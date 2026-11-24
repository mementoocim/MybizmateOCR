# MyBizMate Scan: camera first, a bottom bar, and sessions

**Status:** approved by the user on 2026-11-24 ("Approve"), after the builder check.

**Builds on:**
- the UI pass "design B" (`docs/2026-11-22-mybizmate-scan-ui-ux-design.md`, merged into master at 3720049);
- its rulings in `docs/superpowers/plans/2026-11-22-scanner-ui-design-b-rulings.md`.

Where this document and design B differ, this one wins.

**The mockup the user approved ("okay na yun muna"):** `.superpowers/brainstorm/570-1795475173/content/nav-camera-first.html`, in this folder.

## 1. Why

The user showed the app to their boss ("sir") on 2026-11-23. The goal he set: the app must be very easy to use for someone who isn't technical.

His question was: **what does the app show first, the moment it opens?**
- Today it's the splash, then Home: three capture buttons, "Get set up", "To export" and Recent scans. That's a workspace. A first-time or non-technical person has to work out where to start.
- The answer agreed with the user: **open straight to the camera.** Getting around is a bottom bar of five icons, and a run of photos taken together is a **session**.

## 2. What the person sees

The bar, icons only (Lucide, the app's icon set), left to right:

| Tab | Icon | What it's for |
|---|---|---|
| Home | `house` | What to do now: invoices to check, what's ready to send, the last session, and "Get set up" on a first run. |
| Sessions | `files` | Everything scanned, one row per session, grouped by day. |
| Camera | `camera`, in a raised coral circle in the middle | Where the app opens. On the camera, this circle is the shutter. |
| Export | `send` (paper plane), with a count | Send to MyBizMate: Sales, Purchases and 2307s. The count is how many are saved but not sent yet. |
| Profile | `circle-user` | The business settings, Customers and items, About and licenses, and Team tools in team builds. The account goes here once sign-in exists. |

**A session** is the invoices taken one after another, from opening the camera to pressing **Done**. That's the user's definition, confirmed on 2026-11-24.

## 3. Goals, non-goals, anti-goals

**Goals:**
- After the splash, the app opens on the camera. The first press takes a photo.
- Taking several invoices in a row never stops to ask anything. Checking comes after Done.
- Each tab answers one question, and Home always shows the next thing to do.
- Everything design B built stays and keeps working. That includes the Scan screen and its sheets, the save sheets, the export steps, the lists, Settings' fields, the team screens, the samples, PDFs and 2307s.

**Non-goals (this round):**
- **Signing in.** It's being designed in its own session. Profile leaves room for it, but shows no sign-in until it exists.
- **Saving several invoices in one step.** See §6.4: the mockup's "Save the 1 that's ready" becomes "Check the next one".
- Changes to the reader, the checks or the export file.
- iOS (milestone 9).

**Anti-goals (a failure even if it works):**
- Losing a scan the person hasn't looked at yet.
- A camera that feels slower than today's.
- Icons the person can't tell apart, or a tab they can't find their way back from.

## 4. Constraints

- **It still works offline.** Nothing leaves the phone, and no content is logged.
- **No new dependency.** The tabs come from expo-router 58's own fork of React Navigation (`expo-router/build/react-navigation/bottom-tabs`), which is already installed.
- **Two native changes, both in the app's own scanner module, with no new dependency:**
  - the scan-folder cap (§6.9, `KEEP_SCANS` in `ScannerModule.kt`);
  - re-arming the camera after each photo, so it can keep shooting (§6.3, `ScannerCameraView.kt` and `AutoCapture.kt`, with their Kotlin tests).
  - They need one rebuild on Windows, as design B's Task 0 and Task 26 did, using `plugins/with-windows-native-paths.js`.
- **Design B's tokens and components only:** Screen, Header, Button, ListRow, Badge, Sheet, Snackbar and the others. The bar is one new component built from them.
- **Data persists across the update.** Scans saved or kept before it must show up in Sessions, open, export and delete.
- **Team tools stay out of client builds,** including deep links.
- **Rulings from design B still bind:**
  - T26-4: going back through the live screen's navigation;
  - F-6: a press that opens a screen runs once;
  - and the rest.

## 5. Approaches

**Navigation:**
- **A. expo-router `Tabs`, with our own bar component (`tabBar` prop). Chosen.**
  - Each tab keeps its own state.
  - System Back follows React Navigation's rules.
  - Deep links keep working.
  - It costs a routes move: the tabs go in `app/(tabs)/`.
- **B. One Stack, with a hand-made bar drawn on five screens.**
  - Less to move, but each tab would remount on every switch, and Back would walk through every tab visited.
  - Rejected.
- **C. A third-party animated tab bar.**
  - It needs a new dependency, against §4.
  - Rejected.

**Reading the photos of a session:**
- **1. Read each photo as soon as it's taken, one at a time, while the camera stays live. Chosen.**
  - Each thumbnail shows reading, read, or couldn't read.
  - By Done, most of the session is already read.
- **2. Read them all after Done.**
  - The camera stays as light as possible, but the person waits on a progress screen after Done.
  - This is the fallback. The rest of this design doesn't change if it's used.
- **What decides between them:** a debug-only counter of the camera's form checks per second, with figures only and no content.
  - On the emulator's virtual camera, not the `?test=` hook, which shows no live preview: compare the rate while a read runs with the rate while none does.
  - If the rate drops below half, or the preview visibly stutters, the plan switches to 2.
  - A phone confirms it later.

## 6. The design

### 6.1 Routes and getting around

**Routes:**
- `app/(tabs)/_layout.tsx` holds the `Tabs`, with `initialRouteName` set to the camera.
- The tab screens are `index` (Home), `sessions`, `camera`, `export` and `profile`.

**The session screen** is a screen inside the Sessions tab, so the bar stays visible there, as in the mockup (screen 2).

**These stay in the root Stack, above the tabs, so the bar is hidden on them:**
- the Scan screen (`result`), which has its own bottom bar;
- `lists`, `licenses` and `license`;
- `speed` and `training`.

**Android Back:**
- On any tab other than the camera, Back goes to the camera (`backBehavior: 'initialRoute'`).
- On the camera, Back leaves the app, as on Home today.

**Deep links keep working:** `mybizmatescan://camera?test=…`, `/speed` and `/training`.
- The camera link opens the camera tab.
- T24-1's anchor moves to the tabs group.

**Going back keeps T26-4's hook,** and opening keeps F-6's `usePushOnce`.

### 6.2 The bar (`components/TabBar.tsx`)

**Layout:**
- A white bar with 20 dp corners, floating 12 dp above the navigation bar's inset, with design B's shadow.
- Five slots. Each side tab is at least 48 dp square.

**Icons:**
- 24 dp, in `colors.ink`.
- The inactive ones use a muted ink that still meets 3:1 against white.

**The active tab:**
- an ink icon;
- a 5 dp coral dot under it.

So it never depends on colour alone.

**The middle button:**
- A 60 dp coral circle, raised 26 dp, with a 4 dp paper ring and an ink camera icon.
- On the camera tab it becomes the shutter: a white core inside the coral ring. Pressing it takes a photo.
- Its accessible name is "Camera" on the other tabs and "Take photo" on the camera.

**The Export count:**
- A coral pill with ink figures, in IBM Plex Mono.
- It shows when anything is saved but not exported, and it caps at "99+".
- The count is part of the tab's accessible name: "Export, 7 to send".

**Accessibility:**
- Each tab is a `tab` role with `selected` state and a name ("Home", "Sessions", "Camera", "Export", "Profile").
- The bar is a `tablist`.

**Keyboard:** the bar hides while the keyboard is up (`tabBarHideOnKeyboard`).

### 6.3 The camera tab and the session

- **The screen is today's camera:** the live outline, Auto and the torch.
  - Above the bar sits a tray: the gallery button on the left, the session's thumbnails with **Done · N** in the middle, and the PDF button on the right.
  - The tray shows only while a session has a scan. Before that, the tray area shows today's hint.
- **A session starts** with the first photo, gallery pick or PDF after the camera tab gains focus with no session open. It gets an id (a timestamp plus a random suffix), and every scan read in it carries that id.
- **Re-arming between photos (native).** Today the camera view stays "capturing", and Auto stays "taken", after a photo until the camera is stopped and rebound.
  - After a photo is handed to JS, the camera clears its capturing state and stays bound.
  - Auto re-arms only after the form has left the frame (no outline for 0.5 s), so it never takes the same sheet twice while the person swaps it.
  - The middle button can take a photo any time.
- **Taking a photo** (the middle button, or Auto) adds the photo to the session's queue. The camera stays live and the person can take the next one at once.
- **The queue lasts:**
  - Each photo moves from the camera's cache into `files/queue/<session id>/` before it's read. The scanner clears its cache at every start, so this keeps it safe.
  - At start, the app reads any queued photos into their sessions.
  - A queued photo is deleted only once its scan is stored, or once its read has failed.
  - The queue reads one photo at a time, in order, through today's read path: `scanFlow`'s read, without its jump to `/result`.
  - **Each thumbnail shows its state:**
    - a ring while it's read;
    - a pine ✓ when it's read;
    - an amber ! when the form wasn't found or the read failed.
  - A failed read no longer opens a dialog over the camera. It becomes a thumbnail with !, and the session screen says why.
  - **A failed read** is one that threw, not one where the form wasn't found. It has no scan to store, so the open session keeps a short entry for it in `session.json`: its time and plain-words reason.
    - The session screen lists those entries as "1 photo couldn't be read. Retake it."
    - They're dropped when the session closes.
  - "Done · N" counts every photo taken. A session's "N invoices" counts stored scans.
  - **A sample** (Home's "Try a sample invoice") opens the Scan screen as today. It's never part of a session.
- **Done:**
  - It ends the session.
  - It waits for the queue, showing "Reading 2 more…" on the button.
  - Then it opens the session screen in the Sessions tab.
  - A one-photo session goes straight to that photo's Scan screen, as a single scan does today.
- **Leaving without Done** (another tab, or the app going to the background):
  - The session stays open, and the queue keeps reading.
  - Coming back to the camera continues it.
  - A session left open for 30 minutes, or across an app restart, closes by itself. Its scans are kept, and it shows in Sessions.
- **The gallery and PDF buttons** add to the current session the same way.
  - A PDF with several invoices adds one scan per page that the reader returns, as it does today.

### 6.4 The session screen (`app/(tabs)/sessions/[id].tsx`)

- **The header:** "Today, 9:41 AM" (or "Nov 20, 2:15 PM"), with "Session · 3 invoices".
- **A summary card** counts what's left: "1 ready · 1 to check · 1 to retake". When nothing is left: "All saved."
- **A row per scan:**
  - the party's name, or the scan's label when there's none;
  - the number and kind, and the amount;
  - one badge: Checks passed, N to check, Retake, Saved, or Exported.
  - Pressing a row opens the Scan screen.
- **The primary button is "Check the next one".** It opens the first scan in the session that isn't saved and whose form was found.
  - **On the Scan screen opened from a session, after a successful save,** the bottom bar's primary becomes **Next invoice** while one is left. It replaces the Scan screen with the next one. When none is left, the primary becomes **Back to session**.
  - The snackbar says "Saved as a sale." with no View: the bar now does that job.
  - Opened outside a session (an old scan), the snackbar's View opens the Export tab at that kind.
- **A scan whose form wasn't found** has the badge "Retake".
  - It isn't counted as "to check".
  - "Check the next one" and "Next invoice" skip it.
  - Its row offers **Retake** and **Remove**.
    - Retake opens the camera in that session, and the next photo replaces this scan once it reads.
    - Remove deletes the scan.
  - A session is "All saved" when every scan in it is saved and nothing is left to retake.
  - **Call:** this replaces the mockup's "Save the 1 that's ready". A batch save would need one set of save details (kind, VAT, account, terms) for several invoices. A non-technical person could save them wrong without seeing it. It can come later.
- **Deleting:** a row's long press offers "Delete this scan", with today's confirm. It deletes unsaved scans, and saved ones through today's delete.

### 6.5 Home (`app/(tabs)/index.tsx`)

Home is cards from top to bottom, and each card has a single button.

1. **First run:** "Get set up N of 2" (today's two rows) until it's done.
   - With no scan yet, a card says "Take your first photo" and points at the middle button. Today's three tips move into it.
2. **"N invoices to check"** counts the unsaved scans whose form was found.
   - It adds "and 1 photo to retake" when there's one.
   - Its button, **Check now**, opens the oldest session with something left.
3. **"Ready to send to MyBizMate"**, the Sales, Purchases and 2307s lines with their totals (today's To export). Its button is **Go to Export**.
4. **"Last session"**, with its time and count. It opens that session.
5. **"Try a sample invoice"**, today's text button. It stays for first-timers, at the bottom.

**Call:** the greeting ("Good morning") and the date in the header stay, as in the mockup.

### 6.6 Sessions (`app/(tabs)/sessions/index.tsx`)

- **A row per session, newest first, under day headers** (Today, Yesterday, then "Nov 20").
  - Each row reads "9:41 AM · 3 invoices", or "1 PDF".
  - It shows at most two badges, from: N to check, N retake, All saved, Exported.
- **Scans with no session id** become one-scan sessions under their own time. These are every scan kept or saved before this update, and the samples. Their label is today's ("Camera photo 4:10 PM").
- **The search** (the header's search icon) finds a scan by party name, number or TIN, and lists the matching scans themselves.
- **Saved's month groups and kind chips** go away. The kind chips move to the Export tab, where they mattered.

### 6.7 Export (`app/(tabs)/export.tsx`)

- **The tab screen is today's export as a screen, not a sheet:**
  - Step 1 lists Sales, Purchases and 2307s, each with its count and total.
  - Steps 2–3 (the banners, then "Share the file" and "Did it go?") follow as today, inside the tab.
- The export's own rules stay as they are: T17-3, F-2's write-first mark, and its error banners.
  - That includes the "New customers and suppliers" file and its rule that it goes first.
- **Each kind's row also opens "See invoices":** Saved's rows for that kind, with To export or Exported, opening the Scan screen, and long-press delete.
  - This is where Saved's list lives now.
- **The tab's count** is the invoices and 2307s waiting. New parties aren't counted.
- **When nothing is waiting:** "Everything is sent", and the last export's date.

### 6.8 Profile (`app/(tabs)/profile.tsx`)

**Call:** this is today's Settings as a tab, with the same sections and fields.
- Your business and Export defaults keep their fields and their save on blur.
- Under them comes a **Customers and items** row with its counts. It opens today's Your lists screen.
- About keeps Privacy, Open-source licenses and Version.
- Team tools appear in team builds.
- **The header** is "Profile". Its account area is left out until sign-in exists, so there's no dead button.
- **Call:** the mockup's Help row waits for real help content. It's not in this round.

### 6.9 Data

- **`StoredScan` gets `session?: string`.** The saved summaries (`SummaryBase` in `lib/saved.ts`) and `scan.json` carry it too.
  - Nothing else in the stored formats changes.
  - Old scans have none (§6.6).
- **A session's time and count come from its scans.** No session file is kept.
- **The open session** (its id and when it last changed) lives in memory, and in a small `session.json`, so the 30-minute and restart rules in §6.3 can close it.
- **Call: the unsaved-scan cap goes from 20 to 100.** That's `KEEP` in `lib/scans.ts` and `KEEP_SCANS` in `ScannerModule.kt`, and they must stay equal.
  - At 20, one long session plus yesterday's would push out scans nobody has checked yet.
  - The cost is storage: about 1.2 MB a scan from the QA backup, so about 120 MB at 100.
  - The README says so. A later round could ask before dropping unchecked scans.
- **The camera's test hook,** the samples and the training data keep their rules.

### 6.10 What moves or goes

| Today | After |
|---|---|
| Home's Take photo, From gallery and Import PDF | the camera tab: its shutter, plus gallery and PDF in the tray |
| Home's Recent scans | Sessions (and Home's "Last session") |
| Saved (the screen) | Sessions, plus the Export tab |
| Saved's "Export…" bar, and the Export sheet | the Export tab |
| Settings (the gear on Home) | the Profile tab |
| Your lists (Home's ☰) | Profile › Customers and items |
| The header's ☰ and gear on Home | gone: the bar replaces them |

## 7. Checks

- **jest:**
  - the bar: roles, names, the selected tab, the count, and the middle button's two jobs;
  - Back from each tab;
  - the session's life: start, queue, Done, leave and come back, the 30-minute close, a restart;
  - grouping old scans with no id;
  - Home's cards in their states;
  - "Next invoice" on the Scan screen;
  - and every suite design B has, still passing.
- **On the emulator** (the user's AVD, or a QA AVD made for it as in design B's Task 26):
  - a 10-photo session through the `?test=` hook: the preview stays smooth while reads run, otherwise switch to approach 2;
  - Back on every tab;
  - the bar at 200% text, with 3-button navigation, and at 360 dp;
  - TalkBack names and states, through text dumps;
  - an update over data from before it: the old scans show and open.
- **A phone:** how the camera feels and its speed, as before.

## 8. Calls I made (please check these)

1. **The navigation:** expo-router `Tabs` with our own bar (A), rather than a hand-made bar or a library.
2. **Reading:** each photo is read while the camera stays live, falling back to reading after Done if the emulator shows stutter.
3. **"Check the next one", and "Next invoice" in the Scan screen's bar,** instead of "Save the 1 that's ready" (§6.4).
   - A scan whose form wasn't found is skipped. It has Retake, which replaces it, and Remove.
4. **A one-photo session** goes straight to its Scan screen.
5. **Leaving the camera** keeps the session open. It closes by itself after 30 minutes or a restart.
6. **Unsaved scans keep 100,** not 20. That's the one native change and needs a rebuild.
7. **Saved** becomes Sessions plus the Export tab. Its month groups and chips go.
8. **Profile is today's Settings,** with Customers and items added. There's no sign-in and no Help row yet.
9. **Home** keeps the greeting, and moves the three tips into a "Take your first photo" card.
10. **Back** on any tab returns to the camera first.
11. **Continuous shooting needs a native change** in our own camera code (§6.3). Auto waits for the sheet to leave the frame before it takes the next one.
12. **Photos waiting to be read are kept in `files/queue/`,** so a closed app doesn't lose them. A failed read is kept only while its session is open.
13. **The Export tab** keeps today's steps and rules. Saved's list moves under each kind as "See invoices".

## 9. Left to the builder

- exact spacing, animation (the bar's press ripple, the shutter's press);
- the session id's format;
- the thumbnail tray's scroll when a session passes about eight photos;
- the empty states' copy, in design B's voice.
