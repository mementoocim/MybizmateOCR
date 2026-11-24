import { requireNativeView } from 'expo';
import { type ComponentType, type Ref, forwardRef, useImperativeHandle, useRef } from 'react';
import type { ViewProps } from 'react-native';

import type { FormName } from './types';

// The scanner camera (ScannerCameraView.kt): the back camera in a 3:4 box with the sheet's live outline, taking the
// photo by itself (auto) or on takePhoto(). Status events come only when the status or the form changes. After each
// photo it keeps shooting: 'taken' while Auto waits for that sheet to leave the frame before it takes the next one.

export type CameraStatus = 'looking' | 'holding' | 'blurry' | 'found' | 'capturing' | 'taken';
export type CameraErrorCode = 'no_camera' | 'start' | 'capture' | 'keep';

export type ScannerCameraProps = ViewProps & {
  active: boolean; // false stops the camera (while a photo is read, or the screen isn't shown)
  auto: boolean; // take the photo by itself once the outline holds still
  torch: boolean;
  testImage?: string | null; // development builds only: a file:// photo stands in for the camera
  onReady?: (e: { nativeEvent: { hasTorch: boolean } }) => void;
  onStatus?: (e: { nativeEvent: { status: CameraStatus; form: FormName | null } }) => void;
  onPhoto?: (e: { nativeEvent: { uri: string } }) => void;
  onCameraError?: (e: { nativeEvent: { code: CameraErrorCode; message: string } }) => void;
};

/**
 * takePhoto: takes the photo now. rearm: for a Retake, Auto stops waiting for the last photo's sheet to leave the
 * frame, and takes the sheet in view after its hold (a stop and start keeps that wait).
 */
export type ScannerCameraRef = { takePhoto(): Promise<void>; rearm(): Promise<void> };

// The native view's ref carries its AsyncFunctions (takePhoto, rearm).
const NativeCamera = requireNativeView<ScannerCameraProps>('Scanner') as unknown as ComponentType<
  ScannerCameraProps & { ref?: Ref<ScannerCameraRef> }
>;

export const ScannerCameraView = forwardRef<ScannerCameraRef, ScannerCameraProps>(function ScannerCameraView(props, ref) {
  const native = useRef<ScannerCameraRef>(null);
  useImperativeHandle(ref, () => ({
    takePhoto: () => native.current?.takePhoto() ?? Promise.resolve(),
    rearm: () => native.current?.rearm() ?? Promise.resolve(),
  }));
  return <NativeCamera {...props} ref={native} />;
});
