// A fixed expo-crypto for jest: jest.mock('expo-crypto', () => require('../test-utils/fixedCrypto').fixedCrypto.module)
// Its randomUUID gives the same ID every time, as a jest.fn, so a test can tell whether an ID was made. A test that
// resets its modules (a restart) gets a new one: it reads the calls through require('expo-crypto') after the reset.

const UUID = '4a3f1c2e-8b7d-4e6f-9a5b-0c1d2e3f4a5b';

export const fixedCrypto = {
  uuid: UUID,
  module: { randomUUID: jest.fn(() => UUID) },
};
