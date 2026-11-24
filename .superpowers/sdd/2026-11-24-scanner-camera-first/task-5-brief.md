### Task 5: The bar

**Files:**
- Create: `components/TabBar.tsx`, `lib/shutter.ts`
- Modify: `components/icons.tsx` (`House`, `Files`, `Send`, `CircleUser`), `lib/theme.ts` (`radius.bar`, `bar`), `components/Screen.tsx` (`useTabBarSpace`; `useEndPadding`)
- Test: `__tests__/tabBar.test.tsx` (new), `__tests__/icons.test.tsx`, `__tests__/theme.test.ts`, `__tests__/layout.test.tsx`

**Interfaces:**
- Consumes:
  - `BottomTabBarProps`, `BottomTabBarHeightCallbackContext`, `BottomTabBarHeightContext` (`expo-router/js-tabs`);
  - `useKeyboardHeight` (Screen);
  - `setBottomClearance` (`lib/snackbar.ts`);
  - `savedList`, `subscribeSaved`, `waitingOf` (T17-3);
  - `useIsFocused`.
- Produces:

```ts
// lib/shutter.ts
export type Shutter = { take: () => void; disabled: boolean };
export function setShutter(owner: object, shutter: Shutter | null): void; // null clears only that owner's (T26-4: compare-and-clear)
export function currentShutter(): Shutter | null;
export function subscribeShutter(listener: () => void): () => void;
// components/TabBar.tsx
export type TabName = 'index' | 'sessions' | 'camera' | 'export' | 'profile';
export const TABS: readonly { name: TabName; label: string; icon: IconComponent }[];
// in order: index "Home" House, sessions "Sessions" Files, camera "Camera" Camera, export "Export" Send, profile "Profile" CircleUser
export function countText(n: number): string; // "7"; "99+" past 99
export function TabBar(props: BottomTabBarProps): ReactElement | null;
// components/Screen.tsx
export function useTabBarSpace(): number; // in a tab's screen: the bar's height from the screen's foot; 0 elsewhere, and while it hides
// lib/theme.ts
radius.bar = 20; export const bar = { circle: 60, raise: 26, ring: 4, dot: 5 } as const; // dp, spec §6.2
```

**The bar** (spec §6.2, calls 19 and 20):
- **Its root:**
  - absolutely placed at the foot, with `pointerEvents="box-none"`;
  - padded `space.m` at the sides, and `space.m + insets.bottom` under it, so it floats 12 dp above the navigation bar's inset.
