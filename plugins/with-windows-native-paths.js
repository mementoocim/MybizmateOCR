// Native (CMake) builds on Windows fail when a path passes 260 characters ("ninja: error: mkdir(...)", "build.ninja
// still dirty after 100 tries"). This project's folder path is long, and CMake puts every library's build folder
// inside node_modules, then nests each source file's full path inside its object folder.
//
// On Windows only, for every Android project with native code:
// - its CMake build folder moves to a short cache folder, %LOCALAPPDATA%\mbs-cxx\<project> (like Gradle's own
//   caches, outside the project);
// - CMAKE_OBJECT_PATH_MAX makes CMake replace over-long object folders with a short hash, as it already does when
//   it builds for Windows.
// Builds elsewhere (EAS, macOS) keep the defaults. The app's folder doesn't move.
//
// The block goes before `apply plugin: "expo-root-project"`, which configures some projects early; a project
// configured before the block runs keeps its default folder and gets a warning instead of failing the build.
const { withProjectBuildGradle } = require('expo/config-plugins');

const MARKER = '// mybizmate-scan: short native build paths on Windows (plugins/with-windows-native-paths.js)';
const BLOCK = `${MARKER}
if (System.getProperty('os.name').toLowerCase().contains('windows')) {
  def cxxRoot = new File(System.getenv('LOCALAPPDATA') ?: System.getProperty('user.home'), 'mbs-cxx')
  subprojects { sub ->
    ['com.android.library', 'com.android.application'].each { id ->
      sub.plugins.withId(id) {
        try {
          sub.android.externalNativeBuild.cmake.buildStagingDirectory = new File(cxxRoot, sub.name)
          sub.android.defaultConfig.externalNativeBuild.cmake.arguments('-DCMAKE_OBJECT_PATH_MAX=250')
        } catch (Exception e) {
          logger.warn("mybizmate-scan: kept the default native build folder for \${sub.name}: \${e.message}")
        }
      }
    }
  }
}

`;
const ANCHOR = 'apply plugin: "expo-root-project"';

module.exports = function withWindowsNativePaths(config) {
  return withProjectBuildGradle(config, (cfg) => {
    const src = cfg.modResults.contents;
    if (!src.includes(MARKER)) {
      cfg.modResults.contents = src.includes(ANCHOR) ? src.replace(ANCHOR, BLOCK + ANCHOR) : `${src}\n${BLOCK}`;
    }
    return cfg;
  });
};
