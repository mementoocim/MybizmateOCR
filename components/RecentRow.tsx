import { formatClock } from '../lib/format';
import { FORMS } from '../lib/forms';
import type { StoredScan } from '../lib/scans';
import { homeBadge, shownLabel, useScanCheck } from '../lib/scanState';
import { ListRow } from './ListRow';

/**
 * One of Home's recent scans (design B §9.2): where it came from ("Camera photo", a PDF's file name, "Sample 0051"),
 * when it was read and the form found ("10:24 AM · Service Invoice", or the time alone when no form was found), and
 * its one state as a badge, the state the Scan screen's strip shows (lib/scanState). Its checks run with the lists, the
 * settings and its saved summary as they are now, so the two always agree. The badge is part of the row's spoken label.
 */
export function RecentRow({ scan, onPress }: { scan: StoredScan; onPress: () => void }) {
  const { state, saved } = useScanCheck(scan);
  const time = formatClock(scan.at);
  const form = scan.result.aligned ? scan.result.form : null;
  return (
    <ListRow
      title={shownLabel(scan)}
      sub={form ? `${time} · ${FORMS[form].title}` : time}
      subMono
      subCaps
      badge={state && homeBadge(scan, state, saved)}
      onPress={onPress}
    />
  );
}
