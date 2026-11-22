// Runs before every test file (package.json jest.setupFiles). Every test gets react-native-safe-area-context's own
// jest mock: zero insets and a 320×640 frame unless a SafeAreaProvider gives other metrics. A test file's own
// jest.mock of the module still replaces this one (__tests__/camera.test.tsx, __tests__/layout.test.tsx).
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
