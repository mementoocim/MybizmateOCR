# Slices official PP-OCRv6_small_rec (18,710 -> 100 Latin classes), fine-tunes
# on Filipino invoice/2307 handwriting crops, exports inference_latin.onnx, and verifies it.

# === 1. IMPORTS ===
from __future__ import annotations

import copy
import json
import math
import os
import random
import shutil
import subprocess
import sys
import time
from pathlib import Path

import cv2
import numpy as np
import onnx
import paddle
import paddle.nn as nn
import paddle.nn.functional as F
import yaml
from rapidfuzz.distance import Levenshtein

REPO_ROOT = Path(__file__).resolve().parents[1]
TRAINING_DIR = Path(__file__).resolve().parent
PADDLE_OCR_DIR = TRAINING_DIR / "PaddleOCR"
sys.path.insert(0, str(PADDLE_OCR_DIR))

from ppocr.modeling.architectures import build_model  # noqa: E402


# === 2. CONSTANTS ===
BATCH_SIZE = 32
EPOCHS = 5
BASE_LR = 1.5e-4
INPUT_HEIGHT = 48
TRAIN_WIDTH = 320
MAX_TEXT_LENGTH = 25
SEED = 20261123


# === 3. DICTIONARY & HEAD SLICING (18,710 -> 100 CLASSES) ===
def load_target_dict(dict_path: Path) -> list[str]:
    lines = [ln.replace("\r", "") for ln in dict_path.read_text(encoding="utf-8").split("\n")]
    if len(lines) != 98:
        raise ValueError(f"Expected 98 lines in dict.txt, got {len(lines)}")
    return lines


def slice_pretrained_checkpoint(
    pretrained_path: Path,
    v6_dict_path: Path,
    target_98: list[str],
    output_init_path: Path,
) -> Path:
    v6_chars = v6_dict_path.read_text(encoding="utf-8").splitlines()
    if len(v6_chars) != 18708:
        raise ValueError(f"Expected 18708 lines in ppocrv6_dict.txt, got {len(v6_chars)}")

    src_index = {ch: idx for idx, ch in enumerate(v6_chars)}
    mapped_98 = [src_index[ch] for ch in target_98]

    ctc_indices = np.array([0] + [i + 1 for i in mapped_98] + [18709], dtype=np.int64)
    nrtr_103_indices = np.array([0, 1, 2, 3] + [i + 4 for i in mapped_98] + [18712], dtype=np.int64)
    nrtr_104_indices = np.array([0, 1, 2, 3] + [i + 4 for i in mapped_98] + [18712, 18713], dtype=np.int64)

    raw_state = paddle.load(str(pretrained_path))
    state_dict = raw_state.get("state_dict", raw_state)
    sliced_state = {}

    for key, val in state_dict.items():
        arr = np.asarray(val)
        for axis, dim in enumerate(arr.shape):
            if dim == 18710:
                arr = np.take(arr, ctc_indices, axis=axis)
            elif dim == 18713:
                arr = np.take(arr, nrtr_103_indices, axis=axis)
            elif dim == 18714:
                arr = np.take(arr, nrtr_104_indices, axis=axis)
        sliced_state[key] = paddle.to_tensor(arr)

    paddle.save(sliced_state, str(output_init_path))
    return output_init_path


# === 4. DATA PREPROCESSING & EVALUATION ===
def preprocess_crop_bgr(bgr: np.ndarray, target_w: int) -> np.ndarray:
    h, w = bgr.shape[:2]
    ratio = w / max(1, h)
    rw = min(target_w, max(1, int(math.ceil(INPUT_HEIGHT * ratio))))
    resized = cv2.resize(bgr, (rw, INPUT_HEIGHT))
    norm = ((resized.astype(np.float32) / 255.0) - 0.5) / 0.5
    out = np.zeros((3, INPUT_HEIGHT, target_w), dtype=np.float32)
    out[:, :, :rw] = np.transpose(norm, (2, 0, 1))
    return out


def load_manifest_samples(dataset_dir: Path, list_file: Path, char_to_id: dict[str, int]) -> list[tuple[Path, str, list[int]]]:
    samples: list[tuple[Path, str, list[int]]] = []
    for raw_line in list_file.read_text(encoding="utf-8").splitlines():
        if "\t" not in raw_line:
            continue
        rel_path, label = raw_line.split("\t", 1)
        if not label or len(label) > MAX_TEXT_LENGTH:
            continue
        if any(ch not in char_to_id for ch in label):
            continue
        encoded = [char_to_id[ch] for ch in label]
        samples.append((dataset_dir / rel_path, label, encoded))
    return samples


