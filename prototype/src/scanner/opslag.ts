/**
 * Opslag van scans, vondsten en beelden in IndexedDB (alleen in deze browser).
 * Eén record per BAG-pand: zo kan een pand nooit dubbel in de resultaten komen, ook niet bij overlappende scans.
 * Deze laag is bewust klein gehouden, zodat hij later kan worden vervangen door gedeelde opslag (bijv. Cloudflare D1 + R2).
 */
import type { Gebied, Kandidaat } from './gebied';
import type { Oordeel } from './oordeel';

export type PandStatus = 'wacht' | 'klaar' | 'fout';
export type Beoordeling = 'bevestigd' | 'afgewezen';

export interface PandRecord extends Kandidaat {
  scans: string[];
  status: PandStatus;
  oordeel?: Oordeel;
  toelichting?: string;
  model?: string;
  beeldjaar?: number;
  laag?: string;
  beeldBron?: string;      // WMS-URL van het beeld zonder contour
  gescand?: string;        // ISO-tijd
  fout?: string;
  beoordeling?: Beoordeling;
  beoordeeld?: string;
  tokensIn?: number;
  tokensUit?: number;
}

export interface ScanRecord {
  id: string;
  naam: string;
  gebied: Gebied;
  minOpp: number;
  gemaakt: string;
  pandIds: string[];        // in scanvolgorde (prioriteit)
  status: 'nieuw' | 'bezig' | 'gestopt' | 'klaar';
}

const DB = 'icn-dakscanner';
let dbBelofte: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbBelofte ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('scans', { keyPath: 'id' });
      const p = d.createObjectStore('panden', { keyPath: 'id' });
      p.createIndex('status', 'status');
      d.createObjectStore('beelden');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbBelofte;
}

function verzoek<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}

async function winkel(naam: string, modus: IDBTransactionMode = 'readonly') {
  return (await db()).transaction(naam, modus).objectStore(naam);
}

export async function alleScans(): Promise<ScanRecord[]> {
  const s = await verzoek((await winkel('scans')).getAll() as IDBRequest<ScanRecord[]>);
  return s.sort((a, b) => b.gemaakt.localeCompare(a.gemaakt));
}
export async function scan(id: string) { return verzoek((await winkel('scans')).get(id) as IDBRequest<ScanRecord | undefined>); }
export async function bewaarScan(s: ScanRecord) { await verzoek((await winkel('scans', 'readwrite')).put(s)); }
export async function verwijderScan(id: string) { await verzoek((await winkel('scans', 'readwrite')).delete(id)); }

export async function pand(id: string) { return verzoek((await winkel('panden')).get(id) as IDBRequest<PandRecord | undefined>); }
export async function allePanden(): Promise<PandRecord[]> { return verzoek((await winkel('panden')).getAll() as IDBRequest<PandRecord[]>); }
export async function bewaarPand(p: PandRecord) { await verzoek((await winkel('panden', 'readwrite')).put(p)); }

/**
 * Nieuwe kandidaten toevoegen aan een scan. Panden die al bestaan (uit een eerdere scan) houden hun uitkomst en beoordeling;
 * ze krijgen alleen de scan erbij. Geeft het aantal panden terug dat al eerder bekeken was.
 */
export async function voegKandidatenToe(scanId: string, kandidaten: Kandidaat[]): Promise<number> {
  const w = (await db()).transaction('panden', 'readwrite').objectStore('panden');
  let bekend = 0;
  await Promise.all(kandidaten.map(async (k) => {
    const oud = await verzoek(w.get(k.id) as IDBRequest<PandRecord | undefined>);
    if (oud) {
      if (oud.status === 'klaar') bekend++;
      if (!oud.scans.includes(scanId)) oud.scans.push(scanId);
      await verzoek(w.put(oud));
    } else {
      await verzoek(w.put({ ...k, scans: [scanId], status: 'wacht' } satisfies PandRecord));
    }
  }));
  return bekend;
}

export async function bewaarBeeld(pandId: string, blob: Blob) { await verzoek((await winkel('beelden', 'readwrite')).put(blob, pandId)); }
export async function beeld(pandId: string) { return verzoek((await winkel('beelden')).get(pandId) as IDBRequest<Blob | undefined>); }

/** Vraagt de browser om de opslag niet op te ruimen bij ruimtegebrek (niet elke browser honoreert dit). */
export async function vraagBlijvendeOpslag(): Promise<boolean> {
  try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
}
export async function opslagGebruik(): Promise<number | null> {
  try { return (await navigator.storage?.estimate?.())?.usage ?? null; } catch { return null; }
}
