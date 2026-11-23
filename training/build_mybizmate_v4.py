# Builds the 10,000-crop MyBizMate System-Matched training dataset:
# 50% Philippine Sales/Service Invoices & BIR 2307 (matching the app's 265 box types),
# 20% real SROIE scanned receipts, 20% real English human cursive (IAM), 10% printed replay.

# === 1. IMPORTS ===
from __future__ import annotations

import csv
import json
import random
import shutil
from pathlib import Path

import cv2

from build_cursive_suite import (
    CURSIVE_TRAIN_FONT_NAMES,
    FONTS_DIR,
    HAND_TRAIN_FONT_NAMES,
    MONTHS,
    PRINTED_FONT_NAME,
    font_supports_accents,
    load_allowed_chars,
    load_atc_codes,
    render_connected_crop,
    sample_filipino_label,
)
from build_mega_v4 import apply_philippine_carbon_copy_tint
from build_polish_v3 import POLISH_HARD_WORDS, ROUNDED_SINGLE_STORY_FONTS

# === 2. CONSTANTS ===
REPO_ROOT = Path(__file__).resolve().parents[1]
TRAINING_DIR = Path(__file__).resolve().parent
PREV_MEGA_DIR = TRAINING_DIR / "rec_dataset_v4_mega"
OUT_DATASET_DIR = TRAINING_DIR / "rec_dataset_v4_mybizmate"
ITEMS_CSV_PATH = REPO_ROOT / "fixtures/lists/items.csv"
PARTIES_CSV_PATH = REPO_ROOT / "fixtures/lists/parties.csv"
SEED = 20261126

TARGET_MYBIZMATE_CROPS = 5000
TARGET_SROIE_CROPS = 2000
TARGET_IAM_CROPS = 2000
TARGET_PRINTED_CROPS = 1000

PH_UNITS = (
    "pc", "pcs", "pack", "packs", "sachet", "sachets", "btl", "btls",
    "sack", "sacks", "bag", "bags", "tray", "trays", "can", "cans",
    "box", "boxes", "kg", "g", "L", "mL", "ml", "roll", "set", "unit", "units",
    "gal", "ream", "sheet", "doz", "bundle", "pair",
)

PH_EXTRA_ITEMS_AND_SERVICES = (
    "Alaska Evap 370ml", "Bear Brand 300g", "Lucky Me Pancit Canton", "Nescafe 3in1",
    "Coke 1.5L", "Rice 25kg", "Cement 40kg", "Sugar 1kg", "Cooking Oil 1L",
    "Eggs", "Bread Loaf", "Sardines 155g", "Corned Beef 150g", "Detergent 1kg",
    "Plywood 1/4", "Nails 2in", "Paint 1L", "Bottled Water 500ml",
    "Marine Plywood 1/2", "Portland Cement 40kg", "GI Sheet Corrugated", "PVC Pipe 1/2",
    "Hollow Blocks", "Deformed Bar 10mm", "Tie Wire 1kg", "Sand & Gravel",
    "Office supplies", "Bond Paper A4", "Printing service", "Delivery charge",
    "Hauling service", "Accounting retainer", "Bookkeeping fee", "Store rental",
    "Warehouse rental", "Electrical repair", "Plumbing labor", "Aircon cleaning",
    "Contract labor", "Equipment rental", "Security services", "Janitorial fee",
    "Professional fee", "Consultation fee", "Commission fee", "Freight charge",
    "Jalapeño Cheese", "Piña Juice 1L", "Café Barako 250g", "Éclair Box",
)

PH_EXTRA_PARTIES_AND_ADDRESSES = (
    "Parañaque Hardware", "Muñoz Trading", "Zuñiga Merchandising", "Sto. Niño Store",
    "Dasmariñas Cavite", "Biñan Laguna", "Peñafrancia Ave.", "Doña Juana Subd.",
    "Bañez Construction", "Castañeda Gen. Mdse.", "Ibañez Auto Supply", "San José Café",
    "Las Piñas Commercial", "Los Baños Bakery", "Mañalac Rice Mill",
    "Brgy. Tagaran, Cauayan City", "Diversion Rd., Ilagan City", "Maharlika Hwy., Santiago",
    "Burgos St., Cabatuan", "Rizal Ave., Cauayan City", "Centro East, Alicia, Isabela",
    "Public Market, Roxas", "Quezon Ave., Manila", "Ortigas Center, Pasig",
)


