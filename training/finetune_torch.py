# Fine-tunes the shipped on-device text reader (inference_latin.onnx, PP-OCRv6 small Latin cut) in PyTorch on the
# laptop GPU, starting from the exact shipped weights, then exports a drop-in inference_latin.onnx (same input,
# same 100-class softmax output) and compares it with the shipped model on held-out real lines.
#
#   .venv/Scripts/python.exe finetune_torch.py --version v1.4.0 --synth rec_dataset_v14_synth --real rec_dataset_v14_real
#
# The shipped ONNX is turned into a PyTorch graph with onnx2torch (onnx_to_torch.py rewrites the two
# SAME_UPPER layers to explicit padding; the converted graph matches ONNX Runtime to 1e-6).

# === 1. IMPORTS ===
from __future__ import annotations

import argparse
import hashlib
import json
import math
import random
import sys
import time
from pathlib import Path

import cv2
import numpy as np
import onnx
import onnxruntime as ort
import torch
import torch.nn.functional as F

TRAINING_DIR = Path(__file__).resolve().parent
REPO_ROOT = TRAINING_DIR.parent
ASSETS = REPO_ROOT / "modules" / "scanner" / "assets" / "scanner"
sys.path.insert(0, str(TRAINING_DIR))
from onnx_to_torch import load_torch  # noqa: E402

# === 2. CONSTANTS (MIRRORING recognizer.cpp) ===
HEIGHT = 48
MIN_RATIO = 320.0 / 48.0
MAX_TRAIN_RATIO = 24.0  # wider crops are squeezed while training only (the phone never squeezes)
BUDGET = 320.0  # images x width ratio per pass: 32 normal lines, fewer wide ones (measured: 2.2 GB, 140 lines/s)
MAX_LABEL = 40


def char_table() -> list[str]:
    lines = [ln.replace("\r", "") for ln in (ASSETS / "dict.txt").read_text(encoding="utf-8").split("\n")]
    return ["<blank>", *lines, " "]


CHARS = char_table()
INDEX = {c: i for i, c in enumerate(CHARS)}  # a later duplicate wins, like the C++ map


# === 3. DATA ===
def read_list(folder: Path, source: str) -> list[dict]:
    rows = []
    for line in (folder / "labels.jsonl").read_text(encoding="utf-8").splitlines():
        if line.strip():
            row = json.loads(line)
            label = row["label"]
            if not label or len(label) > MAX_LABEL or any(c not in INDEX or INDEX[c] == 0 for c in label):
                continue
            rows.append({"path": str(folder / row["file"]), "label": label, "source": source,
                         "family": row.get("family") or row.get("style") or source})
    return rows


