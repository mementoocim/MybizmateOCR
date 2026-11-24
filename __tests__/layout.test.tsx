import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { BottomTabBarHeightContext } from 'expo-router/js-tabs';
import { createRef, type ReactNode, useEffect } from 'react';
import {
  DeviceEventEmitter,
  Dimensions,
  FlatList,
  Modal,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  type ViewInstance,
} from 'react-native';

import { BottomBar, ButtonRow } from '../components/BottomBar';
import { Button, type ButtonProps } from '../components/Buttons';
import { Header } from '../components/Header';
import { IconButton } from '../components/IconButton';
import { ListIcon, SettingsIcon } from '../components/icons';
import {
  Screen, ScrollIntoViewScope, useEndPadding, useKeyboardHeight, useScrollIntoView, useTabBarSpace,
} from '../components/Screen';
import { colors, space, touch, type } from '../lib/theme';
import { keyboard } from '../test-utils/keyboard';
import { standIn } from '../test-utils/scrollStandIn';

// Design B §5.6 and §8: the frame every screen is built from. The app is edge-to-edge, so the header pads by the
// status bar's inset, and the bottom bar (or the end of the scroll) by the navigation bar's; Android no longer resizes
// the window for the keyboard, so the end of the scroll clears it too. Bottom bars stack their buttons when a label
// wraps. This file's insets: 24 dp at the top, 34 at the bottom.

/** The screen's own navigation (expo-router's useNavigation), with a screen under this one unless a test says not. */
const mockNavigation = { canGoBack: jest.fn(() => true), goBack: jest.fn() };
const mockReplace = jest.fn(); // useRouter()'s: the way Home
jest.mock('expo-router', () => {
  // The global router as Android's restart of the screen leaves it (ruling T26-4): every method throws.
  const unbound = () => {
    throw new Error('The imperative router is unavailable before the first render has finished.');
  };
  return {
    router: { back: unbound, canGoBack: unbound, replace: unbound, push: unbound, navigate: unbound },
    useNavigation: () => mockNavigation,
    useRouter: () => ({ replace: mockReplace }),
    useIsFocused: () => true, // a bottom bar's screen is the one on top
  };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 34, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children?: unknown }) => children,
}));

const TOP = 24;
const BOTTOM = 34;

const noop = () => {};
const button = (name: string) => screen.getByRole('button', { name });
type Instance = ReturnType<typeof screen.getByRole>;
const kids = (instance: Instance) => instance.children.filter((child): child is Instance => typeof child !== 'string');
/** An icon button's glyph: its Svg, the one host child it has while unfocused. */
const glyphOf = (target: Instance) => kids(target)[0];
const endPadding = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.contentContainerStyle);

const retakeAnd = (save: string): ButtonProps[] => [
  { label: 'Retake', variant: 'secondary', onPress: noop },
  { label: save, onPress: noop },
];
/** Android reports the label's laid-out lines. */
const labelLines = (label: string, lines: number) =>
  fireEvent(screen.getByText(label), 'textLayout', { nativeEvent: { lines: Array.from({ length: lines }, () => ({})) } });

/** What a focused field at this spot calls (TextField's onFocus), as of its last render. */
let scrollIntoView: ReturnType<typeof useScrollIntoView> = noop;
function Field() {
  const fromScope = useScrollIntoView();
  useEffect(() => {
    scrollIntoView = fromScope;
  }, [fromScope]);
  return null;
}
/** A field `y` dp down whatever it's measured against. */
function fieldAt(y: number) {
  const measureLayout = jest.fn((_relativeTo: unknown, onSuccess: (x: number, y: number, w: number, h: number) => void) =>
    onSuccess(0, y, 360, 48),
  );
  return { field: { measureLayout } as unknown as ViewInstance, measureLayout };
}

beforeEach(() => {
  mockNavigation.canGoBack.mockReset().mockReturnValue(true);
  mockNavigation.goBack.mockReset();
  mockReplace.mockReset();
});

