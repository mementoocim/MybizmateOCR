import { colors } from '../lib/theme';

// React Native reads an 8-digit color as #RRGGBBAA; the test app's colors.xml writes Android's #AARRGGBB.
test('the see-through colors are written the React Native way (#RRGGBBAA)', () => {
  expect(colors.scrim).toBe('#FAF7F0CC'); // the paper at 80%, behind the reading card
  expect(colors.pill).toBe('#201913B3'); // the ink at 70%, behind the camera's status
  expect(colors.backdrop).toBe('#00000066'); // black at 40%, behind a bottom sheet
});
