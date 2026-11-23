// Design B's "tokens only" rule (the plan's Global Constraints): colors, type, space and corners come from
// lib/theme.ts, so no screen or component holds a number or a color of its own. A truly one-off optical nudge may stay,
// on a line marked `// optical: <why>`. Text is never cut short or kept from growing with the phone's font size, and no
// press fades as the old 0.6 one did: the ripple shows it (§5.5). Jest runs from the repo's root, so the files are read
// from there.

const fs = require('fs');

const BANNED: [RegExp, string][] = [
  [/#[0-9A-Fa-f]{3,8}\b/, 'a hex color'],
  [/\bfont(Size|Family|Weight)\s*:/, 'a type literal'],
  [/\blineHeight\s*:/, 'a line height literal'],
  [/\b(margin|padding)(Top|Bottom|Left|Right|Horizontal|Vertical|Start|End)?\s*:\s*-?\d/, 'a spacing literal'],
  [/\bgap\s*:\s*\d/, 'a spacing literal'],
  [/\bborder(Top|Bottom)?(Left|Right)?Radius\s*:\s*\d/, 'a radius literal'],
  [/allowFontScaling=\{false\}/, 'fixed text size'],
  [/numberOfLines=/, 'cut text'],
  [/opacity:\s*0\.6\b/, 'the old press fade'],
];

/** Every .tsx under a folder, its subfolders' too, as a path from the repo's root with forward slashes. */
function tsxUnder(dir: string): string[] {
  return (fs.readdirSync(dir, { recursive: true }) as string[])
    .filter((name) => name.endsWith('.tsx'))
    .map((name) => `${dir}/${name.split('\\').join('/')}`);
}

test('app/ and components/ use the theme, with no literal of their own', () => {
  const files = [...tsxUnder('app'), ...tsxUnder('components')];
  expect(files).toEqual(expect.arrayContaining(['app/_layout.tsx', 'components/Buttons.tsx'])); // it reads them all

  const offenders: string[] = [];
  for (const file of files) {
    const lines: string[] = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      if (line.includes('// optical:')) return;
      for (const [pattern, what] of BANNED) {
        if (pattern.test(line)) offenders.push(`${file}:${i + 1}: ${what}`);
      }
    });
  }
  expect(offenders).toEqual([]);
});