test('Header: the title is a header, the subtitle an overline, back goes back', async () => {
  const onBack = jest.fn();
  await render(<Header title="Saved" subtitle="5 to export" onBack={onBack} />);
  expect(screen.getByRole('header', { name: 'Saved' })).toHaveStyle({ ...type.headerTitle, color: colors.ink });
  expect(screen.getByText('5 to export')).toHaveStyle({ ...type.overline, color: colors.mute });
  await fireEvent.press(button('Back'));
  expect(onBack).toHaveBeenCalledTimes(1);
  expect(mockNavigation.goBack).not.toHaveBeenCalled();
  // Edge to edge: the header's panel reaches under the status bar and pads by its inset.
  expect(screen.getByTestId('header')).toHaveStyle({ paddingTop: TOP, backgroundColor: colors.panel });
  expect(button('Back').parent).toHaveStyle({ borderBottomWidth: 1, borderBottomColor: colors.hairline });

  await screen.rerender(<Header title="Saved" backIcon="close" onBack={onBack} />);
  await fireEvent.press(button('Close'));
  expect(onBack).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();

  await screen.rerender(<Header title="Saved" onBack={null} />);
  expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  expect(screen.getByRole('header', { name: 'Saved' })).toBeOnTheScreen();
});

test("Header: Back goes back by the screen's own navigation, never the global router (ruling T26-4)", async () => {
  // This file's global router throws, as Android's restart of the screen leaves it: Back never reads it.
  await render(<Header title="Settings" />);
  await fireEvent.press(button('Back'));
  expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  expect(mockReplace).not.toHaveBeenCalled();
});

test('Header: with nothing to go back to, Back goes to the camera (rulings T24-1, T6-2)', async () => {
  // A screen with nothing under it: the Stack is anchored on the tabs (app/_layout), so the camera is the fallback.
  mockNavigation.canGoBack.mockReturnValue(false);
  await render(<Header title="Speed test" />);
  await fireEvent.press(button('Back'));
  expect(mockReplace.mock.calls).toEqual([['/camera']]);
  expect(mockNavigation.goBack).not.toHaveBeenCalled();
});

test('Header: Back goes back once, however fast it is tapped twice', async () => {
  // Going back queues one GO_BACK per call: a second would leave the screen under this one too (as Close's guard)
  await render(<Header title="Saved" />);
  await act(async () => {
    await fireEvent.press(button('Back'));
    await fireEvent.press(button('Back'));
  });
  expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);

  // with nothing under it: the camera, once
  mockNavigation.goBack.mockReset();
  mockNavigation.canGoBack.mockReturnValue(false);
  await render(<Header title="Speed test" />);
  await act(async () => {
    await fireEvent.press(button('Back'));
    await fireEvent.press(button('Back'));
  });
  expect(mockReplace.mock.calls).toEqual([['/camera']]);
  expect(mockNavigation.goBack).not.toHaveBeenCalled();
});

test('Header: at least 56 dp tall, it grows and wraps with the text, with icon buttons on the right', async () => {
  await render(
    <Header
      title="MyBizMate Sales Invoice"
      subtitle="SI no. 5184138 · read in 3.2 s"
      right={
        <>
          <IconButton icon={ListIcon} label="Your lists" onPress={noop} />
          <IconButton icon={SettingsIcon} label="Settings" onPress={noop} />
        </>
      }
    />,
  );
  const row = button('Back').parent!;
  expect(row).toHaveStyle({
    flexDirection: 'row',
    minHeight: touch.target + space.s,
    paddingHorizontal: space.xs,
    height: undefined,
  });
  const title = screen.getByRole('header', { name: 'MyBizMate Sales Invoice' });
  expect(title.props.numberOfLines).toBeUndefined();
  expect(screen.getByText('SI no. 5184138 · read in 3.2 s').props.numberOfLines).toBeUndefined();
  // In reading order: Back, the title, then the icons on the right.
  expect(kids(row)[0]).toBe(button('Back'));
  expect(within(kids(row)[2]).getByRole('button', { name: 'Your lists' })).toBeOnTheScreen();
  expect(within(kids(row)[2]).getByRole('button', { name: 'Settings' })).toBeOnTheScreen();
});

