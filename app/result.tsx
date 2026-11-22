import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  AccessibilityInfo,
  Alert,
  Image,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  View,
  type ViewInstance,
} from 'react-native';

import { BottomBar } from '../components/BottomBar';
import { BoxSheet } from '../components/BoxSheet';
import { Button, type ButtonProps } from '../components/Buttons';
import { CertificateSections } from '../components/CertificateSections';
import { Header } from '../components/Header';
import { IconButton } from '../components/IconButton';
import { More } from '../components/icons';
import { invoiceSections, Ledger, type LedgerOpen } from '../components/InvoiceLedger';
import { Menu } from '../components/Menu';
import { PartySheet } from '../components/PartySheet';
import { PhotoThumb, PhotoViewer } from '../components/PhotoViewer';
import { ReadingOverlay } from '../components/ReadingOverlay';
import { CertSaveSheet, SaveSheet } from '../components/SaveSheet';
import { Screen, scrollIntoViewOf } from '../components/Screen';
import { Segmented } from '../components/Segmented';
import { useLingering } from '../components/Sheet';
import { StatusStrip } from '../components/StatusStrip';
import { SupplierSheet } from '../components/SupplierSheet';
import { Tap } from '../components/Tap';
import { TermsSheet } from '../components/TermsSheet';
import { TEAM_BUILD } from '../lib/build';
import { localIsoDate } from '../lib/checks/dates';
import { blockWords, saveBlock } from '../lib/exportRows';
import { flagTarget } from '../lib/flagTargets';
import { formatClock, formatMs, monthDay } from '../lib/format';
import { FORMS } from '../lib/forms';
import { addItem } from '../lib/lists';
import { boxValue, type SaleView } from '../lib/sale';
import { compareWithSample, sampleInfo } from '../lib/samples';
import { deleteSaved, type SavedSummary } from '../lib/saved';
import { useScanFlow } from '../lib/scanFlow';
import { shownLabel, useScanCheck } from '../lib/scanState';
import { getScan, type InvoiceKind, type StoredScan, subscribeRecent, updateScan } from '../lib/scans';
import { colors, radius, space, type } from '../lib/theme';
import { toast } from '../lib/toast';
import { uncheckedBoxes } from '../lib/training/boxes';
import type { ScanResult } from '../modules/scanner';

// Design B §9.5: the Scan screen. The header names the form, with the photo behind its thumbnail (and ⋮ for a saved
// scan); the status strip is pinned under it, with a flag chip per thing to check. The scroll holds the saved line, the
// kind switch, the invoice as a ledger (a 2307's sections until Task 12) and the footnote; the bottom bar holds Retake
// and the save. Every row opens what the camera saw in its boxes, each box fixable, and the checks run again. When
// the form wasn't found, the photo and how to retake it take the strip's and the ledger's place.

const KINDS = [
  { value: 'sale', label: 'Sale' },
  { value: 'purchase', label: 'Purchase' },
] as const;
const KIND_CAPTION: Record<InvoiceKind, string> = {
  sale: "You issued it. It becomes a row in MyBizMate's Sales import.",
  purchase: "Another business issued it to you. It becomes a row in MyBizMate's Purchases import.",
};
const CHANGED = 'Changed since it was saved. The export still has the saved version. Save changes to update it.';
const NOT_FOUND_PDF =
  "Page 1 of this PDF isn't a MyBizMate Sales Invoice, a Service Invoice or a BIR Form 2307. Import another PDF.";
const WHOLE_FORM = [
  'All 4 corner squares of a MyBizMate invoice',
  'The whole table of a Service Invoice',
  'The whole page of a BIR Form 2307',
];
/** The photo's height when the form wasn't found, in dp (§9.5). */
const PHOTO_HEIGHT = 240;

/** What a sheet opens with: a row's (LedgerOpen), or the save sheet; n counts the openings, so each starts fresh. */
type SheetOpen = LedgerOpen | { kind: 'save' };
type Opening = SheetOpen & { n: number };

const dayOf = (iso: string) => monthDay(localIsoDate(new Date(iso)));

