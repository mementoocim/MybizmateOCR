# Builds the locked 5-benchmark cursive/invoice evaluation suite and the
# 3-pillar cursive + Filipino invoice + printed training dataset (rec_dataset_v2).

# === 1. IMPORTS ===
from __future__ import annotations

import io
import json
import math
import random
import re
import shutil
from pathlib import Path
from typing import Sequence

import cv2
import numpy as np
from datasets import load_dataset
from PIL import Image, ImageDraw, ImageFilter, ImageFont

# === 2. CONSTANTS ===
REPO_ROOT = Path(__file__).resolve().parents[1]
TRAINING_DIR = Path(__file__).resolve().parent
FONTS_DIR = TRAINING_DIR / "fonts"
DICT_PATH = REPO_ROOT / "modules/scanner/assets/scanner/dict.txt"
ATC_PATH = REPO_ROOT / "lib/checks/atc2307.json"
INV0007_TRUTH_PATH = REPO_ROOT / "assets/samples/inv_0007.json"
INV0007_META_PATH = REPO_ROOT / "fixtures/core/crops/inv_0007/expected.json"
INV0007_CROPS_DIR = REPO_ROOT / "fixtures/core/crops/inv_0007"

BENCHMARKS_DIR = TRAINING_DIR / "benchmarks"
DATASET_V2_DIR = TRAINING_DIR / "rec_dataset_v2"

CROP_PADDING_PX = 6
SEED = 20261123
ACCENTED_CHARS = ("É", "Ñ", "é", "ñ")

# Strictly held-out fonts NEVER seen in training (real cursive + slanted + neat print)
HELD_OUT_VAL_FONT_NAMES = (
    "Cedarville-Cursive.ttf",
    "ReenieBeanie.ttf",
    "Caveat-Variable.ttf",
    "Handlee-Regular.ttf",
    "ShadowsIntoLight.ttf",
)

PRINTED_FONT_NAME = "Arimo-Printed.ttf"

CURSIVE_TRAIN_FONT_NAMES = (
    "HomemadeApple-Regular.ttf",
    "LaBelleAurore.ttf",
    "NothingYouCouldDo.ttf",
    "BadScript-Regular.ttf",
    "MarckScript-Regular.ttf",
    "DancingScript-Variable.ttf",
    "Satisfy-Regular.ttf",
    "Yellowtail-Regular.ttf",
    "Zeyada.ttf",
)

HAND_TRAIN_FONT_NAMES = (
    "GochiHand-Regular.ttf",
    "GloriaHallelujah.ttf",
    "Gaegu-Regular.ttf",
    "Kalam-Regular.ttf",
    "Courgette-Regular.ttf",
    "IndieFlower-Regular.ttf",
    "Neucha.ttf",
    "PatrickHand-Regular.ttf",
    "ArchitectsDaughter-Regular.ttf",
    "ShortStack-Regular.ttf",
    "Delius-Regular.ttf",
    "Mali-Regular.ttf",
    "ComicNeue-Regular.ttf",
)

# === 3. FILIPINO DOMAIN & HARD-CONFUSABLE VOCABULARY ===
SAMPLE_UNITS = (
    "pc", "pcs", "pack", "packs", "box", "boxes", "tray", "sack", "sacks",
    "kg", "g", "L", "mL", "ml", "can", "cans", "btl", "btls", "roll", "set",
    "pair", "bundle", "doz", "gal", "bag", "sheet", "ream", "unit", "units",
)

