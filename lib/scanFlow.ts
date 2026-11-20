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
 * scan at a time: a second tap while one reads does nothing.
 */
export function useScanFlow() {
  const router = useRouter();
  const busy = useRef(false);
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

  async function run(getUri: () => Promise<string | null>, label: string, source: ScanSource, opts: ReadOptions,
                     openError: string): Promise<void> {
    if (busy.current) return;
    busy.current = true;
    try {
      let uri: string | null;
      try {
        uri = await getUri();
      } catch {
        toast(openError);
        return;
      }
      if (!uri) return;
      setReading(true);
      try {
        const result = await scanPhoto(uri, { deletePhoto: opts.deletePhoto ?? false });
        const id = addScan({ label, source, sampleId: opts.sampleId, result });
        if (!here.current) return;
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
      busy.current = false;
    }
  }

  function scanUri(uri: string, label: string, source: ScanSource, opts: ReadOptions = {}): Promise<void> {
    return run(async () => uri, label, source, opts, "Couldn't open the photo.");
  }

  function fromGallery(opts: { replace?: boolean } = {}): Promise<void> {
    return run(
      async () => {
        const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
        return picked.canceled ? null : picked.assets[0].uri;
      },
      'Photo from gallery',
      'gallery',
      opts,
      "Couldn't open that photo.",
    );
  }

  function fromCameraApp(opts: { replace?: boolean } = {}): Promise<void> {
    return run(
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

  function fromSample(id: string): Promise<void> {
    const label = SAMPLES.find((s) => s.id === id)?.label ?? id;
    return run(() => sampleUri(id), label, 'sample', { sampleId: id }, "Couldn't open that sample.");
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

  return { reading, scanUri, fromGallery, fromCameraApp, fromSample, retake };
}
