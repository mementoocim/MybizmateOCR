import { type SnackAction, showSnack } from './snackbar';

/**
 * A short message in the snackbar (design B §5.6), with an optional action such as "View", in place of the one
 * showing. It keeps the test app's name and call shape, so its callers, and the tests that mock this module, stay as
 * they were.
 */
export function toast(message: string, action?: SnackAction): void {
  showSnack(message, action);
}