export default function Result() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const router = useRouter();
  const flow = useScanFlow();
  const scan = useSyncExternalStore(subscribeRecent, () => (id ? getScan(id) : undefined));
  const { sale, cert, state, saved, summary, annotation } = useScanCheck(scan);
  // Deleted from ⋮: the header's words as they were, while the screen goes back.
  const [leaving, setLeaving] = useState<{ title: string; subtitle: string } | null>(null);
  const [open, setOpen] = useState<Opening | null>(null);
  const [viewing, setViewing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const sheetUp = useRef(false); // set at once, so a second tap is refused before the sheet is up
  const openings = useRef(0);
  // Each sheet's opener (the row, or the chip's row), which TalkBack focus goes back to when it closes.
  const boxesOpener = useRef<ViewInstance | null>(null);
  const termsOpener = useRef<ViewInstance | null>(null);
  const customerOpener = useRef<ViewInstance | null>(null);
  const supplierOpener = useRef<ViewInstance | null>(null);
  const saveButton = useRef<ViewInstance>(null); // Save, in the bottom bar: the sheets it opens give focus back to it
  const scrollRef = useRef<ScrollViewInstance>(null);
  const stripRef = useRef<ViewInstance>(null);
  const moreRef = useRef<ViewInstance>(null);
  const [rowRefs] = useState(() => new Map<string, ViewInstance | null>());
  const sections = useMemo(() => (scan && sale ? invoiceSections(scan, sale) : []), [scan, sale]);
  // Each sheet stays mounted with what it last showed, so it can slide away; its key changes at each opening.
  const boxes = useLingering(open?.kind === 'boxes' ? open : null);
  const terms = useLingering(open?.kind === 'terms' ? open : null);
  const customer = useLingering(open?.kind === 'customer' ? open : null);
  const supplier = useLingering(open?.kind === 'supplier' ? open : null);
  const save = useLingering(open?.kind === 'save' ? open : null);

  // Straight from a read (not opened from Home or Saved): TalkBack starts at the strip, which says where it stands.
  useEffect(() => {
    if (from === undefined && stripRef.current) AccessibilityInfo.sendAccessibilityEvent(stripRef.current, 'focus');
  }, [from]);

  if (leaving) {
    // it's going back already: Back stays where it was, and does nothing more
    return <Screen scroll={false} header={<Header title={leaving.title} subtitle={leaving.subtitle} onBack={noop} />} />;
  }
  if (!scan || !state) {
    return (
      <Screen header={<Header title="Scan" />}>
        <Text style={[type.body, styles.gone]}>This scan is no longer here. Go back and read the photo again.</Text>
      </Screen>
    );
  }

  const r = scan.result;
  const found = state.kind !== 'not_found';
  const isSample = scan.source === 'sample';
  const isSaved = saved !== 'no' && summary !== undefined;
  const back = from === 'recent' || from === 'saved';
  const title = found && r.form ? FORMS[r.form].title : 'Scan';
  const subtitle = subtitleOf(scan, found, sale, isSaved ? summary : undefined);

  // what it still needs before it can be saved: Save says it, and so does the strip (never "ready")
  const block = saveBlock(scan, sale ?? cert, { annotation });
  const blocked = blockWords(block, scan);
  // in annotation mode, Save opens every box not checked yet: those no section shows too
  const unchecked = block === 'unchecked' ? uncheckedBoxes(scan) : null;
  const saveLabel = isSaved ? 'Save changes' : cert ? 'Save 2307' : scan.kind === 'sale' ? 'Save sale' : 'Save purchase';
  const rows = sections.flatMap((s) => s.rows);
  const flaggedKeys = new Set(rows.filter((row) => row.flagged).map((row) => row.key));

  /** Opens a sheet, once: a second tap while one is open (or opening) does nothing. */
  function openSheet(sheet: SheetOpen, opener: ViewInstance | null) {
    if (sheetUp.current) return;
    sheetUp.current = true;
    if (sheet.kind === 'boxes') boxesOpener.current = opener;
    else if (sheet.kind === 'terms') termsOpener.current = opener;
    else if (sheet.kind === 'customer') customerOpener.current = opener;
    else if (sheet.kind === 'supplier') supplierOpener.current = opener;
    openings.current += 1;
    setOpen({ ...sheet, n: openings.current });
  }
  function closeSheet() {
    sheetUp.current = false;
    setOpen(null);
  }

  function openSave() {
    if (unchecked) openSheet({ kind: 'boxes', title: 'Check every box first', boxes: unchecked }, saveButton.current);
    else if (block === null) openSheet({ kind: 'save' }, null); // the save sheets' returnFocus is Save itself
    else if (blocked) toast(blocked);
  }

  /** A flag chip: the photo opens the viewer; any other scrolls its row into view and opens it, as tapping it does. */
  function onChip(problem: string) {
    const key = flagTarget(problem, flaggedKeys);
    if (key === 'photo') {
      setViewing(true);
      return;
    }
    const row = rows.find((candidate) => candidate.key === key);
    if (!row?.open) return;
    const view = rowRefs.get(row.key) ?? null;
    scrollIntoViewOf(scrollRef, view);
    openSheet(row.open, view);
  }

  /**
   * ⋮ › Delete saved scan. The screen shows only its header from then on, so the scan's going never shows as "This scan
   * is no longer here": React renders the scans' change, the navigator's and this state's together (one sync batch).
   */
  function confirmDelete(scanId: string) {
    Alert.alert('Delete this saved scan?', "It's removed from this phone. Files you already exported don't change.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setLeaving({ title, subtitle });
          router.back();
          void deleteSaved(scanId);
        },
      },
    ]);
  }

  const retake = () => flow.retake(scan, back);
  const buttons: ButtonProps[] = !found
    ? [
        scan.source === 'pdf'
          ? { label: 'Choose a PDF', variant: 'secondary', onPress: () => flow.fromPdf({ replace: true }) }
          : { label: 'Choose a photo', variant: 'secondary', onPress: () => flow.fromGallery({ replace: true }) },
        {
          label: 'Retake',
          // the plan's call 8: the camera, or the camera app again; opened from Home or Saved, back
          onPress: back || scan.source === 'camera' || scan.source === 'camera_app' ? retake : () => router.replace('/camera'),
        },
      ]
    : isSample
      ? [{ label: 'Retake', variant: 'secondary', onPress: retake }]
      : [
          { label: 'Retake', variant: 'secondary', onPress: retake },
          { label: saveLabel, testID: 'save-open', onPress: openSave, ref: saveButton },
        ];

  const header = (
    <Header
      title={title}
      subtitle={subtitle}
      right={
        found || isSaved ? (
          <>
            {found ? <PhotoThumb result={r} onPress={() => setViewing(true)} /> : null}
            {isSaved ? (
              // The menu's anchor: a view of its own, so Android measures it where it is.
              <View ref={moreRef} collapsable={false}>
                <IconButton icon={More} label="More options" onPress={() => setMenuOpen(true)} />
              </View>
            ) : null}
          </>
        ) : undefined
      }
    />
  );

  return (
    <View style={styles.root}>
      <Screen
        header={header}
        pinned={
          state.kind === 'not_found' ? null : (
            <StatusStrip
              ref={stripRef}
              state={state}
              fixed={Object.keys(scan.edits).length}
              sample={isSample}
              saved={saved}
              onChip={onChip}
            />
          )
        }
        bottom={<BottomBar buttons={buttons} />}
        scrollRef={scrollRef}>
        {found ? (
          <>
            {isSaved ? <SavedLine summary={summary} changed={saved === 'changed'} /> : null}
            {sale ? (
              <View style={styles.kind}>
                <Segmented
                  label="This invoice is"
                  options={KINDS}
                  value={scan.kind === 'purchase' ? 'purchase' : 'sale'}
                  // the party chosen for one is never the other's: a sale's customer didn't issue the invoice
                  onChange={(kind) => {
                    if (kind !== scan.kind) updateScan(scan.id, { kind, party: null });
                  }}
                />
                <Text style={[type.label, styles.mute]}>{KIND_CAPTION[scan.kind === 'purchase' ? 'purchase' : 'sale']}</Text>
              </View>
            ) : null}
            {sale ? (
              <Ledger
                sections={sections}
                rowRefs={rowRefs}
                onOpen={(row, view) => {
                  if (row.open) openSheet(row.open, view);
                }}
              />
            ) : null}
            {cert ? (
              // until Task 12 makes the 2307 a ledger too
              <View style={styles.cert}>
                <CertificateSections
                  scan={scan}
                  view={cert}
                  openBoxes={(boxTitle, names) => openSheet({ kind: 'boxes', title: boxTitle, boxes: names }, null)}
                />
              </View>
            ) : null}
          </>
        ) : (
          <NotFound result={r} onPhoto={() => setViewing(true)} />
        )}
        <Footnote lines={footnoteOf(scan)} />
      </Screen>
      {boxes ? (
        <BoxSheet
          key={boxes.n}
          visible={open?.kind === 'boxes'}
          title={boxes.title}
          scan={scan}
          boxes={boxes.boxes}
          onClose={closeSheet}
          returnFocus={boxesOpener}>
          {boxes.row !== undefined && sale ? <NewItem scan={scan} sale={sale} row={boxes.row} /> : null}
        </BoxSheet>
      ) : null}
      {terms ? (
        <TermsSheet
          key={terms.n}
          visible={open?.kind === 'terms'}
          scan={scan}
          onClose={closeSheet}
          returnFocus={termsOpener}
        />
      ) : null}
      {customer && sale ? (
        <PartySheet
          key={customer.n}
          visible={open?.kind === 'customer'}
          scan={scan}
          sale={sale}
          onClose={closeSheet}
          returnFocus={customerOpener}
        />
      ) : null}
      {supplier && sale ? (
        <SupplierSheet
          key={supplier.n}
          visible={open?.kind === 'supplier'}
          scan={scan}
          sale={sale}
          onClose={closeSheet}
          returnFocus={supplierOpener}
        />
      ) : null}
      {save && sale ? (
        <SaveSheet
          key={save.n}
          visible={open?.kind === 'save'}
          scan={scan}
          sale={sale}
          onClose={closeSheet}
          returnFocus={saveButton}
        />
      ) : null}
      {save && cert ? (
        <CertSaveSheet
          key={save.n}
          visible={open?.kind === 'save'}
          scan={scan}
          view={cert}
          onClose={closeSheet}
          returnFocus={saveButton}
        />
      ) : null}
      <PhotoViewer visible={viewing} result={r} onClose={() => setViewing(false)} />
      {isSaved ? (
        <Menu
          visible={menuOpen}
          anchor={moreRef}
          items={[{ label: 'Delete saved scan', destructive: true, onPress: () => confirmDelete(scan.id) }]}
          onClose={() => setMenuOpen(false)}
        />
      ) : null}
      <ReadingOverlay visible={flow.reading} />
    </View>
  );
}

