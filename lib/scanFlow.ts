import * as ImagePicker from 'expo-image-picker';
import { useIsFocused, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { scanPhoto } from '../modules/scanner';
import { SAMPLES, sampleUri } from './samples';
import { addScan, type ScanSource, type StoredScan } from './scans';
import { toast } from './toast';

type ReadOptions = { sampleId?: string; deletePhoto?: boolean; replace?: boolean };

/**
 * Getting a photo read: from the camera, the phone's camera app, the gallery or a sample, then on to its result. One
 * at a time: while one is being picked or read (busy), another does nothing.
 */
export function useScanFlow() {
  const router = useRouter();
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  // false once the screen is left: a read that ends after that is kept in Recent scans, and nothing opens.
  const focused = useIsFocused();
  const here = useRef(true);
  useEffect(() => {
    here.current = focused;
  }, [focused]);
  useEffect(
    () => () => {
      here.current = false;
    },
    [],
  );

  /** False when another photo was being picked or read, so this one wasn't taken. */
  async function run(getUri: () => Promise<string | null>, label: string, source: ScanSource, opts: ReadOptions,
                     openError: string): Promise<boolean> {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    try {
      let uri: string | null;
      try {
        uri = await getUri();
      } catch {
        toast(openError);
        return true;
      }
      if (!uri) return true;
      setReading(true);
      try {
        const result = await scanPhoto(uri, { deletePhoto: opts.deletePhoto ?? false });
        const id = addScan({ label, source, sampleId: opts.sampleId, result });
        if (!here.current) return true;
        const target = { pathname: '/result', params: { id } } as const;
        if (opts.replace) router.replace(target);
        else router.push(target);
      } catch (e: unknown) {
        const err = e as { code?: string; message?: string };
        toast(
          err?.code === 'ERR_UNREADABLE_IMAGE'
            ? "Couldn't read that photo: This file isn't a photo the scanner can open."
            : `Couldn't read that photo: ${err?.message ?? String(e)}`,
        );
      }
    } finally {
      setReading(false);
      setBusy(false);
      busyRef.current = false;
    }
    return true;
  }

  /** Reads a photo the app already has; false when another one was being picked or read, so this one wasn't. */
  function scanUri(uri: string, label: string, source: ScanSource, opts: ReadOptions = {}): Promise<boolean> {
    return run(async () => uri, label, source, opts, "Couldn't open the photo.");
  }

  async function fromGallery(opts: { replace?: boolean } = {}): Promise<void> {
    await run(
      async () => {
        const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
        return picked.canceled ? null : picked.assets[0].uri;
      },
      'Photo from gallery',
      'gallery',
      { ...opts, deletePhoto: true }, // the picker's copy in the app's cache; the person's photo is never deleted
      "Couldn't open that photo.",
    );
  }

  async function fromCameraApp(opts: { replace?: boolean } = {}): Promise<void> {
    await run(
      async () => {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          toast('The camera app needs the camera permission too. Choose a photo from the gallery instead.');
          return null;
        }
        const taken = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
        return taken.canceled ? null : taken.assets[0].uri;
      },
      'Camera photo',
      'camera_app',
      { ...opts, deletePhoto: true },
      "Couldn't open that photo.",
    );
  }

  async function fromSample(id: string): Promise<void> {
    const label = SAMPLES.find((s) => s.id === id)?.label ?? id;
    await run(() => sampleUri(id), label, 'sample', { sampleId: id }, "Couldn't open that sample.");
  }

  /** Retake: the same source again; back Home after a sample or a scan opened from Recent scans. */
  async function retake(scan: StoredScan, openedFromRecent: boolean): Promise<void> {
    if (openedFromRecent || scan.source === 'sample') {
      router.back();
      return;
    }
    if (scan.source === 'camera') {
      router.replace('/camera');
      return;
    }
    if (scan.source === 'camera_app') return fromCameraApp({ replace: true });
    return fromGallery({ replace: true });
  }

  return { busy, reading, scanUri, fromGallery, fromCameraApp, fromSample, retake };
}
