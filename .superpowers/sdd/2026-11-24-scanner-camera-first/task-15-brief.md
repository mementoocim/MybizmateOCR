### Task 15: The checks on the emulator, and the README's record (the controller runs it)

**Files:**
- Create: `.superpowers/brainstorm/camera-first-2026-11-24/qa/*.png` and `index.md` (in the parent folder, outside git)
- Modify: `README.md` (a "Checked on the emulator (camera first)" section)

Back up first (README step 2), and restore after every check that changes data.

- [ ] **Step 1: The checks** (spec §7). Save each capture as `<check>-<screen>.png`, and note in `index.md` what each shows.
  1. **The launch:**
     - from the dev client, the camera after the splash;
     - a cold `mybizmatescan://speed` with the tabs under it: Back goes to the camera.
  2. **A 10-photo session through the `?test=` hook:**
     - open `mybizmatescan://camera?test=inv_0051`;
     - Auto takes the first, then the pill says "Taken · put in the next one";
     - the middle button takes 9 more, by `adb shell input tap` at its centre, read from a text-only dump;
     - the tray scrolls, and shows Done · 10;
     - Done says "Reading N more…", then opens the session screen, with 10 rows.
  3. **A failed read and a retake:**
     - push `fixtures/core/photos/not_an_image.jpg` and `blank_page.png` to `/sdcard/Pictures/`, and run the media scan;
     - pick each with the tray's Gallery, by its label in a text-only dump: a "!" thumbnail for each;
     - after Done, the banner says "1 photo couldn't be read. Retake it." with its words, and the blank page has Retake and Remove;
     - Retake, then a `?test=` photo, replaces the blank page.
     - Delete the pushed files and run the media scan again.
  4. **Back on every tab** (`adb shell input keyevent KEYCODE_BACK`):
     - Home, Sessions, a session screen, Export, a file step, See invoices and Profile each lead to the camera;
     - on the camera, the app leaves: `dumpsys activity activities | grep mResumedActivity` shows the launcher.
  5. **The bar at 200% text, with 3-button navigation, and at 360 dp** (design B Task 26's commands, each restored after):
     - each tab, and the camera, with nothing behind the bar: the end of Sessions, Share the file, Profile's last row, a snackbar;
     - the status bar is light on the camera and dark on the other tabs.
  6. **The keyboard:** Profile's Offset account, with the soft keyboard shown. On a hardware-keyboard AVD, `show_ime_with_hard_keyboard 1` needs the user's OK, and goes back to 0 after. The bar is gone, and the field sits above the keyboard.
  7. **TalkBack names and states, through text-only uiautomator dumps:**
     - five tabs, the selected one, "Export, N to send", and "Camera" or "Take photo";
     - the tray's thumbnails;
     - the session rows' badges in their names.
  8. **The update over data from before** (the restored backup):
     - the old scans show in Sessions as sessions of their own ("Camera photo 4:10 PM"…);
     - one opens, one shows in See invoices and exports, and one is deleted. Then restore.
  9. **The core suite, once:** `npm run test:core`. Expected: PASS. This change touched nothing it covers.

- [ ] **Step 2: Restore** the app's data and the emulator's settings, and `rm /tmp/scan-appdata.tar`.

- [ ] **Step 3: The README's record.** Add "Checked on the emulator (camera first)", in the style of the UI pass's section:
  - the AVD and the build;
  - the suites on the final tree;
  - each check above, with its result;
  - the measurement's figures and the call;
  - what couldn't be checked here: a real phone's feel and speed, the real camera on paper (re-arming as sheets are swapped), TalkBack at run time, and iOS.

  Commit with the message `docs: camera first, as checked on the emulator`.

- [ ] **Step 4: Tell the user** where the captures are, with two or three of them.

---

