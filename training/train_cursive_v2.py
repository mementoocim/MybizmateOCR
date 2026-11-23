# Round 2 deeper cursive & Filipino invoice fine-tuning (v1.2.0-cursive-r2)
# using aspect-ratio bucketed batches, differential LR, frozen BatchNorm, and 5-benchmark selection.

# === 1. IMPORTS ===
from __future__ import annotations

import argparse
import copy
import json
import math
import random
import sys
import time
from pathlib import Path

import cv2
import numpy as np
import paddle
import paddle.nn as nn
import yaml
from rapidfuzz.distance import Levenshtein

REPO_ROOT = Path(__file__).resolve().parents[1]
TRAINING_DIR = Path(__file__).resolve().parent
PADDLE_OCR_DIR = TRAINING_DIR / "PaddleOCR"
sys.path.insert(0, str(PADDLE_OCR_DIR))

from export_to_onnx import export_checkpoint_to_onnx  # noqa: E402
from ppocr.modeling.architectures import build_model  # noqa: E402
from verify_onnx_contract import build_allowed_columns, build_char_table, greedy_ctc_decode  # noqa: E402

# === 2. CONSTANTS ===
DICT_PATH = REPO_ROOT / "modules/scanner/assets/scanner/dict.txt"
BENCHMARKS_DIR = TRAINING_DIR / "benchmarks"
DATASET_V2_DIR = TRAINING_DIR / "rec_dataset_v2"
INIT_CKPT_PATH = TRAINING_DIR / "pretrain/PP-OCRv6_small_latin_cut_init.pdparams"

INPUT_HEIGHT = 48
MIN_WIDTH = 320
SEED = 20261123

BENCHMARK_SPECS = (
    ("bench_a_real_human_cursive", 0.30),
    ("bench_b_unseen_cursive_fonts", 0.25),
    ("bench_c_hard_confusables", 0.20),
    ("bench_d_inv0007", 0.15),
    ("bench_e_printed_retention", 0.10),
)


# === 3. PREPROCESSING & FAST ASPECT-RATIO BUCKETED BATCHES ===
def preprocess_crop_bgr(bgr: np.ndarray, target_w: int) -> np.ndarray:
    h, w = bgr.shape[:2]
    ratio = w / max(1, h)
    rw = min(target_w, max(1, int(math.ceil(INPUT_HEIGHT * ratio))))
    resized = cv2.resize(bgr, (rw, INPUT_HEIGHT))
    norm = ((resized.astype(np.float32) / 255.0) - 0.5) / 0.5
    out = np.zeros((3, INPUT_HEIGHT, target_w), dtype=np.float32)
    out[:, :, :rw] = np.transpose(norm, (2, 0, 1))
    return out


