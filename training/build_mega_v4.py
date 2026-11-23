# Builds the 14,000-crop 5-pillar mega training dataset combining real human cursive
# (IAM + RIMES), real scanned receipts (SROIE), Augraphy Philippine carbon-copy
# Filipino invoices/2307, and clean printed replay (zero overlap with locked benchmarks).

# === 1. IMPORTS ===
from __future__ import annotations

import json
import random
import shutil
from pathlib import Path

import cv2
import numpy as np
from datasets import load_dataset
from PIL import Image

from build_cursive_suite import (
    CROP_PADDING_PX,
    CURSIVE_TRAIN_FONT_NAMES,
    FONTS_DIR,
    HAND_TRAIN_FONT_NAMES,
    PRINTED_FONT_NAME,
    detokenize_iam_text,
    font_supports_accents,
    load_allowed_chars,
    load_atc_codes,
    normalize_iam_line_to_crop,
    render_connected_crop,
    sample_filipino_label,
)
from build_polish_v3 import POLISH_HARD_WORDS, ROUNDED_SINGLE_STORY_FONTS

# === 2. CONSTANTS ===
TRAINING_DIR = Path(__file__).resolve().parent
DATASET_V4_DIR = TRAINING_DIR / "rec_dataset_v4_mega"
SEED = 20261125

TARGET_IAM_CROPS = 4500
TARGET_RIMES_CROPS = 3000
TARGET_SROIE_CROPS = 2500
TARGET_FILIPINO_CROPS = 3000
TARGET_PRINTED_CROPS = 1000


# === 3. REALISTIC PHILIPPINE CARBON-COPY & RECEIPT CROP HELPERS ===
def apply_philippine_carbon_copy_tint(bgr: np.ndarray, rng: random.Random) -> np.ndarray:
    """Simulates Philippine duplicate Sales Invoice carbon-copy blue/violet/yellowish sheets."""
    img = bgr.astype(np.float32)
    style = rng.choice(("blue_carbon", "purple_carbon", "yellow_dup", "pink_dup"))
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    ink_strength = np.clip((235.0 - gray) / 210.0, 0.0, 1.0)[:, :, None]

    if style == "blue_carbon":
        paper = np.array([248.0, 245.0, 240.0], dtype=np.float32)
        carbon_ink = np.array([175.0, 82.0, 48.0], dtype=np.float32)
    elif style == "purple_carbon":
        paper = np.array([246.0, 242.0, 247.0], dtype=np.float32)
        carbon_ink = np.array([150.0, 62.0, 118.0], dtype=np.float32)
    elif style == "yellow_dup":
        paper = np.array([218.0, 246.0, 250.0], dtype=np.float32)
        carbon_ink = np.array([95.0, 62.0, 52.0], dtype=np.float32)
    else:
        paper = np.array([234.0, 232.0, 248.0], dtype=np.float32)
        carbon_ink = np.array([115.0, 58.0, 65.0], dtype=np.float32)

    out = paper * (1.0 - ink_strength) + carbon_ink * ink_strength
    # Subtle carbon smudge noise
    np_rng = np.random.default_rng(rng.randint(0, 2**31 - 1))
    out += np_rng.normal(0.0, rng.uniform(2.0, 5.5), size=out.shape)
    out = np.clip(out, 0, 255).astype(np.uint8)
    if rng.random() < 0.55:
        out = cv2.GaussianBlur(out, (3, 3), sigmaX=rng.uniform(0.4, 0.9))
    return out


def normalize_sroie_receipt_crop(pil_img: Image.Image) -> np.ndarray | None:
    """Converts a real SROIE scanned receipt RGB crop to clean BGR matching phone crop geometry."""
    rgb = np.array(pil_img.convert("RGB"))
    h, w = rgb.shape[:2]
    if h < 12 or w < 16 or (w / max(1, h)) < 1.15:
        return None
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    if h > 72:
        new_w = max(16, int(round(w * (48.0 / h))))
        bgr = cv2.resize(bgr, (new_w, 48), interpolation=cv2.INTER_AREA)
    return bgr