const noop = () => {};

/**
 * The header's line under the form's name, the first that applies: where it came from and when, when the form wasn't
 * found; saved, and when; a sample's name; a text PDF; else the invoice's number (a 2307 has none) and the read time.
 */
function subtitleOf(scan: StoredScan, found: boolean, sale: SaleView | null, summary: SavedSummary | undefined): string {
  const r = scan.result;
  const t = formatMs(r.timing.totalMs);
  if (!found) return `${shownLabel(scan)} · ${formatClock(scan.at)}`;
  if (summary) return `Saved as a ${summary.kind} · ${dayOf(summary.savedAt)}`;
  if (scan.source === 'sample') return `${scan.label} · Read in ${t}`;
  if (r.source === 'pdf' && r.picture === false) return `From the PDF's text · ${t}`;
  const number = r.form ? FORMS[r.form].number : '';
  const no = sale?.final.invoice_no ?? '';
  return number && no ? `${number} ${no} · Read in ${t}` : `Read in ${t}`;
}

/** A saved scan's slim line at the top of the scroll: when it was saved and exported, or that it changed since. */
function SavedLine({ summary, changed }: { summary: SavedSummary; changed: boolean }) {
  const exported = summary.exportedAt ? `Exported ${dayOf(summary.exportedAt)}` : 'Not exported yet';
  return (
    <View testID="saved-line" style={[styles.savedLine, changed ? styles.changedLine : styles.unchangedLine]}>
      <Text style={[type.label, changed ? styles.warning : styles.ink]}>
        {changed ? CHANGED : `Saved as a ${summary.kind} · ${dayOf(summary.savedAt)} · ${exported}`}
      </Text>
    </View>
  );
}