def load_training_records(dataset_dir: Path, list_file: Path, char_to_id: dict[str, int]) -> list[tuple[Path, str, list[int], float]]:
    records: list[tuple[Path, str, list[int], float]] = []
    for raw_line in list_file.read_text(encoding="utf-8").splitlines():
        if "\t" not in raw_line:
            continue
        rel_path, label = raw_line.split("\t", 1)
        if not label or any(ch not in char_to_id for ch in label):
            continue
        img_path = dataset_dir / rel_path
        bgr = cv2.imread(str(img_path), cv2.IMREAD_COLOR)
        if bgr is None:
            continue
        ratio = bgr.shape[1] / max(1, bgr.shape[0])
        # Ensure CTC time steps (approx width/8) strictly exceed label length * 1.25
        min_needed_steps = int(len(label) * 1.35) + 2
        if int(max(MIN_WIDTH, math.ceil(INPUT_HEIGHT * ratio)) // 8) < min_needed_steps:
            continue
        records.append((img_path, label, [char_to_id[c] for c in label], ratio))
    return records


def make_bucketed_batches(
    records: list[tuple[Path, str, list[int], float]],
    batch_size: int,
    rng: random.Random,
) -> list[list[tuple[Path, str, list[int], float]]]:
    """Sorts by aspect ratio + jitter so similar-width crops batch together, avoiding 3x padding waste."""
    jittered = sorted(records, key=lambda item: item[3] + rng.uniform(-1.0, 1.0))
    batches = [jittered[i : i + batch_size] for i in range(0, len(jittered), batch_size)]
    rng.shuffle(batches)
    return batches


def evaluate_model_on_benchmarks(
    model: nn.Layer,
    chars: list[str],
    columns: dict[str, list[int]],
    eval_batch_size: int = 16,
) -> dict:
    model.eval()
    per_bench: dict[str, dict] = {}
    comp_exact = 0.0
    comp_char = 0.0

    with paddle.no_grad():
        for bench_key, weight in BENCHMARK_SPECS:
            bdir = BENCHMARKS_DIR / bench_key
            manifest = json.loads((bdir / "manifest.json").read_text(encoding="utf-8"))
            exact = 0
            sim_sum = 0.0

            # Group by ratio inside eval too for fast CPU evaluation
            indexed = []
            for row in manifest:
                bgr = cv2.imread(str(bdir / row["file"]), cv2.IMREAD_COLOR)
                indexed.append((bgr, row, bgr.shape[1] / max(1, bgr.shape[0])))
            indexed.sort(key=lambda t: t[2])

            for start in range(0, len(indexed), eval_batch_size):
                chunk = indexed[start : start + eval_batch_size]
                max_ratio = max([MIN_WIDTH / INPUT_HEIGHT] + [t[2] for t in chunk])
                batch_w = int(math.ceil((INPUT_HEIGHT * max_ratio) / 8.0) * 8)
                batch_x = np.stack([preprocess_crop_bgr(t[0], batch_w) for t in chunk], axis=0)
                preds = model(paddle.to_tensor(batch_x))
                if isinstance(preds, dict):
                    preds = preds["ctc"]
                probs_np = preds.numpy()
                for k, (_, row, _) in enumerate(chunk):
                    cols = columns.get(row["type"], columns["text"])
                    pred_text, _ = greedy_ctc_decode(probs_np[k], chars, cols)
                    gt = row["label"]
                    if pred_text == gt:
                        exact += 1
                    max_len = max(1, len(gt), len(pred_text))
                    sim_sum += 1.0 - (Levenshtein.distance(pred_text, gt) / max_len)

            n = max(1, len(manifest))
            ex_acc = exact / n
            ch_acc = sim_sum / n
            comp_exact += weight * ex_acc
            comp_char += weight * ch_acc
            per_bench[bench_key] = {
                "exact_acc": round(ex_acc, 5),
                "char_acc": round(ch_acc, 5),
                "exact_count": exact,
                "total": len(manifest),
            }

    return {
        "composite_exact_acc": round(comp_exact, 5),
        "composite_char_acc": round(comp_char, 5),
        "benchmarks": per_bench,
    }


def set_frozen_bn_train_mode(model: nn.Layer) -> None:
    model.train()
    for sublayer in model.sublayers():
        if isinstance(sublayer, (nn.BatchNorm2D, nn.BatchNorm1D, nn.SyncBatchNorm)):
            sublayer.eval()


# === 4. TRAINING RUNNER ===
def main() -> None:
    parser = argparse.ArgumentParser(description="Fine-tune PP-OCRv6_small_rec on 3-pillar cursive + Filipino invoice dataset.")
    parser.add_argument("--version", type=str, default="v1.2.0-cursive-r2")
    parser.add_argument("--init-ckpt", type=Path, default=INIT_CKPT_PATH)
    parser.add_argument("--dataset-dir", type=Path, default=DATASET_V2_DIR)
    parser.add_argument("--list-file", type=str, default="train_list.txt")
    parser.add_argument("--epochs", type=int, default=4)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--head-lr", type=float, default=1.4e-4)
    parser.add_argument("--backbone-lr-mult", type=float, default=0.35)
    parser.add_argument("--seed", type=int, default=SEED)
    args = parser.parse_args()

    random.seed(args.seed)
    np.random.seed(args.seed)
    paddle.seed(args.seed)
    paddle.set_device("cpu")

    chars = build_char_table(DICT_PATH)
    columns = build_allowed_columns(chars)
    char_to_id = {ch: idx for idx, ch in enumerate(chars) if idx > 0}

    cfg = yaml.safe_load((PADDLE_OCR_DIR / "configs/rec/PP-OCRv6/PP-OCRv6_small_rec.yml").read_text(encoding="utf-8"))
    arch_cfg = copy.deepcopy(cfg["Architecture"])
    arch_cfg["Head"]["out_channels_list"] = {"CTCLabelDecode": len(chars), "NRTRLabelDecode": len(chars) + 3}

    model = build_model(arch_cfg)
    model.set_state_dict(paddle.load(str(args.init_ckpt)))

    # Differential parameter groups: deeper stroke blocks (blocks4.4-6 + blocks5) vs sequence head (ctc_encoder + ctc_head)
    backbone_params = []
    head_params = []
    frozen = 0
    for name, param in model.named_parameters():
        is_backbone_adapt = (
            name.startswith("backbone.blocks4.4.")
            or name.startswith("backbone.blocks4.5.")
            or name.startswith("backbone.blocks4.6.")
            or name.startswith("backbone.blocks5.")
        )
        is_head_adapt = name.startswith("head.ctc_encoder.") or name.startswith("head.ctc_head.")
        if is_backbone_adapt:
            param.stop_gradient = False
            backbone_params.append(param)
        elif is_head_adapt:
            param.stop_gradient = False
            head_params.append(param)
        else:
            param.stop_gradient = True
            frozen += 1

    print(
        f"[{args.version}] Loaded {args.init_ckpt.name} | "
        f"Trainable backbone={len(backbone_params)}, head={len(head_params)}, frozen={frozen}",
        flush=True,
    )

    train_records = load_training_records(args.dataset_dir, args.dataset_dir / args.list_file, char_to_id)
    print(f"[{args.version}] Loaded {len(train_records)} aspect-bucketed training crops.", flush=True)

    baseline = evaluate_model_on_benchmarks(model, chars, columns)
    print(
        f"[{args.version}] START Score -> CompExact={baseline['composite_exact_acc']*100:.2f}% "
        f"| CompChar={baseline['composite_char_acc']*100:.2f}% "
        f"| IAM={baseline['benchmarks']['bench_a_real_human_cursive']['exact_acc']*100:.2f}% "
        f"| Unseen={baseline['benchmarks']['bench_b_unseen_cursive_fonts']['exact_acc']*100:.2f}% "
        f"| Hard={baseline['benchmarks']['bench_c_hard_confusables']['exact_acc']*100:.2f}% "
        f"| inv0007={baseline['benchmarks']['bench_d_inv0007']['exact_count']}/45 "
        f"| Printed={baseline['benchmarks']['bench_e_printed_retention']['exact_acc']*100:.2f}%",
        flush=True,
    )

    steps_per_epoch = math.ceil(len(train_records) / args.batch_size)
    total_steps = steps_per_epoch * args.epochs
    lr_scheduler = paddle.optimizer.lr.CosineAnnealingDecay(learning_rate=args.head_lr, T_max=total_steps, eta_min=5e-6)
    optimizer = paddle.optimizer.AdamW(
        learning_rate=lr_scheduler,
        parameters=[
            {"params": backbone_params, "learning_rate": args.backbone_lr_mult},
            {"params": head_params, "learning_rate": 1.0},
        ],
        weight_decay=1e-4,
        grad_clip=paddle.nn.ClipGradByGlobalNorm(clip_norm=2.0),
    )
    ctc_loss_fn = nn.CTCLoss(blank=0, reduction="mean")

    version_dir = TRAINING_DIR / "models" / args.version
    version_dir.mkdir(parents=True, exist_ok=True)
    best_ckpt_base = version_dir / "best_accuracy"
    paddle.save(model.state_dict(), str(best_ckpt_base) + ".pdparams")

    # Weighted selection criterion combining exact & char accuracy while guarding printed retention
    def composite_rank(m: dict) -> float:
        printed_pen = 0.0 if m["benchmarks"]["bench_e_printed_retention"]["exact_acc"] >= 0.98 else -0.05
        return 0.65 * m["composite_exact_acc"] + 0.35 * m["composite_char_acc"] + printed_pen

    best_rank = composite_rank(baseline)
    rng = random.Random(args.seed)

    for epoch in range(1, args.epochs + 1):
        t0 = time.time()
        set_frozen_bn_train_mode(model)
        batches = make_bucketed_batches(train_records, args.batch_size, rng)
        epoch_losses: list[float] = []

        for step_idx, chunk in enumerate(batches, 1):
            crops = []
            max_label_len = 1
            for img_path, _, enc, _ in chunk:
                bgr = cv2.imread(str(img_path), cv2.IMREAD_COLOR)
                # Online width stretch + brightness/contrast + occasional blur augmentation
                if rng.random() < 0.50:
                    w_scale = rng.uniform(0.93, 1.07)
                    new_w = max(8, int(round(bgr.shape[1] * w_scale)))
                    bgr = cv2.resize(bgr, (new_w, bgr.shape[0]), interpolation=cv2.INTER_LINEAR)
                alpha = rng.uniform(0.90, 1.10)
                beta = rng.uniform(-10.0, 10.0)
                bgr = np.clip(bgr.astype(np.float32) * alpha + beta, 0, 255).astype(np.uint8)
                if rng.random() < 0.18:
                    bgr = cv2.GaussianBlur(bgr, (3, 3), sigmaX=rng.uniform(0.3, 0.75))
                crops.append(bgr)
                max_label_len = max(max_label_len, len(enc))

            max_ratio = max([MIN_WIDTH / INPUT_HEIGHT] + [c.shape[1] / max(1, c.shape[0]) for c in crops])
            batch_w = int(math.ceil((INPUT_HEIGHT * max_ratio) / 8.0) * 8)

            batch_x = np.stack([preprocess_crop_bgr(c, batch_w) for c in crops], axis=0)
            targets_np = np.zeros((len(chunk), max_label_len), dtype=np.int32)
            target_lens_np = np.zeros((len(chunk),), dtype=np.int64)
            for i, (_, _, enc, _) in enumerate(chunk):
                targets_np[i, : len(enc)] = enc
                target_lens_np[i] = len(enc)

            feats = model.backbone(paddle.to_tensor(batch_x))
            neck_out = model.head.ctc_encoder(feats)
            logits = model.head.ctc_head(neck_out)

            time_steps = logits.shape[1]
            logits_tbc = paddle.transpose(logits, [1, 0, 2])
            input_lens = paddle.full(shape=[len(chunk)], fill_value=time_steps, dtype="int64")

            loss = ctc_loss_fn(
                logits_tbc,
                paddle.to_tensor(targets_np),
                input_lens,
                paddle.to_tensor(target_lens_np),
            )
            loss.backward()
            optimizer.step()
            optimizer.clear_grad()
            lr_scheduler.step()
            epoch_losses.append(float(loss.numpy()))

            if step_idx % 40 == 0 or step_idx == len(batches):
                print(
                    f"  Epoch {epoch}/{args.epochs} | Step {step_idx}/{len(batches)} "
                    f"| Loss: {np.mean(epoch_losses[-40:]):.4f} | LR: {optimizer.get_lr():.6f}",
                    flush=True,
                )

        ev = evaluate_model_on_benchmarks(model, chars, columns)
        rank = composite_rank(ev)
        elapsed = time.time() - t0
        tag = ""
        if rank > best_rank:
            best_rank = rank
            paddle.save(model.state_dict(), str(best_ckpt_base) + ".pdparams")
            tag = " [NEW BEST]"
        print(
            f"  Epoch {epoch} Done ({elapsed:.1f}s) | CompExact={ev['composite_exact_acc']*100:.2f}% "
            f"| CompChar={ev['composite_char_acc']*100:.2f}% "
            f"| IAM={ev['benchmarks']['bench_a_real_human_cursive']['exact_acc']*100:.2f}% "
            f"| Unseen={ev['benchmarks']['bench_b_unseen_cursive_fonts']['exact_acc']*100:.2f}% "
            f"| Hard={ev['benchmarks']['bench_c_hard_confusables']['exact_acc']*100:.2f}% "
            f"| inv0007={ev['benchmarks']['bench_d_inv0007']['exact_count']}/45 "
            f"| Printed={ev['benchmarks']['bench_e_printed_retention']['exact_acc']*100:.2f}%{tag}",
            flush=True,
        )

    print(f"[{args.version}] Exporting best checkpoint to verified ONNX...", flush=True)
    export_report = export_checkpoint_to_onnx(
        ckpt_base=best_ckpt_base,
        output_onnx_path=version_dir / "inference_latin.onnx",
        model_name="PP-OCRv6 small, Latin cut, pretrained",
    )
    print(json.dumps(export_report, indent=2), flush=True)


if __name__ == "__main__":
    main()
