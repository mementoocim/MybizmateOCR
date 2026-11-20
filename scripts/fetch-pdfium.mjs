// Fetches pdfium for the scanner core: release chromium/8125 of bblanchon/pdfium-binaries (PDFium 158.0.8125.0), its
// Android builds without V8 (no JavaScript). Each archive must match the SHA-256 pinned below before it is unpacked,
// into a cache folder outside the repo: one folder per Android ABI, each with include/ and lib/libpdfium.so.
// That folder is %LOCALAPPDATA%\mbs-cxx\pdfium\chromium-8125\<ABI> on Windows, ~/.cache/mbs-pdfium/chromium-8125/<ABI>
// elsewhere. An ABI already unpacked from its verified archive is left as it is, so a second run downloads nothing.
// Usage: node scripts/fetch-pdfium.mjs [folder]   (the release's folder instead of the cache folder)
// Run by the scanner module's fetchPdfium Gradle task, and by scripts/core-test.mjs.
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RELEASE = 'chromium/8125';

// Android ABI: the release's archive and its SHA-256, from the first download (2026-11-21), the same digests GitHub
// lists for the release's files.
const BUILDS = {
  'arm64-v8a': ['pdfium-android-arm64.tgz', '0495e57163429937caaee1bdd9b07924a7098dbd51d1b97645d124e349f097b4'],
  'armeabi-v7a': ['pdfium-android-arm.tgz', 'ac4ac5319ded88ba5d885747a6b2641e7f712c9797de0770465104abe4dbf7da'],
  x86_64: ['pdfium-android-x64.tgz', 'bd68707f29f2316c20f9d5c793b8731796a4a65408ac4d3c30bc606390354e41'],
  x86: ['pdfium-android-x86.tgz', '9d4f7edf5b46e1ab155d9da3e56520f2554900997c74e21951f524ea7928c622'],
};

export const PDFIUM_DIR =
  process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA || homedir(), 'mbs-cxx', 'pdfium', 'chromium-8125')
    : path.join(homedir(), '.cache', 'mbs-pdfium', 'chromium-8125');

const STAMP = '.sha256'; // in each ABI's folder: the SHA-256 of the archive it was unpacked from

function unpacked(dir, sha256) {
  try {
    return (
      existsSync(path.join(dir, 'include', 'fpdfview.h')) &&
      existsSync(path.join(dir, 'lib', 'libpdfium.so')) &&
      readFileSync(path.join(dir, STAMP), 'utf8').trim() === sha256
    );
  } catch {
    return false;
  }
}

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function untar(archive, into) {
  // Windows' own tar reads .tgz files and takes C:\ paths (Git Bash's tar doesn't).
  const tar =
    process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
  const r = spawnSync(tar, ['-xzf', archive, '-C', into], { stdio: ['ignore', 'ignore', 'inherit'] });
  if (r.error) throw new Error(`${tar}: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`tar exited with ${r.status} on ${archive}`);
}

// Makes sure every ABI's folder under `root` holds the pinned build; returns `root`.
export async function fetchPdfium(root = PDFIUM_DIR) {
  mkdirSync(root, { recursive: true });
  for (const [abi, [archive, sha256]] of Object.entries(BUILDS)) {
    const dir = path.join(root, abi);
    if (unpacked(dir, sha256)) continue;
    const data = await download(
      `https://github.com/bblanchon/pdfium-binaries/releases/download/${encodeURIComponent(RELEASE)}/${archive}`,
    );
    const got = createHash('sha256').update(data).digest('hex');
    if (got !== sha256) throw new Error(`${archive} has SHA-256 ${got}, not the pinned ${sha256}: not unpacked`);
    // Unpacked beside the ABI's folder first, so a failed run never leaves a half-filled folder behind.
    const part = `${dir}.part`;
    const file = path.join(root, archive);
    rmSync(part, { recursive: true, force: true });
    mkdirSync(part);
    writeFileSync(file, data);
    try {
      untar(file, part);
    } finally {
      rmSync(file, { force: true });
    }
    writeFileSync(path.join(part, STAMP), `${sha256}\n`);
    if (!unpacked(part, sha256)) throw new Error(`${archive} has no include/fpdfview.h or lib/libpdfium.so`);
    rmSync(dir, { recursive: true, force: true });
    renameSync(part, dir);
    console.log(`fetch-pdfium: ${archive} (${RELEASE}) checked and unpacked into ${dir}`);
  }
  return root;
}

if (path.basename(process.argv[1] ?? '') === path.basename(fileURLToPath(import.meta.url))) {
  fetchPdfium(process.argv[2] ? path.resolve(process.argv[2]) : PDFIUM_DIR).catch((e) => {
    console.error(`fetch-pdfium: ${e.message}`);
    process.exit(1);
  });
}