# === 3. SYSTEM VOCABULARY LOADER ===
def load_system_vocab(allowed: set[str]) -> tuple[list[str], list[str]]:
    items: list[str] = list(PH_EXTRA_ITEMS_AND_SERVICES)
    parties: list[str] = list(PH_EXTRA_PARTIES_AND_ADDRESSES)

    if ITEMS_CSV_PATH.is_file():
        with open(ITEMS_CSV_PATH, encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                name = (row.get("Name") or "").strip()
                if name and all(c in allowed for c in name):
                    items.append(name)

    if PARTIES_CSV_PATH.is_file():
        with open(PARTIES_CSV_PATH, encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                for col in ("Registered name", "Trade name", "Street †"):
                    val = (row.get(col) or "").strip()
                    if val and len(val) <= 34 and all(c in allowed for c in val):
                        parties.append(val)

    return sorted(set(items)), sorted(set(parties))


def sample_mybizmate_box_label(
    rng: random.Random,
    atc_codes: tuple[str, ...],
    items: list[str],
    parties: list[str],
    allowed: set[str],
) -> tuple[str, str]:
    """Samples fields matching the real 265-box distribution of Sales/Service Invoices & BIR 2307."""
    for _ in range(20):
        r = rng.random()
        if r < 0.42:
            # 42% Amounts (61% of all boxes across SI/Svc/2307!)
            ftype = "amount"
            roll = rng.random()
            if roll < 0.08:
                s = "0.00"
            elif roll < 0.35:
                whole = rng.randint(10, 995)
                s = f"{whole}.00" if rng.random() < 0.55 else f"{whole}"
                if rng.random() < 0.15:
                    s = f"{whole}.{rng.choice(('25', '50', '75', '18', '82'))}"
            else:
                val = rng.uniform(100.0, 650000.0)
                s = f"{val:,.2f}" if rng.random() < 0.70 else f"{int(round(val)):,}"
                if rng.random() < 0.22:
                    s = s.replace(",", "")
                if rng.random() < 0.18:
                    s = "P" + s
        elif r < 0.68:
            # 26% Short Filipino business text (items, units, customers, addresses, hard pairs)
            ftype = "text"
            sub = rng.random()
            if sub < 0.25:
                s = rng.choice(POLISH_HARD_WORDS)
            elif sub < 0.50:
                s = rng.choice(items)
            elif sub < 0.78:
                s = rng.choice(parties)
            else:
                s = rng.choice(PH_UNITS)
        elif r < 0.80:
            # 12% BIR 2307 ATC codes (all 161 official codes!)
            ftype, s = "code", rng.choice(atc_codes)
        elif r < 0.90:
            # 10% Quantities & fractions
            ftype = "number"
            if rng.random() < 0.55:
                s = str(rng.randint(1, 250))
            elif rng.random() < 0.88:
                frac = rng.choice(("1/2", "1/4", "3/4", "1/8"))
                s = f"{rng.randint(1, 9)} {frac}" if rng.random() < 0.65 else frac
            else:
                s = f"{rng.randint(1, 40)}.{rng.choice(('5', '25', '75'))}"
        else:
            # 10% Dates, TINs, Printed SI No., BIR 2307 Period & ZIP
            sub = rng.random()
            if sub < 0.42:
                ftype = "date"
                m, d, y = rng.randint(1, 12), rng.randint(1, 28), rng.randint(2024, 2028)
                st = rng.randint(0, 3)
                s = (
                    f"{MONTHS[m - 1]} {d}, {y}"
                    if st == 0
                    else f"{d} {MONTHS[m - 1]} {y}"
                    if st == 1
                    else f"{m:02d}{rng.choice(('-', '/'))}{d:02d}{rng.choice(('-', '/'))}{y % 100:02d}"
                    if st == 2
                    else f"{m}/{d}/{y}"
                )
            elif sub < 0.72:
                ftype = "tin"
                a, b, c = rng.randint(100, 999), rng.randint(0, 999), rng.randint(0, 999)
                branch = rng.choice(("", "000", "0000", "00000", "0001", "0002"))
                if rng.random() < 0.45:
                    s = f"{a}{b:03d}{c:03d}{branch}"
                else:
                    s = f"{a}-{b:03d}-{c:03d}" + (f"-{branch}" if branch else "")
            else:
                ftype = "digits"
                kind = rng.randint(0, 2)
                if kind == 0:
                    s = f"{rng.randint(1, 9999999):07d}"
                elif kind == 1:
                    m = rng.choice((1, 3, 4, 6, 7, 9, 10, 12))
                    d = 31 if m in (3, 12) else (30 if m in (6, 9) else 1)
                    s = f"{m:02d}{d:02d}{rng.randint(2024, 2028)}"
                else:
                    s = f"{rng.randint(1000, 9600)}"

        if 1 <= len(s) <= 34 and all(ch in allowed for ch in s):
            return ftype, s
    return "amount", "1,500.00"


# === 4. MAIN BUILDER ===
def main() -> None:
    rng = random.Random(SEED)
    allowed = load_allowed_chars()
    atc_codes = load_atc_codes()
    items, parties = load_system_vocab(allowed)

    cursive_fonts = [FONTS_DIR / n for n in CURSIVE_TRAIN_FONT_NAMES if (FONTS_DIR / n).is_file()]
    hand_fonts = [FONTS_DIR / n for n in HAND_TRAIN_FONT_NAMES if (FONTS_DIR / n).is_file()]
    rounded_fonts = [FONTS_DIR / n for n in ROUNDED_SINGLE_STORY_FONTS if (FONTS_DIR / n).is_file()]
    printed_font = FONTS_DIR / PRINTED_FONT_NAME
    accent_fallback = next((p for p in (hand_fonts + [printed_font]) if font_supports_accents(p)), printed_font)

    if OUT_DATASET_DIR.exists():
        shutil.rmtree(OUT_DATASET_DIR)
    (OUT_DATASET_DIR / "train").mkdir(parents=True)

    train_lines: list[str] = []
    idx_counter = 0

    # --- 1. REUSE ALREADY-EXTRACTED REAL ENGLISH IAM (2,000) & REAL SCANNED SROIE RECEIPTS (2,000) ---
    prev_list = (PREV_MEGA_DIR / "train_list.txt").read_text(encoding="utf-8").splitlines()
    iam_pool = [ln.split("\t", 1) for ln in prev_list if "_iam.png\t" in ln]
    sroie_pool = [ln.split("\t", 1) for ln in prev_list if "_sroie.png\t" in ln]
    rng.shuffle(iam_pool)
    rng.shuffle(sroie_pool)

    iam_kept = 0
    for rel_src, label in iam_pool[:TARGET_IAM_CROPS]:
        dst_rel = f"train/{idx_counter:05d}_iam.png"
        shutil.copy2(PREV_MEGA_DIR / rel_src, OUT_DATASET_DIR / dst_rel)
        train_lines.append(f"{dst_rel}\t{label}")
        idx_counter += 1
        iam_kept += 1

    sroie_kept = 0
    for rel_src, label in sroie_pool[:TARGET_SROIE_CROPS]:
        dst_rel = f"train/{idx_counter:05d}_sroie.png"
        shutil.copy2(PREV_MEGA_DIR / rel_src, OUT_DATASET_DIR / dst_rel)
        train_lines.append(f"{dst_rel}\t{label}")
        idx_counter += 1
        sroie_kept += 1

    # --- 2. GENERATE 5,000 MYBIZMATE SYSTEM-MATCHED INVOICES & BIR 2307 CROPS ---
    mybiz_added = 0
    for i in range(TARGET_MYBIZMATE_CROPS):
        ftype, label = sample_mybizmate_box_label(rng, atc_codes, items, parties, allowed)
        style_roll = rng.random()
        if style_roll < 0.45:
            use_cursive = True
            fp = rng.choice(cursive_fonts)
        elif style_roll < 0.78:
            use_cursive = False
            fp = rng.choice(rounded_fonts)
        else:
            use_cursive = False
            fp = rng.choice(hand_fonts)

        crop = render_connected_crop(label, fp, accent_fallback, rng, is_cursive=use_cursive, is_printed=False)
        # 25% Philippine duplicate carbon-copy Sales Invoice booklet effect
        if rng.random() < 0.25:
            crop = apply_philippine_carbon_copy_tint(crop, rng)
        dst_rel = f"train/{idx_counter:05d}_mbm_{ftype}.png"
        cv2.imwrite(str(OUT_DATASET_DIR / dst_rel), crop)
        train_lines.append(f"{dst_rel}\t{label}")
        idx_counter += 1
        mybiz_added += 1

    # --- 3. GENERATE 1,000 CLEAN PRINTED INVOICE / BIR 2307 REPLAY CROPS ---
    printed_added = 0
    for _ in range(TARGET_PRINTED_CROPS):
        ftype, label = sample_filipino_label(rng, atc_codes, allowed, max_len=28, prefer_printed=True)
        crop = render_connected_crop(label, printed_font, printed_font, rng, is_cursive=False, is_printed=True)
        dst_rel = f"train/{idx_counter:05d}_printed_{ftype}.png"
        cv2.imwrite(str(OUT_DATASET_DIR / dst_rel), crop)
        train_lines.append(f"{dst_rel}\t{label}")
        idx_counter += 1
        printed_added += 1

    (OUT_DATASET_DIR / "train_list.txt").write_text("\n".join(train_lines) + "\n", encoding="utf-8")
    summary = {
        "dataset": "rec_dataset_v4_mybizmate",
        "total": len(train_lines),
        "mybizmate_invoices_2307_50pct": mybiz_added,
        "sroie_real_receipts_20pct": sroie_kept,
        "iam_real_english_cursive_20pct": iam_kept,
        "clean_printed_replay_10pct": printed_added,
        "french_rimes_removed": True,
    }
    (OUT_DATASET_DIR / "dataset_info.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2), flush=True)


if __name__ == "__main__":
    main()
