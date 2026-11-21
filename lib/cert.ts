import { type Cert2307, check2307, problems2307 } from './checks/bir2307';
import { pyRound, pySum } from './checks/num';
import { monthSpan } from './format';
import { customersOf, type Lists, packFor, type Party, partyName } from './lists';
import { listColumn, rawFromScan } from './sale';
import type { StoredScan } from './scans';
import type { Settings } from './settings';

// A scan's BIR Form 2307 (page 1): its checks (lib/checks/bir2307) run on what the boxes say (the person's edits over
// the readings), with the app's rules on top: the photo checks only for a photo or a PDF that is a picture
// (rawFromScan); and the payor is matched against the customers as a sale's customer is, but a payor left blank is no
// payor, never an invoice's walk-in.

/** How the payor stands against the customers. unlisted: there are no customers yet; none: no payor was written. */
export type PayorStatus = 'auto' | 'unsure' | 'new' | 'unlisted' | 'none';
export type CertView = {
  cert: Cert2307;
  problems: string[]; // the status card's words, in order
  payor: {
    status: PayorStatus;
    shown: string; // the list's name when it matched
    listParty: Party | null; // an unsure match's is only the closest one
    column: string; // the payor in MyBizMate's 2307-CWT import; '' when there is none
  };
};

/** A scan with a certificate: a BIR Form 2307, its form found. */
export function is2307(scan: StoredScan): boolean {
  return scan.result.aligned && scan.result.form === 'bir_2307';
}

// One run of the checks per scan as it stands, as for a sale (lib/sale.ts): the stores replace a scan, the lists or
// the settings when they change, so the same objects give the same answer.
const views = new WeakMap<StoredScan, { lists: Lists; settings: Settings; view: CertView }>();

export function certOf(scan: StoredScan, lists: Lists, settings: Settings): CertView {
  const hit = views.get(scan);
  if (hit && hit.lists === lists && hit.settings === settings) return hit.view;
  const view = checkCert(scan, lists);
  views.set(scan, { lists, settings, view });
  return view;
}

function checkCert(scan: StoredScan, lists: Lists): CertView {
  const cert = check2307(rawFromScan(scan), packFor(lists));
  const { id, status } = cert.payorMatch;
  const matched = lists.parties.find((p) => p.id === id) ?? null;
  const written = cert.payor.name;
  let payor: CertView['payor'];
  if (status === 'blank') {
    payor = { status: 'none', shown: written, listParty: null, column: '' };
  } else if (status === 'auto' && matched) {
    payor = { status, shown: partyName(matched), listParty: matched, column: listColumn(matched) };
  } else if (status === 'unsure' && matched) {
    // only the closest match: what goes out is the payor as written
    payor = { status, shown: partyName(matched), listParty: matched, column: written };
  } else {
    const noCustomers = customersOf(lists).length === 0;
    payor = { status: noCustomers ? 'unlisted' : 'new', shown: written, listParty: null, column: written };
  }
  return { cert, problems: problems2307(cert), payor };
}

/** The 2307's period as Saved invoices names it: "Q4 2026", or the months it spans when it isn't one quarter. */
export function periodName(cert: Cert2307): string {
  if (cert.quarter !== null) {
    const [year, quarter] = cert.quarter.split('-');
    return `${quarter} ${year}`;
  }
  return cert.from !== null && cert.to !== null ? monthSpan(cert.from, cert.to) : '';
}

/** The tax withheld on the 2307's rows, both tables (its total rows aren't counted). */
export function taxWithheld(cert: Cert2307): number {
  return pyRound(pySum(cert.rows.map((r) => r.tax ?? 0)), 2);
}
