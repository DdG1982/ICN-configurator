/**
 * Gebouwen in een gebied ophalen uit de BAG (PDOK WFS), met adressen uit de verblijfsobjecten.
 * Zelfde bronnen als de live dakmodule (src/live/bronnen.ts), maar dan voor een heel gebied en met paginering.
 */
import { puntInVeelhoek } from '../live/geo';

const BAG_WFS = 'https://service.pdok.nl/lv/bag/wfs/v2_0';
const PAGINA = 1000;
export const MAX_STRAAL = 10000;     // m
export const MAX_OPPERVLAK = 320e6;  // m², ca. een cirkel met straal 10 km
const TEGEL = 2000;                  // m: grote gebieden halen we per tegel op, zodat geen enkele vraag aan de BAG te groot wordt
const TEGELS_TEGELIJK = 3;
const ADRES_ZOEKSTRAAL = 150;        // m, voor het dichtstbijzijnde adres bij een pand zonder eigen adres

export type Gebied =
  | { soort: 'rechthoek'; x0: number; y0: number; x1: number; y1: number }
  | { soort: 'cirkel'; x: number; y: number; r: number; naam?: string };

/** Hoe de BAG het pand beschrijft. Bewust geen 'agrarisch': dat staat niet in de BAG en verzinnen we niet. */
export type PandSoort = 'bijgebouw' | 'bedrijf' | 'gemengd' | 'woning';

export interface Kandidaat {
  id: string;
  footprint: [number, number][];
  opp: number;          // m², grondvlak volgens BAG
  x: number; y: number; // zwaartepunt (RD)
  bouwjaar: number;
  gebruiksdoel: string;
  eenheden: number;
  soort: PandSoort;
  adres?: string;
  adresSoort: 'eigen' | 'nabij' | 'geen';
  adresAfstand?: number; // m, alleen bij 'nabij'
}

export class NetFout extends Error {
  constructor(public bron: string, bericht: string) { super(bericht); }
}

export async function haalJson<T>(url: string, bron: string, signaal?: AbortSignal, pogingen = 3): Promise<T> {
  let laatste: unknown;
  for (let p = 0; p < pogingen; p++) {
    try {
      const r = await fetch(url, { signal: signaal });
      if (r.ok) return await r.json() as T;
      laatste = new Error(`HTTP ${r.status}`);
      if (r.status >= 400 && r.status < 500 && r.status !== 429) break;
    } catch (e) {
      if (signaal?.aborted) throw e;
      laatste = e;
    }
    await new Promise((res) => setTimeout(res, 700 * 2 ** p));
  }
  throw new NetFout(bron, `${bron} niet bereikbaar (${laatste instanceof Error ? laatste.message : String(laatste)})`);
}

export function bbox(g: Gebied): [number, number, number, number] {
  return g.soort === 'rechthoek'
    ? [Math.min(g.x0, g.x1), Math.min(g.y0, g.y1), Math.max(g.x0, g.x1), Math.max(g.y0, g.y1)]
    : [g.x - g.r, g.y - g.r, g.x + g.r, g.y + g.r];
}

export function oppervlakGebied(g: Gebied): number {
  if (g.soort === 'cirkel') return Math.PI * g.r ** 2;
  const [x0, y0, x1, y1] = bbox(g);
  return (x1 - x0) * (y1 - y0);
}

