# Manages SemVer model versions in training/models/registry.json and promotes
# or rolls back modules/scanner/assets/scanner/inference_latin.onnx + model.json.

# === 1. IMPORTS ===
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

# === 2. CONSTANTS ===
REPO_ROOT = Path(__file__).resolve().parents[1]
MODELS_DIR = Path(__file__).resolve().parent / "models"
REGISTRY_PATH = MODELS_DIR / "registry.json"
APP_SCANNER_ASSETS_DIR = REPO_ROOT / "modules/scanner/assets/scanner"
DEFAULT_APP_MODEL_NAME = "PP-OCRv6 small, Latin cut, pretrained"


# === 3. REGISTRY HELPERS ===
def load_registry() -> dict:
    if REGISTRY_PATH.is_file():
        return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    return {"active_version": "v1.0.0-pretrained", "versions": {}}


def save_registry(reg: dict) -> None:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    REGISTRY_PATH.write_text(json.dumps(reg, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def register_version(
    version: str,
    onnx_path: Path,
    notes: str,
    metrics: dict | None = None,
    app_model_name: str = DEFAULT_APP_MODEL_NAME,
) -> dict:
    version_dir = MODELS_DIR / version
    version_dir.mkdir(parents=True, exist_ok=True)
    dest_onnx = version_dir / "inference_latin.onnx"
    if onnx_path.resolve() != dest_onnx.resolve():
        shutil.copy2(onnx_path, dest_onnx)

    raw = dest_onnx.read_bytes()
    sha256_hex = hashlib.sha256(raw).hexdigest()
    model_json = {"name": app_model_name, "sha256": sha256_hex, "bytes": len(raw)}
    (version_dir / "model.json").write_text(json.dumps(model_json, indent=2) + "\n", encoding="utf-8")
    if metrics is not None:
        (version_dir / "metrics.json").write_text(json.dumps(metrics, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    reg = load_registry()
    reg["versions"][version] = {
        "version": version,
        "registered_at_utc": datetime.now(timezone.utc).isoformat(),
        "sha256": sha256_hex,
        "bytes": len(raw),
        "notes": notes,
        "metrics": metrics or {},
    }
    save_registry(reg)
    return reg["versions"][version]


def promote_version(version: str) -> dict:
    version_dir = MODELS_DIR / version
    src_onnx = version_dir / "inference_latin.onnx"
    src_meta = version_dir / "model.json"
    if not src_onnx.is_file() or not src_meta.is_file():
        raise FileNotFoundError(f"Version '{version}' is incomplete in {version_dir}")

    shutil.copy2(src_onnx, APP_SCANNER_ASSETS_DIR / "inference_latin.onnx")
    shutil.copy2(src_meta, APP_SCANNER_ASSETS_DIR / "model.json")

    reg = load_registry()
    reg["active_version"] = version
    save_registry(reg)
    return {"promoted": version, "model_json": json.loads(src_meta.read_text(encoding="utf-8"))}


# === 4. CLI ENTRYPOINT ===
def main() -> None:
    parser = argparse.ArgumentParser(description="List, register, promote, or rollback MyBizMate Scan OCR model versions.")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list", help="Show all registered model versions and active version")

    p_use = sub.add_parser("use", help="Promote or roll back app model to a registered SemVer version")
    p_use.add_argument("version", type=str, help="Version tag (e.g. v1.0.0-pretrained, v1.2.0-cursive-r2)")

    args = parser.parse_args()
    if args.cmd == "list":
        print(json.dumps(load_registry(), indent=2, ensure_ascii=False))
    elif args.cmd == "use":
        print(json.dumps(promote_version(args.version), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