- **The bar itself:**
  - `accessibilityRole="tablist"`;
  - `panel` fill, `radius.bar` and `elevation.overlay` (design B's shadow);
  - five slots in `TABS` order.
- **A side tab:**
  - a `Tap`, at least 48×48;
  - `accessibilityRole="tab"`, `accessibilityState={{ selected }}`, and its label as its name;
  - a 24 dp icon, in `ink` when selected and `chevron` otherwise;
  - when selected, a `bar.dot` `brand` dot under the icon.
- **Export's count:**
  - `waitingOf(null, savedList()).length`; new parties don't count;
  - while it's above 0: a pill on the icon's corner, `brand` fill, `ink` `countText(n)` in `type.badge`;
  - the tab's name becomes `` `Export, ${n} to send` ``.
- **The middle button:**
  - a `bar.circle` `brand` circle, raised `bar.raise` above the bar's top, in a `bar.ring` `paper` ring;
  - `accessibilityRole="tab"`, with the dot under it while it's selected;
  - **on another tab:** the name "Camera" and an `ink` `Camera` icon. A press opens the camera tab.
  - **on the camera tab:** the name "Take photo" and the shutter look, a `panel` core inside the coral ring. A press runs `currentShutter()?.take()`, and it's disabled while `currentShutter()` is null or `disabled`.
- **A press** emits `tabPress` (`emitter.emit({ type: 'tabPress', target: key, canPreventDefault: true })`), then, unless that tab is focused or the event was prevented, `navigateToTab(key)`. That's the default bar's contract.
- **Its height:**
  - On layout, the root's height plus `bar.raise` goes to `BottomTabBarHeightCallbackContext`, for `useTabBarSpace`.
  - While `useIsFocused()` is true, it also goes to `setBottomClearance(owner, h)`, so the root snackbar sits above it. It's withdrawn on blur and unmount.
- **The keyboard:** with `tabBarHideOnKeyboard` and `useKeyboardHeight() > 0`, the bar renders nothing, reports 0 and withdraws its clearance.
- **`useEndPadding(hasBottomBar)`** is `(hasBottomBar ? 0 : Math.max(insets.bottom, useTabBarSpace())) + space.xl + keyboard`. `useTabBarSpace` reads `BottomTabBarHeightContext`; it's undefined outside the tabs, and then 0.

- [ ] **Step 1 (the controller): the icons.**
  - Ask the user's OK to fetch four SVGs (about 2 KB) from `raw.githubusercontent.com/lucide-icons/lucide/1.77.0/icons/`: `house.svg`, `files.svg`, `send.svg` and `circle-user.svg`.
  - They go into a new, empty folder in the scratchpad.
  - If that's declined, the implementer copies the approved mockup's `i-house`, `i-files`, `i-send` and `i-user` symbols, and `icons.tsx`'s header says they're from an older Lucide (call 20).
  - Give the implementer the folder's path.

- [ ] **Step 2: Write the failing tests.**

  `__tests__/tabBar.test.tsx`. Its props are made up, with five routes, an `emitter` whose `emit` returns `{ defaultPrevented: false }`, and `navigateToTab: jest.fn()`. `useIsFocused` is mocked.
  - `'a tablist of five tabs in order, each a tab with its name; the open one is selected'`.
  - `'the open tab: its icon in ink, with a coral dot under it; the others in the quiet ink, at least 3:1 on white'`. Use `test-utils/contrast.ts` on `colors.chevron` against `colors.panel`.
  - `'a press tells the tab, then opens it; on the open tab, it only tells it'`.
  - `"Export's count: a coral pill with ink figures, 99+ past 99, and in its name, Export, 7 to send; none at 0"`. The saved scans come from `saved.json` in `memoryFs`, through `loadSaved`.
  - `'the middle button: elsewhere, Camera, which opens the camera; on the camera, Take photo, which takes it'`.
  - `"Take photo waits while the camera can't take one"`.
  - `'with the keyboard up it hides, and takes no space'`. Use `test-utils/keyboard.ts`'s `keyboard(300)`.
  - `'its height, the raised button too, goes to the tab screens, and to the snackbar while the tabs are on top'` (Review Focus 3).
  - `'a camera that leaves clears only its own shutter'`.

  `__tests__/layout.test.tsx`:
  - `'in a tab, the end of a scroll clears the bar; with the keyboard up, the keyboard'` (Review Focus 3). Use `BottomTabBarHeightContext.Provider value={120}`.

  `__tests__/icons.test.tsx`: `GLYPHS` gains `House`, `Files`, `Send` and `CircleUser`.

  `__tests__/theme.test.ts`: `"the bar's measures"`.

- [ ] **Step 3: Run** `npx jest __tests__/tabBar.test.tsx __tests__/layout.test.tsx __tests__/icons.test.tsx __tests__/theme.test.ts`. Expected: FAIL.

- [ ] **Step 4: Implement.** Copy the glyphs' elements exactly from the SVGs, in Lucide's 24 grid, as `icons.tsx` does, and add their names to its header.

- [ ] **Step 5: Run** `npm test` and the gates. Expected: PASS.

- [ ] **Step 6: Commit** with the message `feat(app): the bar: five icon tabs, a raised camera button that is the shutter on the camera, and Export's count`.

---

