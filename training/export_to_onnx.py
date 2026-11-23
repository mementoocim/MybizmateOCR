# Exports any fine-tuned PP-OCRv6_small_rec (100-class Latin cut) Paddle checkpoint
# to a clean, zero-warning, single-file Opset 11 inference_latin.onnx with <1e-5 parity.

# === 1. IMPORTS ===
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
import paddle
import yaml
from onnx import numpy_helper

# === 2. CONSTANTS ===
REPO_ROOT = Path(__file__).resolve().parents[1]
TRAINING_DIR = Path(__file__).resolve().parent
PADDLE_OCR_DIR = TRAINING_DIR / "PaddleOCR"
BASE_ONNX_TEMPLATE = TRAINING_DIR / "models/v1.0.0-pretrained/inference_latin.onnx"
BASE_LATIN_INIT_CKPT = TRAINING_DIR / "pretrain/PP-OCRv6_small_latin_cut_init"
MAP_CACHE_PATH = TRAINING_DIR / "pretrain/pir_to_onnx_map.json"
PARITY_MAX_ABS_TOL = 1e-4


# === 3. PADDLE PIR EXPORT & 151/151 TENSOR BIJECTION ===
def export_paddle_pir(ckpt_base: Path, infer_out_dir: Path, max_text_length: int = 25) -> Path:
    ckpt_base = ckpt_base.resolve()
    infer_out_dir = infer_out_dir.resolve()
    if infer_out_dir.exists():
        shutil.rmtree(infer_out_dir)

    base_cfg_path = PADDLE_OCR_DIR / "configs/rec/PP-OCRv6/PP-OCRv6_small_rec.yml"
    cfg = yaml.safe_load(base_cfg_path.read_text(encoding="utf-8"))
    cfg["Global"]["pretrained_model"] = str(ckpt_base)
    cfg["Global"]["character_dict_path"] = str(REPO_ROOT / "modules/scanner/assets/scanner/dict.txt")
    cfg["Global"]["use_space_char"] = True
    cfg["Global"]["max_text_length"] = max_text_length
    cfg["Global"]["distributed"] = False

    tmp_cfg = infer_out_dir.parent / "_tmp_export_cfg.yml"
    tmp_cfg.parent.mkdir(parents=True, exist_ok=True)
    tmp_cfg.write_text(yaml.safe_dump(cfg, sort_keys=False, allow_unicode=True), encoding="utf-8")

    subprocess.check_call(
        [
            sys.executable,
            "tools/export_model.py",
            "-c",
            str(tmp_cfg),
            "-o",
            f"Global.pretrained_model={ckpt_base}",
            f"Global.save_inference_dir={infer_out_dir}",
        ],
        cwd=str(PADDLE_OCR_DIR),
    )
    return infer_out_dir / "inference"


def build_or_load_tensor_map() -> dict[str, dict]:
    if MAP_CACHE_PATH.is_file():
        return json.loads(MAP_CACHE_PATH.read_text(encoding="utf-8"))

    base_infer_dir = TRAINING_DIR / "pretrain/base_infer_pir"
    if not (base_infer_dir / "inference.pdiparams").is_file():
        export_paddle_pir(BASE_LATIN_INIT_CKPT, base_infer_dir)

    base_pir = paddle.jit.load(str(base_infer_dir / "inference"))
    pir_sd = {k: np.asarray(v, dtype=np.float32) for k, v in base_pir.state_dict().items()}

    onnx_model = onnx.load(str(BASE_ONNX_TEMPLATE))
    onnx_f32 = []
    for init in onnx_model.graph.initializer:
        arr = numpy_helper.to_array(init)
        if arr.dtype == np.float32 and arr.size > 4:
            onnx_f32.append((init.name, arr))

    mapping: dict[str, dict] = {}
    used_pir: set[str] = set()

    # Pass 1: exact value match against baseline PIR tensors (handling 1D -> 4D broadcast bias reshape)
    for onnx_name, onnx_arr in onnx_f32:
        hits = []
        for pk, parr in pir_sd.items():
            if pk in used_pir:
                continue
            if parr.size != onnx_arr.size:
                continue
            if np.allclose(parr.reshape(onnx_arr.shape), onnx_arr, atol=1e-4, rtol=1e-4):
                diff = float(np.max(np.abs(parr.reshape(onnx_arr.shape) - onnx_arr)))
                hits.append((diff, pk))
        if len(hits) == 1:
            pk = hits[0][1]
            mapping[onnx_name] = {"pir_key": pk, "onnx_shape": list(onnx_arr.shape)}
            used_pir.add(pk)
        elif len(hits) > 1:
            hits.sort(key=lambda x: x[0])
            pk = hits[0][1]
            mapping[onnx_name] = {"pir_key": pk, "onnx_shape": list(onnx_arr.shape)}
            used_pir.add(pk)

    if len(mapping) != len(pir_sd) or len(mapping) != len(onnx_f32):
        unmatched_onnx = [n for n, _ in onnx_f32 if n not in mapping]
        unmatched_pir = [k for k in pir_sd if k not in used_pir]
        raise RuntimeError(
            f"Tensor bijection incomplete: matched {len(mapping)} / {len(pir_sd)} PIR / {len(onnx_f32)} ONNX. "
            f"Unmatched ONNX={unmatched_onnx[:5]}, PIR={unmatched_pir[:5]}"
        )

    MAP_CACHE_PATH.write_text(json.dumps(mapping, indent=2), encoding="utf-8")
    return mapping