test('Header brand: logo and wordmark', async () => {
  await render(<Header brand onBack={null} right={<IconButton icon={SettingsIcon} label="Settings" onPress={noop} />} />);
  expect(screen.getByText('mybizmate')).toBeOnTheScreen();
  expect(screen.getByText('.io')).toHaveStyle({ color: colors.brandText });
  expect(screen.getByRole('header', { name: 'mybizmate.io' })).toHaveStyle({ ...type.headerTitle, color: colors.ink });
  const logo = screen.getByTestId('header-logo');
  expect(logo.props.source).toEqual(require('../assets/brand/logo_mark.png'));
  expect(logo).toHaveStyle({ width: 30, height: 30 });
  expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  expect(button('Settings')).toBeOnTheScreen();
});

test("Header dark: the photo viewer's, on the viewer fill with light text and no hairline", async () => {
  await render(<Header tone="dark" title="Photo" subtitle="Enhanced" backIcon="close" onBack={noop} />);
  expect(screen.getByTestId('header')).toHaveStyle({ paddingTop: TOP, backgroundColor: colors.viewer });
  expect(button('Close').parent).toHaveStyle({ borderBottomWidth: undefined });
  expect(screen.getByRole('header', { name: 'Photo' })).toHaveStyle({ color: colors.cameraText });
  expect(screen.getByText('Enhanced')).toHaveStyle({ color: colors.cameraMute }); // mute is too dark on the viewer
  expect(glyphOf(button('Close')).props).toMatchObject({ stroke: colors.cameraText });
});

test('Screen pads the end of its scroll by the bottom inset when it has no bottom bar', async () => {
  await render(
    <Screen header={<Header title="Settings" />}>
      <Text>Body</Text>
    </Screen>,
  );
  expect(endPadding('screen-scroll')).toMatchObject({ paddingBottom: BOTTOM + space.xl });
  expect(screen.getByTestId('screen-scroll').props.keyboardShouldPersistTaps).toBe('handled');
  expect(within(screen.getByTestId('screen-scroll')).getByText('Body')).toBeOnTheScreen();
});

test("Screen: on paper, the header, what's pinned, the scroll, then the bottom bar, which takes the inset", async () => {
  await render(
    <Screen
      testID="scan"
      header={<Header title="Scan" />}
      pinned={<Text>3 to check</Text>}
      bottom={<BottomBar buttons={retakeAnd('Save sale')} />}>
      <Text>Body</Text>
    </Screen>,
  );
  const root = screen.getByTestId('scan');
  expect(root).toHaveStyle({ flex: 1, backgroundColor: colors.paper });
  const [header, pinned, scroll, bottom] = kids(root);
  expect(header).toBe(screen.getByTestId('header'));
  expect(pinned).toBe(screen.getByText('3 to check')); // pinned: outside the scroll
  expect(scroll).toBe(screen.getByTestId('screen-scroll'));
  expect(bottom).toBe(screen.getByTestId('bottom-bar'));
  expect(kids(root)).toHaveLength(4);
  // The bar pads by the inset, so the scroll's end keeps only its space.
  expect(endPadding('screen-scroll')).toMatchObject({ paddingBottom: space.xl });
});

test('Screen: the end of the scroll clears the open keyboard too', async () => {
  await render(
    <Screen header={<Header title="Settings" />}>
      <Text>Body</Text>
    </Screen>,
  );
  await keyboard(300);
  expect(endPadding('screen-scroll')).toMatchObject({ paddingBottom: BOTTOM + space.xl + 300 });
  await keyboard(0);
  expect(endPadding('screen-scroll')).toMatchObject({ paddingBottom: BOTTOM + space.xl });
});

test("useKeyboardHeight: the open keyboard's height, 0 while hidden, and no listeners left once unmounted", async () => {
  function Probe() {
    return <Text>{`keyboard ${useKeyboardHeight()}`}</Text>;
  }
  await render(<Probe />);
  expect(screen.getByText('keyboard 0')).toBeOnTheScreen();
  await keyboard(300);
  expect(screen.getByText('keyboard 300')).toBeOnTheScreen();
  await keyboard(320); // the emoji panel: Android sends the new height while it stays open
  expect(screen.getByText('keyboard 320')).toBeOnTheScreen();
  await keyboard(0);
  expect(screen.getByText('keyboard 0')).toBeOnTheScreen();

  const shown = DeviceEventEmitter.listenerCount('keyboardDidShow');
  const hidden = DeviceEventEmitter.listenerCount('keyboardDidHide');
  await screen.unmount();
  expect(DeviceEventEmitter.listenerCount('keyboardDidShow')).toBe(shown - 1);
  expect(DeviceEventEmitter.listenerCount('keyboardDidHide')).toBe(hidden - 1);

  // Mounted while the keyboard is already open (a sheet opened from a field, say), it starts from that height.
  await keyboard(280);
  await render(<Probe />);
  expect(screen.getByText('keyboard 280')).toBeOnTheScreen();
  await keyboard(0);
  expect(screen.getByText('keyboard 0')).toBeOnTheScreen();
});

