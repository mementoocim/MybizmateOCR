// lib/ is the app's logic: the screens (app/) and the components use it, and it never reaches back into them, not even
// for a type (lib/badge holds the badge's spec for that). And no app code reaches expo-router's global router (ruling
// T26-4). Jest runs from the repo's root, so the files are read from there.

const fs = require('fs');

/** A folder's TypeScript files, its subfolders' too, as paths from the repo's root. */
const sourcesIn = (folder: string): string[] =>
  (fs.readdirSync(folder, { recursive: true }) as string[])
    .filter((name) => /\.tsx?$/.test(name))
    .map((name) => `${folder}/${name.split('\\').join('/')}`);

/** Whether a file imports `router` by name from 'expo-router', alone or among other names, on one line or several. */
const importsGlobalRouter = (source: string): boolean =>
  [...source.matchAll(/import\s+(?:[\w$]+\s*,\s*)?\{([^}]*)\}\s*from\s*['"]expo-router['"]/g)].some(([, names]) =>
    names.split(',').some((name) => /^router(\s+as\s+[\w$]+)?$/.test(name.trim())),
  );

test('lib/ imports nothing from app/ or components/', () => {
  const files = sourcesIn('lib');
  expect(files).toEqual(expect.arrayContaining(['lib/scanState.ts', 'lib/checks/index.ts'])); // its folders too

  const reaching = files.filter((file) =>
    /from\s+'(\.\.\/)+(app|components)\/|require\('(\.\.\/)+(app|components)\//.test(fs.readFileSync(file, 'utf8')),
  );
  expect(reaching).toEqual([]);
});

test("app/, components/ and lib/ never import expo-router's global router (ruling T26-4)", () => {
  // A new font size, display size or language restarts Android's activity in the same JS context: the new root binds
  // that router, then the old root's late unmount unbinds it, and every method of it throws from then on. Hooks bound
  // to the live root (useRouter, useNavigation) are the way in.
  expect(importsGlobalRouter("import { router } from 'expo-router';")).toBe(true);
  expect(importsGlobalRouter("import { Stack, router } from 'expo-router';")).toBe(true);
  expect(importsGlobalRouter("import {\n  useLocalSearchParams,\n  router as go,\n} from 'expo-router';")).toBe(true);
  expect(importsGlobalRouter("import { useNavigation, useRouter } from 'expo-router';")).toBe(false);
  expect(importsGlobalRouter("import { router } from './router';")).toBe(false);

  const files = ['app', 'components', 'lib'].flatMap(sourcesIn);
  expect(files).toEqual(expect.arrayContaining(['app/_layout.tsx', 'components/Header.tsx', 'lib/navigation.ts']));
  expect(files.filter((file) => importsGlobalRouter(fs.readFileSync(file, 'utf8')))).toEqual([]);
});