export function binnenGebied(g: Gebied, x: number, y: number): boolean {
  if (g.soort === 'cirkel') return (x - g.x) ** 2 + (y - g.y) ** 2 <= g.r ** 2;
  const [x0, y0, x1, y1] = bbox(g);
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

export function controleerGebied(g: Gebied): string | null {
  if (g.soort === 'cirkel' && g.r > MAX_STRAAL) return `De straal is hooguit ${MAX_STRAAL / 1000} km.`;
  if (oppervlakGebied(g) > MAX_OPPERVLAK) return `Het gebied is te groot (hooguit ${MAX_OPPERVLAK / 1e6} km²). Kies een kleiner gebied.`;
  if (oppervlakGebied(g) < 100) return 'Het gebied is te klein.';
  return null;
}

/** Grondvlak (m²) en zwaartepunt van een ring. */
export function vlakEnMidden(ring: [number, number][]): { opp: number; x: number; y: number } {
  const p = ring.length > 1 && ring[0][0] === ring.at(-1)![0] && ring[0][1] === ring.at(-1)![1] ? ring.slice(0, -1) : ring;
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i], [x1, y1] = p[(i + 1) % p.length];
    const k = x0 * y1 - x1 * y0;
    a += k; cx += (x0 + x1) * k; cy += (y0 + y1) * k;
  }
  if (Math.abs(a) < 1e-9) return { opp: 0, x: p[0][0], y: p[0][1] };
  const x = cx / (3 * a), y = cy / (3 * a);
  // Bij een L- of U-vorm kan het zwaartepunt buiten het pand liggen: neem dan het hoekpuntgemiddelde als dat wel binnen ligt.
  if (!puntInVeelhoek(x, y, p)) {
    const mx = p.reduce((s, q) => s + q[0], 0) / p.length, my = p.reduce((s, q) => s + q[1], 0) / p.length;
    if (puntInVeelhoek(mx, my, p)) return { opp: Math.abs(a) / 2, x: mx, y: my };
  }
  return { opp: Math.abs(a) / 2, x, y };
}

/** Rond bouwwerk (silo, mestsilo, tank)? Veel hoekpunten en bijna cirkelvormig. Daar liggen geen panelen op. */
export function isRond(ring: [number, number][]): boolean {
  if (ring.length < 13) return false;
  const { opp } = vlakEnMidden(ring);
  let omtrek = 0;
  for (let i = 1; i < ring.length; i++) omtrek += Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]);
  return omtrek > 0 && (4 * Math.PI * opp) / omtrek ** 2 > 0.9;
}

export function pandSoort(gebruiksdoel: string, eenheden: number): PandSoort {
  const doelen = gebruiksdoel.split(',').map((d) => d.trim()).filter(Boolean);
  if (!doelen.length || eenheden === 0) return 'bijgebouw';
  const wonen = doelen.includes('woonfunctie');
  if (wonen && doelen.length === 1) return 'woning';
  return wonen ? 'gemengd' : 'bedrijf';
}

export const SOORT_TEKST: Record<PandSoort, string> = {
  bijgebouw: 'Bijgebouw (geen verblijfsobject in BAG)',
  bedrijf: 'Niet-woonfunctie',
  gemengd: 'Woning met andere functie',
  woning: 'Woning',
};

/** Volgorde: eerst panden zonder woonfunctie (schuren, stallen, bedrijfshallen), dan gemengd, dan woningen; binnen elke groep groot eerst. */
const GROEP: Record<PandSoort, number> = { bijgebouw: 0, bedrijf: 0, gemengd: 1, woning: 2 };
export function sorteer(k: Kandidaat[]): Kandidaat[] {
  return [...k].sort((a, b) => GROEP[a.soort] - GROEP[b.soort] || b.opp - a.opp);
}

type Feature<P> = { properties: P; geometry: { type: string; coordinates: unknown } };

async function allePagina<P>(type: string, bb: number[], signaal?: AbortSignal, voortgang?: (n: number) => void): Promise<Feature<P>[]> {
  const uit: Feature<P>[] = [];
  for (let start = 0; ; start += PAGINA) {
    const u = `${BAG_WFS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${type}&outputFormat=application/json`
      + `&srsName=EPSG:28992&count=${PAGINA}&startIndex=${start}&sortBy=identificatie&bbox=${bb.join(',')},EPSG:28992`;
    const d = await haalJson<{ features: Feature<P>[] }>(u, 'BAG', signaal);
    uit.push(...d.features);
    voortgang?.(uit.length);
    if (d.features.length < PAGINA) return uit;
    if (start > 50000) throw new NetFout('BAG', 'Te veel gebouwen in dit gebied. Kies een kleiner gebied.');
  }
}

