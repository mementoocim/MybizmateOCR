import { File } from 'expo-file-system';
import { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, FlatList, StyleSheet, Text, View, type ViewInstance } from 'react-native';

import type { BadgeSpec } from '../components/Badge';
import { Banner } from '../components/Banner';
import { Button } from '../components/Buttons';
import { EmptyState } from '../components/EmptyState';
import { Header } from '../components/Header';
import { Search } from '../components/icons';
import { ListRow } from '../components/ListRow';
import { Screen, useEndPadding } from '../components/Screen';
import { SectionHeader } from '../components/SectionHeader';
import { Segmented } from '../components/Segmented';
import { Sheet } from '../components/Sheet';
import { TextField } from '../components/TextField';
import { decodeCsv } from '../lib/csv';
import { peso } from '../lib/format';
import {
  clearItems,
  clearParties,
  customersOf,
  formatTin,
  type ImportSummary,
  importItemsCsv,
  importPartiesCsv,
  ListImportError,
  type ListItem,
  type Lists,
  lists,
  type Party,
  partyName,
  subscribeLists,
  suppliersOf,
} from '../lib/lists';
import { matchesItem, matchesParty } from '../lib/search';
import { colors, space, type } from '../lib/theme';
import { toast } from '../lib/toast';
import { releaseAccess } from '../modules/scanner';

// Design B §9.9: Your lists, the customers, suppliers and items the checks use, imported from CSV files (MyBizMate's
// export, saved as CSV in Excel or Google Sheets). They stay on this phone. The tabs say their counts plainly. A search
// finds a party by its name, TIN or code, or an item by its name, and goes when the tab changes; the strip under the
// actions counts what it found. Import CSV and How to import, which explains the file in a sheet. Then the rows (a
// virtualized list; not tappable, as today) and, at the end, a Clear that names what it clears and asks first. An empty
// tab says what to import, with both actions. An import that worked says so in the snackbar; a file that can't be
// imported says why in a banner under the actions, until another file is picked or the tab changes.

type Tab = 'customers' | 'suppliers' | 'items';
/** A row of the list: its title, its sub-line (in figures when mono), and its badge. */
type Row = { id: string; title: string; sub: string; mono: boolean; badge: BadgeSpec | null };

const INTRO: Record<Tab, string> = {
  customers:
    "Your scans' customers are matched against these names and TINs. In MyBizMate, export your parties, open the file in Excel or Google Sheets, save it as CSV, then import it here.",
  suppliers: 'The suppliers you choose from when you save a purchase. Import them the same way as customers.',
  items: 'Your items and their list prices. A row whose price is far from its list price is marked to check.',
};
const PARTY_COLUMNS =
  "The first row names the columns, as in MyBizMate's Parties import: Code, Type, Entity type, Registered name, Last name, First name, Middle name, Trade name, TIN, Sub-street, Street, Barangay, City / Municipality, Province, ZIP, VAT status and Payment terms. Other columns are skipped. Contact numbers and emails are never kept.";
const ITEM_COLUMNS = 'The first row names the columns: Name, Unit and Price.';
/** An empty tab's words (the suppliers' and items' bodies are the plan's call 18). */
const EMPTY: Record<Tab, { title: string; body: string }> = {
  customers: {
    title: 'No customers yet',
    body: 'Import the parties file from MyBizMate as a CSV. Scans then match names and TINs against it.',
  },
  suppliers: {
    title: 'No suppliers yet',
    body: 'Import the parties file from MyBizMate as a CSV. You choose from these when you save a purchase.',
  },
  items: {
    title: 'No items yet',
    body: "Import your items as a CSV, with Name, Unit and Price. Scans then check each row's price.",
  },
};
/** One of a tab's rows: "1 customer". */
const SINGULAR: Record<Tab, string> = { customers: 'customer', suppliers: 'supplier', items: 'item' };
const NEW: BadgeSpec = { label: 'New', tone: 'brand' };

// Android's Downloads can hand over a link that doesn't carry the file's name (content://…/document/msf%3A123), so a
// file is a CSV by its name or by the type the phone gives it.
const CSV_TYPES = ['text/csv', 'text/comma-separated-values', 'application/csv', 'text/x-csv'];

function isCsv(file: { name: string; type: string | null }): boolean {
  const type = (file.type ?? '').split(';')[0].trim().toLowerCase();
  return file.name.toLowerCase().endsWith('.csv') || CSV_TYPES.includes(type);
}