SAMPLE_ITEMS = (
    "Eggs", "Fresh Eggs", "Salted Eggs", "Sugar", "Brown Sugar", "Sardines",
    "Bread Loaf", "Alaska Evap 370ml", "Alaska Cond 300ml", "Nails 2in",
    "Nails 3in", "Common Nails 4in", "Rice 25kg", "Sinandomeng Rice 50kg",
    "Plywood 1/4", "Marine Plywood 1/2", "Bear Brand 300g", "Portland Cement 40kg",
    "Holcim Cement 40kg", "GI Sheet Corrugated", "PVC Pipe 1/2", "PVC Pipe 3/4",
    "Cooking Oil 1L", "Palm Oil 1L", "Soy Sauce 385mL", "Vinegar 385mL",
    "Coffee 3-in-1", "Nescafe 200g", "Milo 1kg", "Flour 25kg", "Salt 1kg",
    "Office supplies", "Bond Paper A4", "Ballpen Black", "Printing service",
    "Delivery fee", "Hauling service", "Accounting retainer", "Store rental",
    "Electrical repair", "Plumbing labor", "Equipment maintenance",
    "Jalapeño Cheese", "Piña Juice 1L", "Café Barako 250g", "Éclair Box",
    "Niño Notebook", "Cañon Elbow 1/2", "Maggi Magic Sarap", "Baguio Oil 1L",
)

FILIPINO_PARTIES_AND_PLACES = (
    "Parañaque Hardware", "Muñoz Trading", "Zuñiga Merchandising",
    "Sto. Niño Sari-Sari", "Dasmariñas Cavite", "Biñan Laguna",
    "Peñafrancia Ave.", "Doña Juana Subd.", "Bañez Construction",
    "Castañeda Gen. Mdse.", "Ibañez Auto Supply", "Yañez Agrivet",
    "San José Del Monte", "Café Élan Catering", "Étoile Office Center",
    "Los Baños Bakery", "Las Piñas Commercial", "Mañalac Rice Mill",
    "Torres Construction", "Flores Grocery", "Reyes Lumber Supply",
    "Dela Cruz Enterprises", "Bautista Hardware", "Villanueva Trading",
    "Santiago City Isabela", "Diversion Rd. Ilagan", "Quezon Ave. Manila",
)

HARD_CONFUSABLE_SAMPLES = (
    # a/g/q confusions (targets inv_0007 Eggs, Alaska, Nails, Sugar, Bag)
    ("text", "Eggs"), ("text", "Alaska Evap 370ml"), ("text", "Nails 2in"),
    ("text", "Sugar"), ("text", "Bag 25kg"), ("text", "Baguio Oil 1L"),
    ("text", "Maggi Sauce"), ("text", "Gas Tank 11kg"), ("text", "Tagalog Guide"),
    ("text", "Garlic 1kg"), ("text", "Cabbage 2kg"), ("text", "Vinegar 500ml"),
    # u/v/y confusions (targets Round 1 Jun/Aug/unit/Twenty mistakes)
    ("date", "28 Jun 2028"), ("date", "23 Aug 2025"), ("date", "15 Jul 2026"),
    ("text", "unit"), ("text", "units"), ("text", "Plywood 1/4"),
    ("text", "Twenty-four pesos"), ("text", "Value Pack"), ("text", "Buying fee"),
    ("text", "Laundry soap"), ("text", "Utility bill"), ("text", "Survey fee"),
    # 0/O/o and 1/I/l confusions + mixed units
    ("text", "Portland Cement 40kg"), ("text", "Cooking Oil 1L"), ("text", "Oil 1L"),
    ("text", "mL"), ("text", "ml"), ("text", "500mL"), ("text", "370ml"),
    ("code", "WC100"), ("code", "WI010"), ("code", "WC158"), ("code", "WB082"),
    ("printed_digits", "0007655"), ("printed_digits", "0100109"),
    # Tight space / fraction confusions
    ("number", "3 1/8"), ("number", "1 1/2"), ("number", "2 3/4"), ("number", "1/4"),
    ("date", "23 Sep 2024"), ("date", "25 Jun 2027"), ("date", "Sep 20, 2026"),
    ("text", "Torres Construction"), ("text", "Alaska Evap 370ml"),
    # Filipino Ñ/ñ/É/é preservation
    ("text", "Parañaque Hardware"), ("text", "Muñoz Trading"), ("text", "Sto. Niño Store"),
    ("text", "Dasmariñas Cavite"), ("text", "Biñan Laguna"), ("text", "San José Café"),
    ("text", "Las Piñas Supply"), ("text", "Éclair Pastry"), ("text", "Peñafrancia St."),
)

MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


