// lib/ is the app's logic: the screens (app/) and the components use it, and it never reaches back into them, not even
// for a type (lib/badge holds the badge's spec for that). Jest runs from the repo's root, so the files are read from
// there.

const fs = require('fs');

test('lib/ imports nothing from app/ or components/', () => {
  const files = (fs.readdirSync('lib', { recursive: true }) as string[])
    .filter((name) => /\.tsx?$/.test(name))
    .map((name) => `lib/${name.split('\\').join('/')}`);
  expect(files).toEqual(expect.arrayContaining(['lib/scanState.ts', 'lib/checks/index.ts'])); // its folders too

  const reaching = files.filter((file) =>
    /from\s+'(\.\.\/)+(app|components)\/|require\('(\.\.\/)+(app|components)\//.test(fs.readFileSync(file, 'utf8')),
  );
  expect(reaching).toEqual([]);
});
