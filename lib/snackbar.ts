// Design B §5.6 and the plan's call 4: what the snackbar shows, which lib/toast raises and components/Snackbar shows.
// One message at a time: a new one replaces the one showing. Hosts stack in the order they mount (the root layout's,
// then an open sheet's, inside its Modal; the photo viewer's too), and only the newest shows the message, so it's
// never dimmed behind a modal; one that goes hands the message back to the one under it. A bottom bar reports its
// height while it's mounted, so the root host's message sits above it: the bar that first reported most recently (the
// screen on top), whatever the ones under it report later.

export type SnackAction = { label: string; onPress: () => void };
export type Snack = { id: number; message: string; action: SnackAction | null };

let current: Snack | null = null; // replaced, never changed in place: hosts subscribe to it
let counter = 0;
let hosts: readonly symbol[] = []; // oldest first
const clearances = new Map<object, number>(); // each bar's height, in the order the bars first reported
const listeners = new Set<() => void>();

function changed(): void {
  listeners.forEach((listener) => listener());
}

/** Shows a message, with an optional action, in place of the one showing. */
export function showSnack(message: string, action?: SnackAction): void {
  counter += 1;
  current = { id: counter, message, action: action ?? null };
  changed();
}

/** Takes the message down, if it's still the one showing. */
export function dismissSnack(id: number): void {
  if (current?.id !== id) return;
  current = null;
  changed();
}

export function currentSnack(): Snack | null {
  return current;
}

/** For useSyncExternalStore: called after each change to the message, the hosts or the bars' clearance. */
export function subscribeSnack(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** A new host, on top of the others until it's removed. */
export function pushHost(): { id: symbol; remove: () => void } {
  const id = Symbol('snackbar host');
  hosts = [...hosts, id];
  changed();
  return {
    id,
    remove: () => {
      hosts = hosts.filter((host) => host !== id);
      changed();
    },
  };
}

/** The host that shows the message: the newest. */
export function topHost(): symbol | null {
  return hosts.at(-1) ?? null;
}

/** A bottom bar's height, in dp, as it lays out; null once it has gone. */
export function setBottomClearance(owner: object, height: number | null): void {
  if (height === null) {
    if (!clearances.delete(owner)) return;
  } else {
    if (clearances.get(owner) === height) return;
    clearances.set(owner, height); // a bar that reports again keeps its place in the order
  }
  changed();
}

/** What the root host's message clears: the newest bar's height, 0 with none. */
export function bottomClearance(): number {
  return [...clearances.values()].at(-1) ?? 0;
}