/** The form wasn't found: the photo, which opens the viewer, and how to get the whole form in the next one. */
function NotFound({ result, onPhoto }: { result: ScanResult; onPhoto: () => void }) {
  return (
    <View style={styles.notFound}>
      {result.originalUri ? (
        <Tap
          accessibilityRole="button"
          accessibilityLabel="Photo of the form"
          accessibilityHint="Opens it full screen"
          onPress={onPhoto}
          focusRadius={radius.field}>
          <Image
            testID="not-found-photo"
            source={{ uri: result.originalUri }}
            resizeMode="contain"
            style={styles.photo}
          />
        </Tap>
      ) : null}
      <Text accessibilityRole="header" style={[type.headline, styles.ink]}>
        {"Couldn't find the form"}
      </Text>
      {/* what the scanner read (a photo or a PDF), not how the scan came in: a PDF has no photo to retake */}
      {result.source === 'pdf' ? (
        <Text style={[type.body, styles.ink]}>{NOT_FOUND_PDF}</Text>
      ) : (
        <>
          <Text style={[type.body, styles.ink]}>Get the whole form in the photo, then retake it:</Text>
          {WHOLE_FORM.map((line, i) => (
            <View key={line} accessible style={styles.numbered}>
              <Text style={[type.figure, styles.number]}>{String(i + 1)}</Text>
              <Text style={[type.body, styles.numberedLine]}>{line}</Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

/** Once, at the end of the scroll: one paragraph per line. */
function Footnote({ lines }: { lines: readonly string[] }) {
  return (
    <View testID="footnote" style={styles.footnote}>
      {lines.map((line) => (
        <Text key={line} style={[type.label, styles.mute]}>
          {line}
        </Text>
      ))}
    </View>
  );
}

/**
 * The footnote's lines: how long it took, on the phone; in team builds, its stages; how many boxes were read; a PDF's
 * own line; and for a sample, how it read against what's written on it.
 */
function footnoteOf(scan: StoredScan): string[] {
  const r = scan.result;
  const total = formatMs(r.timing.totalMs);
  const boxes = `${r.reads.length} ${r.reads.length === 1 ? 'box' : 'boxes'}`;
  const lines: (string | null)[] = r.aligned
    ? [
        `Read on this phone in ${total}. Nothing left the phone.`,
        TEAM_BUILD ? `Straighten ${formatMs(r.timing.alignMs)}, read ${formatMs(r.timing.readMs)}.` : null,
        `${boxes} read.`,
      ]
    : [`Checked on this phone in ${total}. Nothing left the phone.`];
  // r.source is what the scanner read (a photo or a PDF); scan.source is how the scan came in
  if (r.source === 'pdf') lines.push(pdfFootnote(r));
  if (scan.source === 'sample' && r.aligned) lines.push(sampleLine(scan));
  return lines.filter((line) => line !== null);
}

/**
 * A PDF's own footnote: where its boxes came from (its text, or its rendered page; a picture PDF is read like a photo)
 * and, when it has more pages, that only page 1 was read. null when there's nothing to tell.
 */
function pdfFootnote(r: ScanResult): string | null {
  const text = r.reads.filter((b) => b.fromText).length;
  const boxes = `${text} ${text === 1 ? 'box' : 'boxes'} from its text, ${r.reads.length - text} read from the page`;
  const how = r.picture ? 'The PDF is a picture: read like a photo.' : r.aligned ? `Read from the PDF: ${boxes}.` : null;
  const pages = r.pageCount !== null && r.pageCount > 1 ? `Only page 1 of ${r.pageCount} was read.` : null;
  return [how, pages].filter((s) => s !== null).join(' ') || null;
}

/** A sample: how many of the boxes written on it were read exactly; and that samples can't be saved. */
function sampleLine(scan: StoredScan): string {
  const made = "Samples are made up, so they can't be saved.";
  if (!scan.sampleId) return made;
  const { exact, written } = compareWithSample(scan.result.reads, sampleInfo(scan.sampleId));
  return `Sample invoice: ${exact} of ${written} boxes read exactly as written. ${made}`;
}

/** On a sale, an item the lists don't have: one tap adds it, with its unit and the row's unit price. */
function NewItem({ scan, sale, row }: { scan: StoredScan; sale: SaleView; row: number }) {
  const item = sale.final.items.find((it) => it.row === row);
  if (scan.kind !== 'sale' || scan.source === 'sample' || !item || item.item_id !== null || !item.description) return null;
  const add = async () => {
    await addItem({ name: item.description, unit: boxValue(scan, `item${row}_unit`) ?? '', price: item.unit_price });
    toast('Added to your items.');
  };
  return <Button variant="text" label={`Add “${item.description}” to your items`} onPress={add} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  gone: { color: colors.ink, padding: space.l },
  savedLine: { paddingHorizontal: space.l, paddingVertical: space.s },
  unchangedLine: { backgroundColor: colors.sand },
  changedLine: { backgroundColor: colors.warningTint },
  kind: { padding: space.l, gap: space.s },
  cert: { paddingHorizontal: space.l, paddingTop: space.l },
  notFound: { padding: space.l, gap: space.m },
  photo: { width: '100%', height: PHOTO_HEIGHT, backgroundColor: colors.crop, borderRadius: radius.field },
  numbered: { flexDirection: 'row', gap: space.m },
  number: { color: colors.brandText },
  numberedLine: { flex: 1, color: colors.ink },
  footnote: { paddingHorizontal: space.l, paddingTop: space.l, gap: space.xs },
  ink: { color: colors.ink },
  mute: { color: colors.mute },
  warning: { color: colors.warning },
});