test("useKeyboardHeight in a scope that gives its own window's keyboard (a sheet's): that height, not RN's events", async () => {
  function Probe() {
    return <Text>{`keyboard ${useKeyboardHeight()}`}</Text>;
  }
  const scope = (height: number) => (
    <ScrollIntoViewScope scrollRef={null} keyboard={height}>
      <Probe />
    </ScrollIntoViewScope>
  );
  await render(scope(0));
  expect(screen.getByText('keyboard 0')).toBeOnTheScreen();
  await screen.rerender(scope(300)); // the sheet's own window reports a keyboard
  expect(screen.getByText('keyboard 300')).toBeOnTheScreen();
  // RN's keyboard events are the app window's: inside the scope they change nothing.
  await keyboard(280);
  expect(screen.getByText('keyboard 300')).toBeOnTheScreen();

  // A scope that gives none (a Screen's, a menu's) leaves it to RN's events, inside one that does too.
  await screen.rerender(
    <ScrollIntoViewScope scrollRef={null} keyboard={300}>
      <ScrollIntoViewScope scrollRef={null}>
        <Probe />
      </ScrollIntoViewScope>
    </ScrollIntoViewScope>,
  );
  expect(screen.getByText('keyboard 280')).toBeOnTheScreen();
  await keyboard(0);
  expect(screen.getByText('keyboard 0')).toBeOnTheScreen();
});

test('useEndPadding: a screen with its own list pads it the same way', async () => {
  function OwnList({ bar }: { bar: boolean }) {
    const end = useEndPadding(bar);
    return (
      <FlatList
        testID="own-list"
        data={['Bagong Tindahan']}
        keyExtractor={(name) => name}
        renderItem={({ item }) => <Text>{item}</Text>}
        contentContainerStyle={{ paddingBottom: end }}
      />
    );
  }
  await render(
    <Screen header={<Header title="Your lists" />} scroll={false}>
      <OwnList bar={false} />
    </Screen>,
  );
  expect(screen.queryByTestId('screen-scroll')).toBeNull(); // the screen brings its own list
  expect(endPadding('own-list')).toMatchObject({ paddingBottom: BOTTOM + space.xl });

  await screen.rerender(
    <Screen header={<Header title="Saved" />} scroll={false} bottom={<BottomBar buttons={[{ label: 'Export…', onPress: noop }]} />}>
      <OwnList bar />
    </Screen>,
  );
  expect(endPadding('own-list')).toMatchObject({ paddingBottom: space.xl });
  // The keyboard covers the bar too, so the list can still lift its end above it.
  await keyboard(300);
  expect(endPadding('own-list')).toMatchObject({ paddingBottom: space.xl + 300 });
  await keyboard(0);
});

