# Converts MyBizMate Scan Annotation-Mode training .zip exports into a
# writer-split PaddleOCR rec_dataset, filtering unchecked and poisoned boxes.

# === 1. IMPORTS ===
from __future__ import annotations

import argparse
import json
import random
import sys
import zipfile
from pathlib import Path

# === 2. CONSTANTS ===
EXPECTED_FORMAT = "mybizmate-scan-training"
EXPECTED_VERSION = 1
DEFAULT_MAX_TEXT_LENGTH = 40
MIN_RECOMMENDED_WRITERS = 20
MIN_RECOMMENDED_VAL_WRITERS = 5


# === 3. EXPORT READER & WRITER-DISJOINT SPLITTER ===
def writer_key_of(scan: dict, fallback_install_id: str) -> str:
    tag = scan.get("tag")
    if isinstance(tag, dict) and tag.get("client") and tag.get("writer"):
        return f"{tag['client']}/{tag['writer']}"
    install_id = scan.get("installId") or fallback_install_id
    return f"install:{install_id}"


def convert_exports_to_dataset(
    output_dir: Path,
    export_zips: list[Path],
    dict_path: Path,
    val_writers_arg: list[str] | None = None,
    val_count: int = 5,
    max_text_length: int = DEFAULT_MAX_TEXT_LENGTH,
    skip_unedited_used_mismatch: bool = True,
    seed: int = 20261123,
    make_zip: bool = True,
) -> dict:
    zip_out_path = output_dir.with_suffix(".zip")
    if output_dir.exists() and any(output_dir.iterdir()):
        raise FileExistsError(f"Output directory must be empty: {output_dir}")
    if make_zip and zip_out_path.exists():
        raise FileExistsError(f"Output zip already exists: {zip_out_path}")

    allowed_chars = set(dict_path.read_text(encoding="utf-8").splitlines()) | {" "}

    # Deduplicate scans across multiple exports: keep newest exportedAt per (installId, scan.id)
    newest_scans: dict[tuple[str, str], tuple[str, Path, dict]] = {}
    total_scans_seen = 0

    for zip_path in export_zips:
        with zipfile.ZipFile(zip_path, "r") as zf:
            manifest = json.loads(zf.read("manifest.json").decode("utf-8"))
        if manifest.get("format") != EXPECTED_FORMAT or manifest.get("version") != EXPECTED_VERSION:
            raise ValueError(f"Unsupported training export format/version in {zip_path}")
        exported_at = str(manifest.get("exportedAt", ""))
        root_install_id = str(manifest.get("installId", ""))

        for scan in manifest.get("scans", []):
            total_scans_seen += 1
            scan_install = str(scan.get("installId") or root_install_id)
            scan_key = (scan_install, str(scan["id"]))
            prev = newest_scans.get(scan_key)
            if prev is None or exported_at >= prev[0]:
                newest_scans[scan_key] = (exported_at, zip_path, scan)

    stats = {
        "exports": len(export_zips),
        "scans_seen": total_scans_seen,
        "unique_scans": len(newest_scans),
        "duplicates_dropped": total_scans_seen - len(newest_scans),
        "boxes_seen": 0,
        "skipped_unchecked": 0,
        "skipped_empty": 0,
        "skipped_too_long": 0,
        "skipped_out_of_dict": 0,
        "unedited_used_diff": 0,
        "skipped_unedited_used_diff": 0,
        "normalized_peso_sign": 0,
    }

    box_types_seen: dict[str, str] = {}
    records_by_writer: dict[str, list[tuple[Path, str, str, str]]] = {}

    for (scan_install, _), (_, zip_path, scan) in sorted(newest_scans.items()):
        writer = writer_key_of(scan, scan_install)
        for box in scan.get("boxes", []):
            stats["boxes_seen"] += 1
            box_name = str(box["name"])
            box_type = str(box["type"])
            if box_name in box_types_seen and box_types_seen[box_name] != box_type:
                raise ValueError(f"Box '{box_name}' has conflicting types: {box_types_seen[box_name]} vs {box_type}")
            box_types_seen[box_name] = box_type

            if not box.get("confirmed", False):
                stats["skipped_unchecked"] += 1
                continue

            raw_label = str(box.get("label", ""))
            if "₱" in raw_label:
                raw_label = raw_label.replace("₱", "P")
                stats["normalized_peso_sign"] += 1

            if raw_label == "":
                stats["skipped_empty"] += 1
                continue
            if len(raw_label) > max_text_length:
                stats["skipped_too_long"] += 1
                continue
            if any(ch not in allowed_chars for ch in raw_label):
                stats["skipped_out_of_dict"] += 1
                continue

            is_unedited_mismatch = (not box.get("edited", False)) and (box.get("used") is not None)
            if is_unedited_mismatch:
                stats["unedited_used_diff"] += 1
                if skip_unedited_used_mismatch:
                    stats["skipped_unedited_used_diff"] += 1
                    continue

            records_by_writer.setdefault(writer, []).append((zip_path, str(box["crop"]), box_name, raw_label))

    all_writers = sorted(w for w, items in records_by_writer.items() if items)
    if not all_writers:
        raise ValueError("No valid checked training boxes found in the provided exports.")

    if val_writers_arg is not None:
        missing_val = [w for w in val_writers_arg if w not in records_by_writer or not records_by_writer[w]]
        if missing_val:
            raise ValueError(f"--val-writers names writers with no valid crops: {missing_val}")
        val_writers = sorted(set(val_writers_arg))
    else:
        rng = random.Random(seed)
        shuffled = list(all_writers)
        rng.shuffle(shuffled)
        actual_val_count = min(max(0, val_count), len(shuffled) - 1)
        val_writers = sorted(shuffled[:actual_val_count])

    train_writers = [w for w in all_writers if w not in set(val_writers)]
    if not train_writers:
        raise ValueError("Writer split left 0 writers for training.")

    if len(all_writers) < MIN_RECOMMENDED_WRITERS or len(val_writers) < MIN_RECOMMENDED_VAL_WRITERS:
        print(
            f"Warning: {len(all_writers)} total writers ({len(val_writers)} held out for val). "
            f"Recommended >= {MIN_RECOMMENDED_WRITERS} writers and >= {MIN_RECOMMENDED_VAL_WRITERS} in val.",
            file=sys.stderr,
        )

    (output_dir / "train").mkdir(parents=True, exist_ok=True)
    (output_dir / "val").mkdir(parents=True, exist_ok=True)

    open_zips: dict[Path, zipfile.ZipFile] = {zp: zipfile.ZipFile(zp, "r") for zp in export_zips}
    try:
        split_counts = {"train": 0, "val": 0}
        for split_name, split_writer_list in (("train", train_writers), ("val", val_writers)):
            lines: list[str] = []
            idx = 0
            for writer in split_writer_list:
                for zip_path, crop_in_zip, box_name, label in records_by_writer[writer]:
                    png_bytes = open_zips[zip_path].read(crop_in_zip)
                    rel_out = f"{split_name}/{idx:05d}_{box_name}.png"
                    (output_dir / rel_out).write_bytes(png_bytes)
                    lines.append(f"{rel_out}\t{label}")
                    idx += 1
            split_counts[split_name] = idx
            (output_dir / f"{split_name}_list.txt").write_text(
                "\n".join(lines) + ("\n" if lines else ""),
                encoding="utf-8",
            )
    finally:
        for zf in open_zips.values():
            zf.close()

    dataset_info = {
        "source": "mybizmate_scan_training_exports",
        "max_text_length": max_text_length,
        "train_writers": train_writers,
        "val_writers": val_writers,
        "train_crops": split_counts["train"],
        "val_crops": split_counts["val"],
        "stats": stats,
    }
    (output_dir / "dataset_info.json").write_text(json.dumps(dataset_info, indent=2), encoding="utf-8")

    if make_zip:
        root_name = output_dir.name
        with zipfile.ZipFile(zip_out_path, "w", compression=zipfile.ZIP_STORED) as out_zf:
            for path in sorted(output_dir.rglob("*")):
                if path.is_file():
                    arcname = f"{root_name}/{path.relative_to(output_dir).as_posix()}"
                    out_zf.write(path, arcname=arcname)

    return dataset_info