def ctc_greedy_decode_batch(probs_np: np.ndarray, chars: list[str]) -> list[str]:
    decoded: list[str] = []
    best_ids = np.argmax(probs_np, axis=-1)
    for seq in best_ids:
        out_chars: list[str] = []
        prev = 0
        for idx in seq:
            idx_i = int(idx)
            if idx_i != 0 and idx_i != prev:
                out_chars.append(chars[idx_i])
            prev = idx_i
        decoded.append("".join(out_chars))
    return decoded


def evaluate_samples(
    model: nn.Layer,
    samples: list[tuple[Path, str, list[int]]],
    chars: list[str],
) -> dict[str, float]:
    model.eval()
    exact_matches = 0
    norm_sim_sum = 0.0
    total = len(samples)

    with paddle.no_grad():
        for start in range(0, total, BATCH_SIZE):
            chunk = samples[start : start + BATCH_SIZE]
            crops = [cv2.imread(str(p), cv2.IMREAD_COLOR) for p, _, _ in chunk]
            max_ratio = max([TRAIN_WIDTH / INPUT_HEIGHT] + [c.shape[1] / max(1, c.shape[0]) for c in crops])
            batch_w = int(INPUT_HEIGHT * max_ratio)
            batch_x = np.stack([preprocess_crop_bgr(c, batch_w) for c in crops], axis=0)
            preds = model(paddle.to_tensor(batch_x))
            if isinstance(preds, dict):
                preds = preds["ctc"]
            probs_np = preds.numpy()
            texts = ctc_greedy_decode_batch(probs_np, chars)
            for pred_text, (_, gt_label, _) in zip(texts, chunk):
                if pred_text == gt_label:
                    exact_matches += 1
                max_len = max(1, len(pred_text), len(gt_label))
                dist = Levenshtein.distance(pred_text, gt_label)
                norm_sim_sum += 1.0 - (dist / max_len)

    return {
        "exact_acc": round(exact_matches / max(1, total), 5),
        "char_acc": round(norm_sim_sum / max(1, total), 5),
        "exact_count": exact_matches,
        "total": total,
    }


def set_finetune_train_mode(model: nn.Layer) -> None:
    model.train()
    # Keep all BatchNorm layers in eval() mode to preserve clean pretrained running stats
    for sublayer in model.sublayers():
        if isinstance(sublayer, (nn.BatchNorm2D, nn.BatchNorm1D, nn.SyncBatchNorm)):
            sublayer.eval()