# === 4. HELPERS: ALLOWED CHARS, ACCENT SUPPORT & ELASTIC CURSIVE RENDERING ===
def load_allowed_chars() -> set[str]:
    return set(DICT_PATH.read_text(encoding="utf-8").splitlines()) | {" "}


def load_atc_codes() -> tuple[str, ...]:
    items = json.loads(ATC_PATH.read_text(encoding="utf-8"))
    return tuple(sorted({str(it["code"]) for it in items if it.get("code")}))


def font_supports_accents(font_path: Path) -> bool:
    try:
        font = ImageFont.truetype(str(font_path), size=32)
        mask_n = font.getmask("Ñ")
        mask_e = font.getmask("é")
        mask_box = font.getmask("\uffff")
        return (
            mask_n.size[0] > 0
            and mask_e.size[0] > 0
            and list(mask_n) != list(mask_box)
            and list(mask_e) != list(mask_box)
        )
    except OSError:
        return False


def apply_elastic_wobble(gray_mask: np.ndarray, rng: random.Random, strength: float) -> np.ndarray:
    """Applies smooth low-frequency elastic displacement to emulate organic hand wobble."""
    h, w = gray_mask.shape
    if h < 12 or w < 16 or strength <= 0.0:
        return gray_mask
    np_rng = np.random.default_rng(rng.randint(0, 2**31 - 1))
    dx = np_rng.uniform(-1.0, 1.0, size=(h, w)).astype(np.float32)
    dy = np_rng.uniform(-1.0, 1.0, size=(h, w)).astype(np.float32)
    sigma = rng.uniform(5.0, 10.0)
    dx = cv2.GaussianBlur(dx, (0, 0), sigmaX=sigma, sigmaY=sigma) * (strength * 14.0)
    dy = cv2.GaussianBlur(dy, (0, 0), sigmaX=sigma, sigmaY=sigma) * (strength * 10.0)
    grid_x, grid_y = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    return cv2.remap(gray_mask, grid_x + dx, grid_y + dy, interpolation=cv2.INTER_LINEAR, borderValue=0)


def apply_camera_paper_effects(bgr: np.ndarray, rng: random.Random, is_printed: bool = False) -> np.ndarray:
    """Simulates realistic phone capture: shadow gradient, grain, rule stubs, blur, JPEG."""
    h, w = bgr.shape[:2]
    img = bgr.astype(np.float32)
    np_rng = np.random.default_rng(rng.randint(0, 2**31 - 1))

    # Uneven lighting / phone shadow ramp across crop
    if rng.random() < (0.35 if is_printed else 0.65):
        shadow_delta = rng.uniform(-18.0, 18.0)
        ramp = np.linspace(0.0, shadow_delta, w, dtype=np.float32).reshape((1, w, 1))
        img = img + ramp

    # Paper texture / camera sensor noise
    sigma = rng.uniform(0.8, 2.2 if is_printed else 4.2)
    img = img + np_rng.normal(0.0, sigma, size=(h, w, 1))

    # Occasional faint residual rule stub left over after box_cut.cpp rule removal
    if rng.random() < 0.25 and h > 18:
        line_y = h - rng.randint(2, 6)
        img[line_y : line_y + 1, :, :] -= rng.uniform(6.0, 18.0)

    # Occasional faint vertical comb-tick smudge (BIR 2307 style)
    if rng.random() < 0.12 and w > 30 and h > 16:
        tx = rng.randint(6, w - 6)
        img[h - 6 : h, tx : tx + 2, :] -= rng.uniform(8.0, 16.0)

    out = np.clip(img, 0, 255).astype(np.uint8)

    # Subtle defocus / handheld motion blur
    if rng.random() < (0.20 if is_printed else 0.55):
        k = rng.choice((3,))
        out = cv2.GaussianBlur(out, (k, k), sigmaX=rng.uniform(0.35, 0.95))

    # Mild JPEG compression artifacts like real phone photos
    if rng.random() < 0.45:
        quality = rng.randint(58, 92)
        ok, enc = cv2.imencode(".jpg", out, [cv2.IMWRITE_JPEG_QUALITY, quality])
        if ok:
            dec = cv2.imdecode(enc, cv2.IMREAD_COLOR)
            if dec is not None:
                out = dec

    return out


