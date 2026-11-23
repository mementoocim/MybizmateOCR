# Runs a fast WiSE-FT (weight-space ensembling) sweep between v1.0.0-pretrained
# and v1.2.0-cursive-r2 to maximize both real human cursive and Filipino invoice accuracy.

# === 1. IMPORTS ===
from __future__ import annotations

import copy
import json
from pathlib import Path

import numpy as np
import paddle

from eval_benchmark import evaluate_onnx_all_benchmarks
from export_to_onnx import export_checkpoint_to_onnx
from use_model_version import register_version

# === 2. CONSTANTS ===
TRAINING_DIR = Path(__file__).resolve().parent
PRETRAIN_CKPT = TRAINING_DIR / "pretrain/PP-OCRv6_small_latin_cut_init.pdparams"
FT_CKPT = TRAINING_DIR / "models/v1.2.0-cursive-r2/best_accuracy.pdparams"
ALPHAS = (0.45, 0.55, 0.65, 0.75, 0.85)


# === 3. SWEEP ===
def main() -> None:
    paddle.set_device("cpu")
    sd_pre = paddle.load(str(PRETRAIN_CKPT))
    sd_ft = paddle.load(str(FT_CKPT))

    tmp_dir = TRAINING_DIR / "models/_wise_sweep"
    tmp_dir.mkdir(parents=True, exist_ok=True)

    best_alpha = None
    best_score = -1.0
    best_report = None
    best_ckpt_path = None
    best_onnx_path = None

    for alpha in ALPHAS:
        blended = {}
        for k, v_pre in sd_pre.items():
            a_pre = np.asarray(v_pre, dtype=np.float32)
            a_ft = np.asarray(sd_ft[k], dtype=np.float32)
            # Interpolate float weights; keep exact pretrained BN running stats intact
            if "_mean" in k or "_variance" in k:
                blended[k] = paddle.to_tensor(a_pre)
            else:
                blended[k] = paddle.to_tensor(((1.0 - alpha) * a_pre + alpha * a_ft).astype(np.float32))

        ckpt_base = tmp_dir / f"wise_{int(alpha * 100)}"
        paddle.save(blended, str(ckpt_base) + ".pdparams")
        onnx_out = tmp_dir / f"wise_{int(alpha * 100)}.onnx"
        export_checkpoint_to_onnx(ckpt_base, onnx_out, model_name="PP-OCRv6 small, Latin cut, pretrained")
        rep = evaluate_onnx_all_benchmarks(onnx_out)
        b = rep["benchmarks"]
        iam_ex = b["bench_a_real_human_cursive"]["exact_acc"]
        uns_ex = b["bench_b_unseen_cursive_fonts"]["exact_acc"]
        hrd_ex = b["bench_c_hard_confusables"]["exact_acc"]
        inv_cnt = b["bench_d_inv0007"]["exact_count"]
        prt_ex = b["bench_e_printed_retention"]["exact_acc"]
        rank = 0.65 * rep["composite_exact_acc"] + 0.35 * rep["composite_char_acc"]
        print(
            f"alpha={alpha:.2f} -> CompExact={rep['composite_exact_acc']*100:.2f}% "
            f"| CompChar={rep['composite_char_acc']*100:.2f}% "
            f"| IAM={iam_ex*100:.2f}% ({b['bench_a_real_human_cursive']['char_acc']*100:.2f}% char) "
            f"| Unseen={uns_ex*100:.2f}% | Hard={hrd_ex*100:.2f}% "
            f"| inv0007={inv_cnt}/45 | Printed={prt_ex*100:.2f}%",
            flush=True,
        )
        if rank > best_score and prt_ex >= 0.99:
            best_score = rank
            best_alpha = alpha
            best_report = rep
            best_ckpt_path = ckpt_base
            best_onnx_path = onnx_out

    print(f"\nBEST WiSE-FT alpha={best_alpha} -> CompExact={best_report['composite_exact_acc']*100:.2f}% | CompChar={best_report['composite_char_acc']*100:.2f}%")
    if best_alpha is not None and best_report is not None and best_onnx_path is not None:
        final_dir = TRAINING_DIR / "models/v1.3.0-wise-ft"
        final_dir.mkdir(parents=True, exist_ok=True)
        # Copy best checkpoint and register version cleanly
        import shutil
        shutil.copy2(str(best_ckpt_path) + ".pdparams", final_dir / "best_accuracy.pdparams")
        register_version(
            version="v1.3.0-wise-ft",
            onnx_path=best_onnx_path,
            notes=f"WiSE-FT weight-space ensemble (alpha={best_alpha:.2f} * v1.2.0-cursive-r2 + {1-best_alpha:.2f} * v1.0.0-pretrained)",
            metrics=best_report,
        )
        shutil.rmtree(tmp_dir, ignore_errors=True)
        print("Registered winning WiSE-FT model as v1.3.0-wise-ft!")


if __name__ == "__main__":
    main()
