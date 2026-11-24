// Camera first (spec §6.2): on the camera tab, the bar's raised middle button is the shutter. The camera tab gives it
// here while it's mounted: what a press does, and whether it waits (the camera starting, or a photo on its way). One
// camera at a time; a camera that goes clears only its own, so an old root's late unmount (ruling T26-4) never takes
// away the new root's shutter.

export type Shutter = { take: () => void; disabled: boolean };

/**
 * How long Done waits, once it has ended the session, for a photo Auto or the middle button had just started taking:
 * its 'capturing' can still be on its way from the camera as Done is tapped (ruling T7-8). Then Done waits for that
 * photo, or for the capture to end without one.
 */
export const CAPTURE_GRACE_MS = 250;

let holder: object | null = null; // whose shutter it is
let current: Shutter | null = null;
const listeners = new Set<() => void>();

/** The camera's shutter, in place of any other's; null clears it, only if it's still that owner's. */
export function setShutter(owner: object, shutter: Shutter | null): void {
  if (shutter === null) {
    if (holder !== owner) return;
    holder = null;
    current = null;
  } else {
    if (holder === owner && current === shutter) return;
    holder = owner;
    current = shutter;
  }
  listeners.forEach((listener) => listener());
}

export function currentShutter(): Shutter | null {
  return current;
}

/** For useSyncExternalStore: called after each change to the shutter. */
export function subscribeShutter(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
