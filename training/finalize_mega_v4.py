# Runs WiSE-FT sweep on v1.4.0-mega-cursive vs v1.0.0-pretrained, checks all 5
# benchmarks, and automatically promotes the winning v1.4.x model if it beats v1.3.0-wise-ft.

# === 1. IMPORTS ===
from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
import paddle

from eval_benchmark import evaluate_onnx_all_benchmarks
from export_to_onnx import export_checkpoint_to_onnx
from use_model_version import load_registry, promote_version, register_version

# === 2. CONSTANTS ===
TRAINING_DIR = Path(__file__).resolve().parent
PRETRAIN_CKPT = TRAINING_DIR / "pretrain/PP-OCRv6_small_latin_cut_init.pdparams"
MEGA_FT_CKPT = TRAINING_DIR / "models/v1.4.0-mybizmate/best_accuracy.pdparams"
ALPHAS = (0.45, 0.55, 0.65, 0.75, 0.85, 1.00)


# === 3. RUNNER ===
def composite_rank(metrics: dict) -> float:
    return 0.65 * metrics["composite_exact_acc"] + 0.35 * metrics["composite_char_acc"]


def main() -> None:
    paddle.set_device("cpu")
    sd_pre = paddle.load(str(PRETRAIN_CKPT))
    sd_ft = paddle.load(str(MEGA_FT_CKPT))

    tmp_dir = TRAINING_DIR / "models/_mega_wise_sweep"
    if tmp_dir.exists():
        shutil.rmtree(tmp_dir)
    tmp_dir.mkdir(parents=True)

    best_alpha = None
    best_rank = -1.0
    best_report = None
    best_ckpt_path = None
    best_onnx_path = None

    for alpha in ALPHAS:
        blended = {}
        for k, v_pre in sd_pre.items():
            a_pre = np.asarray(v_pre, dtype=np.float32)
            a_ft = np.asarray(sd_ft[k], dtype=np.float32)
            if "_mean" in k or "_variance" in k:
                blended[k] = paddle.to_tensor(a_pre)
            else:
                blended[k] = paddle.to_tensor(((1.0 - alpha) * a_pre + alpha * a_ft).astype(np.float32))

        ckpt_base = tmp_dir / f"mega_wise_{int(alpha * 100)}"
        paddle.save(blended, str(ckpt_base) + ".pdparams")
        onnx_out = tmp_dir / f"mega_wise_{int(alpha * 100)}.onnx"
        export_checkpoint_to_onnx(ckpt_base, onnx_out, model_name="PP-OCRv6 small, Latin cut, pretrained")
        rep = evaluate_onnx_all_benchmarks(onnx_out)
        b = rep["benchmarks"]
        rank = composite_rank(rep)
        print(
            f"mega alpha={alpha:.2f} -> CompExact={rep['composite_exact_acc']*100:.2f}% "
            f"| CompChar={rep['composite_char_acc']*100:.2f}% "
            f"| IAM={b['bench_a_real_human_cursive']['exact_acc']*100:.2f}% ({b['bench_a_real_human_cursive']['char_acc']*100:.2f}% char) "
            f"| Unseen={b['bench_b_unseen_cursive_fonts']['exact_acc']*100:.2f}% "
            f"| Hard={b['bench_c_hard_confusables']['exact_acc']*100:.2f}% "
            f"| inv0007={b['bench_d_inv0007']['exact_count']}/45 "
            f"| Printed={b['bench_e_printed_retention']['exact_acc']*100:.2f}%",
            flush=True,
        )
        if rank > best_rank and b["bench_e_printed_retention"]["exact_acc"] >= 0.99:
            best_rank = rank
            best_alpha = alpha
            best_report = rep
            best_ckpt_path = ckpt_base
            best_onnx_path = onnx_out

    assert best_alpha is not None and best_report is not None and best_onnx_path is not None

    win_dir = TRAINING_DIR / "models/v1.4.1-mybizmate-wise"
    win_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(str(best_ckpt_path) + ".pdparams", win_dir / "best_accuracy.pdparams")
    register_version(
        version="v1.4.1-mybizmate-wise",
        onnx_path=best_onnx_path,
        notes=f"MyBizMate 10k System-Matched (50% PH Invoices/2307 + 20% SROIE + 20% IAM + 10% Printed) WiSE-FT alpha={best_alpha:.2f}",
        metrics=best_report,
    )
    shutil.rmtree(tmp_dir, ignore_errors=True)

    # Compare against current active version (v1.3.0-wise-ft) before promoting
    reg = load_registry()
    current_ver = reg.get("active_version", "v1.3.0-wise-ft")
    current_metrics = reg["versions"].get(current_ver, {}).get("metrics", {})
    current_rank = composite_rank(current_metrics) if current_metrics else -1.0

    print(
        f"\nCHAMPION CHECK: v1.4.1-mybizmate-wise rank={best_rank:.5f} vs active {current_ver} rank={current_rank:.5f}",
        flush=True,
    )
    if best_rank > current_rank:
        promoted = promote_version("v1.4.1-mybizmate-wise")
        print("PROMOTED NEW CHAMPION -> v1.4.1-mybizmate-wise:", json.dumps(promoted, indent=2), flush=True)
        subprocess.check_call(
            [
                sys.executable,
                str(TRAINING_DIR / "verify_onnx_contract.py"),
                str(TRAINING_DIR.parent / "modules/scanner/assets/scanner/inference_latin.onnx"),
                "--name",
                "PP-OCRv6 small, Latin cut, pretrained",
            ]
        )
    else:
        print(f"Kept existing champion {current_ver} (v1.4.1-mybizmate-wise registered in models/registry.json for reference).", flush=True)


if __name__ == "__main__":
    main()
