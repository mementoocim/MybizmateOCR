import { act, fireEvent, screen } from '@testing-library/react-native';

/** The phone's viewport, in dp. */
const VIEWPORT = { width: 360, height: 640 };

/**
 * Scrolls a virtualized list (its testID) to its end as a phone would. Jest lays nothing out, so this does: the
 * viewport, then each part the list has rendered (its header, its items, its footer) one under the other, itemHeight
 * dp each. The list then renders the items that come into reach, a batch at a time.
 */
export async function scrollListToEnd(testID: string, itemHeight: number) {
  const list = screen.getByTestId(testID);
  for (let batch = 0; batch < 10; batch += 1) {
    const parts = list.queryAll((n) => n !== list && typeof n.props.onLayout === 'function');
    const height = parts.length * itemHeight;
    await act(async () => {
      await fireEvent(list, 'layout', { nativeEvent: { layout: { x: 0, y: 0, ...VIEWPORT } } });
      for (const [i, part] of parts.entries()) {
        const layout = { x: 0, y: i * itemHeight, width: VIEWPORT.width, height: itemHeight };
        await fireEvent(part, 'layout', { nativeEvent: { layout } });
      }
      await fireEvent(list, 'contentSizeChange', VIEWPORT.width, height);
      await fireEvent.scroll(list, {
        nativeEvent: {
          contentOffset: { x: 0, y: Math.max(0, height - VIEWPORT.height) },
          contentSize: { width: VIEWPORT.width, height },
          layoutMeasurement: VIEWPORT,
        },
      });
      await new Promise((resolve) => setTimeout(resolve, 60)); // the list renders a batch after 50 ms
    });
  }
}