def render_connected_crop(
    label: str,
    font_path: Path,
    accent_fallback_font: Path,
    rng: random.Random,
    is_cursive: bool = False,
    is_printed: bool = False,
) -> np.ndarray:
    """Renders full connected string (preserving cursive ligatures/tails) into a C++-style BGR crop."""
    fp = font_path
    if any(ch in label for ch in ACCENTED_CHARS) and not font_supports_accents(fp):
        fp = accent_fallback_font

    font_size = rng.randint(28, 42) if is_cursive else rng.randint(26, 38)
    font = ImageFont.truetype(str(fp), size=font_size)

    # Estimate generous canvas using full-string bbox so cursive ligatures stay connected!
    probe = Image.new("L", (16, 16), 0)
    probe_draw = ImageDraw.Draw(probe)
    bb = probe_draw.textbbox((0, 0), label, font=font)
    text_w = max(24, bb[2] - bb[0])
    text_h = max(20, bb[3] - bb[1])

    canvas_w = text_w + font_size * 3
    canvas_h = text_h + font_size * 3
    ink_layer = Image.new("L", (canvas_w, canvas_h), 0)
    draw = ImageDraw.Draw(ink_layer)

    # Slight stroke thickness variation (ballpen vs felt pen vs thin print)
    stroke_w = 0 if is_printed else (1 if rng.random() < 0.25 else 0)
    draw.text((font_size, font_size), label, fill=255, font=font, stroke_width=stroke_w)

    # Slant & tiny tilt
    if not is_printed:
        shear = rng.uniform(-0.15, 0.15)
        if abs(shear) > 0.02:
            ink_layer = ink_layer.transform(
                ink_layer.size,
                Image.Transform.AFFINE,
                (1.0, shear, -shear * font_size, 0.0, 1.0, 0.0),
                resample=Image.Resampling.BILINEAR,
            )
        angle = rng.uniform(-2.0, 2.0)
        if abs(angle) > 0.2:
            ink_layer = ink_layer.rotate(angle, resample=Image.Resampling.BILINEAR, expand=True)

    ink_np = np.array(ink_layer)

    # Elastic organic hand-wobble (makes synthetic cursive feel genuinely human)
    if not is_printed and rng.random() < (0.75 if is_cursive else 0.45):
        ink_np = apply_elastic_wobble(ink_np, rng, strength=rng.uniform(0.6, 1.4))

    # Slight pen-pressure dropout (ballpen skips tiny spots on carbon-copy paper)
    if not is_printed and rng.random() < 0.25:
        np_rng = np.random.default_rng(rng.randint(0, 2**31 - 1))
        pressure = np_rng.uniform(0.72, 1.05, size=ink_np.shape).astype(np.float32)
        pressure = cv2.GaussianBlur(pressure, (5, 5), 1.0)
        ink_np = np.clip(ink_np.astype(np.float32) * pressure, 0, 255).astype(np.uint8)

    ys, xs = np.where(ink_np > 26)
    if len(xs) == 0:
        x0, x1, y0, y1 = 0, 32, 0, 24
    else:
        pad = CROP_PADDING_PX + (0 if is_printed else rng.randint(-1, 2))
        pad = max(3, pad)
        x0 = max(0, int(xs.min()) - pad)
        x1 = min(ink_np.shape[1], int(xs.max()) + pad + 1)
        y0 = max(0, int(ys.min()) - pad)
        y1 = min(ink_np.shape[0], int(ys.max()) + pad + 1)

    alpha = ink_np[y0:y1, x0:x1].astype(np.float32) / 255.0
    out_h, out_w = alpha.shape

    # Realistic off-white / warm bond / carbon-copy paper in BGR
    paper_base = rng.randint(230, 253)
    warm = rng.randint(-4, 5)
    paper_bgr = np.array(
        [
            max(210, min(255, paper_base - warm)),
            max(212, min(255, paper_base)),
            max(215, min(255, paper_base + warm)),
        ],
        dtype=np.float32,
    )

    # Ink color in BGR (charcoal black, dark blue ballpen, or slightly faded grey pen)
    ink_roll = rng.random()
    if is_printed or ink_roll < 0.62:
        s = rng.randint(15, 58)
        ink_bgr = np.array([s + rng.randint(0, 8), s, s], dtype=np.float32)
    elif ink_roll < 0.90:
        # Blue ballpen (higher B channel in BGR!)
        ink_bgr = np.array([rng.randint(85, 150), rng.randint(28, 65), rng.randint(16, 48)], dtype=np.float32)
    else:
        s = rng.randint(60, 96)
        ink_bgr = np.array([s, s, s], dtype=np.float32)

    blended = paper_bgr * (1.0 - alpha[:, :, None]) + ink_bgr * alpha[:, :, None]
    bgr = np.clip(blended, 0, 255).astype(np.uint8)
    return apply_camera_paper_effects(bgr, rng, is_printed=is_printed)


