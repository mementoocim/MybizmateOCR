import { Directory, File, Paths } from 'expo-file-system';

// The app's JSON files, in its own files folder (Paths.document). A write goes to `<path>.tmp` first and then
// replaces the file, one write at a time per file, so two quick saves never interleave and a write cut short by a
// kill leaves the last good file.

const queues = new Map<string, Promise<void>>();

const fileAt = (path: string) => new File(Paths.document, ...path.split('/'));

/** The file's JSON; `<path>.tmp` when only it can be read; null when there's neither. */
export async function readJson<T>(path: string): Promise<T | null> {
  for (const file of [fileAt(path), fileAt(`${path}.tmp`)]) {
    try {
      if (file.exists) return JSON.parse(await file.text()) as T;
    } catch {
      // broken or unreadable: try the next one
    }
  }
  return null;
}

/** Writes the value as JSON after any write to the same file that is still going on. */
export function writeJson(path: string, value: unknown): Promise<void> {
  const text = JSON.stringify(value);
  const previous = queues.get(path) ?? Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(async () => {
      const folders = path.split('/').slice(0, -1);
      if (folders.length > 0) {
        const folder = new Directory(Paths.document, ...folders);
        if (!folder.exists) folder.create({ intermediates: true });
      }
      const tmp = fileAt(`${path}.tmp`);
      await tmp.write(text);
      await tmp.move(fileAt(path), { overwrite: true });
    });
  queues.set(path, next);
  return next;
}
