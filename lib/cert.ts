import { type Cert2307, check2307, problems2307 } from './checks/bir2307';
import { customersOf, type Lists, packFor, type Party, partyName } from './lists';
import { rawFromScan } from './sale';
import type { StoredScan } from './scans';
import type { Settings } from './settings';

// A scan's BIR Form 2307 (page 1): its checks (lib/checks/bir2307) run on what the boxes say (the person's edits over
// the readings), with the app's rules on top: a photo, or a PDF that is a picture, gets the photo checks, but a PDF's
// typed page doesn't; and the payor is matched against the customers as a sale's customer is, but a payor left blank
// is no payor, never an invoice's walk-in.

/** How the payor stands against the customers. unlisted: there are no customers yet; none: no payor was written. */
export type PayorStatus = 'auto' | 'unsure' | 'new' | 'unlisted' | 'none';
export type CertView = {
  cert: Cert2307;
  problems: string[]; // the status card's words, in order
  payor: { status: PayorStatus; shown: string; listParty: Party | null }; // shown: the list's name when it matched
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
  const r = scan.result;
  const raw = rawFromScan(scan);
  // A typed page is no photo: only a photo or a picture can be too blurry or too dark to trust.
  const typed = r.source === 'pdf' && r.picture === false;
  const cert = check2307({ ...raw, photo: typed ? null : raw.photo }, packFor(lists));
  const { id, status } = cert.payorMatch;
  const matched = lists.parties.find((p) => p.id === id) ?? null;
  let payor: CertView['payor'];
  if (status === 'blank') {
    payor = { status: 'none', shown: cert.payor.name, listParty: null };
  } else if ((status === 'auto' || status === 'unsure') && matched) {
    payor = { status, shown: partyName(matched), listParty: matched };
  } else {
    payor = { status: customersOf(lists).length === 0 ? 'unlisted' : 'new', shown: cert.payor.name, listParty: null };
  }
  return { cert, problems: problems2307(cert), payor };
}
