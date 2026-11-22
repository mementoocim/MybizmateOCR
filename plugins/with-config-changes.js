// Android recreates an activity on every configuration change it doesn't declare. Expo's MainActivity doesn't
// declare font scale or density changes, so changing the phone's font size (or display size) restarts the app's
// screen: whatever the person typed in an open sheet is lost, and a debug build warns "configured linking in multiple
// places" each time.
//
// This adds fontScale and density to MainActivity's android:configChanges, so React Native handles those changes in
// place (it already re-reads the font scale and redraws its text). Values already declared are kept, and running it
// again adds nothing (design B §8: kept only while text updates correctly in place).
const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

const HANDLED = ['fontScale', 'density'];

module.exports = function withConfigChanges(config) {
  return withAndroidManifest(config, (cfg) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults);
    const declared = (activity.$['android:configChanges'] ?? '').split('|').filter(Boolean);
    for (const change of HANDLED) if (!declared.includes(change)) declared.push(change);
    activity.$['android:configChanges'] = declared.join('|');
    return cfg;
  });
};
