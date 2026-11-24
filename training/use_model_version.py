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
# The app shows "<base>, <version>" (lib/versions.ts) and writes it into every scan and training export.
APP_MODEL_BASE_NAME = "PP-OCRv6 small, Latin cut"


def app_model_name(version: str) -> str:
    return f"{APP_MODEL_BASE_NAME}, {version}"


def write_json(path: Path, data: dict) -> None:
    # newline="\n": on Windows write_text would turn every line ending into CRLF.
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")


# === 3. REGISTRY HELPERS ===
def load_registry() -> dict:
    if REGISTRY_PATH.is_file():
        return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    return {"active_version": "v1.0.0-pretrained", "versions": {}}


def save_registry(reg: dict) -> None:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    write_json(REGISTRY_PATH, reg)


def register_version(
    version: str,
    onnx_path: Path,
    notes: str,
    metrics: dict | None = None,
) -> dict:
    version_dir = MODELS_DIR / version
    version_dir.mkdir(parents=True, exist_ok=True)
    dest_onnx = version_dir / "inference_latin.onnx"
    if onnx_path.resolve() != dest_onnx.resolve():
        shutil.copy2(onnx_path, dest_onnx)

    raw = dest_onnx.read_bytes()
    sha256_hex = hashlib.sha256(raw).hexdigest()
    model_json = {"name": app_model_name(version), "sha256": sha256_hex, "bytes": len(raw)}
    write_json(version_dir / "model.json", model_json)
    if metrics is not None:
        # Record the registered copy, repo-relative, not wherever the evaluated file happened to sit.
        metrics = {**metrics, "onnx_path": dest_onnx.relative_to(REPO_ROOT).as_posix()}
        write_json(version_dir / "metrics.json", metrics)

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

    # The app's model.json names the promoted version, so scans and training exports say which model read them.
    model_json = json.loads(src_meta.read_text(encoding="utf-8"))
    model_json["name"] = app_model_name(version)
    shutil.copy2(src_onnx, APP_SCANNER_ASSETS_DIR / "inference_latin.onnx")
    write_json(APP_SCANNER_ASSETS_DIR / "model.json", {"name": model_json["name"], "sha256": model_json["sha256"], "bytes": model_json["bytes"]})

    reg = load_registry()
    reg["active_version"] = version
    save_registry(reg)
    return {"promoted": version, "model_json": model_json}


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
