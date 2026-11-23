# Generates synthetic handwritten Filipino invoice and BIR Form 2307 box crops
# in PaddleOCR recognition format, matching C++ crop.cpp / box_cut.cpp styling.

# === 1. IMPORTS ===
from __future__ import annotations

import argparse
import json
import math
import random
import zipfile
from pathlib import Path
from typing import Sequence

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

# === 2. CONSTANTS & FILIPINO BUSINESS VOCABULARY ===
CROP_PADDING_PX = 6
MAX_TEXT_LENGTH_DEFAULT = 40
DEFAULT_TRAIN_COUNT = 10000
DEFAULT_VAL_COUNT = 2000

ACCENTED_REQUIRED_CHARS = ("É", "Ñ", "é", "ñ")

SAMPLE_UNITS = (
    "pc", "pcs", "pack", "packs", "box", "boxes", "tray", "sack", "sacks",
    "kg", "g", "L", "mL", "can", "cans", "btl", "btls", "roll", "set",
    "pair", "bundle", "doz", "gal", "bag", "sheet", "ream", "unit",
)

SAMPLE_ITEMS = (
    "Eggs", "Sugar", "Sardines", "Bread Loaf", "Alaska Evap 370ml",
    "Nails 2in", "Rice 25kg", "Plywood 1/4", "Bear Brand 300g",
    "Portland Cement 40kg", "GI Sheet Corrugated", "PVC Pipe 1/2",
    "Cooking Oil 1L", "Soy Sauce 385mL", "Vinegar 385mL", "Coffee 3-in-1",
    "Office supplies", "Printing service", "Delivery fee", "Hauling service",
    " Accounting retainer", "Store rental", "Electrical repair",
    " Jalapeño Cheese Pack", "Piña Juice 1L", " Café Barako 250g",
    "Éclair Pastry Box", "Niño School Notebook", "Cañon PVC Elbow",
)

FILIPINO_PARTIES_AND_PLACES = (
    "Parañaque Hardware", "Muñoz Trading", "Zuñiga Merchandising",
    "Sto. Niño Sari-Sari", "Dasmariñas Cavite", "Biñan Laguna",
    "Peñafrancia Ave.", "Doña Juana Subd.", "Bañez Construction",
    "Castañeda General Mdse.", "Ibañez Auto Supply", "Yañez Agrivet",
    "San José Del Monte", "Café Élan Catering", "Étoile Office Center",
    "Los Baños Bakeries", "Las Piñas Commercial", " Mañalac Rice Mill",
)

BIR_2307_ATC_CODES = (
    "WC010", "WC100", "WC120", "WC140", "WC158", "WC160", "WC610", "WC640",
    "WI010", "WI050", "WI060", "WI100", "WI120", "WI140", "WI158", "WI160",
    "WB040", "WB080", "WB082", "WV010", "WV020",
)

MONTH_ABBREVIATIONS = (
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
)

NUMBER_WORDS_ONES = (
    "", "one", "two", "three", "four", "five",
    "six", "seven", "eight", "nine", "ten", "eleven",
    "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
    "seventeen", "eighteen", "nineteen",
)
NUMBER_WORDS_TENS = (
    "", "", "twenty", "thirty", "forty", "fifty",
    "sixty", "seventy", "eighty", "ninety",
)


# === 3. LABEL GENERATORS ===
def load_allowed_characters(dict_path: Path) -> set[str]:
    lines = dict_path.read_text(encoding="utf-8").splitlines()
    allowed = set(lines)
    allowed.add(" ")
    return allowed


def format_amount_string(rng: random.Random) -> str:
    roll = rng.random()
    if roll < 0.12:
        return "0.00"
    if roll < 0.40:
        whole = rng.randint(12, 995)
        return f"{whole}" if rng.random() < 0.6 else f"{whole}.00"
    amount = rng.uniform(100.0, 495000.0)
    has_centavos = rng.random() < 0.65
    formatted = f"{amount:,.2f}" if has_centavos else f"{int(round(amount)):,}"
    if rng.random() < 0.40:
        formatted = formatted.replace(",", "")
    if rng.random() < 0.18:
        formatted = f"P{formatted}"
    return formatted


def format_quantity_string(rng: random.Random) -> str:
    roll = rng.random()
    if roll < 0.72:
        return str(rng.randint(1, 250))
    if roll < 0.88:
        fraction = rng.choice(("1/2", "1/4", "3/4", "1/8"))
        prefix = f"{rng.randint(1, 12)} " if rng.random() < 0.5 else ""
        return f"{prefix}{fraction}"
    return f"{rng.randint(1, 50)}.{rng.choice(('5', '25', '75'))}"