interface PandProps { identificatie: string; bouwjaar: number; status: string; gebruiksdoel?: string; aantal_verblijfsobjecten?: number }
interface VboProps { openbare_ruimte: string; huisnummer: number; huisletter?: string; toevoeging?: string; postcode: string; woonplaats: string; pandidentificatie: string }

const adresTekst = (p: VboProps) =>
  `${p.openbare_ruimte} ${p.huisnummer}${p.huisletter ?? ''}${p.toevoeging ? `-${p.toevoeging}` : ''}, ${p.postcode.replace(/(\d{4})([A-Z]{2})/, '$1 $2')} ${p.woonplaats}`;

/**
 * Alle panden in het gebied (status 'in gebruik' of 'verbouwing'), met grondvlak, soort en adres.
 * Panden kleiner dan minOpp vallen af. Het adres komt uit de verblijfsobjecten; heeft een pand er geen
 * (schuur, stal), dan noemen we het dichtstbijzijnde adres binnen 150 m en zeggen we erbij dat het niet van dit pand is.
 */
/** Tegels van hooguit 2 × 2 km die het gebied bedekken (bij een cirkel alleen tegels die de cirkel raken). */
export function tegels(g: Gebied): [number, number, number, number][] {
  const [x0, y0, x1, y1] = bbox(g);
  const uit: [number, number, number, number][] = [];
  for (let x = x0; x < x1; x += TEGEL) {
    for (let y = y0; y < y1; y += TEGEL) {
      const t: [number, number, number, number] = [x, y, Math.min(x + TEGEL, x1), Math.min(y + TEGEL, y1)];
      if (g.soort === 'cirkel') {
        const dx = Math.max(t[0] - g.x, 0, g.x - t[2]), dy = Math.max(t[1] - g.y, 0, g.y - t[3]);
        if (dx * dx + dy * dy > g.r * g.r) continue;
      }
      uit.push(t);
    }
  }
  return uit;
}

/** Voert werk per tegel uit, een paar tegelijk. */
async function perTegel<T>(ts: T[], werk: (t: T) => Promise<void>, signaal?: AbortSignal) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(TEGELS_TEGELIJK, ts.length) }, async () => {
    while (i < ts.length) {
      if (signaal?.aborted) throw new DOMException('Afgebroken', 'AbortError');
      await werk(ts[i++]);
    }
  }));
}

