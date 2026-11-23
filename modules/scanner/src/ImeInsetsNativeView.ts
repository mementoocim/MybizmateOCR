import { requireNativeView } from 'expo';
import type { ViewProps } from 'react-native';

// The module's second native view, by its name (ScannerModule.kt: View(ImeInsetsView::class), Name("ImeInsetsView")):
// the keyboard's height in the window it's in. ImeInsetsView.tsx is its TypeScript side. It's in a file of its own so
// jest can put a host component in its place (test-utils/jestSetup.ts).

export type ImeChangeEvent = { nativeEvent: { height: number } }; // dp above the navigation bar; 0: no keyboard

export type ImeInsetsViewProps = ViewProps & {
  onImeChange?: (e: ImeChangeEvent) => void;
};

export default requireNativeView<ImeInsetsViewProps>('Scanner', 'ImeInsetsView');