# === 4. CLI ENTRYPOINT ===
def main() -> None:
    parser = argparse.ArgumentParser(description="Convert MyBizMate Scan training export ZIPs to rec_dataset.")
    parser.add_argument("output_dir", type=Path, help="Target rec_dataset folder (must not exist or must be empty)")
    parser.add_argument("exports", nargs="+", type=Path, help="One or more exported training data .zip files")
    parser.add_argument(
        "--dict-path",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "modules/scanner/assets/scanner/dict.txt",
    )
    parser.add_argument("--val-writers", nargs="*", default=None, help="Pinned writer codes (e.g. C001/W02)")
    parser.add_argument("--val-count", type=int, default=5, help="Number of writers to hold out when unpinned")
    parser.add_argument("--max-text-length", type=int, default=DEFAULT_MAX_TEXT_LENGTH)
    parser.add_argument(
        "--keep-unedited-used-diff",
        action="store_true",
        help="Keep unedited boxes even when checks used a different value than raw reading",
    )
    parser.add_argument("--seed", type=int, default=20261123)
    parser.add_argument("--no-zip", action="store_true", help="Skip writing rec_dataset.zip")
    args = parser.parse_args()

    info = convert_exports_to_dataset(
        output_dir=args.output_dir,
        export_zips=args.exports,
        dict_path=args.dict_path,
        val_writers_arg=args.val_writers,
        val_count=args.val_count,
        max_text_length=args.max_text_length,
        skip_unedited_used_mismatch=not args.keep_unedited_used_diff,
        seed=args.seed,
        make_zip=not args.no_zip,
    )
    print(json.dumps(info, indent=2))


if __name__ == "__main__":
    main()