export async function pandenInGebied(g: Gebied, minOpp: number, signaal?: AbortSignal, voortgang?: (t: string) => void, rondOverslaan = true): Promise<{ kandidaten: Kandidaat[]; totaal: number; rond: number }> {
  const ts = tegels(g);
  let klaar = 0, totaal = 0, rond = 0;
  type Ruw = { p: PandProps; ring: [number, number][]; opp: number; x: number; y: number; tegel: number };
  const groot: Ruw[] = [];
  voortgang?.('Gebouwen ophalen uit de BAG…');
  await perTegel(ts.map((t, i) => ({ t, i })), async ({ t, i }) => {
    const fs = await allePagina<PandProps>('bag:pand', t, signaal);
    for (const f of fs) {
      if (!/in gebruik|verbouwing/i.test(f.properties.status ?? '')) continue;
      const c = f.geometry.coordinates as number[][][] | number[][][][];
      const ring = (f.geometry.type === 'MultiPolygon' ? (c as number[][][][])[0][0] : (c as number[][][])[0]).map((q) => [q[0], q[1]] as [number, number]);
      const { opp, x, y } = vlakEnMidden(ring);
      // Elk pand hoort bij precies één tegel (die waarin het zwaartepunt ligt): zo tellen randpanden niet dubbel.
      if (x < t[0] || x >= t[2] || y < t[1] || y >= t[3] || !binnenGebied(g, x, y)) continue;
      totaal++;
      if (opp < minOpp) continue;
      if (rondOverslaan && isRond(ring)) { rond++; continue; }
      groot.push({ p: f.properties, ring, opp, x, y, tegel: i });
    }
    klaar++;
    voortgang?.(`Gebouwen ophalen uit de BAG… ${ts.length > 1 ? `tegel ${klaar} van ${ts.length} · ` : ''}${totaal.toLocaleString('nl-NL')} panden`);
  }, signaal);

  // Adressen alleen ophalen voor tegels met kandidaten, met 150 m marge.
  const metKandidaat = [...new Set(groot.map((r) => r.tegel))].map((i) => ts[i]);
  const perPand = new Map<string, string[]>();
  const gezien = new Set<string>();
  const raster = new Map<string, { x: number; y: number; tekst: string }[]>();
  const cel = (x: number, y: number) => `${Math.floor(x / ADRES_ZOEKSTRAAL)},${Math.floor(y / ADRES_ZOEKSTRAAL)}`;
  klaar = 0;
  voortgang?.('Adressen ophalen…');
  await perTegel(metKandidaat, async (t) => {
    const m = ADRES_ZOEKSTRAAL;
    const vbos = await allePagina<VboProps & { identificatie?: string }>('bag:verblijfsobject', [t[0] - m, t[1] - m, t[2] + m, t[3] + m], signaal);
    for (const v of vbos) {
      const id = String(v.properties.identificatie ?? '');
      if (id && gezien.has(id)) continue;
      if (id) gezien.add(id);
      const [x, y] = v.geometry.coordinates as number[];
      const tekst = adresTekst(v.properties);
      for (const pid of String(v.properties.pandidentificatie ?? '').split(',').map((q) => q.trim()).filter(Boolean)) {
        if (!perPand.has(pid)) perPand.set(pid, []);
        perPand.get(pid)!.push(tekst);
      }
      const k = cel(x, y);
      if (!raster.has(k)) raster.set(k, []);
      raster.get(k)!.push({ x, y, tekst });
    }
    klaar++;
    voortgang?.(`Adressen ophalen… ${metKandidaat.length > 1 ? `tegel ${klaar} van ${metKandidaat.length}` : ''}`);
  }, signaal);

  /** Dichtstbijzijnde adres binnen 150 m, via een raster van 150 m (alleen de 9 cellen eromheen). */
  const dichtsbij = (x: number, y: number) => {
    const cx = Math.floor(x / ADRES_ZOEKSTRAAL), cy = Math.floor(y / ADRES_ZOEKSTRAAL);
    let beste: { d: number; tekst: string } | null = null;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const q of raster.get(`${cx + dx},${cy + dy}`) ?? []) {
        const d = Math.hypot(q.x - x, q.y - y);
        if (d <= ADRES_ZOEKSTRAAL && (!beste || d < beste.d)) beste = { d, tekst: q.tekst };
      }
    }
    return beste;
  };

  const kandidaten: Kandidaat[] = groot.map(({ p, ring, opp, x, y }) => {
    const eenheden = Number(p.aantal_verblijfsobjecten ?? 0);
    const k: Kandidaat = {
      id: String(p.identificatie), footprint: ring.map(([a, b]) => [Math.round(a * 100) / 100, Math.round(b * 100) / 100]),
      opp: Math.round(opp), x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100,
      bouwjaar: Number(p.bouwjaar) || 0, gebruiksdoel: String(p.gebruiksdoel ?? ''), eenheden,
      soort: pandSoort(String(p.gebruiksdoel ?? ''), eenheden), adresSoort: 'geen',
    };
    const eigen = perPand.get(k.id);
    if (eigen?.length) {
      k.adres = eigen.length > 1 ? `${eigen[0]} (+${eigen.length - 1} adres${eigen.length > 2 ? 'sen' : ''})` : eigen[0];
      k.adresSoort = 'eigen';
    } else {
      const beste = dichtsbij(x, y);
      if (beste) { k.adres = beste.tekst; k.adresSoort = 'nabij'; k.adresAfstand = Math.round(beste.d); }
    }
    return k;
  });
  return { kandidaten: sorteer(kandidaten), totaal, rond };
}
