# Evaluates any inference_latin.onnx across all 5 locked benchmarks using exact
# C++ recognizer.cpp masked CTC decoding, reports top confusions, and updates registry.

# === 1. IMPORTS ===
from __future__ import annotations

import argparse
import json
import math
import time
from collections import Counter
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort
from rapidfuzz.distance import Levenshtein

from use_model_version import register_version
from verify_onnx_contract import build_allowed_columns, build_char_table, greedy_ctc_decode, preprocess_bgr_batch

# === 2. CONSTANTS ===
REPO_ROOT = Path(__file__).resolve().parents[1]
TRAINING_DIR = Path(__file__).resolve().parent
DICT_PATH = REPO_ROOT / "modules/scanner/assets/scanner/dict.txt"
BENCHMARKS_DIR = TRAINING_DIR / "benchmarks"

BENCHMARK_LIST = (
    ("bench_a_real_human_cursive", "Real Human Cursive (IAM)", 0.30),
    ("bench_b_unseen_cursive_fonts", "Unseen Cursive Fonts", 0.25),
    ("bench_c_hard_confusables", "Hard Confusables (a/g/u/v/0/1/Ñ)", 0.20),
    ("bench_d_inv0007", "Repo Fixture inv_0007", 0.15),
    ("bench_e_printed_retention", "Clean Printed Retention", 0.10),
)


# === 3. BENCHMARK EVALUATOR ===
def evaluate_onnx_all_benchmarks(onnx_path: Path, batch_size: int = 8) -> dict:
    chars = build_char_table(DICT_PATH)
    columns = build_allowed_columns(chars)
    sess = ort.InferenceSession(onnx_path.read_bytes(), providers=["CPUExecutionProvider"])
    in_name = sess.get_inputs()[0].name
    out_name = sess.get_outputs()[0].name

    results: dict[str, dict] = {}
    confusions: Counter[str] = Counter()
    total_crops = 0
    total_infer_s = 0.0
    composite_exact = 0.0
    composite_char = 0.0

    for bench_key, bench_label, weight in BENCHMARK_LIST:
        bdir = BENCHMARKS_DIR / bench_key
        manifest = json.loads((bdir / "manifest.json").read_text(encoding="utf-8"))
        exact = 0
        char_sim_sum = 0.0
        sample_mistakes = []

        for start in range(0, len(manifest), batch_size):
            chunk = manifest[start : start + batch_size]
            crops = [cv2.imread(str(bdir / row["file"]), cv2.IMREAD_COLOR) for row in chunk]
            tensor = preprocess_bgr_batch(crops)
            t0 = time.perf_counter()
            probs = sess.run([out_name], {in_name: tensor})[0]
            total_infer_s += time.perf_counter() - t0
            total_crops += len(chunk)

            for k, row in enumerate(chunk):
                ftype = row["type"]
                cols = columns.get(ftype, columns["text"])
                pred, conf = greedy_ctc_decode(probs[k], chars, cols)
                gt = row["label"]
                if pred == gt:
                    exact += 1
                else:
                    if len(sample_mistakes) < 12:
                        sample_mistakes.append({"file": row["file"], "gt": gt, "pred": pred, "conf": round(conf, 4)})
                    # Track 1-to-1 substitutions for error analysis
                    for tag, i1, i2, j1, j2 in Levenshtein.editops(gt, pred).as_opcodes():
                        if tag == "replace" and (i2 - i1) == 1 and (j2 - j1) == 1:
                            confusions[f"{gt[i1]}->{pred[j1]}"] += 1
                        elif tag == "delete" and gt[i1:i2] == " ":
                            confusions["<space>-><dropped>"] += 1
                max_len = max(1, len(gt), len(pred))
                char_sim_sum += 1.0 - (Levenshtein.distance(pred, gt) / max_len)

        n = max(1, len(manifest))
        exact_acc = round(exact / n, 5)
        char_acc = round(char_sim_sum / n, 5)
        composite_exact += weight * exact_acc
        composite_char += weight * char_acc
        results[bench_key] = {
            "label": bench_label,
            "exact_acc": exact_acc,
            "char_acc": char_acc,
            "exact_count": exact,
            "total": len(manifest),
            "sample_mistakes": sample_mistakes,
        }

    return {
        "onnx_path": str(onnx_path),
        "composite_exact_acc": round(composite_exact, 5),
        "composite_char_acc": round(composite_char, 5),
        "ms_per_crop": round((total_infer_s / max(1, total_crops)) * 1000.0, 2),
        "top_confusions": confusions.most_common(12),
        "benchmarks": results,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Run 5-benchmark cursive/invoice evaluation on an ONNX model.")
    parser.add_argument("onnx_path", type=Path)
    parser.add_argument("--register-version", type=str, default=None, help="If set, register metrics in training/models/registry.json")
    parser.add_argument("--notes", type=str, default="")
    args = parser.parse_args()

    report = evaluate_onnx_all_benchmarks(args.onnx_path)
    if args.register_version:
        register_version(
            version=args.register_version,
            onnx_path=args.onnx_path,
            notes=args.notes or args.register_version,
            metrics=report,
        )

    # Compact readable summary
    print(f"\n=== EVALUATION: {args.register_version or args.onnx_path.name} ===")
    print(
        f"Composite Exact: {report['composite_exact_acc']*100:.2f}% | "
        f"Composite Char: {report['composite_char_acc']*100:.2f}% | "
        f"Speed: {report['ms_per_crop']:.1f} ms/crop"
    )
    for k, b in report["benchmarks"].items():
        print(f"  {b['label']:34s} -> Exact: {b['exact_acc']*100:6.2f}% ({b['exact_count']:3d}/{b['total']:3d}) | Char: {b['char_acc']*100:6.2f}%")
    print("  Top confusions:", report["top_confusions"][:8])


if __name__ == "__main__":
    main()