def format_date_string(rng: random.Random) -> str:
    month = rng.randint(1, 12)
    day = rng.randint(1, 28)
    year = rng.randint(2024, 2028)
    style = rng.randint(0, 4)
    if style == 0:
        return f"{MONTH_ABBREVIATIONS[month - 1]} {day}, {year}"
    if style == 1:
        return f"{day} {MONTH_ABBREVIATIONS[month - 1]} {year}"
    if style == 2:
        sep = rng.choice(("-", "/", "."))
        return f"{month:02d}{sep}{day:02d}{sep}{year % 100:02d}"
    if style == 3:
        sep = rng.choice(("-", "/"))
        return f"{month}{sep}{day}{sep}{year}"
    return f"{MONTH_ABBREVIATIONS[month - 1]}. {day:02d}, {year}"


def format_tin_string(rng: random.Random) -> str:
    part1 = f"{rng.randint(100, 999)}"
    part2 = f"{rng.randint(0, 999):03d}"
    part3 = f"{rng.randint(0, 999):03d}"
    branch_len = rng.choice((0, 3, 4, 5))
    branch = f"0000{rng.randint(0, 9)}"[-branch_len:] if branch_len > 0 else ""
    if rng.random() < 0.45:
        return f"{part1}{part2}{part3}{branch}"
    return f"{part1}-{part2}-{part3}" + (f"-{branch}" if branch else "")


def format_digits_string(rng: random.Random) -> str:
    kind = rng.randint(0, 2)
    if kind == 0:
        return f"{rng.randint(1, 999999):07d}"
    if kind == 1:
        month = rng.choice((1, 3, 4, 6, 7, 9, 10, 12))
        day = 31 if month in (3, 12) else (30 if month in (6, 9) else 1)
        return f"{month:02d}{day:02d}{rng.randint(2024, 2028)}"
    return f"{rng.randint(1000, 9600)}"


