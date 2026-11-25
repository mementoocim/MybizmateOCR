### Task 13: Leftovers, and the README

**Files:**
- Modify: `README.md`; anything the search below finds.

- [ ] **Step 1: Leftovers.**
  - `rg -n "'/saved'|'/settings'|RecentRow|ExportSheet|scanUri|from: 'recent'|from: 'saved'" app components lib __tests__ test-utils`. Expected: nothing.
  - `rg -n "newest 20|last 20" lib app components README.md`. Expected: only the milestone sections the README keeps as they are.
  - Remove whatever is found, with its tests.

- [ ] **Step 2: The README.**
  - **At the top:** the spec and this plan join the design and plan lists.
  - **"What it does", milestone 2:** Home, The camera and Recent scans become:
    - **The bar:** five icons, the raised camera button that's the shutter on the camera, and Export's count.
    - **The camera tab:**
      - continuous shooting; Auto takes the next sheet once the last has left the frame for half a second;
      - the tray: gallery, the thumbnails with their state, Done · N, and PDF;
      - a read that fails is a "!", with why on the session screen.
    - **Sessions:**
      - what a session is;
      - 30 minutes, or a restart, closes one;
      - photos wait in `files/queue/` until they're read.
    - **Home's cards, and Profile.**
  - **Milestone 3:** Saved becomes the Export tab (its steps, and See invoices). The session screen has Check the next one and Next invoice.
  - **Privacy:**
    - unsaved scans keep the newest 100, about 1.2 MB each from the QA backup, so about 120 MB at 100 (spec §6.9);
    - a later round could ask before dropping unchecked scans;
    - debug builds log the camera's form checks per second (`MbsCheckRate`), figures only.
  - **"The camera's test photo":**
    - the link opens the camera tab;
    - Auto takes the photo once, then waits for the sheet to leave, which a still never does;
    - the round button takes more.
  - **"PDFs on the emulator":** the camera tab's PDF button.
  - **The dev client's Tools button note:** Home's header has no icons now.
  - **Tests:** the Kotlin tests add re-arming after a photo and the checks counter.
  - Leave every "Checked on the emulator (…)" section as it is.

- [ ] **Step 3: Run** `npm test` and the gates. Expected: PASS.

- [ ] **Step 4: Commit** with the message `docs: the README describes the tabs, the camera's sessions, the Export tab, Profile and the 100 unsaved scans`.

---

