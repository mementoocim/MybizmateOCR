import { useMemo, useSyncExternalStore } from 'react';

import type { BadgeSpec } from './badge';
import { certOf, type CertView, is2307 } from './cert';
import { blockWords, saveBlock, sameRows } from './exportRows';
import { lists, subscribeLists } from './lists';
import { isInvoice, saleOf, type SaleView } from './sale';
import { marksOf, rowsNow, type SavedSummary, savedSummary, subscribeSaved, summaryRows } from './saved';
import type { StoredScan } from './scans';
import { annotationOn, settings, subscribeSettings } from './settings';

// Design B §9.5 and §9.2: a scan's one state, which the status strip and Home's badge both show, so the two always
// agree. In the old status card's order: its form not found; things to check, which come first; what it still needs
// before it can be saved (a 2307 with no payments read, say, or boxes not checked yet in annotation mode); or checks
// passed. Samples are made up, so they're never blocked: their screen says why they can't be saved. Apart from that,
// whether a saved scan has changed since it was saved.

export type ScanState =
  | { kind: 'not_found' }
  | { kind: 'to_check'; problems: readonly string[] }
  | { kind: 'blocked'; reason: string } // blockWords(...) without its full stop
  | { kind: 'passed' };

/** Not saved; saved and as it was saved; or changed since, so the export still has the saved version. */
export type SavedState = 'no' | 'unchanged' | 'changed';

/** A scan's state: checked is its sale or its certificate (null when no form was found); annotation: annotationOn(). */
export function scanStateOf(scan: StoredScan, checked: SaleView | CertView | null, annotation: boolean): ScanState {
  if (!scan.result.aligned || !checked) return { kind: 'not_found' };
  if (checked.problems.length > 0) return { kind: 'to_check', problems: checked.problems };
  const blocked = blockWords(saveBlock(scan, checked, { annotation }), scan);
  // as a headline, without the sentence's full stop
  return blocked === null ? { kind: 'passed' } : { kind: 'blocked', reason: blocked.replace(/\.$/, '') };
}

/**
 * Whether a saved scan changed since it was saved: its boxes, its kind or its party, so its import rows aren't the
 * saved ones. In annotation mode, any box's edit or check counts too, one outside the import rows as well: the
 * training export has the labels as saved (the M4 rulings, Important 3). summary: savedSummary(scan.id).
 */
export function savedStateOf(scan: StoredScan, summary: SavedSummary | undefined, annotation: boolean): SavedState {
  if (summary === undefined || scan.saved === null) return 'no';
  const marksChanged = annotation && !!scan.savedMarks && marksOf(scan) !== scan.savedMarks;
  return marksChanged || !sameRows(rowsNow(scan), summaryRows(summary)) ? 'changed' : 'unchanged';
}

/**
 * A scan's label as the screens show it: a PDF's is its file's own name, without the "PDF: " it's kept with
 * ("sales_text_1.pdf"). The Scan screen's subtitle when the form wasn't found, and Home's recent rows.
 */
export function shownLabel(scan: Pick<StoredScan, 'label'>): string {
  return scan.label.replace(/^PDF: /, '');
}

/**
 * Home's badge for a recent scan: one state, the first that applies. Changed, then Saved; Sample; then the scan's
 * state: Couldn't find the form, N to check, Can't save yet, Checks passed.
 */
export function homeBadge(scan: StoredScan, state: ScanState, saved: SavedState): BadgeSpec {
  if (saved === 'changed') return { label: 'Changed', tone: 'warning' };
  if (saved === 'unchanged') return { label: 'Saved', tone: 'neutral' };
  if (scan.source === 'sample') return { label: 'Sample', tone: 'neutral' };
  switch (state.kind) {
    case 'not_found':
      return { label: "Couldn't find the form", tone: 'warning' };
    case 'to_check':
      return { label: `${state.problems.length} to check`, tone: 'warning' };
    case 'blocked':
      return { label: "Can't save yet", tone: 'warning' };
    case 'passed':
      return { label: 'Checks passed', tone: 'success' };
  }
}

/**
 * A scan's checks and state, kept up to date with the lists, the settings and its saved summary. The checks run once
 * per scan as it stands (saleOf, certOf): the Scan screen, Home's rows and Saved share each run. No scan
 * (one that's gone): no state.
 */
export function useScanCheck(scan: StoredScan | undefined): {
  sale: SaleView | null;
  cert: CertView | null;
  state: ScanState | null; // null when there's no scan
  saved: SavedState;
  summary: SavedSummary | undefined;
  annotation: boolean;
} {
  const theLists = useSyncExternalStore(subscribeLists, lists);
  const theSettings = useSyncExternalStore(subscribeSettings, settings);
  const annotation = useSyncExternalStore(subscribeSettings, annotationOn);
  const id = scan?.id;
  const summary = useSyncExternalStore(subscribeSaved, () => (id === undefined ? undefined : savedSummary(id)));
  const sale = useMemo(
    () => (scan && isInvoice(scan) ? saleOf(scan, theLists, theSettings) : null),
    [scan, theLists, theSettings],
  );
  const cert = useMemo(
    () => (scan && is2307(scan) ? certOf(scan, theLists, theSettings) : null),
    [scan, theLists, theSettings],
  );
  if (!scan) return { sale, cert, state: null, saved: 'no', summary, annotation };
  return {
    sale,
    cert,
    state: scanStateOf(scan, sale ?? cert, annotation),
    saved: savedStateOf(scan, summary, annotation),
    summary,
    annotation,
  };
}
