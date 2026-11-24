### Task 6: The tabs: routes, Back, links, and Profile

**Files:**
- Create: `app/(tabs)/_layout.tsx`, `app/(tabs)/sessions/_layout.tsx`, `app/(tabs)/export/_layout.tsx`, `app/+native-intent.tsx`, `test-utils/routes.tsx`
- Create, as stand-ins that later tasks build:
  - `app/(tabs)/sessions/index.tsx`: a `Screen` with the `Header` "Sessions" and no Back;
  - `app/(tabs)/sessions/[id].tsx`: the `Header` "Session";
  - `app/(tabs)/export/index.tsx`: the `Header` "Send to MyBizMate", with no Back, and one `ListRow` "Saved" that pushes `/saved`, so today's export stays reachable until Task 10.
- Move: `app/index.tsx`, `app/camera.tsx` and `app/settings.tsx` into `app/(tabs)/` as `index.tsx`, `camera.tsx` and `profile.tsx`.
- Modify: `app/_layout.tsx`, `lib/navigation.ts`, `lib/scanFlow.ts` (`toCamera`), and the three moved screens.
- Test: `__tests__/tabs.test.tsx` (new), `__tests__/nativeIntent.test.ts` (new)
- Test: `__tests__/rootLayout.test.tsx`, `__tests__/navigation.test.tsx`, `__tests__/snackbarClearance.test.tsx`, `__tests__/camera.test.tsx`, `__tests__/home.test.tsx`, and `__tests__/settingsScreen.test.tsx` → `__tests__/profileScreen.test.tsx`

**Interfaces:**
- Consumes: `TabBar` (Task 5), `usePushOnce`, `useGoBackOrHome`.
- Produces:

```ts
// app/(tabs)/_layout.tsx
export const unstable_settings = { anchor: 'camera' };
// <Tabs backBehavior="initialRoute" tabBar={(props) => <TabBar {...props} />}
//   screenOptions={{ headerShown: false, tabBarHideOnKeyboard: true, sceneStyle: { backgroundColor: colors.paper } }}>
//   index, sessions, camera (sceneStyle: colors.camera), export, profile
// app/(tabs)/sessions/_layout.tsx and app/(tabs)/export/_layout.tsx:
//   export const unstable_settings = { anchor: 'index' }; a Stack with headerShown false, on paper
// app/_layout.tsx
export const unstable_settings = { anchor: '(tabs)' }; // T24-1's anchor; the camera's Stack.Screen goes
// app/+native-intent.tsx
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string;
// lib/navigation.ts
export function useNavigateOnce(): (href: Href) => void; // usePushOnce's guard, with router.navigate: a tab, or a screen in one
// test-utils/routes.tsx
export type RouteFile = '_layout' | '(tabs)/_layout' | '(tabs)/index' | '(tabs)/camera' | '(tabs)/profile'
  | '(tabs)/sessions/_layout' | '(tabs)/sessions/index' | '(tabs)/sessions/[id]' | '(tabs)/export/_layout'
  | '(tabs)/export/index' | 'result' | 'saved' | 'lists' | 'licenses' | 'license' | 'speed' | 'training';
export function appRoutes(screens?: Partial<Record<RouteFile, ComponentType>>): Record<string, unknown>;
// the four layouts as they are; any screen not given, a stand-in saying its name and "on top" or "under"
```

**`redirectSystemPath`** (call 1). The algorithm isn't determined by the signature:

```ts
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string {
  if (!initial) return path;
  try {
    return routeOf(unwrapDevLaunchURL(path)) === '' ? '/camera' : path; // expo-linking's unwrap
  } catch {
    return path; // never throws: the link goes on as it came
  }
}
/** A link's route: after a web link's host, or right after a deep link's scheme://; no query, hash, Expo Go's --, or end slashes. */
function routeOf(url: string): string {
  let rest = url.replace(/[?#].*$/, '');
  const web = /^https?:[/][/][^/]*/i.exec(rest);
  rest = web ? rest.slice(web[0].length) : rest.replace(/^[a-z][a-z0-9+.-]*:[/][/]/i, '');
  return rest.replace(/^[/]+|[/]+$/g, '').replace(/^--([/]|$)/, '');
}
```