def format_short_words_amount(rng: random.Random) -> str:
    hundreds = rng.randint(1, 9)
    rem = rng.randint(1, 99)
    tens_word = NUMBER_WORDS_TENS[rem // 10]
    ones_word = NUMBER_WORDS_ONES[rem % 10] if rem >= 20 else NUMBER_WORDS_ONES[rem]
    tail = f"{tens_word}-{ones_word}".strip("-") if rem >= 20 else ones_word
    phrase = f"{NUMBER_WORDS_ONES[hundreds].capitalize()} hundred {tail} pesos".strip()
    return " ".join(phrase.split())


def sample_invoice_label(
    rng: random.Random,
    allowed_chars: set[str],
    max_text_length: int,
) -> tuple[str, str]:
    for _ in range(20):
        bucket = rng.random()
        if bucket < 0.34:
            field_kind, label = "amount", format_amount_string(rng)
        elif bucket < 0.46:
            field_kind, label = "number", format_quantity_string(rng)
        elif bucket < 0.58:
            field_kind, label = "date", format_date_string(rng)
        elif bucket < 0.66:
            field_kind, label = "digits", format_digits_string(rng)
        elif bucket < 0.73:
            field_kind, label = "tin", format_tin_string(rng)
        elif bucket < 0.80:
            field_kind, label = "code", rng.choice(BIR_2307_ATC_CODES)
        elif bucket < 0.88:
            field_kind, label = "unit", rng.choice(SAMPLE_UNITS)
        elif bucket < 0.95:
            raw_text = rng.choice(SAMPLE_ITEMS + FILIPINO_PARTIES_AND_PLACES).strip()
            field_kind, label = "text", raw_text
        else:
            field_kind, label = "words", format_short_words_amount(rng)

        if 1 <= len(label) <= max_text_length and all(ch in allowed_chars for ch in label):
            return field_kind, label
    return "amount", "1,250.00"


# === 4. HANDWRITING CROP RENDERER (MATCHES C++ crop.cpp / box_cut.cpp) ===
def font_supports_accents(font_path: Path) -> bool:
    try:
        font = ImageFont.truetype(str(font_path), size=32)
        mask_n = font.getmask("Ñ")
        mask_box = font.getmask("\uffff")
        return mask_n.size[0] > 0 and list(mask_n) != list(mask_box)
    except OSError:
        return False


def render_handwritten_crop(
    label: str,
    font_path: Path,
    fallback_accent_font_path: Path | None,
    rng: random.Random,
) -> Image.Image:
    use_font_path = font_path
    if any(ch in label for ch in ACCENTED_REQUIRED_CHARS) and not font_supports_accents(font_path):
        if fallback_accent_font_path is not None:
            use_font_path = fallback_accent_font_path

    font_size = rng.randint(26, 38)
    font = ImageFont.truetype(str(use_font_path), size=font_size)

    paper_base = rng.randint(233, 252)
    warm_tint = rng.randint(-3, 4)
    paper_rgb = (
        max(220, min(255, paper_base + warm_tint)),
        max(220, min(255, paper_base)),
        max(218, min(255, paper_base - warm_tint)),
    )

    ink_choice = rng.random()
    if ink_choice < 0.72:
        shade = rng.randint(18, 62)
        ink_rgb = (shade, shade, shade + rng.randint(0, 8))
    elif ink_choice < 0.92:
        ink_rgb = (rng.randint(18, 45), rng.randint(25, 55), rng.randint(70, 125))
    else:
        ink_rgb = (rng.randint(55, 88), rng.randint(55, 88), rng.randint(55, 88))

    # Render character-by-character with slight baseline and spacing jitter
    glyph_advances: list[tuple[str, int, int]] = []
    cursor_x = 24
    for ch in label:
        bbox = font.getbbox(ch)
        ch_width = max(6, bbox[2] - bbox[0]) if ch != " " else max(8, int(font_size * 0.33))
        jitter_y = rng.randint(-2, 2) if ch != " " else 0
        glyph_advances.append((ch, cursor_x, jitter_y))
        extra_kerning = rng.randint(-1, 2)
        cursor_x += ch_width + extra_kerning

    canvas_w = max(96, cursor_x + 36)
    canvas_h = font_size * 3
    ink_layer = Image.new("L", (canvas_w, canvas_h), 0)
    draw = ImageDraw.Draw(ink_layer)
    base_y = font_size
    stroke_width = 1 if rng.random() < 0.22 else 0
    for ch, x_pos, dy in glyph_advances:
        if ch != " ":
            draw.text((x_pos, base_y + dy), ch, fill=255, font=font, stroke_width=stroke_width)

    # Slight shear / rotation mimicking slanted handwriting on ruled lines
    shear = rng.uniform(-0.14, 0.14)
    angle = rng.uniform(-1.8, 1.8)
    if abs(shear) > 0.02:
        ink_layer = ink_layer.transform(
            ink_layer.size,
            Image.Transform.AFFINE,
            (1.0, shear, -shear * base_y, 0.0, 1.0, 0.0),
            resample=Image.Resampling.BILINEAR,
        )
    if abs(angle) > 0.2:
        ink_layer = ink_layer.rotate(angle, resample=Image.Resampling.BILINEAR, expand=True)

    # Tight ink bounding box + 6 px margin (exact match to C++ cropField / cropBox PAD = 6)
    ink_np = np.array(ink_layer)
    ys, xs = np.where(ink_np > 28)
    if len(xs) == 0:
        min_x, max_x, min_y, max_y = 0, 32, 0, 24
    else:
        min_x, max_x = int(xs.min()), int(xs.max())
        min_y, max_y = int(ys.min()), int(ys.max())

    crop_x0 = max(0, min_x - CROP_PADDING_PX)
    crop_x1 = min(ink_np.shape[1], max_x + CROP_PADDING_PX + 1)
    crop_y0 = max(0, min_y - CROP_PADDING_PX)
    crop_y1 = min(ink_np.shape[0], max_y + CROP_PADDING_PX + 1)
    alpha = ink_np[crop_y0:crop_y1, crop_x0:crop_x1].astype(np.float32) / 255.0

    out_h, out_w = alpha.shape
    paper = np.empty((out_h, out_w, 3), dtype=np.float32)
    paper[:, :, 0] = paper_rgb[0]
    paper[:, :, 1] = paper_rgb[1]
    paper[:, :, 2] = paper_rgb[2]

    # Subtle paper grain + occasional faint residual line stub after box_cut.cpp rule removal
    grain_sigma = rng.uniform(1.2, 4.0)
    grain = np.random.default_rng(rng.randint(0, 2**31 - 1)).normal(0.0, grain_sigma, size=(out_h, out_w, 1))
    paper = np.clip(paper + grain, 0.0, 255.0)

    if rng.random() < 0.25 and out_h > 16:
        line_y = out_h - rng.randint(2, 6)
        paper[line_y : line_y + 1, :, :] = np.clip(paper[line_y : line_y + 1, :, :] - rng.randint(6, 16), 0, 255)

    ink_color = np.array(ink_rgb, dtype=np.float32).reshape((1, 1, 3))
    blended = paper * (1.0 - alpha[:, :, None]) + ink_color * alpha[:, :, None]
    out_img = Image.fromarray(np.clip(blended, 0, 255).astype(np.uint8), mode="RGB")

    blur_radius = rng.uniform(0.0, 0.95)
    if blur_radius > 0.25:
        out_img = out_img.filter(ImageFilter.GaussianBlur(radius=blur_radius))

    return out_img


# === 5. DATASET BUILDER ===
def build_synthetic_dataset(
    output_dir: Path,
    dict_path: Path,
    font_paths: Sequence[Path],
    train_count: int = DEFAULT_TRAIN_COUNT,
    val_count: int = DEFAULT_VAL_COUNT,
    val_font_count: int = 3,
    max_text_length: int = MAX_TEXT_LENGTH_DEFAULT,
    seed: int = 20261123,
    make_zip: bool = False,
) -> dict:
    if output_dir.exists() and any(output_dir.iterdir()):
        raise FileExistsError(f"Output directory is not empty: {output_dir}")
    if len(font_paths) < 2:
        raise ValueError("Provide at least 2 TTF/OTF font files so train and val do not share fonts.")

    allowed_chars = load_allowed_characters(dict_path)
    rng = random.Random(seed)

    sorted_fonts = sorted(font_paths, key=lambda p: p.name.lower())
    accent_capable_fonts = [p for p in sorted_fonts if font_supports_accents(p)]
    fallback_accent_font = accent_capable_fonts[0] if accent_capable_fonts else None

    actual_val_fonts = min(max(1, val_font_count), len(sorted_fonts) - 1)
    shuffled_fonts = list(sorted_fonts)
    rng.shuffle(shuffled_fonts)
    val_fonts = shuffled_fonts[:actual_val_fonts]
    train_fonts = shuffled_fonts[actual_val_fonts:]

    (output_dir / "train").mkdir(parents=True, exist_ok=True)
    (output_dir / "val").mkdir(parents=True, exist_ok=True)

    stats_by_split: dict[str, dict[str, int]] = {"train": {}, "val": {}}

    for split_name, total_samples, split_fonts in (
        ("train", train_count, train_fonts),
        ("val", val_count, val_fonts),
    ):
        manifest_lines: list[str] = []
        for idx in range(total_samples):
            field_kind, label = sample_invoice_label(rng, allowed_chars, max_text_length)
            chosen_font = rng.choice(split_fonts)
            crop_image = render_handwritten_crop(label, chosen_font, fallback_accent_font, rng)
            rel_path = f"{split_name}/{idx:05d}_{field_kind}.png"
            crop_image.save(output_dir / rel_path, format="PNG")
            manifest_lines.append(f"{rel_path}\t{label}")
            stats_by_split[split_name][field_kind] = stats_by_split[split_name].get(field_kind, 0) + 1

        (output_dir / f"{split_name}_list.txt").write_text("\n".join(manifest_lines) + "\n", encoding="utf-8")

    dataset_info = {
        "source": "synthetic_filipino_invoice_2307",
        "seed": seed,
        "max_text_length": max_text_length,
        "train_count": train_count,
        "val_count": val_count,
        "train_fonts": [p.name for p in train_fonts],
        "val_fonts": [p.name for p in val_fonts],
        "field_counts": stats_by_split,
    }
    (output_dir / "dataset_info.json").write_text(json.dumps(dataset_info, indent=2), encoding="utf-8")

    if make_zip:
        zip_path = output_dir.with_suffix(".zip")
        root_prefix = output_dir.name
        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_STORED) as zf:
            for file_path in sorted(output_dir.rglob("*")):
                if file_path.is_file():
                    arcname = f"{root_prefix}/{file_path.relative_to(output_dir).as_posix()}"
                    zf.write(file_path, arcname=arcname)

    return dataset_info