const counted = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const skipped = (s: ImportSummary) => (s.skipped > 0 ? ` ${counted(s.skipped, 'row', 'rows')} skipped: no name.` : '');
/** A sub-line's parts, the empty ones left out: "TIN 123-456-789-00000 · C001", "sack · ₱1,350.00". */
const join = (parts: readonly string[]) => parts.filter((part) => part !== '').join(' · ');

/**
 * A party's row: its name over its TIN and code, in figures. One added from a scan with no code yet says so, after its
 * TIN, in words, with New until it has gone out in a Parties file.
 */
function partyRow(p: Party): Row {
  const tin = p.tin ? `TIN ${formatTin(p.tin)}` : '';
  if (p.fromScan && p.code === '') {
    const added = `Added from a scan · ${p.exportedAt ? 'sent in a Parties file' : 'not exported yet'}`;
    return { id: p.id, title: partyName(p), sub: join([tin, added]), mono: false, badge: p.exportedAt ? null : NEW };
  }
  return { id: p.id, title: partyName(p), sub: join([tin, p.code]), mono: true, badge: null };
}

/** An item's row: its name over its unit and price, the missing ones left out. */
function itemRow(i: ListItem): Row {
  const sub = join([i.unit, i.price === null ? '' : peso(i.price)]);
  return { id: i.id, title: i.name, sub, mono: false, badge: null };
}

/** The tab's rows that what's typed finds (all of them, with nothing typed). */
function rowsOf(l: Lists, tab: Tab, query: string): Row[] {
  if (tab === 'items') return l.items.filter((i) => matchesItem(i, query)).map(itemRow);
  return (tab === 'customers' ? customersOf(l) : suppliersOf(l)).filter((p) => matchesParty(p, query)).map(partyRow);
}

const renderRow = ({ item }: { item: Row }) => (
  <ListRow testID="list-row" title={item.title} sub={item.sub || null} subMono={item.mono} badge={item.badge} />
);

