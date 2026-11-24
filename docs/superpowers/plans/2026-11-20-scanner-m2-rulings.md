# Milestone 2: rulings and deferred minors

Every decision made while executing `2026-11-20-scanner-m2-camera-and-both-forms.md` (Native, 2026-11-20), copied from the execution ledger before it was deleted. Branch `m2-camera-both-forms` in `mybizmate-ocr/`, head d322034.

## Rulings, in the order they were made

- Setup: Ruling: worked on branch m2-camera-both-forms in the existing mybizmate-ocr checkout, not in a separate git worktree — a second checkout needs its own node_modules and native build caches, and this laptop has the 260-character path limit; the branch keeps master clean — cost if wrong: low (no other work shares this checkout).
- Pre-flight: Ruling: build components/ReadingOverlay.tsx in Task 8 (used on Result during a retake) and reuse it in Tasks 9 and 10 — Task 8's retake reads while Result is on screen, so the overlay must exist there first — cost if wrong: none (same component, earlier).
- Task 1: Ruling: the tests are a plain script (python test_synth_service_invoice.py) with the plan's assertions, not pytest — the project's .venv has no pytest and its other tests are scripts — cost if wrong: none (same assertions).
- Task 1: Ruling: random.Random(2026) (and random.Random(1) in the test), not np.random.default_rng — synth.py's make_invoice, write_hand, write_check and photo_effects all take a random.Random — cost if wrong: none.
- Task 1: Ruling: photo_effects runs with synth.PAGE_W/PAGE_H set to the Service sheet's size for the call (restored after) — it is hard-wired to the 1700x2200 Sales page — cost if wrong: none.
- Task 1: Ruling: make_service_invoice redraws while make_invoice gives no customer — a Service Invoice always names its customer, and the test needs those boxes — cost if wrong: low (no blank-customer Service fixture).
- Task 1: Ruling: the table headings are "Qty" and "Price", short enough to stay 12+ px from the rules the finder checks beside — cost if wrong: none.
- Task 2: Ruling: the new checks are in test_export_core_fixtures.py's own check() style (the plan wrote pytest) — no pytest in the .venv, and the file already exports to a temp folder and checks it — cost if wrong: none (same assertions).
- Task 2: Ruling: tilt() is copied into the exporter instead of importing robust_service_invoice — that module imports test_service_invoice and postprocess, which sit next to scripts that read data/real_private; the copy is 6 lines — cost if wrong: none.
- Task 2: Ruling: 11 new photos, not 10 (inv_0051_dark2, svc_0000-0003, 6 svc_0000 variants); the "photos" check is now 28 photos / 27 expected — cost if wrong: none.
- Task 2: Ruling: the B&W fixtures are saved single-channel (enhance.black_white returns BGR; its 3 channels are equal) — Task 5's blackWhite is 8-bit single channel — cost if wrong: none.
- Task 2: Ruling: test_scanner.cpp's parity count goes from 16 to 18 alongside the skip line (dark2 and svc_0000_top join the loop) — both marked "until Task 4" — cost if wrong: none.
- Task 3: Ruling: scanner_core is compiled with -ffp-contract=off (not in the plan) — arm64 phones would otherwise fuse multiply-adds that the x86_64 emulator (where parity is tested) can't, so phones could compute the core's maths slightly differently — cost if wrong: none on x86_64; negligible speed on arm64.
- Task 3: Ruling: numpy.linalg.eigh on the 2x2 line covariance is a closed-form eigenvector (principal()), using the lower triangle as eigh does — parity passed on all 9 Service photos — cost if wrong: ulp-level line directions; the tests would show a tie flip.
- Task 4: Ruling: FrameAligner::find returns no form when the image is too small for its threshold block (under 3 px), as align.cpp does for the corner squares — the Python would raise; milestone 1's "a tiny image finds no form" test now reaches this finder — cost if wrong: none.
- Task 4: Ruling: numpy's summation is mirrored where the Python rounds or compares the result. That covers wts.sum() in the line merge, and np.average and the weight sums in _line_bands, all via npSum, numpy's pairwise sum. np.convolve sums left to right, each product rounded. Measured against numpy 2.5: 4,000 random sums, 16,413 convolve outputs. The 2x2 covariance (BLAS dgemm) and rel @ u (dgemv) stay plain, since their order couldn't be matched; they only move values at the last digit — cost if wrong: a rare tie flip, which the parity tests would show.
- Task 4: Ruling: the date's second, digits-only read uses a new recognizer type "date_digits" (0-9 and "/-., ") — the C++ recognizer keys its character sets by type — cost if wrong: none.
- Task 4: Ruling: checkParity now also compares cropSize, for both forms — the plan asked for it on the Service reads; it costs nothing on the Sales reads — cost if wrong: none.
- Task 6: Ruling: BoxRead.cropUri is now string | null (null when a scan keeps no files); app/result.tsx passes `?? undefined` until Task 8 rewrites it — cost if wrong: none.
- Task 6: Ruling: a scan's copied photo (content://) and Android's HEIC decode go in cache/scan-work, deleted after every scan, so no input/photo.png copies stay in the scan folder (milestone 1's deferred cleanup) — cost if wrong: none.
- Task 6: Ruling: a failed scan deletes the scan folder it just made (not in the plan) — cost if wrong: none.
- Task 7: Ruling: the view's prop setters only store values; OnViewDidUpdateProps applies them together (applyProps), so the order props arrive in can't start the camera before testImage is known — cost if wrong: none.
- Task 7: Ruling: when the view becomes active again (after a photo is read, or a read failed), it resets AutoCapture and its capture flag, so the camera looks again — the plan didn't say how the view resumes — cost if wrong: none.
- Task 7: Ruling: the analysis thread is a daemon thread, shut down in OnViewDestroys (release()) — cost if wrong: none.
- Task 7: Ruling: the TS wrapper casts requireNativeView's component to accept a ref (Expo's type omits it); the ref carries takePhoto — cost if wrong: none.
- Task 8: Ruling: components/ReadingOverlay.tsx (with a LoadingBar) is built here, as the pre-flight ruled — cost if wrong: none.
- Task 8: Ruling: formatClock formats by hand ("2:41 PM") instead of toLocaleTimeString — Hermes' Intl may put a narrow no-break space before AM/PM — cost if wrong: none.
- Task 8: Ruling: the photo-check test lists the 27 fixture stems by name (no Node fs types in this project) — cost if wrong: a new fixture needs adding there.
- Task 8: Ruling: the tests check the fixtures' own values, not the plan's illustrations: svc_0000's terms are cash ("Cash sales", the plan's example said "Charge sales"), and invoice_no's confidence rounds to 100% (the example said 99%); the result test computes them from the fixtures — cost if wrong: none.
- Task 8: Ruling: app/index.tsx (milestone 1's Home) moved to addScan's new object form, so tsc stays clean until Task 9 rewrites it — cost if wrong: none.
- Task 8: Ruling: a "Couldn't open the photo." toast for scanUri's own failure (the camera's photo), alongside the plan's gallery and sample messages — cost if wrong: none.
- Task 9: Ruling: BrandSplash hides the phone's splash in its own onLayout, not when the scanner is ready, so the brand splash (with its loading bar) is what shows while the scanner warms up — cost if wrong: a blank frame between the two splashes on a slow phone.
- Task 9: Ruling: onReady is called from a setTimeout after the 300 ms fade, not from Animated's end callback (which jest's fake timers don't drive and which may not fire if the animation is interrupted) — cost if wrong: none, same timing.
- Task 9: Ruling: Home refreshes recent scans when it gets focus and when a read ends (scans read on the camera screen land while Home is behind it) — cost if wrong: none.
- Task 9: Ruling: expo-image-picker's plugin gets microphonePermission:false, so the manifest drops RECORD_AUDIO (the app never records; the camera-app path takes stills only) — cost if wrong: none.
- Task 9: Ruling: the adaptive icon's background is #FFFFFF, matching the test app's launcher icon (white with the coral B) — cost if wrong: none.
- Task 9: Ruling: no "scanner ready" console log (no content or timing logs in the client app) — cost if wrong: none.
- Task 10: Ruling: the camera view fills the space between the bars and fits the 3:4 picture itself (ScannerCameraView.kt's onLayout, as CameraActivity.fitPicture), so the screen measures nothing — cost if wrong: none.
- Task 10: Ruling: the camera permission is checked again when the app comes back to the front (AppState "active"), not only on focus — coming back from the phone's settings doesn't change the screen's focus, so the camera would never appear — cost if wrong: none.
- Task 10: Ruling: a capture or keep error stays in the pill for 3 s — the view re-sends its status right after a failed photo, which would hide the error at the next frame (the test app had the same one-frame flash) — cost if wrong: the status shows 3 s late after an error.
- Task 10: Ruling: a photo that arrives after the screen was left is deleted, not just ignored (an invoice photo in the app's cache) — cost if wrong: none.
- Task 10: Ruling: useScanFlow (Task 8) opens a read's result only if its screen is still shown (useIsFocused, and false once unmounted); otherwise the scan is only kept in Recent scans. Back pressed during a read on the camera (or Result's retake) would otherwise replace Home with the result. Home's and Result's test mocks gained useIsFocused — cost if wrong: a read that ends after leaving doesn't open (it's in Recent scans).
- Task 10: Ruling: in the development test mode (/camera?test=) the camera permission isn't checked; the test photo needs no camera — cost if wrong: none (development builds only).
- Task 10: Ruling: while a panel shows, the pill, Auto/Manual, the torch and the shutter hide (the test app's showPanel); the gallery button stays — cost if wrong: none.
- Task 10: Ruling: Auto/Manual is announced by its visible word with a hint, instead of the test app's fixed description (which said "Auto" in Manual too) — cost if wrong: none.
- Task 10: Ruling: the camera route's contentStyle is black, so the push animation doesn't flash the paper color — cost if wrong: none.
- Task 10: Ruling: theme.ts's scrim and pill and Sheet's backdrop were copied in Android's #AARRGGBB; React Native reads #RRGGBBAA (the reading scrim showed cyan, the pill a faint red, the sheet had no backdrop). Fixed, with theme.test.ts — cost if wrong: none.
- Task 10: Ruling: AGENTS.md asks for lint before a task is done and the project had none; `npx expo lint` set up ESLint 9 + eslint-config-expo (224 packages added to the lockfile, none changed). Its findings fixed in their own commit: Animated values in state instead of refs, Recent scans as a store Home subscribes to (useSyncExternalStore; a scan read on another screen shows at once — new test), apostrophes as strings; tests may use require() — cost if wrong: devDependencies the team didn't pick; the lint commit can be dropped on its own.
- Task 11: Ruling: the rows use the test app's words around the values ("1.6 s or more", "905 ms of each invoice"); the plan's table gave only the values — cost if wrong: none.
- Task 11: Ruling: compareWithSample (lib/samples.ts) counts for both the Result screen's sample line and the speed test: exact = boxes with writing read exactly (strict equality, as the plan and Task 8 say; the test app's same() also ignored case and extra spaces in text boxes), laptop = the laptop's reads (empty ones too) read the same — cost if wrong: the exact count can be a little lower than the test app's.
- Task 11: Ruling: "Starting the scanner" is stats().loadMs only; the test app added its warm-up scan's time, which this app doesn't time — cost if wrong: a smaller number than the test app's.
- Task 11: Ruling: the device line is the plan's "<Brand> <Model> · Android <Release>" with the brand capitalized (the test app showed cores and RAM) — cost if wrong: none.
- Task 11: Ruling: leaving the screen mid-run doesn't stop the run, as in the test app; a scan started meanwhile waits for the scanner's thread — cost if wrong: a team member who leaves mid-run waits up to ~20 s for their next scan.
- Task 12: Ruling: no phone was connected, so Step 3's phone checks are OPEN (speed on arm64, 50 MP / HEIC memory, live camera on a printed form, torch, Manual); the README says so. In their place a client release was built and checked on the emulator (x86_64) — cost if wrong: none; the phone check still has to happen.
- Task 12: Ruling: the client release on the emulator stopped on "The scanner couldn't start": a release build gives bundled images (the samples) as drawable names with no scheme (expo-asset keeps them for React Native's Image), and the module read only file:// and content://. Fixed: bundledImageName + copyBundledImage (12abc33), with a JVM test that failed first; the release then starts, reads samples, runs the speed test and the live camera — cost if wrong: none; this blocked every client release.
- Task 12: Ruling: `npx expo run:android --variant release` built all 4 ABIs (450 MB APK, INSUFFICIENT_STORAGE on the emulator); the check used `gradlew app:assembleRelease -PreactNativeArchitectures=x86_64` (168 MB). The README tells the team to build one ABI (arm64-v8a ≈ 110 MB) and says clients should get an AAB through Play — cost if wrong: none.
- Task 12: Ruling: for the live-camera checks the app's own permission request was answered "Only this time" (the least lasting grant) — cost if wrong: none.
- Final: Ruling: I5 the speed test opens by deep link in client builds — kept as the plan says ("on any build"): it reads only the bundled samples, shows timings, and no screen leads to it in a client build, so the team can measure a client build — cost if wrong: a client who opens the link sees the team's speed test (nothing shown or sent about them). Asked the user to confirm.
- Final: Ruling: declined "Save pressed again after the first save makes a second file" — stands: a deliberate second save saves again; the double-tap guard covers accidental repeats — cost if wrong: a duplicate image in Pictures.
- Final: Ruling: declined "switching apps mid-photo still reads the photo and opens its result" — stands: the person took the photo; the requirement aims at leaving the camera with Back — cost if wrong: none.
- Final: Ruling: declined "Android 16 ignoring the portrait lock on large screens" — phones only for now; on the device checklist for tablets and foldables later — cost if wrong: a misplaced outline on big screens.
- Final: Ruling: declined "the real-phone checks" — still open, listed in the README — cost if wrong: arm64 numbers unknown until checked.
- Final: Ruling: declined "APK size, ABIs, AAB and store permissions" — the store-release milestone; the README says how to build one ABI — cost if wrong: none now.
- Final: Ruling: declined "the iOS fallbacks" — the iOS milestone — cost if wrong: none now.
- Final: Ruling: declined "the Python generator and exporter outside the repo" — tested in this run (29/29 and the synth tests) — cost if wrong: none.
- Final: Ruling: declined "the generated fixtures" — written by the tested exporter and checked by the parity tests — cost if wrong: none.
- Final: Ruling: declined "22 moderate npm advisories" — dev tools only, unchanged by this work, not in the app — cost if wrong: none for clients.
- Final: Ruling: declined "ScanOptions' Introspectable warning in release" — expo-modules-core keeps Record classes whole under R8 (its consumer rules, read), and the release build read samples; checking that a release speed-test run keeps no files is on the phone checklist — cost if wrong: release scans keep files (at most 6) and camera photos wait for the start-up sweep.
- Final: Ruling: reviewer's "Task 11 cost understated" — with I4 fixed the camera no longer freezes during a background run; a scan started meanwhile still waits for it — stands for a team-only tool — cost if wrong: a team member waits up to ~20 s.

## Deferred minors

- the torch icon can stay "on" after leaving the app and coming back (CameraX reopens with the torch off).
- the preview and the analysis share no ViewPort; if one falls back from 4:3 the outline is offset — on the phone checklist.
- detectFrame's JNI doesn't check the buffer's capacity against rowStride*(height-1)+width.
- enhance() reuses an enhanced.jpg/bw.png cut short by a kill; write to a temp name and rename.
- lineBands can return an empty band, so rowRange throws and the scan fails where the Python gets an empty slice.
- recent.json writes aren't chained; two quick saves can interleave.
- the Service finder's cost on cluttered frames is unmeasured — on the phone checklist.
- the logo jumps ~115 px between the phone's splash and the brand splash.
- the manifest keeps template permissions the app doesn't use (INTERNET, SYSTEM_ALERT_WINDOW, VIBRATE, READ/WRITE_EXTERNAL_STORAGE) while Home says "no internet access"; strip them for the Play build (INTERNET in release only).
- decodeWithAndroid catches only IOException, and Android 8's BitmapFactory path has no inSampleSize.
- a gallery copy left by a kill mid-read stays in cache/ImagePicker (only cache/camera is swept: expo-image-picker can hand over a pending result after a restart).

## Final review fixes

- fixed C1 Auto Backup of scans and recent.json — appConfig.test "the app's files are kept out of Android's backups" RED→GREEN; regenerated manifest allowBackup="false"; the installed app's flags have no ALLOW_BACKUP; suite 60/60.
- fixed I1 the gallery's copies stayed in the cache — home.test "Choose from gallery reads the photo" now expects deletePhoto:true, RED→GREEN; emulator: cache/ImagePicker empty after a gallery read; suite 60/60.
- fixed I1 failed reads, photos saved after the camera stopped, and leftovers — ImageSizingTest "a photo to delete is deleted whether or not it could be read" and "clearing the captures empties the camera folder and nothing else" RED→GREEN; onImageSaved deletes a photo when the camera stopped; emulator: a planted cache/camera photo is gone after a cold start; Kotlin 20/20.
- fixed I2 a photo arriving while the gallery was open was dropped and froze the camera — camera.test "the camera stops while the gallery is open, and looks again when it closes" and "a photo that arrives while the gallery is open is deleted, not read" RED→GREEN; suite 60/60.
- fixed I3 large JPEGs decoded at full size — test_scanner "the JPEG header gives the stored size", "only a JPEG over twice the cap is decoded smaller", "a JPEG over twice the cap decodes to a full decode's size, and reads", "a turned JPEG over twice the cap comes out upright" RED→GREEN; with the reduction switched off the two decode tests fail; core 36/36, 6048 assertions; fixture parity unchanged.
- fixed I4 frame checks waited for scans — ScannerHolderTest "aFrameCheckDoesNotWaitForAScan" RED→GREEN, plus "twoUsesAtOnceCreateTheScannerOnce"; Kotlin 20/20.
- fixed (reviewer's Minor, re-graded Important: a failed warm-up left the app unusable) — splash.test "a warm-up read that fails still opens the app" RED→GREEN, and fails again with the fix removed; suite 60/60.
