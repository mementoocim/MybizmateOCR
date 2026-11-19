// Builds the scanner core's C++ tests for the x86_64 emulator and runs them there.
// Usage: npm run test:core -- [doctest arguments, e.g. -tc="*parity*"]
// Needs: the Android SDK (NDK 28.2.13676358, CMake 3.22.1), a running emulator, and the OpenCV 5.1.0 and
// ONNX Runtime 1.32.0 AARs in Gradle's cache (the first `npx expo run:android` downloads them).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CPP = path.join(ROOT, 'modules', 'scanner', 'cpp');
const TESTS = path.join(CPP, 'tests');
const BUILD = path.join(TESTS, 'build');
const ABI = 'x86_64';
const REMOTE = '/data/local/tmp/scanner_tests';
const exe = process.platform === 'win32' ? '.exe' : '';

function fail(message) {
  console.error(`core-test: ${message}`);
  process.exit(1);
}

function run(cmd, args, options = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...options });
  if (r.error) fail(`${cmd}: ${r.error.message}`);
  return r.status ?? 1;
}

function mustRun(cmd, args, options) {
  const status = run(cmd, args, options);
  if (status !== 0) fail(`${path.basename(cmd)} ${args.join(' ')} exited with ${status}`);
}

// 1. The SDK's tools
const sdk = process.env.ANDROID_HOME || path.join(process.env.LOCALAPPDATA || homedir(), 'Android', 'Sdk');
const ndk = path.join(sdk, 'ndk', '28.2.13676358');
const cmakeBin = path.join(sdk, 'cmake', '3.22.1', 'bin');
const cmake = path.join(cmakeBin, `cmake${exe}`);
const ninja = path.join(cmakeBin, `ninja${exe}`);
const adb = path.join(sdk, 'platform-tools', `adb${exe}`);
for (const p of [ndk, cmake, ninja, adb]) if (!existsSync(p)) fail(`missing ${p}`);
const hostTag = process.platform === 'win32' ? 'windows-x86_64' : process.platform === 'darwin' ? 'darwin-x86_64' : 'linux-x86_64';
const libcxx = path.join(ndk, 'toolchains', 'llvm', 'prebuilt', hostTag, 'sysroot', 'usr', 'lib', 'x86_64-linux-android', 'libc++_shared.so');

// 2. The two AARs in Gradle's cache
function findAar(group, name, version) {
  const dir = path.join(homedir(), '.gradle', 'caches', 'modules-2', 'files-2.1', group, name, version);
  if (existsSync(dir)) {
    for (const hash of readdirSync(dir)) {
      const aar = path.join(dir, hash, `${name}-${version}.aar`);
      if (existsSync(aar)) return aar;
    }
  }
  fail('Run `npx expo run:android` once so Gradle downloads OpenCV 5.1.0 and ONNX Runtime 1.32.0');
}
const deps = {
  opencv: findAar('org.opencv', 'opencv', '5.1.0'),
  ort: findAar('com.microsoft.onnxruntime', 'onnxruntime-android', '1.32.0'),
};

// 3. Extract each AAR once (Windows' own tar reads zip files)
const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'unzip';
for (const [name, aar] of Object.entries(deps)) {
  const out = path.join(BUILD, 'deps', name);
  const done = path.join(out, '.extracted');
  if (existsSync(done)) continue;
  mkdirSync(out, { recursive: true });
  if (process.platform === 'win32') mustRun(tar, ['-xf', aar, '-C', out]);
  else mustRun(tar, ['-q', '-o', aar, '-d', out]);
  writeFileSync(done, aar);
}

// 4. Configure and build
const buildDir = path.join(BUILD, ABI);
mustRun(cmake, [
  '-G', 'Ninja', '-S', TESTS, '-B', buildDir,
  `-DCMAKE_MAKE_PROGRAM=${ninja}`,
  `-DCMAKE_TOOLCHAIN_FILE=${path.join(ndk, 'build', 'cmake', 'android.toolchain.cmake')}`,
  `-DANDROID_ABI=${ABI}`, '-DANDROID_PLATFORM=android-26', '-DANDROID_STL=c++_shared',
  '-DCMAKE_BUILD_TYPE=Release',
  `-DOPENCV_DIR=${path.join(BUILD, 'deps', 'opencv')}`,
  `-DORT_DIR=${path.join(BUILD, 'deps', 'ort')}`,
]);
mustRun(cmake, ['--build', buildDir]);

// 5. Push the program, its libraries, the assets and the fixtures to the emulator
const state = (() => {
  try {
    return execFileSync(adb, ['get-state'], { encoding: 'utf8' }).trim();
  } catch {
    return 'none';
  }
})();
if (state !== 'device') fail(`no emulator or phone ready (adb get-state: ${state}); start the emulator first`);
mustRun(adb, ['shell', `mkdir -p ${REMOTE} && rm -rf ${REMOTE}/assets ${REMOTE}/fixtures`]);
const pushes = [
  [path.join(buildDir, 'scanner_tests'), `${REMOTE}/scanner_tests`],
  [path.join(BUILD, 'deps', 'opencv', 'prefab', 'modules', 'opencv_java5', 'libs', `android.${ABI}`, 'libopencv_java5.so'), `${REMOTE}/libopencv_java5.so`],
  [path.join(BUILD, 'deps', 'ort', 'jni', ABI, 'libonnxruntime.so'), `${REMOTE}/libonnxruntime.so`],
  [libcxx, `${REMOTE}/libc++_shared.so`],
  [path.join(ROOT, 'modules', 'scanner', 'assets', 'scanner'), `${REMOTE}/assets`],
  [path.join(ROOT, 'fixtures', 'core'), `${REMOTE}/fixtures`],
];
for (const [local, remote] of pushes) {
  if (!existsSync(local)) fail(`missing ${local}`);
  const status = run(adb, ['push', local, remote], { stdio: ['ignore', 'ignore', 'inherit'] });
  if (status !== 0) fail(`adb push ${local} failed`);
}

// 6. Run the tests there; doctest's arguments pass through
const quote = (a) => `'${a.replace(/'/g, `'\\''`)}'`;
const args = process.argv.slice(2).map(quote).join(' ');
const status = run(adb, ['shell',
  `cd ${REMOTE} && chmod +x scanner_tests && rm -rf tmp && mkdir tmp && ` +
  `LD_LIBRARY_PATH=. ./scanner_tests --assets=assets --fixtures=fixtures ${args}`]);
process.exit(status);
