# Builds the targeted Round 3 hard-negative & real human cursive polish dataset
# (3,000 crops) to push all 5 benchmarks above v1.0.0-pretrained simultaneously.

# === 1. IMPORTS ===
from __future__ import annotations

import json
import random
import shutil
from pathlib import Path

import cv2
from datasets import load_dataset

from build_cursive_suite import (
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

# === 2. CONSTANTS ===
TRAINING_DIR = Path(__file__).resolve().parent
DATASET_V3_DIR = TRAINING_DIR / "rec_dataset_v3_polish"
SEED = 20261124

ROUNDED_SINGLE_STORY_FONTS = (
    "PatrickHand-Regular.ttf",
    "ComicNeue-Regular.ttf",
    "ArchitectsDaughter-Regular.ttf",
    "Gaegu-Regular.ttf",
    "GochiHand-Regular.ttf",
    "ShortStack-Regular.ttf",
    "Mali-Regular.ttf",
    "Delius-Regular.ttf",
)

# Targeted hard-negative vocabulary covering Round 2's exact remaining error patterns
POLISH_HARD_WORDS = (
    # Single-story rounded a/g/q words (general invoice vocabulary, zero test leakage)
    "Fresh Eggs", "Brown Eggs", "Eggs", "Tray of Eggs", "Egg Noodles",
    "Bread", "Bread Loaf", "Wheat Bread", "Loaf Bread", "Garlic Bread",
    "Nails", "Nails 2in", "Steel Nails 3in", "Roofing Nails", "Common Nails 4in",
    "Alaska Milk", "Alaska Evap 370ml", "Evap Milk 370ml", "Condensed Milk 300ml",
    "Sugar", "Washed Sugar 1kg", "Brown Sugar 50kg", "Bag of Rice", "Paper Bag",
    "Garbage Bag", "Sardines Can", "Tuna Flakes", "Pasta Sauce", "Salad Oil",
    "Water Gallon", "Mineral Water", "Gas Refill", "Maggi Seasoning", "Vinegar 1L",
    "Cabbage", "Baguio Beans", "Squash", "Liquid Soap", "Quality Paper",
    "Hardware", "General Merchandising", "Trading Corp.", "Grand Market",
    # u/v/y/r/s/n/m confusable words & dates
    "1 Jun 2024", "28 Jun 2028", "15 Jul 2026", "21 Jul 2025", "23 Aug 2025",
    "Aug 28, 2025", "Sep 20, 2026", "Nov 23, 2026", "Oct 15, 2025",
    "unit", "units", "Utility bill", "Villanueva Trading", "Laundry soap",
    "Value Pack", "Survey fee", "Courier service", "Number of items",
    # 0/O/o, 1/I/l, mL/ml, and fraction spaces
    "1 1/2", "2 1/2", "3 1/2", "1 1/4", "2 3/4", "3 1/8", "4 1/8", "5 1/4",
    "Marine Plywood 1/2", "Plywood 1/4", "PVC Pipe 1/2", "Cooking Oil 1L",
    "Baguio Oil 1L", "Palm Oil 1L", "Oil 1L", "Garlic 1kg", "Salt 1kg",
    "Portland Cement 40kg", "370ml", "500ml", "500mL", "250mL", "mL", "ml",
    "171,111", "11,100.00", "10,010.50", "24,377", "419,626.03", "0007655",
    "WC100", "WI010", "WI071", "WC158", "WB082",
    # Filipino Ñ/ñ/É/é preservation
    "Parañaque Hardware", "Muñoz Trading", "Zuñiga Mdse.", "Sto. Niño Store",
    "Dasmariñas Cavite", "Biñan Laguna", "Ibañez Auto Supply", "San José Café",
    "Las Piñas Supply", "Los Baños Bakery", "Peñafrancia Ave.", "Éclair Box",
)


# === 3. BUILDER ===
def main() -> None:
    rng = random.Random(SEED)
    allowed = load_allowed_chars()
    atc_codes = load_atc_codes()

    cursive_fonts = [FONTS_DIR / n for n in CURSIVE_TRAIN_FONT_NAMES if (FONTS_DIR / n).is_file()]
    hand_fonts = [FONTS_DIR / n for n in HAND_TRAIN_FONT_NAMES if (FONTS_DIR / n).is_file()]
    rounded_fonts = [FONTS_DIR / n for n in ROUNDED_SINGLE_STORY_FONTS if (FONTS_DIR / n).is_file()]
    printed_font = FONTS_DIR / PRINTED_FONT_NAME
    accent_fallback = next((p for p in (hand_fonts + [printed_font]) if font_supports_accents(p)), printed_font)

    if DATASET_V3_DIR.exists():
        shutil.rmtree(DATASET_V3_DIR)
    (DATASET_V3_DIR / "train").mkdir(parents=True)

    iam_ds = load_dataset("Teklia/IAM-line")
    train_lines: list[str] = []
    idx_counter = 0

    # 1. 1,500 Real Human Cursive IAM train lines (using a fresh seed/slice from the 6,482 train split!)
    iam_indices = list(range(len(iam_ds["train"])))
    rng.shuffle(iam_indices)
    iam_added = 0
    for idx in iam_indices:
        if iam_added >= 1500:
            break
        row = iam_ds["train"][idx]
        text = detokenize_iam_text(row["text"])
        if not (3 <= len(text) <= 40) or any(ch not in allowed for ch in text):
            continue
        crop = normalize_iam_line_to_crop(row["image"], rng)
        rel = f"train/{idx_counter:05d}_iam_polish.png"
        cv2.imwrite(str(DATASET_V3_DIR / rel), crop)
        train_lines.append(f"{rel}\t{text}")
        idx_counter += 1
        iam_added += 1

    # 2. 1,100 Hard-Negative Rounded-Pen & Cursive Invoice Crops
    for i in range(1100):
        roll = rng.random()
        if roll < 0.55:
            label = rng.choice(POLISH_HARD_WORDS)
            use_cursive = rng.random() < 0.35
            fp = rng.choice(cursive_fonts if use_cursive else rounded_fonts)
            crop = render_connected_crop(label, fp, accent_fallback, rng, is_cursive=use_cursive, is_printed=False)
        else:
            use_cursive = rng.random() < 0.55
            fp = rng.choice(cursive_fonts if use_cursive else hand_fonts)
            _, label = sample_filipino_label(rng, atc_codes, allowed, max_len=34, prefer_printed=False)
            crop = render_connected_crop(label, fp, accent_fallback, rng, is_cursive=use_cursive, is_printed=False)
        if not all(c in allowed for c in label):
            continue
        rel = f"train/{idx_counter:05d}_hard.png"
        cv2.imwrite(str(DATASET_V3_DIR / rel), crop)
        train_lines.append(f"{rel}\t{label}")
        idx_counter += 1

    # 3. 400 Clean Printed Replay Crops (lock Printed Retention at 100%)
    for i in range(400):
        _, label = sample_filipino_label(rng, atc_codes, allowed, max_len=28, prefer_printed=True)
        crop = render_connected_crop(label, printed_font, printed_font, rng, is_cursive=False, is_printed=True)
        rel = f"train/{idx_counter:05d}_printed.png"
        cv2.imwrite(str(DATASET_V3_DIR / rel), crop)
        train_lines.append(f"{rel}\t{label}")
        idx_counter += 1

    (DATASET_V3_DIR / "train_list.txt").write_text("\n".join(train_lines) + "\n", encoding="utf-8")
    print(json.dumps({"total": len(train_lines), "iam_human": iam_added, "hard_cursive_rounded": 1100, "printed": 400}, indent=2))


if __name__ == "__main__":
    main()