export default function ListsScreen() {
  const theLists = useSyncExternalStore(subscribeLists, lists);
  const [tab, setTab] = useState<Tab>('customers');
  const [query, setQuery] = useState('');
  const [problem, setProblem] = useState<string | null>(null); // why the last file couldn't be imported
  const [howToOpen, setHowToOpen] = useState(false);
  const howToButton = useRef<ViewInstance>(null); // TalkBack focus goes back to it once the sheet has gone
  const picking = useRef(false); // two quick presses open one picker
  const end = useEndPadding(false);

  const customers = customersOf(theLists);
  const suppliers = suppliersOf(theLists);
  const total = { customers: customers.length, suppliers: suppliers.length, items: theLists.items.length }[tab];
  const rows = useMemo(() => rowsOf(theLists, tab, query), [theLists, tab, query]);
  const noun = total === 1 ? SINGULAR[tab] : tab;
  const searchLabel = tab === 'items' ? 'Search name' : 'Search name, TIN or code';
  const options: { value: Tab; label: string }[] = [
    { value: 'customers', label: `Customers ${customers.length}` },
    { value: 'suppliers', label: `Suppliers ${suppliers.length}` },
    { value: 'items', label: `Items ${theLists.items.length}` },
  ];

  function changeTab(next: Tab) {
    if (next === tab) return;
    setTab(next);
    setQuery('');
    setProblem(null);
  }

  async function importCsv() {
    if (picking.current) return;
    picking.current = true;
    const into = tab;
    let file: File | null = null;
    try {
      const picked = await File.pickFileAsync({ mimeTypes: ['*/*'] });
      if (picked.canceled) return;
      file = picked.result;
      setProblem(null); // another file: the last one's problem goes with it
      if (!isCsv(picked.result)) {
        setProblem('Choose a .csv file. In Excel or Google Sheets, save or download the sheet as CSV.');
        return;
      }
      const text = decodeCsv(await picked.result.bytes()); // UTF-8, or Excel's plain CSV (Windows-1252)
      if (into === 'items') {
        const s = await importItemsCsv(text);
        toast(`Imported ${counted(s.added + s.updated, 'item', 'items')}.${skipped(s)}`);
      } else {
        const s = await importPartiesCsv(text, into === 'customers' ? 'customer' : 'supplier');
        toast(
          `Imported ${counted(s.customers, 'customer', 'customers')} and ${counted(s.suppliers, 'supplier', 'suppliers')}.${skipped(s)}`,
        );
      }
    } catch (e) {
      if (!(e instanceof ListImportError)) setProblem("Couldn't read that file.");
      else if (into === 'items') setProblem('That file has no Name column.');
      else {
        setProblem(
          "That file has no Registered name, Last name or First name column. Use the columns of MyBizMate's Parties import.",
        );
      }
    } finally {
      // Read or not, the app needs no lasting access to the file (Android's picker takes it on every pick). Nothing else
      // of the file is touched, nothing waits for it, and a failure to give it up changes nothing for the person.
      if (file) void releaseAccess(file.uri).catch(() => undefined);
      picking.current = false;
    }
  }

  function clear() {
    const what = tab;
    const n = total;
    Alert.alert(
      n === 1 ? `Clear 1 ${SINGULAR[what]}?` : `Clear all ${n} ${what}?`,
      "They're removed from this phone. Saved scans don't change. You can import the file again.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            setQuery(''); // nothing left to search
            void (what === 'items' ? clearItems() : clearParties(what === 'customers' ? 'customer' : 'supplier'));
          },
        },
      ],
    );
  }

  const openHowTo = () => setHowToOpen(true);
  const closeHowTo = () => setHowToOpen(false);
  const banner = problem ? <Banner tone="danger" text={problem} live /> : null;

  return (
    <View style={styles.root}>
      <Screen scroll={false} header={<Header title="Your lists" />}>
        <FlatList
          testID="lists-list"
          data={rows}
          keyExtractor={(r) => r.id}
          renderItem={renderRow}
          keyboardShouldPersistTaps="handled" // the clear button and the tabs take the first tap with the keyboard up
          ListHeaderComponent={
            <>
              <View style={styles.controls}>
                <Segmented label="List" options={options} value={tab} onChange={changeTab} />
                {total > 0 ? (
                  <>
                    <TextField
                      label={searchLabel}
                      placeholder={searchLabel}
                      hideLabel
                      leading={Search}
                      clearLabel="Clear the search"
                      value={query}
                      onChangeText={setQuery}
                    />
                    <View style={styles.actions}>
                      <Button label="Import CSV" variant="secondary" onPress={importCsv} />
                      <Button ref={howToButton} label="How to import" variant="text" onPress={openHowTo} />
                    </View>
                    {banner}
                  </>
                ) : null}
              </View>
              {total > 0 ? (
                <SectionHeader title={query.trim() ? `${rows.length} of ${total} ${noun}` : `${total} ${noun}`} />
              ) : null}
            </>
          }
          ListEmptyComponent={
            total === 0 ? (
              <>
                <EmptyState
                  title={EMPTY[tab].title}
                  body={EMPTY[tab].body}
                  actions={[
                    { label: 'Import CSV', onPress: importCsv },
                    { label: 'How to import', onPress: openHowTo, variant: 'text', ref: howToButton },
                  ]}
                />
                {banner ? <View style={styles.emptyBanner}>{banner}</View> : null}
              </>
            ) : undefined // a search that finds nothing: the strip says "0 of 21 customers"
          }
          ListFooterComponent={
            total > 0 ? (
              <View style={styles.clear}>
                <Button label={`Clear ${tab}`} variant="destructiveText" onPress={clear} />
              </View>
            ) : undefined
          }
          contentContainerStyle={{ paddingBottom: end }}
        />
      </Screen>
      <Sheet
        visible={howToOpen}
        title={`How to import ${tab}`}
        onClose={closeHowTo}
        returnFocus={howToButton}
        // the title row's Close, as every sheet has, and this one (ruling T18-1)
        actions={[{ label: 'Close', variant: 'secondary', onPress: closeHowTo }]}>
        <View style={styles.howTo}>
          <Text style={[type.body, styles.howToText]}>{INTRO[tab]}</Text>
          <Text style={[type.body, styles.howToText]}>{tab === 'items' ? ITEM_COLUMNS : PARTY_COLUMNS}</Text>
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // the tabs, the search, the actions and a banner on the gutter (they have no margins of their own), over the strip
  controls: { gap: space.m, paddingHorizontal: space.l, paddingVertical: space.m },
  // Import CSV at its own width, How to import beside it; at large text they wrap
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.s },
  emptyBanner: { paddingHorizontal: space.l },
  clear: { alignItems: 'center', paddingTop: space.l, paddingHorizontal: space.l },
  howTo: { gap: space.m },
  howToText: { color: colors.ink },
});
