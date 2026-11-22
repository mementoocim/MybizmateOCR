/** A time the way the test app shows it: "57 ms" under a second, else "1.4 s". */
export function formatMs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/** A clock time: "2:41 PM". */
export function formatClock(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const thousands = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * An amount in a row, without the peso sign (design §6): "5,810.50", "-12.30"; "—" when there's none. By hand:
 * Hermes' Intl can differ.
 */
export function amount(v: number | null): string {
  if (v === null) return '—';
  const [whole, cents] = Math.abs(v).toFixed(2).split('.');
  return `${v < 0 ? '-' : ''}${thousands(whole)}.${cents}`;
}

/** An amount as a total or in a summary, as the test app shows it: "₱1,575.00"; "—" when there's none. */
export function peso(v: number | null): string {
  if (v === null) return '—';
  return `${v < 0 ? '-' : ''}₱${amount(Math.abs(v))}`;
}

/** A quantity with up to 2 decimals and thousands commas: "1,500", "0.5", "0.33"; "?" when there's none. */
export function qty(v: number | null): string {
  if (v === null) return '?';
  const [whole, decimals = ''] = Math.abs(v).toFixed(2).replace(/\.?0+$/, '').split('.');
  return `${v < 0 ? '-' : ''}${thousands(whole)}${decimals ? `.${decimals}` : ''}`;
}

/** An ISO date as "Oct 21, 2026". */
export function prettyDate(iso: string | null): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** An ISO date as a short date: "Nov 22". */
export function monthDay(isoDate: string): string {
  const [, m, d] = isoDate.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

/** The months from one ISO date to another: "Oct–Dec 2026", "Oct 2026", "Dec 2025–Feb 2026". */
export function monthSpan(from: string, to: string): string {
  const [fromYear, fromMonth] = from.split('-').map(Number);
  const [toYear, toMonth] = to.split('-').map(Number);
  const [first, last] = [MONTHS[fromMonth - 1], MONTHS[toMonth - 1]];
  if (fromYear !== toYear) return `${first} ${fromYear}–${last} ${toYear}`;
  return fromMonth === toMonth ? `${last} ${toYear}` : `${first}–${last} ${toYear}`;
}
