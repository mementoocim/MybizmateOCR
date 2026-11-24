// The WCAG 2.2 contrast ratio between two colors, as design B §5.1 measured its figures: from 1 (none) to 21 (black on
// white). Colors are #RRGGBB or #RRGGBBAA (React Native's order). A see-through foreground is laid over the background
// first, as the screen shows it: blended, then rounded to whole 0–255 channels. The background must be opaque.

type Rgb = [number, number, number];

function parse(color: string): { rgb: Rgb; alpha: number } {
  const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(color);
  if (!hex) throw new Error(`Not a #RRGGBB or #RRGGBBAA color: ${color}`);
  const n = parseInt(hex[1], 16);
  const alpha = hex[2] === undefined ? 1 : parseInt(hex[2], 16) / 255;
  return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], alpha };
}

/** Relative luminance, with each sRGB channel linearised at 0.04045. */
function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(fg: string, bg: string): number {
  const back = parse(bg);
  if (back.alpha !== 1) throw new Error(`The background must be opaque: ${bg}`);
  const front = parse(fg);
  const shown = front.rgb.map((c, i) => Math.round(front.alpha * c + (1 - front.alpha) * back.rgb[i])) as Rgb;
  const [lighter, darker] = [luminance(shown), luminance(back.rgb)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}