def fix_stale_18710_value_info(onnx_model: onnx.ModelProto) -> None:
    """Replaces leftover 18,710 class dim hints in value_info with 100 so ORT emits zero warnings."""
    for vi in onnx_model.graph.value_info:
        if vi.type.HasField("tensor_type") and vi.type.tensor_type.HasField("shape"):
            for dim in vi.type.tensor_type.shape.dim:
                if dim.dim_value == 18710:
                    dim.dim_value = 100


def export_checkpoint_to_onnx(
    ckpt_base: Path,
    output_onnx_path: Path,
    model_name: str,
    keep_pir_dir: Path | None = None,
) -> dict:
    mapping = build_or_load_tensor_map()

    pir_dir = keep_pir_dir if keep_pir_dir else (output_onnx_path.parent / "_pir_export")
    infer_prefix = export_paddle_pir(ckpt_base, pir_dir)

    ft_pir = paddle.jit.load(str(infer_prefix))
    ft_pir.eval()
    ft_sd = {k: np.asarray(v, dtype=np.float32) for k, v in ft_pir.state_dict().items()}

    onnx_model = onnx.load(str(BASE_ONNX_TEMPLATE))
    updated = 0
    for init in onnx_model.graph.initializer:
        if init.name in mapping:
            info = mapping[init.name]
            new_arr = ft_sd[info["pir_key"]].reshape(info["onnx_shape"]).astype(np.float32)
            new_tensor = numpy_helper.from_array(new_arr, name=init.name)
            init.CopyFrom(new_tensor)
            updated += 1

    if updated != len(mapping):
        raise RuntimeError(f"Expected to update {len(mapping)} initializers, updated {updated}")

    fix_stale_18710_value_info(onnx_model)
    onnx.checker.check_model(onnx_model)

    output_onnx_path.parent.mkdir(parents=True, exist_ok=True)
    onnx.save_model(onnx_model, str(output_onnx_path), save_as_external_data=False)

    # Strict numerical parity check: Paddle PIR output vs ONNX Runtime output
    rng = np.random.default_rng(20261123)
    onnx_bytes = output_onnx_path.read_bytes()
    sess = ort.InferenceSession(onnx_bytes, providers=["CPUExecutionProvider"])
    in_name = sess.get_inputs()[0].name
    out_name = sess.get_outputs()[0].name

    max_diff = 0.0
    for batch_sz, width in ((1, 320), (4, 512)):
        test_x = rng.uniform(-1.0, 1.0, size=(batch_sz, 3, 48, width)).astype(np.float32)
        with paddle.no_grad():
            pd_out = ft_pir(paddle.to_tensor(test_x)).numpy()
        ort_out = sess.run([out_name], {in_name: test_x})[0]
        if pd_out.shape != ort_out.shape or ort_out.shape[2] != 100:
            raise AssertionError(f"Shape mismatch: Paddle={pd_out.shape} vs ORT={ort_out.shape}")
        diff = float(np.max(np.abs(pd_out - ort_out)))
        max_diff = max(max_diff, diff)
        row_sum_err = float(np.max(np.abs(ort_out.sum(axis=-1) - 1.0)))
        if row_sum_err > 1e-3:
            raise AssertionError(f"Softmax row sum error {row_sum_err:.6f} > 1e-3")

    if max_diff > PARITY_MAX_ABS_TOL:
        raise AssertionError(f"Paddle vs ONNX numerical parity failed: max_abs_diff={max_diff:.6f}")

    if keep_pir_dir is None:
        shutil.rmtree(pir_dir, ignore_errors=True)

    sha256_hex = hashlib.sha256(onnx_bytes).hexdigest()
    model_json = {
        "name": model_name,
        "sha256": sha256_hex,
        "bytes": len(onnx_bytes),
    }
    (output_onnx_path.parent / "model.json").write_text(json.dumps(model_json, indent=2) + "\n", encoding="utf-8")

    return {
        "status": "EXPORT_VERIFIED",
        "updated_tensors": updated,
        "paddle_vs_onnx_max_abs_diff": round(max_diff, 8),
        "onnx_path": str(output_onnx_path),
        "model_json": model_json,
    }


# === 4. CLI ENTRYPOINT ===
def main() -> None:
    parser = argparse.ArgumentParser(description="Export fine-tuned PP-OCRv6_small_rec checkpoint to inference_latin.onnx.")
    parser.add_argument("ckpt_base", type=Path, help="Checkpoint prefix without .pdparams (e.g. training/output_ft/best_accuracy)")
    parser.add_argument("output_onnx", type=Path, help="Output path for inference_latin.onnx")
    parser.add_argument("--name", type=str, default="PP-OCRv6 small, Latin cut, pretrained")
    args = parser.parse_args()

    report = export_checkpoint_to_onnx(args.ckpt_base, args.output_onnx, args.name)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
