# Verifies that an exported inference_latin.onnx obeys every C++ recognizer.cpp
# contract (shapes, BGR normalization, Softmax probs, 100 classes) and prints model.json.

# === 1. IMPORTS ===
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort

# === 2. CONSTANTS (MIRRORING recognizer.cpp) ===
EXPECTED_CLASSES = 100
INPUT_HEIGHT = 48
MIN_WIDTH_RATIO = 320.0 / 48.0


# === 3. C++-EQUIVALENT RECOGNIZER CHECKS ===
def build_char_table(dict_path: Path) -> list[str]:
    lines = [line.replace("\r", "") for line in dict_path.read_text(encoding="utf-8").split("\n")]
    return ["<blank>", *lines, " "]


def build_allowed_columns(chars: list[str]) -> dict[str, list[int]]:
    index = {ch: idx for idx, ch in enumerate(chars)}
    digits = list("0123456789")
    capitals = list("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
    letters = capitals + list("abcdefghijklmnopqrstuvwxyz")
    ascii_and_latin = [chr(c) for c in range(32, 127)] + ["Ñ", "ñ", "É", "é"]

    charsets = {
        "printed_digits": digits,
        "date": digits + list("/-., ") + letters,
        "date_digits": digits + list("/-., "),
        "tin": digits + ["-"],
        "amount": digits + list(",.P"),
        "number": digits + list(",./ "),
        "text": ascii_and_latin,
        "digits": digits,
        "code": capitals + digits,
    }
    columns: dict[str, list[int]] = {}
    for field_type, allowed in charsets.items():
        cols = sorted({index[c] for c in allowed if c in index and index[c] != 0})
        columns[field_type] = [0, *cols]
    return columns


def preprocess_bgr_batch(bgr_crops: list[np.ndarray]) -> np.ndarray:
    ratios = [crop.shape[1] / max(1, crop.shape[0]) for crop in bgr_crops]
    max_ratio = max([MIN_WIDTH_RATIO, *ratios])
    img_w = int(INPUT_HEIGHT * max_ratio)
    batch = np.zeros((len(bgr_crops), 3, INPUT_HEIGHT, img_w), dtype=np.float32)
    for k, (crop, ratio) in enumerate(zip(bgr_crops, ratios)):
        rw = min(img_w, int(math.ceil(INPUT_HEIGHT * ratio)))
        resized = cv2.resize(crop, (max(1, rw), INPUT_HEIGHT))
        norm = ((resized.astype(np.float64) / 255.0) - 0.5) / 0.5
        batch[k, :, :, : resized.shape[1]] = np.transpose(norm.astype(np.float32), (2, 0, 1))
    return batch


def greedy_ctc_decode(probs_2d: np.ndarray, chars: list[str], cols: list[int]) -> tuple[str, float]:
    kept_chars: list[str] = []
    confs: list[float] = []
    prev = 0
    for t in range(probs_2d.shape[0]):
        row = probs_2d[t]
        best = 0
        best_p = float(row[cols[0]])
        for j in range(1, len(cols)):
            val = float(row[cols[j]])
            if val > best_p:
                best_p = val
                best = j
        if best != 0 and best != prev:
            kept_chars.append(chars[cols[best]])
            confs.append(best_p)
        prev = best
    mean_conf = float(sum(confs) / len(confs)) if confs else 0.0
    return "".join(kept_chars), mean_conf


def verify_onnx_model(
    onnx_path: Path,
    dict_path: Path,
    model_name: str,
    fixtures_crop_dir: Path | None = None,
) -> dict:
    if not onnx_path.is_file():
        raise FileNotFoundError(f"ONNX file not found: {onnx_path}")
    external_data = onnx_path.with_suffix(onnx_path.suffix + ".data")
    if external_data.exists():
        raise RuntimeError(f"External tensor file {external_data.name} detected; model must be a single .onnx file.")

    chars = build_char_table(dict_path)
    if len(chars) != EXPECTED_CLASSES:
        raise ValueError(f"Expected {EXPECTED_CLASSES} classes from dict.txt, got {len(chars)}")
    columns = build_allowed_columns(chars)

    onnx_bytes = onnx_path.read_bytes()
    sha256_hex = hashlib.sha256(onnx_bytes).hexdigest()

    session = ort.InferenceSession(onnx_bytes, providers=["CPUExecutionProvider"])
    input_meta = session.get_inputs()[0]
    output_meta = session.get_outputs()[0]

    # Verify dynamic batch (1 and 8) and dynamic width (320 and 512) + Softmax probabilities
    for batch_size, width in ((1, 320), (8, 512)):
        dummy_x = np.random.uniform(-1.0, 1.0, size=(batch_size, 3, INPUT_HEIGHT, width)).astype(np.float32)
        probs = session.run([output_meta.name], {input_meta.name: dummy_x})[0]
        if probs.ndim != 3 or probs.shape[0] != batch_size or probs.shape[2] != EXPECTED_CLASSES:
            raise AssertionError(
                f"Invalid output shape {probs.shape} for input {(batch_size, 3, INPUT_HEIGHT, width)}; "
                f"expected ({batch_size}, steps, {EXPECTED_CLASSES})."
            )
        if float(probs.min()) < -1e-5 or float(probs.max()) > 1.0 + 1e-5:
            raise AssertionError(
                f"Output values [{probs.min():.4f}, {probs.max():.4f}] are outside [0, 1]. "
                "Exported ONNX graph is missing final Softmax(axis=2)."
            )
        row_sums = probs.sum(axis=-1)
        max_sum_err = float(np.max(np.abs(row_sums - 1.0)))
        if max_sum_err > 1e-3:
            raise AssertionError(f"Row probability sums deviate from 1.0 by {max_sum_err:.6f}; Softmax missing.")

    sample_readings: dict[str, dict] = {}
    if fixtures_crop_dir and fixtures_crop_dir.is_dir():
        for crop_name, field_type in (
            ("invoice_no", "printed_digits"),
            ("date", "date"),
            ("item4_description", "text"),
            ("item2_description", "text"),
            ("item6_description", "text"),
            ("total_due", "amount"),
        ):
            crop_file = fixtures_crop_dir / f"{crop_name}.png"
            if crop_file.is_file():
                bgr = cv2.imread(str(crop_file), cv2.IMREAD_COLOR)
                tensor = preprocess_bgr_batch([bgr])
                probs = session.run([output_meta.name], {input_meta.name: tensor})[0]
                text, conf = greedy_ctc_decode(probs[0], chars, columns[field_type])
                sample_readings[crop_name] = {"text": text, "conf": round(conf, 5)}

    model_json = {
        "name": model_name,
        "sha256": sha256_hex,
        "bytes": len(onnx_bytes),
    }
    return {
        "status": "PASSED",
        "input_name": input_meta.name,
        "input_shape": input_meta.shape,
        "output_name": output_meta.name,
        "output_shape": output_meta.shape,
        "sample_readings_inv_0007": sample_readings,
        "model_json": model_json,
    }


# === 4. CLI ENTRYPOINT ===
def main() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description="Verify inference_latin.onnx contract for MyBizMate Scan.")
    parser.add_argument(
        "onnx_path",
        nargs="?",
        type=Path,
        default=repo_root / "modules/scanner/assets/scanner/inference_latin.onnx",
    )
    parser.add_argument(
        "--dict-path",
        type=Path,
        default=repo_root / "modules/scanner/assets/scanner/dict.txt",
    )
    parser.add_argument(
        "--name",
        type=str,
        default="PP-OCRv6 small, Latin cut, ft-v1",
        help="Model name to print for modules/scanner/assets/scanner/model.json",
    )
    parser.add_argument(
        "--fixtures-crop-dir",
        type=Path,
        default=repo_root / "fixtures/core/crops/inv_0007",
    )
    args = parser.parse_args()

    report = verify_onnx_model(
        onnx_path=args.onnx_path,
        dict_path=args.dict_path,
        model_name=args.name,
        fixtures_crop_dir=args.fixtures_crop_dir,
    )
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