test('in a tab, the end of a scroll clears the bar; with the keyboard up, the keyboard', async () => {
  // The tabs give their screens the bar's height (components/TabBar reports it, the raised button too): 120 here,
  // more than the navigation bar's inset. The bar hides while the keyboard is up (ruling P-F5), so then it's the
  // keyboard over the inset, as outside the tabs.
  function TabSpace() {
    return <Text>{`tab bar ${useTabBarSpace()}`}</Text>;
  }
  const inTab = (children: ReactNode) => (
    <BottomTabBarHeightContext.Provider value={120}>{children}</BottomTabBarHeightContext.Provider>
  );
  await render(
    inTab(
      <Screen header={<Header title="Sessions" />}>
        <TabSpace />
      </Screen>,
    ),
  );
  expect(endPadding('screen-scroll')).toMatchObject({ paddingBottom: 120 + space.xl });
  expect(screen.getByText('tab bar 120')).toBeOnTheScreen();
  await keyboard(300);
  expect(endPadding('screen-scroll')).toMatchObject({ paddingBottom: BOTTOM + space.xl + 300 });
  expect(screen.getByText('tab bar 0')).toBeOnTheScreen();
  await keyboard(0);
  expect(endPadding('screen-scroll')).toMatchObject({ paddingBottom: 120 + space.xl });

  // A screen's own bottom bar takes the space as before: the end keeps only its own.
  await screen.rerender(
    inTab(
      <Screen header={<Header title="Scan" />} bottom={<BottomBar buttons={retakeAnd('Save sale')} />}>
        <Text>Body</Text>
      </Screen>,
    ),
  );
  expect(endPadding('screen-scroll')).toMatchObject({ paddingBottom: space.xl });

  // Outside the tabs there's no bar: the inset, as before.
  await screen.rerender(
    <Screen header={<Header title="Your lists" />}>
      <TabSpace />
    </Screen>,
  );
  expect(endPadding('screen-scroll')).toMatchObject({ paddingBottom: BOTTOM + space.xl });
  expect(screen.getByText('tab bar 0')).toBeOnTheScreen();
});

test('useScrollIntoView: scrolls a target to 24 dp under the top of the scroll; outside any scope it does nothing', async () => {
  const scrollRef = createRef<ScrollViewInstance>();
  await render(
    <Screen header={<Header title="Settings" />} scrollRef={scrollRef}>
      <Field />
    </Screen>,
  );
  const { content, scrollTo } = standIn(scrollRef.current);
  const { field, measureLayout } = fieldAt(300);

  scrollIntoView(field);
  expect(measureLayout).toHaveBeenCalledWith(content, expect.any(Function));
  expect(scrollTo).toHaveBeenCalledWith({ y: 300 - space.xl, animated: true });
  scrollIntoView(null);
  expect(scrollTo).toHaveBeenCalledTimes(1);

  // Near the top, it scrolls to the top, never past it.
  measureLayout.mockImplementationOnce((_relativeTo, onSuccess) => onSuccess(0, 10, 360, 48));
  scrollIntoView(field);
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 0, animated: true });

  await screen.rerender(<Field />); // outside any Screen or scope
  expect(scrollRef.current).toBeNull(); // the caller's ref let go of the ScrollView with the Screen
  scrollIntoView(field);
  expect(measureLayout).toHaveBeenCalledTimes(2);
  expect(scrollTo).toHaveBeenCalledTimes(2);
});

test("ScrollIntoViewScope: a field in a sheet's own scope scrolls the sheet, never the Screen behind it", async () => {
  const screenScroll = createRef<ScrollViewInstance>();
  const sheetScroll = createRef<ScrollViewInstance>();
  await render(
    <Screen header={<Header title="Scan" />} scrollRef={screenScroll}>
      {/* A sheet, rendered from the screen's children: a Modal, which React context passes through. */}
      <Modal visible transparent>
        <ScrollView ref={sheetScroll}>
          <ScrollIntoViewScope scrollRef={sheetScroll}>
            <Field />
          </ScrollIntoViewScope>
        </ScrollView>
      </Modal>
    </Screen>,
  );
  const behind = standIn(screenScroll.current);
  const sheet = standIn(sheetScroll.current);
  const { field, measureLayout } = fieldAt(140);

  scrollIntoView(field);
  expect(measureLayout).toHaveBeenCalledWith(sheet.content, expect.any(Function));
  expect(sheet.scrollTo).toHaveBeenCalledWith({ y: 140 - space.xl, animated: true });
  expect(behind.scrollTo).not.toHaveBeenCalled();
});