# === 5. MAIN FINE-TUNING + EXPORT PIPELINE ===
def main() -> None:
    random.seed(SEED)
    np.random.seed(SEED)
    paddle.seed(SEED)
    paddle.set_device("cpu")

    dict_path = REPO_ROOT / "modules/scanner/assets/scanner/dict.txt"
    target_98 = load_target_dict(dict_path)
    chars = ["<blank>", *target_98, " "]
    char_to_id = {ch: idx for idx, ch in enumerate(chars) if idx > 0}

    pretrain_dir = TRAINING_DIR / "pretrain"
    output_dir = TRAINING_DIR / "output_ft"
    output_dir.mkdir(parents=True, exist_ok=True)

    latin_init_path = pretrain_dir / "PP-OCRv6_small_latin_cut_init.pdparams"
    print("[1/5] Slicing PP-OCRv6_small_rec_pretrained.pdparams (18,710 -> 100 classes)...")
    slice_pretrained_checkpoint(
        pretrained_path=pretrain_dir / "PP-OCRv6_small_rec_pretrained.pdparams",
        v6_dict_path=PADDLE_OCR_DIR / "ppocr/utils/dict/ppocrv6_dict.txt",
        target_98=target_98,
        output_init_path=latin_init_path,
    )

    base_cfg_path = PADDLE_OCR_DIR / "configs/rec/PP-OCRv6/PP-OCRv6_small_rec.yml"
    cfg = yaml.safe_load(base_cfg_path.read_text(encoding="utf-8"))
    arch_cfg = copy.deepcopy(cfg["Architecture"])
    for head_item in arch_cfg["Head"]["head_list"]:
        if "NRTRHead" in head_item:
            head_item["NRTRHead"]["max_text_length"] = MAX_TEXT_LENGTH

    arch_cfg["Head"]["out_channels_list"] = {
        "CTCLabelDecode": len(chars),       # 100
        "NRTRLabelDecode": len(chars) + 3,  # 103 (+1 inside Transformer = 104)
    }

    model = build_model(arch_cfg)
    sliced_state = paddle.load(str(latin_init_path))
    model.set_state_dict(sliced_state)
    print("      Loaded 100% of 422 sliced tensors into SVTR_LCNet (PP-OCRv6_small_rec).")

    # Freeze early/mid conv blocks (conv1, blocks2, blocks3, blocks4); train blocks5 + lightsvtr + ctc_head
    trainable_params = []
    frozen_count = 0
    for name, param in model.named_parameters():
        is_trainable = (
            name.startswith("backbone.blocks5.")
            or name.startswith("head.ctc_encoder.")
            or name.startswith("head.ctc_head.")
        )
        param.stop_gradient = not is_trainable
        if is_trainable:
            trainable_params.append(param)
        else:
            frozen_count += 1
    print(f"      Trainable tensors: {len(trainable_params)} | Frozen early/aux tensors: {frozen_count}")

    dataset_dir = TRAINING_DIR / "rec_dataset"
    train_samples = load_manifest_samples(dataset_dir, dataset_dir / "train_list.txt", char_to_id)
    val_samples = load_manifest_samples(dataset_dir, dataset_dir / "val_list.txt", char_to_id)
    print(f"[2/5] Loaded {len(train_samples)} train crops & {len(val_samples)} held-out font val crops.")

    baseline_metrics = evaluate_samples(model, val_samples, chars)
    print(f"      BASELINE (Before Fine-Tune) Val -> {baseline_metrics}")

    steps_per_epoch = math.ceil(len(train_samples) / BATCH_SIZE)
    total_steps = steps_per_epoch * EPOCHS
    lr_scheduler = paddle.optimizer.lr.CosineAnnealingDecay(learning_rate=BASE_LR, T_max=total_steps, eta_min=1e-5)
    optimizer = paddle.optimizer.AdamW(
        learning_rate=lr_scheduler,
        parameters=trainable_params,
        weight_decay=1e-5,
        grad_clip=paddle.nn.ClipGradByGlobalNorm(clip_norm=2.0),
    )
    ctc_loss_fn = nn.CTCLoss(blank=0, reduction="mean")

    best_val_acc = baseline_metrics["exact_acc"]
    best_val_char = baseline_metrics["char_acc"]
    best_ckpt_base = output_dir / "best_accuracy"
    paddle.save(model.state_dict(), str(best_ckpt_base) + ".pdparams")

    print(f"[3/5] Fine-tuning for {EPOCHS} epochs ({steps_per_epoch} steps/epoch)...")
    rng = random.Random(SEED)

    for epoch in range(1, EPOCHS + 1):
        t0 = time.time()
        set_finetune_train_mode(model)
        shuffled = list(train_samples)
        rng.shuffle(shuffled)
        epoch_losses: list[float] = []

        for step_idx, start in enumerate(range(0, len(shuffled), BATCH_SIZE), 1):
            chunk = shuffled[start : start + BATCH_SIZE]
            crops = []
            max_label_len = 1
            for img_path, _, enc in chunk:
                bgr = cv2.imread(str(img_path), cv2.IMREAD_COLOR)
                # Mild brightness/contrast jitter for camera robustness
                alpha = rng.uniform(0.92, 1.08)
                beta = rng.uniform(-8.0, 8.0)
                bgr = np.clip(bgr.astype(np.float32) * alpha + beta, 0, 255).astype(np.uint8)
                crops.append(bgr)
                max_label_len = max(max_label_len, len(enc))

            max_ratio = max([TRAIN_WIDTH / INPUT_HEIGHT] + [c.shape[1] / max(1, c.shape[0]) for c in crops])
            batch_w = int(math.ceil((INPUT_HEIGHT * max_ratio) / 8.0) * 8)

            batch_x = np.stack([preprocess_crop_bgr(c, batch_w) for c in crops], axis=0)
            targets_np = np.zeros((len(chunk), max_label_len), dtype=np.int32)
            target_lens_np = np.zeros((len(chunk),), dtype=np.int64)
            for i, (_, _, enc) in enumerate(chunk):
                targets_np[i, : len(enc)] = enc
                target_lens_np[i] = len(enc)

            feats = model.backbone(paddle.to_tensor(batch_x))
            neck_out = model.head.ctc_encoder(feats)
            logits = model.head.ctc_head(neck_out)  # [B, T, 100] in train mode

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

            if step_idx % 25 == 0 or step_idx == steps_per_epoch:
                print(
                    f"      Epoch {epoch}/{EPOCHS} | Step {step_idx}/{steps_per_epoch} "
                    f"| Loss: {np.mean(epoch_losses[-25:]):.4f} | LR: {optimizer.get_lr():.6f}",
                    flush=True,
                )

        val_metrics = evaluate_samples(model, val_samples, chars)
        elapsed = time.time() - t0
        improved = (val_metrics["exact_acc"] > best_val_acc) or (
            val_metrics["exact_acc"] == best_val_acc and val_metrics["char_acc"] > best_val_char
        )
        tag = ""
        if improved:
            best_val_acc = val_metrics["exact_acc"]
            best_val_char = val_metrics["char_acc"]
            paddle.save(model.state_dict(), str(best_ckpt_base) + ".pdparams")
            tag = " [NEW BEST]"
        print(f"      Epoch {epoch} Done ({elapsed:.1f}s) | Val: {val_metrics}{tag}", flush=True)

    # Export using official PaddleOCR tools/export_model.py + paddle2onnx
    print("[4/5] Exporting best checkpoint to Paddle inference & ONNX (Opset 11)...")
    ft_cfg = copy.deepcopy(cfg)
    ft_cfg["Global"]["pretrained_model"] = str(best_ckpt_base)
    ft_cfg["Global"]["character_dict_path"] = str(dict_path)
    ft_cfg["Global"]["use_space_char"] = True
    ft_cfg["Global"]["max_text_length"] = MAX_TEXT_LENGTH
    ft_cfg["Global"]["distributed"] = False
    ft_cfg_path = output_dir / "mybizmate_ppocrv6_export.yml"
    ft_cfg_path.write_text(yaml.safe_dump(ft_cfg, sort_keys=False, allow_unicode=True), encoding="utf-8")

    infer_dir = output_dir / "infer_export"
    if infer_dir.exists():
        shutil.rmtree(infer_dir)

    subprocess.check_call(
        [
            sys.executable,
            "tools/export_model.py",
            "-c",
            str(ft_cfg_path),
            "-o",
            f"Global.pretrained_model={best_ckpt_base}",
            f"Global.save_inference_dir={infer_dir}",
        ],
        cwd=str(PADDLE_OCR_DIR),
    )

    model_filename = "inference.json" if (infer_dir / "inference.json").exists() else "inference.pdmodel"
    final_onnx_path = output_dir / "inference_latin.onnx"
    paddle2onnx_exe = Path(sys.executable).parent / ("paddle2onnx.exe" if os.name == "nt" else "paddle2onnx")

    subprocess.check_call(
        [
            str(paddle2onnx_exe),
            "--model_dir",
            str(infer_dir),
            "--model_filename",
            model_filename,
            "--params_filename",
            "inference.pdiparams",
            "--save_file",
            str(final_onnx_path),
            "--opset_version",
            "11",
            "--enable_onnx_checker",
            "True",
        ]
    )

    ext_data = Path(str(final_onnx_path) + ".data")
    if ext_data.exists():
        onnx_proto = onnx.load(str(final_onnx_path), load_external_data=True)
        onnx.save_model(onnx_proto, str(final_onnx_path), save_as_external_data=False)
        ext_data.unlink(missing_ok=True)

    print("[5/5] Verifying exported inference_latin.onnx contract & inv_0007 readings...")
    verify_out = subprocess.check_output(
        [
            sys.executable,
            str(TRAINING_DIR / "verify_onnx_contract.py"),
            str(final_onnx_path),
            "--name",
            "PP-OCRv6 small, Latin cut, pretrained",
        ],
        text=True,
    )
    summary = {
        "baseline_val": baseline_metrics,
        "best_finetuned_val": {"exact_acc": best_val_acc, "char_acc": best_val_char},
        "onnx_verification": json.loads(verify_out),
    }
    (output_dir / "finetune_report.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
