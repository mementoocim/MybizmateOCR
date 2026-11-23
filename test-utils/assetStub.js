// Jest's stand-in for a required .txt asset (package.json's jest.moduleNameMapper): as Metro does, it gives the
// require a number, for expo-asset's Asset.fromModule. Each one is this same module, so a test reads a text's own file
// with fs (__tests__/licenses.test.ts).
module.exports = 1;