# === 4. MAIN BUILDER ===
def main() -> None:
    rng = random.Random(SEED)
    allowed = load_allowed_chars()
    atc_codes = load_atc_codes()

    cursive_fonts = [FONTS_DIR / n for n in CURSIVE_TRAIN_FONT_NAMES if (FONTS_DIR / n).is_file()]
    hand_fonts = [FONTS_DIR / n for n in HAND_TRAIN_FONT_NAMES if (FONTS_DIR / n).is_file()]
    rounded_fonts = [FONTS_DIR / n for n in ROUNDED_SINGLE_STORY_FONTS if (FONTS_DIR / n).is_file()]
    printed_font = FONTS_DIR / PRINTED_FONT_NAME
    accent_fallback = next((p for p in (hand_fonts + [printed_font]) if font_supports_accents(p)), printed_font)

    if DATASET_V4_DIR.exists():
        shutil.rmtree(DATASET_V4_DIR)
    (DATASET_V4_DIR / "train").mkdir(parents=True)

    train_lines: list[str] = []
    idx_counter = 0

    # --- PILLAR 1: 4,500 Real Human English Cursive (Teklia/IAM-line train split) ---
    print("Pillar 1/5: Loading Teklia/IAM-line (train split)...", flush=True)
    iam_train = load_dataset("Teklia/IAM-line", split="train")
    iam_indices = list(range(len(iam_train)))
    rng.shuffle(iam_indices)
    iam_added = 0
    for idx in iam_indices:
        if iam_added >= TARGET_IAM_CROPS:
            break
        row = iam_train[idx]
        text = detokenize_iam_text(row["text"])
        if not (3 <= len(text) <= 42) or any(ch not in allowed for ch in text):
            continue
        crop = normalize_iam_line_to_crop(row["image"], rng)
        rel = f"train/{idx_counter:05d}_iam.png"
        cv2.imwrite(str(DATASET_V4_DIR / rel), crop)
        train_lines.append(f"{rel}\t{text}")
        idx_counter += 1
        iam_added += 1

    # --- PILLAR 2: 3,000 Real Human Handwritten Business Forms (Teklia/RIMES-2011-line train split) ---
    print("Pillar 2/5: Loading Teklia/RIMES-2011-line (train split)...", flush=True)
    rimes_train = load_dataset("Teklia/RIMES-2011-line", split="train")
    rimes_indices = list(range(len(rimes_train)))
    rng.shuffle(rimes_indices)
    rimes_added = 0
    for idx in rimes_indices:
        if rimes_added >= TARGET_RIMES_CROPS:
            break
        row = rimes_train[idx]
        text = detokenize_iam_text(row["text"])
        if not (3 <= len(text) <= 42) or any(ch not in allowed for ch in text):
            continue
        crop = normalize_iam_line_to_crop(row["image"], rng)
        rel = f"train/{idx_counter:05d}_rimes.png"
        cv2.imwrite(str(DATASET_V4_DIR / rel), crop)
        train_lines.append(f"{rel}\t{text}")
        idx_counter += 1
        rimes_added += 1

    # --- PILLAR 3: 2,500 Real Scanned Receipts (priyank-m/SROIE_2019_text_recognition train split) ---
    print("Pillar 3/5: Loading priyank-m/SROIE_2019_text_recognition (train split)...", flush=True)
    sroie_train = load_dataset("priyank-m/SROIE_2019_text_recognition", split="train")
    sroie_indices = list(range(len(sroie_train)))
    rng.shuffle(sroie_indices)
    sroie_added = 0
    for idx in sroie_indices:
        if sroie_added >= TARGET_SROIE_CROPS:
            break
        row = sroie_train[idx]
        text = " ".join(str(row["text"]).strip().split())
        if not (2 <= len(text) <= 34) or any(ch not in allowed for ch in text):
            continue
        crop = normalize_sroie_receipt_crop(row["image"])
        if crop is None:
            continue
        rel = f"train/{idx_counter:05d}_sroie.png"
        cv2.imwrite(str(DATASET_V4_DIR / rel), crop)
        train_lines.append(f"{rel}\t{text}")
        idx_counter += 1
        sroie_added += 1

    # --- PILLAR 4: 3,000 Filipino Invoices & BIR 2307 (Connected Cursive + Carbon Copy + Hard Pairs) ---
    print("Pillar 4/5: Rendering 3,000 Filipino cursive, rounded-pen, and carbon-copy crops...", flush=True)
    fil_added = 0
    for i in range(TARGET_FILIPINO_CROPS):
        roll = rng.random()
        if roll < 0.25:
            label = rng.choice(POLISH_HARD_WORDS)
            use_cursive = rng.random() < 0.40
            fp = rng.choice(cursive_fonts if use_cursive else rounded_fonts)
        else:
            use_cursive = (i % 20) < 11
            fp = rng.choice(cursive_fonts if use_cursive else hand_fonts)
            _, label = sample_filipino_label(rng, atc_codes, allowed, max_len=34, prefer_printed=False)
        if not label or any(ch not in allowed for ch in label):
            continue
        crop = render_connected_crop(label, fp, accent_fallback, rng, is_cursive=use_cursive, is_printed=False)
        # 25% authentic Philippine duplicate carbon-copy blue/purple/yellow/pink booklet effect
        if rng.random() < 0.25:
            crop = apply_philippine_carbon_copy_tint(crop, rng)
        rel = f"train/{idx_counter:05d}_fil.png"
        cv2.imwrite(str(DATASET_V4_DIR / rel), crop)
        train_lines.append(f"{rel}\t{label}")
        idx_counter += 1
        fil_added += 1

    # --- PILLAR 5: 1,000 Clean Printed Replay Crops ---
    print("Pillar 5/5: Rendering 1,000 clean printed replay crops...", flush=True)
    printed_added = 0
    for _ in range(TARGET_PRINTED_CROPS):
        _, label = sample_filipino_label(rng, atc_codes, allowed, max_len=28, prefer_printed=True)
        crop = render_connected_crop(label, printed_font, printed_font, rng, is_cursive=False, is_printed=True)
        rel = f"train/{idx_counter:05d}_printed.png"
        cv2.imwrite(str(DATASET_V4_DIR / rel), crop)
        train_lines.append(f"{rel}\t{label}")
        idx_counter += 1
        printed_added += 1

    (DATASET_V4_DIR / "train_list.txt").write_text("\n".join(train_lines) + "\n", encoding="utf-8")
    summary = {
        "dataset": "rec_dataset_v4_mega",
        "total": len(train_lines),
        "pillar_1_iam_human_cursive": iam_added,
        "pillar_2_rimes_human_business": rimes_added,
        "pillar_3_sroie_real_receipts": sroie_added,
        "pillar_4_filipino_cursive_carbon": fil_added,
        "pillar_5_printed_replay": printed_added,
    }
    (DATASET_V4_DIR / "dataset_info.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2), flush=True)


if __name__ == "__main__":
    main()