def detokenize_iam_text(raw_text: str) -> str:
    """Removes artificial IAM corpus spaces before punctuation so cursive labels match natural writing."""
    text = " ".join(str(raw_text).strip().split())
    text = re.sub(r"\s+([.,!?;:%)\]}])", r"\1", text)
    text = re.sub(r"([(\[{])\s+", r"\1", text)
    text = re.sub(r"\s+('(?:s|t|m|re|ve|ll|d)\b)", r"\1", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+n't\b", "n't", text, flags=re.IGNORECASE)
    return text.strip()


def normalize_iam_line_to_crop(pil_img: Image.Image, rng: random.Random) -> np.ndarray:
    """Converts a real human IAM grayscale line scan into a C++-style BGR crop with 6px padding."""
    gray = np.array(pil_img.convert("L"))
    # Crop tight around ink + 6px margin, matching C++ cropField()
    paper = float(np.percentile(gray, 90))
    thr = paper - max(35.0, paper * 0.2)
    ys, xs = np.where(gray < thr)
    if len(xs) > 0:
        x0 = max(0, int(xs.min()) - CROP_PADDING_PX)
        x1 = min(gray.shape[1], int(xs.max()) + CROP_PADDING_PX + 1)
        y0 = max(0, int(ys.min()) - CROP_PADDING_PX)
        y1 = min(gray.shape[0], int(ys.max()) + CROP_PADDING_PX + 1)
        gray = gray[y0:y1, x0:x1]

    # Rescale height into realistic invoice crop range (~34-54 px) so scale matches phone crops
    h, w = gray.shape[:2]
    target_h = rng.randint(36, 54)
    if h > 0 and (h > 64 or h < 24):
        new_w = max(8, int(round(w * (target_h / float(h)))))
        gray = cv2.resize(gray, (new_w, target_h), interpolation=cv2.INTER_AREA if h > target_h else cv2.INTER_LINEAR)

    # Convert to slightly warm BGR paper tint (or subtle blue ballpen tint on ink)
    bgr = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR).astype(np.float32)
    warm = rng.uniform(-3.0, 4.0)
    bgr[:, :, 0] = np.clip(bgr[:, :, 0] - warm, 0, 255)
    bgr[:, :, 2] = np.clip(bgr[:, :, 2] + warm, 0, 255)
    return bgr.astype(np.uint8)


