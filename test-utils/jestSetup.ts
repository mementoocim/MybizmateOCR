// Runs before every test file (package.json jest.setupFiles). Every test gets react-native-safe-area-context's own
// jest mock: zero insets and a 320×640 frame unless a SafeAreaProvider gives other metrics. A test file's own
// jest.mock of the module still replaces this one (__tests__/camera.test.tsx, __tests__/layout.test.tsx).
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

// Every animation runs to its end at once: RN's own AnimatedMock, which Animated picks when the platform asks for no
// animations (Platform.isDisableAnimations). With the native driver's jest mock, each animation would end 16 ms later
// on a timer, outside act(): a sheet would finish closing, and leave, after the test had moved on. A test that needs
// an animation's frames or its end stubs Animated.timing or Animated.parallel (__tests__/sheet.test.tsx).
const { PlatformConstants } = require('react-native/Libraries/BatchedBridge/NativeModules').default;
const platformConstants = PlatformConstants.getConstants();
PlatformConstants.getConstants = () => ({ ...platformConstants, isDisableAnimations: true });

// The phone recommends the very time a snackbar asks it for (components/Snackbar): 4 s, or 8 s with an action. RN's
// own jest mock resolves false, which took a message down at the next timer tick. This is that mock's own
// implementation, not a spy over it, so jest.restoreAllMocks() leaves it; a test that wants another answer mocks it
// again (__tests__/snackbar.test.tsx).
const { AccessibilityInfo } = require('react-native');
jest.mocked(AccessibilityInfo.getRecommendedTimeoutMillis).mockImplementation(async (ms: number) => ms);

// The scanner module's keyboard view (modules/scanner/src/ImeInsetsNativeView.ts) is native code, which jest doesn't
// have: a host component of its name stands in for it. A sheet renders it on Android, and a test fires imeChange on it
// for what the keyboard does in the sheet's own window (test-utils/keyboard's sheetKeyboard).
jest.mock('../modules/scanner/src/ImeInsetsNativeView', () => ({ __esModule: true, default: 'ImeInsetsView' }));
