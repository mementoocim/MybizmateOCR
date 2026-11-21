import { File } from 'expo-file-system';
import { useRef, useState, useSyncExternalStore } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';

import { OutlinedButton, TextButton } from '../components/Buttons';
import { Segmented } from '../components/Segmented';
import { Sheet } from '../components/Sheet';
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
  lists,
  type Party,
  partyName,
  subscribeLists,
  suppliersOf,
} from '../lib/lists';
import { bold, colors } from '../lib/theme';
import { toast } from '../lib/toast';
import { releaseAccess } from '../modules/scanner';

// Your lists: the customers, suppliers and items the checks use, imported from CSV files (MyBizMate's export, saved as
// CSV in Excel or Google Sheets). They stay on this phone.

type Tab = 'customers' | 'suppliers' | 'items';
type Row = { id: string; name: string; line: string };

const INTRO: Record<Tab, string> = {
  customers:
    "Your scans' customers are matched against these names and TINs. In MyBizMate, export your parties, open the file in Excel or Google Sheets, save it as CSV, then import it here.",
  suppliers: 'The suppliers you choose from when you save a purchase. Import them the same way as customers.',
  items: 'Your items and their list prices. A row whose price is far from its list price is marked to check.',
};
const EMPTY: Record<Tab, string> = {
  customers: 'No customers yet.',
  suppliers: 'No suppliers yet.',
  items: 'No items yet.',
};
const PARTY_COLUMNS =
  "The first row names the columns, as in MyBizMate's Parties import: Code, Type, Entity type, Registered name, Last name, First name, Middle name, Trade name, TIN, Sub-street, Street, Barangay, City / Municipality, Province, ZIP, VAT status and Payment terms. Other columns are skipped. Contact numbers and emails are never kept.";
const ITEM_COLUMNS = 'The first row names the columns: Name, Unit and Price.';

// Android's Downloads can hand over a link that doesn't carry the file's name (content://…/document/msf%3A123), so a
// file is a CSV by its name or by the type the phone gives it.
const CSV_TYPES = ['text/csv', 'text/comma-separated-values', 'application/csv', 'text/x-csv'];

function isCsv(file: { name: string; type: string | null }): boolean {
  const type = (file.type ?? '').split(';')[0].trim().toLowerCase();
  return file.name.toLowerCase().endsWith('.csv') || CSV_TYPES.includes(type);
}

const counted = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const skipped = (s: ImportSummary) => (s.skipped > 0 ? ` ${counted(s.skipped, 'row', 'rows')} skipped: no name.` : '');

/** Under a party's name: its TIN and code, or, with no code, that it came from a scan (and whether it went out since). */
function partyLine(p: Party): string {
  const parts: string[] = [];
  if (p.tin) parts.push(`TIN ${formatTin(p.tin)}`);
  if (p.code) parts.push(p.code);
  else if (p.fromScan) parts.push(p.exportedAt ? 'sent in a Parties file' : 'added from a scan');
  return parts.join(' · ');
}

function itemLine(i: ListItem): string {
  return [i.unit, i.price === null ? '' : peso(i.price)].filter((part) => part !== '').join(' · ');
}

export default function ListsScreen() {
  const theLists = useSyncExternalStore(subscribeLists, lists);
  const [tab, setTab] = useState<Tab>('customers');
  const [columnsOpen, setColumnsOpen] = useState(false);
  const picking = useRef(false); // two quick presses open one picker
  const customers = customersOf(theLists);
  const suppliers = suppliersOf(theLists);
  const rows: Row[] =
    tab === 'items'
      ? theLists.items.map((i) => ({ id: i.id, name: i.name, line: itemLine(i) }))
      : (tab === 'customers' ? customers : suppliers).map((p) => ({ id: p.id, name: partyName(p), line: partyLine(p) }));
  const options: { value: Tab; label: string }[] = [
    { value: 'customers', label: `Customers (${customers.length})` },
    { value: 'suppliers', label: `Suppliers (${suppliers.length})` },
    { value: 'items', label: `Items (${theLists.items.length})` },
  ];

  async function importCsv() {
    if (picking.current) return;
    picking.current = true;
    const into = tab;
    let file: File | null = null;
    try {
      const picked = await File.pickFileAsync({ mimeTypes: ['*/*'] });
      if (picked.canceled) return;
      file = picked.result;
      if (!isCsv(picked.result)) {
        toast('Choose a .csv file. In Excel or Google Sheets, save or download the sheet as CSV.');
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
      if (!(e instanceof ListImportError)) toast("Couldn't read that file.");
      else if (into === 'items') toast('That file has no Name column.');
      else {
        toast(
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
    Alert.alert(`Clear all ${what}?`, "They're removed from this phone only.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => void (what === 'items' ? clearItems() : clearParties(what === 'customers' ? 'customer' : 'supplier')),
      },
    ]);
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <Segmented options={options} value={tab} onChange={setTab} />
            <Text style={styles.intro}>{INTRO[tab]}</Text>
            <OutlinedButton label="Import CSV" onPress={() => void importCsv()} />
            <View style={styles.columnsButton}>
              <TextButton label="Which columns?" onPress={() => setColumnsOpen(true)} />
            </View>
          </View>
        }
        ListEmptyComponent={<Text style={styles.empty}>{EMPTY[tab]}</Text>}
        renderItem={({ item, index }) => (
          <View style={[styles.row, index === 0 && styles.first, index === rows.length - 1 && styles.last]}>
            <Text style={styles.name}>{item.name}</Text>
            {item.line !== '' && <Text style={styles.line}>{item.line}</Text>}
          </View>
        )}
        ListFooterComponent={
          rows.length > 0 ? (
            <View style={styles.clear}>
              <TextButton label={`Clear ${tab}`} color={colors.ember} onPress={clear} />
            </View>
          ) : undefined
        }
      />
      <Sheet
        visible={columnsOpen}
        title={tab === 'items' ? 'Columns for items' : 'Columns for customers and suppliers'}
        onClose={() => setColumnsOpen(false)}>
        <Text style={styles.columns}>{tab === 'items' ? ITEM_COLUMNS : PARTY_COLUMNS}</Text>
        <TextButton label="Close" onPress={() => setColumnsOpen(false)} />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingBottom: 32 },
  header: { gap: 12, marginBottom: 16 },
  intro: { fontSize: 15, color: colors.mute, lineHeight: 22 },
  columnsButton: { alignItems: 'center' },
  empty: { fontSize: 15, color: colors.mute, textAlign: 'center', marginTop: 8 },
  row: {
    backgroundColor: colors.panel,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  first: { borderTopWidth: 1, borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  last: { borderBottomWidth: 1, borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },
  name: { ...bold, fontSize: 15, color: colors.ink },
  line: { fontSize: 13, color: colors.mute, marginTop: 2 },
  clear: { alignItems: 'center', marginTop: 16 },
  columns: { fontSize: 15, color: colors.ink, lineHeight: 22, marginBottom: 12 },
});