# === 5. FILIPINO INVOICE & 2307 LABEL SAMPLER ===
def sample_filipino_label(
    rng: random.Random,
    atc_codes: tuple[str, ...],
    allowed: set[str],
    max_len: int = 34,
    prefer_printed: bool = False,
) -> tuple[str, str]:
    for _ in range(20):
        r = rng.random()
        if prefer_printed:
            if r < 0.30:
                ftype, s = "printed_digits", f"{rng.randint(1, 9999999):07d}"
            elif r < 0.50:
                ftype, s = "code", rng.choice(atc_codes)
            elif r < 0.70:
                a, b, c = rng.randint(100, 999), rng.randint(0, 999), rng.randint(0, 999)
                s = f"{a}-{b:03d}-{c:03d}-0000" if rng.random() < 0.6 else f"{a}{b:03d}{c:03d}0000"
                ftype = "tin"
            elif r < 0.85:
                val = rng.uniform(10.0, 500000.0)
                ftype, s = "amount", f"{val:,.2f}"
            else:
                ftype, s = "text", rng.choice(SAMPLE_ITEMS + FILIPINO_PARTIES_AND_PLACES)
        else:
            if r < 0.14:
                ftype, s = rng.choice(HARD_CONFUSABLE_SAMPLES)
            elif r < 0.36:
                ftype = "amount"
                if rng.random() < 0.10:
                    s = "0.00"
                else:
                    val = rng.uniform(12.0, 490000.0)
                    s = f"{val:,.2f}" if rng.random() < 0.65 else f"{int(round(val)):,}"
                    if rng.random() < 0.30:
                        s = s.replace(",", "")
                    if rng.random() < 0.18:
                        s = "P" + s
            elif r < 0.47:
                ftype = "number"
                if rng.random() < 0.65:
                    s = str(rng.randint(1, 250))
                else:
                    frac = rng.choice(("1/2", "1/4", "3/4", "1/8"))
                    s = f"{rng.randint(1, 9)} {frac}" if rng.random() < 0.6 else frac
            elif r < 0.59:
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
            elif r < 0.66:
                ftype = "digits"
                s = f"{rng.randint(1, 999999):07d}" if rng.random() < 0.5 else f"{rng.randint(1, 12):02d}012026"
            elif r < 0.73:
                ftype = "tin"
                a, b, c = rng.randint(100, 999), rng.randint(0, 999), rng.randint(0, 999)
                s = f"{a}-{b:03d}-{c:03d}-0000" if rng.random() < 0.6 else f"{a}{b:03d}{c:03d}0000"
            elif r < 0.80:
                ftype, s = "code", rng.choice(atc_codes)
            elif r < 0.87:
                ftype, s = "unit", rng.choice(SAMPLE_UNITS)
            else:
                ftype, s = "text", rng.choice(SAMPLE_ITEMS + FILIPINO_PARTIES_AND_PLACES)

        if 1 <= len(s) <= max_len and all(ch in allowed for ch in s):
            return ("text" if ftype == "unit" else ftype), s
    return "amount", "1,500.00"