# === 6. CLI ENTRYPOINT ===
def main() -> None:
    parser = argparse.ArgumentParser(description="Generate synthetic Filipino invoice/2307 crops for PaddleOCR.")
    parser.add_argument("output_dir", type=Path, help="New output directory (e.g., training/rec_dataset)")
    parser.add_argument(
        "--dict-path",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "modules/scanner/assets/scanner/dict.txt",
        help="Path to 98-char dict.txt",
    )
    parser.add_argument("--fonts-dir", type=Path, required=True, help="Directory holding handwriting .ttf/.otf fonts")
    parser.add_argument("--train-count", type=int, default=DEFAULT_TRAIN_COUNT)
    parser.add_argument("--val-count", type=int, default=DEFAULT_VAL_COUNT)
    parser.add_argument("--val-font-count", type=int, default=3)
    parser.add_argument("--max-text-length", type=int, default=MAX_TEXT_LENGTH_DEFAULT)
    parser.add_argument("--seed", type=int, default=20261123)
    parser.add_argument("--zip", action="store_true", help="Also create <output_dir>.zip")
    args = parser.parse_args()

    fonts = list(args.fonts_dir.glob("*.ttf")) + list(args.fonts_dir.glob("*.otf"))
    info = build_synthetic_dataset(
        output_dir=args.output_dir,
        dict_path=args.dict_path,
        font_paths=fonts,
        train_count=args.train_count,
        val_count=args.val_count,
        val_font_count=args.val_font_count,
        max_text_length=args.max_text_length,
        seed=args.seed,
        make_zip=args.zip,
    )
    print(json.dumps(info, indent=2))


if __name__ == "__main__":
    main()
