// An in-memory expo-file-system for jest: jest.mock('expo-file-system', () => require('../test-utils/memoryFs').memoryFs.module)
// It covers what the app uses: File and Directory built from a Directory (or a URI) and names, uri, name, exists,
// write, text, bytes, delete, move, copy, create and list, and Paths.document / Paths.cache. Files live in one store
// on globalThis, so a test that resets its modules (a restart) still finds them.

type Content = string | Uint8Array;
type Store = { files: Map<string, Content>; dirs: Set<string> };

const holder = globalThis as unknown as { __memoryFsStore?: Store };
const store: Store = (holder.__memoryFsStore ??= { files: new Map(), dirs: new Set() });

const textOf = (c: Content) => (typeof c === 'string' ? c : new TextDecoder().decode(c));
const bytesOf = (c: Content) => (typeof c === 'string' ? new TextEncoder().encode(c) : c);
const uriOf = (p: unknown) => (typeof p === 'string' ? p : (p as { uri: string }).uri);
const trim = (u: string) => u.replace(/\/+$/, '');
const nameOf = (u: string) => trim(u).replace(/^.*\//, '');

function joinUri(parts: unknown[]): string {
  const [first, ...rest] = parts.map(uriOf);
  return [trim(first), ...rest.map((s) => s.replace(/^\/+|\/+$/g, ''))].filter((s) => s !== '').join('/');
}

class MemoryDirectory {
  uri: string;
  constructor(...parts: unknown[]) {
    this.uri = `${joinUri(parts)}/`;
  }
  get name() {
    return nameOf(this.uri);
  }
  get exists() {
    const base = trim(this.uri);
    return store.dirs.has(base) || [...store.files.keys(), ...store.dirs].some((k) => k.startsWith(`${base}/`));
  }
  create() {
    store.dirs.add(trim(this.uri));
  }
  delete() {
    const base = trim(this.uri);
    for (const k of [...store.files.keys()]) if (k.startsWith(`${base}/`)) store.files.delete(k);
    for (const k of [...store.dirs]) if (k === base || k.startsWith(`${base}/`)) store.dirs.delete(k);
  }
  /**
   * As expo-file-system 58 on Android (FileSystemPath.getMoveOrCopyPath, unix-like): into the destination when it
   * exists, else renamed to it when its parent exists.
   */
  async move(destination: { uri: string }) {
    const from = trim(this.uri);
    let to = trim(destination.uri);
    if (new MemoryDirectory(to).exists) to = `${to}/${nameOf(from)}`;
    else if (!new MemoryDirectory(to.replace(/\/[^/]*$/, '')).exists) throw new Error(`No destination folder: ${to}`);
    if (new MemoryDirectory(to).exists) throw new Error(`Destination exists: ${to}`);
    for (const k of [...store.files.keys()]) {
      if (!k.startsWith(`${from}/`)) continue;
      store.files.set(to + k.slice(from.length), store.files.get(k)!);
      store.files.delete(k);
    }
    for (const k of [...store.dirs]) {
      if (k !== from && !k.startsWith(`${from}/`)) continue;
      store.dirs.delete(k);
      store.dirs.add(to + k.slice(from.length));
    }
    store.dirs.add(to);
    this.uri = `${to}/`;
  }
  list(): (MemoryDirectory | MemoryFile)[] {
    const base = trim(this.uri);
    const names = new Map<string, boolean>(); // child name -> is a folder
    for (const k of [...store.files.keys(), ...store.dirs]) {
      if (!k.startsWith(`${base}/`)) continue;
      const rest = k.slice(base.length + 1);
      const slash = rest.indexOf('/');
      if (slash >= 0) names.set(rest.slice(0, slash), true);
      else if (rest !== '') names.set(rest, names.get(rest) ?? store.dirs.has(k));
    }
    return [...names].map(([name, isDir]) => (isDir ? new MemoryDirectory(base, name) : new MemoryFile(base, name)));
  }
}

class MemoryFile {
  uri: string;
  constructor(...parts: unknown[]) {
    this.uri = joinUri(parts);
  }
  get name() {
    return nameOf(this.uri);
  }
  get exists() {
    return store.files.has(this.uri);
  }
  private content(): Content {
    const c = store.files.get(this.uri);
    if (c === undefined) throw new Error(`No such file: ${this.uri}`);
    return c;
  }
  async text() {
    return textOf(this.content());
  }
  async bytes() {
    return bytesOf(this.content());
  }
  async write(content: string | Uint8Array) {
    store.files.set(this.uri, content);
  }
  delete() {
    if (!store.files.delete(this.uri)) throw new Error(`No such file: ${this.uri}`);
  }
  private target(destination: { uri: string }) {
    return destination.uri.endsWith('/') ? destination.uri + this.name : destination.uri;
  }
  async move(destination: { uri: string }, options?: { overwrite?: boolean }) {
    const to = this.target(destination);
    if (store.files.has(to) && !options?.overwrite) throw new Error(`Destination exists: ${to}`);
    store.files.set(to, this.content());
    store.files.delete(this.uri);
    this.uri = to;
  }
  async copy(destination: { uri: string }, options?: { overwrite?: boolean }) {
    const to = this.target(destination);
    if (store.files.has(to) && !options?.overwrite) throw new Error(`Destination exists: ${to}`);
    store.files.set(to, this.content());
  }
}

export const memoryFs = {
  files: store.files,
  dirs: store.dirs,
  reset() {
    store.files.clear();
    store.dirs.clear();
  },
  module: {
    File: MemoryFile,
    Directory: MemoryDirectory,
    Paths: { document: new MemoryDirectory('file:///docs'), cache: new MemoryDirectory('file:///cache') },
  },
};