# === 6. MAIN BUILDER ===
def main() -> None:
    rng = random.Random(SEED)
    allowed = load_allowed_chars()
    atc_codes = load_atc_codes()

    val_fonts = [FONTS_DIR / n for n in HELD_OUT_VAL_FONT_NAMES if (FONTS_DIR / n).is_file()]
    cursive_train_fonts = [FONTS_DIR / n for n in CURSIVE_TRAIN_FONT_NAMES if (FONTS_DIR / n).is_file()]
    hand_train_fonts = [FONTS_DIR / n for n in HAND_TRAIN_FONT_NAMES if (FONTS_DIR / n).is_file()]
    printed_font = FONTS_DIR / PRINTED_FONT_NAME

    accent_fallback = next(
        (p for p in (hand_train_fonts + cursive_train_fonts + [printed_font]) if font_supports_accents(p)),
        printed_font,
    )

    print("Loading real human cursive dataset Teklia/IAM-line from Hugging Face...")
    iam_ds = load_dataset("Teklia/IAM-line")

    # Reset output directories cleanly
    for target in (BENCHMARKS_DIR, DATASET_V2_DIR):
        if target.exists():
            shutil.rmtree(target)
        target.mkdir(parents=True)

    # --- BENCHMARK A: 300 Real Human Cursive Crops (Teklia/IAM-line validation split) ---
    bench_a_dir = BENCHMARKS_DIR / "bench_a_real_human_cursive"
    bench_a_dir.mkdir(parents=True)
    bench_a_rows = []
    iam_val_indices = list(range(len(iam_ds["validation"])))
    rng.shuffle(iam_val_indices)
    for idx in iam_val_indices:
        if len(bench_a_rows) >= 300:
            break
        row = iam_ds["validation"][idx]
        text = detokenize_iam_text(row["text"])
        if not (3 <= len(text) <= 42) or any(ch not in allowed for ch in text):
            continue
        crop = normalize_iam_line_to_crop(row["image"], rng)
        fname = f"{len(bench_a_rows):04d}_iam_val.png"
        cv2.imwrite(str(bench_a_dir / fname), crop)
        bench_a_rows.append({"file": fname, "type": "text", "label": text})
    (bench_a_dir / "manifest.json").write_text(json.dumps(bench_a_rows, indent=2, ensure_ascii=False), encoding="utf-8")

    # --- BENCHMARK B: 400 Unseen Cursive & Handwriting Font Crops (5 held-out fonts) ---
    bench_b_dir = BENCHMARKS_DIR / "bench_b_unseen_cursive_fonts"
    bench_b_dir.mkdir(parents=True)
    bench_b_rows = []
    cursive_val_set = {"Cedarville-Cursive.ttf", "ReenieBeanie.ttf", "Caveat-Variable.ttf"}
    for i in range(400):
        fp = val_fonts[i % len(val_fonts)]
        ftype, label = sample_filipino_label(rng, atc_codes, allowed, max_len=30)
        crop = render_connected_crop(
            label, fp, accent_fallback, rng, is_cursive=(fp.name in cursive_val_set), is_printed=False
        )
        fname = f"{i:04d}_{ftype}.png"
        cv2.imwrite(str(bench_b_dir / fname), crop)
        bench_b_rows.append({"file": fname, "type": ftype, "label": label, "font": fp.name})
    (bench_b_dir / "manifest.json").write_text(json.dumps(bench_b_rows, indent=2, ensure_ascii=False), encoding="utf-8")

    # --- BENCHMARK C: 240 Hard Confusable Stress Crops (unseen fonts) ---
    bench_c_dir = BENCHMARKS_DIR / "bench_c_hard_confusables"
    bench_c_dir.mkdir(parents=True)
    bench_c_rows = []
    for i in range(240):
        ftype, label = HARD_CONFUSABLE_SAMPLES[i % len(HARD_CONFUSABLE_SAMPLES)]
        fp = val_fonts[i % len(val_fonts)]
        crop = render_connected_crop(
            label, fp, accent_fallback, rng, is_cursive=(fp.name in cursive_val_set), is_printed=False
        )
        fname = f"{i:04d}_{ftype}.png"
        cv2.imwrite(str(bench_c_dir / fname), crop)
        bench_c_rows.append({"file": fname, "type": ftype, "label": label, "font": fp.name})
    (bench_c_dir / "manifest.json").write_text(json.dumps(bench_c_rows, indent=2, ensure_ascii=False), encoding="utf-8")

    # --- BENCHMARK D: 45 Repo Real Fixture Crops (inv_0007 ground truth from assets/samples/inv_0007.json) ---
    bench_d_dir = BENCHMARKS_DIR / "bench_d_inv0007"
    bench_d_dir.mkdir(parents=True)
    truth_map = json.loads(INV0007_TRUTH_PATH.read_text(encoding="utf-8"))["truth"]
    meta_map = json.loads(INV0007_META_PATH.read_text(encoding="utf-8"))
    bench_d_rows = []
    for box_name, box_meta in meta_map.items():
        if box_name in truth_map and (INV0007_CROPS_DIR / f"{box_name}.png").is_file():
            shutil.copy2(INV0007_CROPS_DIR / f"{box_name}.png", bench_d_dir / f"{box_name}.png")
            bench_d_rows.append({"file": f"{box_name}.png", "type": box_meta["type"], "label": truth_map[box_name]})
    (bench_d_dir / "manifest.json").write_text(json.dumps(bench_d_rows, indent=2, ensure_ascii=False), encoding="utf-8")

    # --- BENCHMARK E: 150 Clean Printed Retention Crops ---
    bench_e_dir = BENCHMARKS_DIR / "bench_e_printed_retention"
    bench_e_dir.mkdir(parents=True)
    bench_e_rows = []
    for i in range(150):
        ftype, label = sample_filipino_label(rng, atc_codes, allowed, max_len=28, prefer_printed=True)
        crop = render_connected_crop(label, printed_font, printed_font, rng, is_cursive=False, is_printed=True)
        fname = f"{i:04d}_{ftype}.png"
        cv2.imwrite(str(bench_e_dir / fname), crop)
        bench_e_rows.append({"file": fname, "type": ftype, "label": label})
    (bench_e_dir / "manifest.json").write_text(json.dumps(bench_e_rows, indent=2, ensure_ascii=False), encoding="utf-8")

    # --- 3-PILLAR TRAINING DATASET (rec_dataset_v2: 5,400 rich crops) ---
    train_img_dir = DATASET_V2_DIR / "train"
    train_img_dir.mkdir(parents=True)
    train_lines: list[str] = []
    idx_counter = 0

    # Pillar 1: 1,800 Real Human Cursive crops (Teklia/IAM-line TRAIN split only — zero writer overlap!)
    iam_train_indices = list(range(len(iam_ds["train"])))
    rng.shuffle(iam_train_indices)
    iam_added = 0
    for idx in iam_train_indices:
        if iam_added >= 1800:
            break
        row = iam_ds["train"][idx]
        text = detokenize_iam_text(row["text"])
        if not (3 <= len(text) <= 40) or any(ch not in allowed for ch in text):
            continue
        crop = normalize_iam_line_to_crop(row["image"], rng)
        rel = f"train/{idx_counter:05d}_iam_human.png"
        cv2.imwrite(str(DATASET_V2_DIR / rel), crop)
        train_lines.append(f"{rel}\t{text}")
        idx_counter += 1
        iam_added += 1

    # Pillar 2: 2,800 True Connected-Cursive + Rounded-Pen Filipino Invoices & BIR 2307 crops
    # (55% true messy cursive fonts + 45% rounded/neat ballpen handwriting fonts)
    for i in range(2800):
        use_cursive = (i % 20) < 11
        fp = rng.choice(cursive_train_fonts if use_cursive else hand_train_fonts)
        ftype, label = sample_filipino_label(rng, atc_codes, allowed, max_len=34, prefer_printed=False)
        crop = render_connected_crop(label, fp, accent_fallback, rng, is_cursive=use_cursive, is_printed=False)
        rel = f"train/{idx_counter:05d}_{'cur' if use_cursive else 'hand'}_{ftype}.png"
        cv2.imwrite(str(DATASET_V2_DIR / rel), crop)
        train_lines.append(f"{rel}\t{label}")
        idx_counter += 1

    # Pillar 3: 800 Clean Printed Replay crops (zero forgetting on printed digits, TINs, ATCs)
    for i in range(800):
        ftype, label = sample_filipino_label(rng, atc_codes, allowed, max_len=28, prefer_printed=True)
        crop = render_connected_crop(label, printed_font, printed_font, rng, is_cursive=False, is_printed=True)
        rel = f"train/{idx_counter:05d}_printed_{ftype}.png"
        cv2.imwrite(str(DATASET_V2_DIR / rel), crop)
        train_lines.append(f"{rel}\t{label}")
        idx_counter += 1

    (DATASET_V2_DIR / "train_list.txt").write_text("\n".join(train_lines) + "\n", encoding="utf-8")

    summary = {
        "benchmarks": {
            "bench_a_real_human_cursive": len(bench_a_rows),
            "bench_b_unseen_cursive_fonts": len(bench_b_rows),
            "bench_c_hard_confusables": len(bench_c_rows),
            "bench_d_inv0007": len(bench_d_rows),
            "bench_e_printed_retention": len(bench_e_rows),
        },
        "train_v2": {
            "total": len(train_lines),
            "pillar_1_real_human_iam": iam_added,
            "pillar_2_filipino_cursive_hand": 2800,
            "pillar_3_printed_replay": 800,
            "train_cursive_fonts": [p.name for p in cursive_train_fonts],
            "train_hand_fonts": [p.name for p in hand_train_fonts],
            "held_out_val_fonts": [p.name for p in val_fonts],
        },
    }
    (DATASET_V2_DIR / "dataset_info.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
