// Scans keep client invoices (names, TINs, amounts, page images) in the app's files. Android's Auto Backup would
// upload them to the person's Google account, and the app promises that nothing leaves the phone.
test("the app's files are kept out of Android's backups", () => {
  const { expo } = require('../app.json');
  expect(expo.android.allowBackup).toBe(false);
});