**What else changes:**

| Where | Today | Now |
|---|---|---|
| Home's Take photo | `push('/camera')` | `navigateOnce('/camera')` |
| Home's Settings icon, and "Set your export defaults" | `push('/settings')` | `navigateOnce('/profile')` |
| `scanFlow`'s `toCamera` | `router.replace('/camera')` | `router.navigate('/camera')`, once |
| The camera's reads (the shutter, the gallery, the camera app, "Choose from gallery") | `replace: true` | push: the Scan screen opens over the tabs |
| The camera's Close | `IconButton` "Close" | gone: Back leaves the app (call 8) |
| The camera's `StatusBar` | always light | `{focused && <StatusBar style="light" />}` (Review Focus 4) |
| Settings | `Header title="Settings"` | `Header title="Profile" onBack={null}`; after Export defaults' note, `SectionHeader` "Your lists" and the row below |

**Profile's new row** (spec §6.8, call 17):
- a `ListRow` titled "Customers and items", with a chevron, that pushes `/lists`;
- its sub-line is `` `${c} customers · ${s} suppliers · ${i} items` ``, `subMono` and `subCaps`, with "customer", "supplier" and "item" for 1;
- a party typed `both` counts in both.

Today's sections, fields, saves as typed, Privacy, licenses, Version and Team tools stay as they are.

- [ ] **Step 1: Write the failing tests.**

  `__tests__/nativeIntent.test.ts`:
  - `"a launch with no route opens the camera"`. It covers `mybizmatescan:///`, `mybizmatescan://`, `/`, and `exp+mybizmate-scan://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8081`.
  - `'a link with a route keeps it'`: `mybizmatescan://camera?test=inv_0051`, `mybizmatescan://speed` and `/training` come back as they were.
  - `'a link while the app runs is never changed'`.
  - `"it never throws; what it can't read goes on as it came"`.

  `__tests__/tabs.test.tsx`. Use `renderRouter(appRoutes(), …)`, with the real bar, and the global `router` in the test only.
  - `'the camera is the first tab: with nothing under it, Back leaves the app'`. `initialUrl` is `'/camera'`, and `router.canGoBack()` is false.
  - `'Back from Home, Sessions, Export and Profile goes to the camera'`. Press each tab by role and name, then `act(() => router.back())`: the pathname is `/camera`.
  - `'a screen inside Sessions keeps the bar; Back goes to Sessions, then the camera'`.
  - `'the Scan screen, Your lists, the licenses and the team screens sit above the tabs, with no bar'`.
  - `'a cold link keeps working, with the tabs under it: /camera?test=…, /speed and /training'`.
  - `'a press that opens a tab from a screen switches to it once, with one tabs navigator'`. Use `useNavigateOnce`, pressed twice in one act. The root state has one route.
  - `'a double press on a tab opens it once: one Back goes to the camera'` (Review Focus 5).
  - `'the light status bar is the camera's only while it's on top'` (Review Focus 4).

  The suites that change:
  - `__tests__/rootLayout.test.tsx` and `__tests__/navigation.test.tsx` use `appRoutes`. The camera tab's scene is black; the others are paper.
  - `__tests__/snackbarClearance.test.tsx`: `'on a tab, the message clears the floating bar; on the Scan screen over it, that screen's bar'`.
  - `__tests__/camera.test.tsx`:
    - `'no Close: the camera is a tab'`;
    - `'a photo opens its Scan screen over the tabs'` (push, not replace).
  - `__tests__/home.test.tsx`: Take photo and the Settings icon navigate.
  - `__tests__/profileScreen.test.tsx`:
    - `'Profile: the settings as a tab, with no Back'`;
    - `'Customers and items, with its counts, opens Your lists'`;
    - every Settings test kept.

- [ ] **Step 2: Run** `npx jest __tests__/nativeIntent.test.ts __tests__/tabs.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.** Use `git mv` for the moves and the renamed suite.

- [ ] **Step 4: Run** `npm test` and the gates. Expected: PASS.

- [ ] **Step 5: Commit** with the message `feat(app): the tabs: the camera first, Back to the camera, links that still open, and Profile as a tab`.

---

