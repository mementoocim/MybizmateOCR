// Checks a built APK for the README's release checklist, so any build can repeat it:
// - its manifest has no ai.onnxruntime.TelemetryInitializer (onnxruntime-android's provider, which starts its telemetry
//   client by itself; the scanner module's AndroidManifest.xml removes it);
// - in every ABI it holds, libonnxruntime.so, libonnxruntime4j_jni.so and libpdfium.so import no socket function;
// - and it lists the network permissions the manifest asks for, which the checklist decides on for a client release.
// Usage: npm run check:apk -- [path/to/app.apk]   (default: the debug APK, android/app/build/outputs/apk/debug/app-debug.apk)
// Needs the Android SDK (build-tools' aapt2) and NDK 28.2 (llvm-nm). Exits 1 when a check fails. Nothing is installed.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exe = process.platform === 'win32' ? '.exe' : '';

function fail(message) {
  console.error(`check-apk: ${message}`);
  process.exit(1);
}

const apk = path.resolve(process.argv[2] ?? path.join(ROOT, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'));
if (!existsSync(apk)) fail(`no APK at ${apk}`);

// The SDK's tools: the newest build-tools' aapt2, and NDK 28.2's llvm-nm
const sdk = process.env.ANDROID_HOME || path.join(process.env.LOCALAPPDATA || homedir(), 'Android', 'Sdk');
const versionKey = (v) => v.split('.').map((n) => n.padStart(4, '0')).join('.');
const buildTools = path.join(sdk, 'build-tools');
const newest = existsSync(buildTools) ? readdirSync(buildTools).sort((a, b) => versionKey(b).localeCompare(versionKey(a)))[0] : null;
const aapt2 = newest ? path.join(buildTools, newest, `aapt2${exe}`) : '';
const hostTag = process.platform === 'win32' ? 'windows-x86_64' : process.platform === 'darwin' ? 'darwin-x86_64' : 'linux-x86_64';
const nm = path.join(sdk, 'ndk', '28.2.13676358', 'toolchains', 'llvm', 'prebuilt', hostTag, 'bin', `llvm-nm${exe}`);
for (const tool of [aapt2, nm]) if (!tool || !existsSync(tool)) fail(`missing ${tool || 'build-tools'}`);
// Windows' own tar reads zip files (Git Bash's can't take C:\ paths); elsewhere, unzip
const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
const read = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

let failed = false;

// 1. The manifest, as the APK holds it
const manifest = read(aapt2, ['dump', 'xmltree', '--file', 'AndroidManifest.xml', apk]);
if (manifest.includes('ai.onnxruntime.TelemetryInitializer')) {
  console.log('FAIL  the manifest has ai.onnxruntime.TelemetryInitializer');
  failed = true;
} else {
  console.log('ok    the manifest has no ai.onnxruntime.TelemetryInitializer');
}
const network = ['INTERNET', 'ACCESS_NETWORK_STATE', 'ACCESS_WIFI_STATE'].filter((p) =>
  manifest.includes(`"android.permission.${p}"`),
);
console.log(`info  network permissions asked for: ${network.length > 0 ? network.join(', ') : 'none'}`);

// 2. The native libraries' imports
const LIBS = ['libonnxruntime.so', 'libonnxruntime4j_jni.so', 'libpdfium.so'];
const SOCKETS = new Set(['socket', 'connect', 'bind', 'listen', 'accept', 'accept4', 'getaddrinfo', 'gethostbyname',
  'send', 'sendto', 'sendmsg', 'recv', 'recvfrom', 'recvmsg']);
const entries = (process.platform === 'win32' ? read(tar, ['-tf', apk]) : read('unzip', ['-Z1', apk]))
  .split(/\r?\n/)
  .filter((name) => /^lib\/[^/]+\/[^/]+\.so$/.test(name) && LIBS.includes(path.posix.basename(name)));
if (entries.length === 0) fail('the APK holds none of the native libraries to check');
const out = mkdtempSync(path.join(tmpdir(), 'check-apk-'));
try {
  if (process.platform === 'win32') read(tar, ['-xf', apk, '-C', out, ...entries]);
  else read('unzip', ['-q', '-o', apk, ...entries, '-d', out]);
  for (const entry of entries.sort()) {
    // undefined symbols, as "U name@VERSION": a socket function by its name, whatever its version
    const imports = read(nm, ['-D', '--undefined-only', path.join(out, ...entry.split('/'))])
      .split(/\r?\n/)
      .map((line) => line.trim().split(/\s+/).pop()?.split('@')[0] ?? '')
      .filter((name) => SOCKETS.has(name));
    if (imports.length > 0) {
      console.log(`FAIL  ${entry} imports ${[...new Set(imports)].join(', ')}`);
      failed = true;
    } else {
      console.log(`ok    ${entry} imports no socket function`);
    }
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}

process.exit(failed ? 1 : 0);
