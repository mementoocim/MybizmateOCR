### Task 14: The rebuild, and approach 1 or 2 (the controller runs it)

**Files:**
- Modify (only if approach 2 wins): `lib/captureQueue.ts` (`READ_WHILE_SHOOTING = false`) and the README's sessions bullet
- Temporary, never committed: fixture photos in the app's `files/queue/`

- [ ] **Step 1: Get the emulator.**
  - Check that no other session holds emulator-5554.
  - Copy `android/app/build/outputs/apk/debug/app-debug.apk` into a new folder in the scratchpad. Task 1 built no APK, so this is still master's build: it gives the size before, and a QA AVD's data from before.
  - Ask the user (AskUserQuestion) which AVD to use:
    - **their Medium_Phone_API_36.1:** it has a hardware keyboard, a virtual-scene back camera, and the app's data from before this change;
    - **a new QA AVD:** made as design B's Task 26 made `UI_QA_Phone` (API 36, 1080×2400 at 420 dpi, x86_64, no hardware keyboard), with `hw.camera.back=virtualscene`, and made-up data only.
  - **For a new QA AVD,** make data from before first:
    - install the copied master APK;
    - `git switch master`, start Metro, and make made-up data: two samples' worth of scans, plus a `?test=` scan kept unsaved;
    - stop Metro, then `git switch camera-first`.

- [ ] **Step 2: Rebuild and reinstall** with README "Reinstalling without losing the app's data":
  - step 1 builds the APK;
  - run `npm run check:apk`;
  - step 2 is the backup and its three checks, to `/tmp/scan-appdata.tar`;
  - step 3 uninstalls, installs and restores;
  - step 4 is the counts.

  Keep the backup: Task 15 checks the update against it. Start Metro (`npx expo start --dev-client`) on `camera-first`, and open the app from the dev client's launcher.
  - Expected: after the splash, the camera, with the bar.
  - The permission is asked for there, not over the splash.

- [ ] **Step 3: The measurement** (spec §5).
  - Push eight fixture photos to `/data/local/tmp/`: `fixtures/core/photos/inv_0001`, `inv_0007`, `inv_0011`, `inv_0017`, `inv_0027`, `inv_0041`, `inv_0051` and `svc_0000.jpg`.
  - Force-stop the app.
  - Copy them with `run-as` into `files/queue/1764000000000-qa01/`, each named as `queuedName` names a test camera photo (Task 3), so the restart reads them. They're real reads, and never training data.
  - `adb logcat -c`, then open the app. The camera tab shows the virtual scene while the queue reads the eight.
  - Ask the user to watch the emulator's preview during the reads, and say whether it stutters.
  - When `reading=false` lines have run for 20 s, run `adb logcat -d -s MbsCheckRate:D` into the scratchpad.
  - Take the median of `form checks/s` over the `reading=true` lines and over the `reading=false` ones.
  - Also run `adb shell dumpsys gfxinfo com.mybizmate.scan` for janky frames: reset before, read after the reads, then again after 20 s idle.
  - **The call:** approach 2 when the reading median is under half the idle one, or the user saw stutter. Otherwise approach 1.
  - **For approach 2:**
    - set `READ_WHILE_SHOOTING = false`;
    - say so in the README's sessions bullet;
    - run the gates;
    - commit `fix(app): read a session's photos after Done: the camera stuttered while it read (spec §5, approach 2)`.

- [ ] **Step 4: Restore** the app's data from the backup (README steps 3–4, without the rebuild), so the measurement's scans go. Tell the user the figures, the call, and the APK's size before and after.

---