test('ScrollIntoViewScope with no scroll: a field in a modal over a Screen scrolls nothing', async () => {
  const screenScroll = createRef<ScrollViewInstance>();
  const overScreen = (inModal: ReactNode) => (
    <Screen header={<Header title="Scan" />} scrollRef={screenScroll}>
      <Modal visible transparent>
        {inModal}
      </Modal>
    </Screen>
  );
  await render(overScreen(<Field />));
  const behind = standIn(screenScroll.current);
  const { field, measureLayout } = fieldAt(140);
  scrollIntoView(field); // with no scope of its own, the modal's field reaches the Screen behind it
  expect(behind.scrollTo).toHaveBeenCalledTimes(1);

  await screen.rerender(
    overScreen(
      <ScrollIntoViewScope scrollRef={null}>
        <Field />
      </ScrollIntoViewScope>,
    ),
  );
  scrollIntoView(field);
  expect(measureLayout).toHaveBeenCalledTimes(1); // not measured again
  expect(behind.scrollTo).toHaveBeenCalledTimes(1);
});

test('BottomBar pads by the inset and sits on a hairline', async () => {
  const onPress = jest.fn();
  await render(
    <BottomBar buttons={[{ label: 'Retake', variant: 'secondary', onPress: noop }, { label: 'Save changes', onPress }]}>
      <Text>Saved as a sale · Nov 20</Text>
    </BottomBar>,
  );
  const bar = screen.getByTestId('bottom-bar');
  expect(bar).toHaveStyle({
    paddingBottom: space.m + BOTTOM,
    paddingTop: space.m,
    paddingHorizontal: space.l,
    backgroundColor: colors.panel,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  });
  // Its line (a saved line, say) sits above the buttons.
  const [line, row] = kids(bar);
  expect(line).toBe(screen.getByText('Saved as a sale · Nov 20'));
  expect(row).toBe(screen.getByTestId('button-row'));
  await fireEvent.press(button('Save changes'));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test("BottomBar: a button's ref reaches its pressable, so a sheet it opens can give TalkBack focus back to it", async () => {
  const save = createRef<ViewInstance>();
  await render(
    <BottomBar
      buttons={[
        { label: 'Retake', variant: 'secondary', onPress: noop },
        { label: 'Save sale', onPress: noop, ref: save },
      ]}
    />,
  );
  // The view TalkBack focus would go to: the button's own pressable, with its role and name.
  expect(save.current).toMatchObject({ props: { accessibilityRole: 'button', accessibilityLabel: 'Save sale' } });
  await screen.rerender(<BottomBar buttons={[{ label: 'Retake', variant: 'secondary', onPress: noop }]} />);
  expect(save.current).toBeNull(); // gone with its button
});

test('ButtonRow puts two buttons side by side, and stacks them, primary last, when a label wraps', async () => {
  await render(<ButtonRow buttons={retakeAnd('Save purchase')} />);
  const row = () => screen.getByTestId('button-row');
  expect(row()).toHaveStyle({ flexDirection: 'row', gap: space.m });
  const [retake, save] = kids(row());
  expect(retake).toHaveStyle({ flex: 0.8 }); // secondary 0.8, primary 1
  expect(save).toHaveStyle({ flex: 1 });
  expect(within(save).getByRole('button', { name: 'Save purchase' })).toBeOnTheScreen();
  await labelLines('Save purchase', 1); // both labels fit on one line: still side by side
  expect(row()).toHaveStyle({ flexDirection: 'row' });

  await labelLines('Save purchase', 2);
  expect(row()).toHaveStyle({ flexDirection: 'column' });
  const stacked = kids(row());
  expect(within(stacked[0]).getByRole('button', { name: 'Retake' })).toBeOnTheScreen();
  expect(within(stacked[stacked.length - 1]).getByRole('button', { name: 'Save purchase' })).toBeOnTheScreen();
  for (const child of stacked) expect(child).toHaveStyle({ flex: undefined }); // full width

  await labelLines('Save purchase', 1); // full width, the label fits: it stays stacked rather than flip back
  expect(row()).toHaveStyle({ flexDirection: 'column' });

  await screen.rerender(<ButtonRow buttons={retakeAnd('Save sale')} />);
  expect(row()).toHaveStyle({ flexDirection: 'row' });
});

test("ButtonRow: a stacked row measures again when the window's width or font size changes", async () => {
  const initial = Dimensions.get('window');
  const setFontScale = (fontScale: number) =>
    act(() => {
      Dimensions.set({ window: { ...initial, fontScale }, screen: Dimensions.get('screen') });
    });
  await render(<ButtonRow buttons={retakeAnd('Save purchase')} />);
  await labelLines('Save purchase', 2);
  expect(screen.getByTestId('button-row')).toHaveStyle({ flexDirection: 'column' });
  try {
    await setFontScale(initial.fontScale / 2);
    expect(screen.getByTestId('button-row')).toHaveStyle({ flexDirection: 'row' });
    await setFontScale(initial.fontScale); // back: remembered, so it stacks at once
    expect(screen.getByTestId('button-row')).toHaveStyle({ flexDirection: 'column' });
  } finally {
    await setFontScale(initial.fontScale);
  }
});

test('ButtonRow: text buttons keep their width, destructive is 0.8, and a lone button fills the row', async () => {
  const onLabelLines = jest.fn();
  await render(
    <ButtonRow
      buttons={[
        { label: 'Cancel', variant: 'text', onPress: noop, onLabelLines },
        { label: 'Delete', variant: 'destructive', onPress: noop },
        { label: 'Save', onPress: noop },
      ]}
    />,
  );
  const [cancel, remove, save] = kids(screen.getByTestId('button-row'));
  expect(cancel).toHaveStyle({ flex: undefined, flexGrow: undefined, flexShrink: 1 });
  expect(remove).toHaveStyle({ flex: 0.8 });
  expect(save).toHaveStyle({ flex: 1 });
  await labelLines('Cancel', 1);
  expect(onLabelLines).toHaveBeenCalledWith(1); // a button's own onLabelLines still hears its label

  await screen.rerender(<ButtonRow buttons={[{ label: 'Retake', variant: 'secondary', onPress: noop }]} />);
  expect(kids(screen.getByTestId('button-row'))[0]).toHaveStyle({ flex: 1 });
});

test('ButtonRow: "lone" counts the buttons that grow, so text buttons beside one leave it the whole row', async () => {
  // The supplier sheet's row: Use this name (secondary) and Add to your suppliers (text). The secondary is the one
  // button that grows, so it fills what the text button leaves, with no gap at the end.
  const use: ButtonProps = { label: 'Use this name', variant: 'secondary', onPress: noop };
  const add: ButtonProps = { label: 'Add to your suppliers', variant: 'text', onPress: noop };
  await render(<ButtonRow buttons={[use, add]} />);
  const shares = () => kids(screen.getByTestId('button-row')).map((child) => StyleSheet.flatten(child.props.style));
  expect(shares()).toEqual([{ flex: 1 }, { flexShrink: 1 }]);
  await screen.rerender(<ButtonRow buttons={[add, use]} />); // whatever the order
  expect(shares()).toEqual([{ flexShrink: 1 }, { flex: 1 }]);
  const remove: ButtonProps = { label: 'Delete', variant: 'destructive', onPress: noop };
  const keep: ButtonProps = { label: 'Keep it', variant: 'destructiveText', onPress: noop };
  await screen.rerender(<ButtonRow buttons={[keep, remove]} />); // a destructive one too
  expect(shares()).toEqual([{ flexShrink: 1 }, { flex: 1 }]);

  // Two that grow share the row as before: secondary 0.8, primary 1, the text button at its own width.
  await screen.rerender(<ButtonRow buttons={[add, use, { label: 'Save', onPress: noop }]} />);
  expect(shares()).toEqual([{ flexShrink: 1 }, { flex: 0.8 }, { flex: 1 }]);
  // Only text buttons: none grows.
  await screen.rerender(<ButtonRow buttons={[add, { label: 'Cancel', variant: 'text', onPress: noop }]} />);
  expect(shares()).toEqual([{ flexShrink: 1 }, { flexShrink: 1 }]);
});

test("Button reports its label's lines", async () => {
  const onLabelLines = jest.fn();
  await render(<Button label="Save purchase" onPress={noop} onLabelLines={onLabelLines} />);
  await labelLines('Save purchase', 3);
  expect(onLabelLines).toHaveBeenCalledWith(3);

  await screen.rerender(<Button label="Retake" onPress={noop} />); // nobody asks: Android doesn't measure its lines
  expect(screen.getByText('Retake').props.onTextLayout).toBeUndefined();
});