def vary(img: np.ndarray, rng: random.Random) -> np.ndarray:
    """A slightly different look at a real crop each time: tilt, scale, light, focus, recompression, crop margin."""
    h, w = img.shape[:2]
    if rng.random() < 0.5:
        m = cv2.getRotationMatrix2D((w / 2, h / 2), rng.gauss(0, 1.0), rng.uniform(0.95, 1.05))
        m[0, 1] += rng.gauss(0, 0.03)
        img = cv2.warpAffine(img, m, (w, h), borderMode=cv2.BORDER_REPLICATE)
    if rng.random() < 0.4:
        dx, dy = rng.randint(0, max(1, w // 40)), rng.randint(0, max(1, h // 10))
        img = img[dy:h - rng.randint(0, max(1, h // 10)), dx:w - rng.randint(0, max(1, w // 40))]
    img = img.astype(np.float32) * rng.uniform(0.85, 1.12) + rng.uniform(-18, 18)
    if rng.random() < 0.3:
        img = cv2.GaussianBlur(img, (0, 0), rng.uniform(0.3, 1.0))
    img = np.clip(img, 0, 255).astype(np.uint8)
    if rng.random() < 0.4:
        ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, rng.randint(40, 92)])
        img = cv2.imdecode(buf, cv2.IMREAD_COLOR)
    return img


def batch_tensor(images: list[np.ndarray], squeeze_to: float | None = None) -> torch.Tensor:
    """recognizer.cpp's preprocessing: resize to 48 high keeping the ratio, (v/255-0.5)/0.5, zero padding right."""
    ratios = [im.shape[1] / max(1, im.shape[0]) for im in images]
    top = max([MIN_RATIO, *ratios])
    if squeeze_to:
        top = min(top, squeeze_to)
    width = int(HEIGHT * top)
    x = np.zeros((len(images), 3, HEIGHT, width), dtype=np.float32)
    for k, (im, r) in enumerate(zip(images, ratios)):
        rw = min(width, int(math.ceil(HEIGHT * r)))
        resized = cv2.resize(im, (max(1, rw), HEIGHT))
        x[k, :, :, :rw] = np.transpose((resized.astype(np.float64) / 255.0 - 0.5) / 0.5, (2, 0, 1)).astype(np.float32)
    return torch.from_numpy(x)


def decode(probs: np.ndarray) -> list[str]:
    out = []
    for row in probs.argmax(-1):
        text, prev = [], 0
        for i in row:
            i = int(i)
            if i != 0 and i != prev:
                text.append(CHARS[i])
            prev = i
        out.append("".join(text))
    return out


def edit(a: str, b: str) -> int:
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[-1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


# === 4. MODEL ===
def logits_model(onnx_path: Path) -> torch.nn.Module:
    """The converted graph without its final softmax, so training gets raw scores for CTC."""
    net = load_torch(str(onnx_path))
    graph = net.graph
    output = next(n for n in graph.nodes if n.op == "output")
    softmax = output.args[0]
    assert softmax.op == "call_module" and "Softmax" in str(softmax.target), softmax
    output.args = (softmax.args[0],)
    graph.erase_node(softmax)
    graph.lint()
    net.recompile()
    return net


class WithSoftmax(torch.nn.Module):
    def __init__(self, net):
        super().__init__()
        self.net = net

    def forward(self, x):
        return torch.softmax(self.net(x), dim=-1)


def freeze_batchnorm(net: torch.nn.Module) -> None:
    for m in net.modules():
        if isinstance(m, torch.nn.modules.batchnorm._BatchNorm):
            m.eval()


# === 5. EVALUATION ===
def evaluate_onnx(onnx_path: Path, rows: list[dict], batch: int = 16) -> dict:
    """Reads like the phone: ONNX Runtime on CPU, batches sorted by width, full width (no squeezing)."""
    sess = ort.InferenceSession(onnx_path.read_bytes(), providers=["CPUExecutionProvider"])
    order = sorted(range(len(rows)), key=lambda i: cv2.imread(rows[i]["path"]).shape[1] / max(1, cv2.imread(rows[i]["path"]).shape[0]))
    preds = [""] * len(rows)
    for s in range(0, len(order), batch):
        chunk = order[s:s + batch]
        x = batch_tensor([cv2.imread(rows[i]["path"]) for i in chunk]).numpy()
        probs = sess.run(None, {sess.get_inputs()[0].name: x})[0]
        for i, p in zip(chunk, decode(probs)):
            preds[i] = p
    return score(rows, preds)


def score(rows: list[dict], preds: list[str]) -> dict:
    def summary(idx):
        if not idx:
            return None
        exact = sum(preds[i] == rows[i]["label"] for i in idx)
        errors = sum(edit(preds[i], rows[i]["label"]) for i in idx)
        chars = sum(len(rows[i]["label"]) for i in idx)
        return {"lines": len(idx), "exact": exact, "exact_rate": round(exact / len(idx), 4),
                "char_accuracy": round(1 - errors / max(1, chars), 4)}
    families = sorted({r["family"] for r in rows})
    return {"all": summary(list(range(len(rows)))),
            "by_family": {f: summary([i for i, r in enumerate(rows) if r["family"] == f]) for f in families},
            "mistakes": [{"label": rows[i]["label"], "read": preds[i], "family": rows[i]["family"]}
                         for i in range(len(rows)) if preds[i] != rows[i]["label"]][:400]}


# === 6. TRAINING ===
def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--version", required=True)
    parser.add_argument("--synth", required=True, help="folders with train/ and test/ practice crops, comma separated")
    parser.add_argument("--real", required=True, help="folder with train/ and test/ real line crops")
    parser.add_argument("--base", default=str(ASSETS / "inference_latin.onnx"))
    parser.add_argument("--epochs", type=float, default=3.0)
    parser.add_argument("--batch", type=int, default=32)
    parser.add_argument("--lr", type=float, default=1e-4)
    parser.add_argument("--real-repeats", type=int, default=12)
    parser.add_argument("--synth-per-epoch", type=int, default=30000)
    parser.add_argument("--seed", type=int, default=20261126)
    args = parser.parse_args()

    rng = random.Random(args.seed)
    torch.manual_seed(args.seed)
    real_dir = TRAINING_DIR / args.real
    out = TRAINING_DIR / "models" / args.version
    out.mkdir(parents=True, exist_ok=False)
    synth_train, synth_test = [], []
    for name in args.synth.split(","):  # several practice sets, comma separated
        synth_train += read_list(TRAINING_DIR / name / "train", "synth")
        synth_test += read_list(TRAINING_DIR / name / "test", "synth")
    real_train, real_test = read_list(real_dir / "train", "real"), read_list(real_dir / "test", "real")
    print(f"synthetic {len(synth_train)}/{len(synth_test)}, real {len(real_train)}/{len(real_test)}", flush=True)

    base_path = Path(args.base)
    report = {"version": args.version, "base": base_path.name,
              "base_sha256": hashlib.sha256(base_path.read_bytes()).hexdigest(), "settings": vars(args),
              "data": {"synthetic_train": len(synth_train), "synthetic_test": len(synth_test),
                       "real_train": len(real_train), "real_test": len(real_test)}}
    print("measuring the shipped model...", flush=True)
    report["before"] = {"real_test": evaluate_onnx(base_path, real_test),
                        "synthetic_test": evaluate_onnx(base_path, synth_test)}
    print("before:", json.dumps({k: v["all"] for k, v in report["before"].items()}), flush=True)

    device = torch.device("cuda")
    net = logits_model(base_path).to(device)
    weights = [p for p in net.parameters() if p.requires_grad]
    optimizer = torch.optim.AdamW(weights, lr=args.lr, weight_decay=1e-4)
    per_epoch = args.synth_per_epoch + len(real_train) * args.real_repeats
    steps = int(math.ceil(per_epoch * args.epochs / args.batch))
    warm = max(1, steps // 30)
    schedule = torch.optim.lr_scheduler.LambdaLR(
        optimizer, lambda s: (s + 1) / warm if s < warm else 0.05 + 0.95 * 0.5 * (1 + math.cos(math.pi * (s - warm) / max(1, steps - warm))))
    ctc = torch.nn.CTCLoss(blank=0, zero_infinity=True)
    began, step, recent = time.time(), 0, []
    pool: list[dict] = []
    while step < steps:
        if not pool:
            pool = rng.sample(synth_train, min(args.synth_per_epoch, len(synth_train))) + real_train * args.real_repeats
            rng.shuffle(pool)
        chunk, pool = pool[:args.batch], pool[args.batch:]
        images = []
        for r in chunk:
            im = cv2.imread(r["path"])
            images.append(vary(im, rng) if r["source"] == "real" else im)
        # Wide lines go through in smaller groups, so a group's pixels stay within 6 GB (batch x width <= budget).
        order = sorted(range(len(chunk)), key=lambda i: images[i].shape[1] / max(1, images[i].shape[0]))
        groups, current = [], []
        for i in order:
            ratio = min(MAX_TRAIN_RATIO, max(MIN_RATIO, images[i].shape[1] / max(1, images[i].shape[0])))
            if current and (len(current) + 1) * ratio > BUDGET:
                groups.append(current)
                current = []
            current.append(i)
        groups.append(current)
        net.train()
        freeze_batchnorm(net)
        optimizer.zero_grad(set_to_none=True)
        total = 0.0
        for group in groups:
            x = batch_tensor([images[i] for i in group], squeeze_to=MAX_TRAIN_RATIO).to(device)
            with torch.autocast("cuda", dtype=torch.bfloat16):
                logits = net(x)  # [B, T, C]
            log_probs = F.log_softmax(logits.float(), dim=-1).permute(1, 0, 2)
            targets = torch.tensor([INDEX[c] for i in group for c in chunk[i]["label"]], dtype=torch.long)
            target_lengths = torch.tensor([len(chunk[i]["label"]) for i in group], dtype=torch.long)
            input_lengths = torch.full((len(group),), log_probs.shape[0], dtype=torch.long)
            part = ctc(log_probs, targets, input_lengths, target_lengths) * len(group) / len(chunk)
            part.backward()
            total += part.item()
        loss = torch.tensor(total)
        torch.nn.utils.clip_grad_norm_(weights, 5.0)
        optimizer.step()
        schedule.step()
        step += 1
        recent = (recent + [loss.item()])[-100:]
        if step % 100 == 0 or step == steps:
            pace = (time.time() - began) / step
            print(f"step {step}/{steps} loss {sum(recent) / len(recent):.4f} lr {schedule.get_last_lr()[0]:.2e} "
                  f"{pace * (steps - step) / 60:.1f} min left", flush=True)

    # === 7. EXPORT: same input name and layout, softmax output, opset 11 like the shipped file ===
    net.eval()
    final = WithSoftmax(net).cpu().eval()
    onnx_path = out / "inference_latin.onnx"
    dummy = torch.zeros(1, 3, HEIGHT, 320)
    torch.onnx.export(final, dummy, str(onnx_path), input_names=["x"], output_names=["fetch_name_0"],
                      dynamic_axes={"x": {0: "batch", 3: "width"}, "fetch_name_0": {0: "batch", 1: "steps"}},
                      opset_version=11, do_constant_folding=True, dynamo=False)
    model = onnx.load(str(onnx_path))
    onnx.checker.check_model(model)
    onnx.save_model(model, str(onnx_path), save_as_external_data=False)
    check = np.random.rand(3, 3, HEIGHT, 517).astype(np.float32) * 2 - 1
    with torch.no_grad():
        ref = final(torch.from_numpy(check)).numpy()
    got = ort.InferenceSession(str(onnx_path)).run(None, {"x": check})[0]
    report["export"] = {"bytes": onnx_path.stat().st_size, "sha256": hashlib.sha256(onnx_path.read_bytes()).hexdigest(),
                        "max_diff_vs_torch": float(np.abs(ref - got).max()), "output_shape": list(got.shape),
                        "row_sums_close_to_1": bool(np.allclose(got.sum(-1), 1, atol=1e-4))}
    print("export:", json.dumps(report["export"]), flush=True)
    print("measuring the new model...", flush=True)
    report["after"] = {"real_test": evaluate_onnx(onnx_path, real_test),
                       "synthetic_test": evaluate_onnx(onnx_path, synth_test)}
    report["training_minutes"] = round((time.time() - began) / 60, 1)
    (out / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print("after:", json.dumps({k: v["all"] for k, v in report["after"].items()}), flush=True)


if __name__ == "__main__":
    main()
