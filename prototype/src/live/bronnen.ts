/**
 * Open bronnen voor het live dakmodel. Alles behalve PVGIS mag rechtstreeks vanuit de browser (CORS: *).
 * PVGIS stuurt geen CORS-headers en loopt daarom via onze eigen functie /api/pvgis (met 30 dagen cache).
 */
import { fromArrayBuffer } from 'geotiff';
import type { Raster } from './hoogte';
import { schoon } from './hoogte';
import { afstandTotRand, puntInVeelhoek } from './geo';

const LOCATIE = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1';
const BAG_WFS = 'https://service.pdok.nl/lv/bag/wfs/v2_0';
const RCE_WFS = 'https://service.pdok.nl/rce/ps-ch/wfs/v1_0';
const AHN_WCS = 'https://service.pdok.nl/rws/ahn/wcs/v1_0';
const LUCHTFOTO_WMS = 'https://service.pdok.nl/hwh/luchtfotorgb/wms/v1_0';
const DRIEDBAG = 'https://api.3dbag.nl/collections/pand/items';

export class BronFout extends Error {
  constructor(public bron: string, bericht: string) { super(bericht); }
}

async function haal(url: string, bron: string, pogingen = 3): Promise<Response> {
  let laatste: unknown;
  for (let p = 0; p < pogingen; p++) {
    try {
      const r = await fetch(url);
      if (r.ok) return r;
      laatste = new Error(`HTTP ${r.status}`);
      if (r.status >= 400 && r.status < 500 && r.status !== 429) break;
    } catch (e) { laatste = e; }
    await new Promise((res) => setTimeout(res, 600 * 2 ** p));
  }
  throw new BronFout(bron, `${bron} niet bereikbaar (${laatste instanceof Error ? laatste.message : String(laatste)})`);
}
const json = async <T>(url: string, bron: string) => (await haal(url, bron)).json() as Promise<T>;
const punt = (wkt: string) => (wkt.match(/[-\d.]+/g) ?? []).map(Number);

/* ---------------------------------------------------------------- PDOK Locatieserver */
export interface Suggestie { id: string; label: string }

export async function suggesties(q: string, signaal?: AbortSignal): Promise<Suggestie[]> {
  const u = `${LOCATIE}/suggest?q=${encodeURIComponent(q)}&fq=type:adres&rows=7`;
  const r = await fetch(u, { signal: signaal });
  if (!r.ok) throw new BronFout('PDOK Locatieserver', `HTTP ${r.status}`);
  const d = await r.json() as { response: { docs: { id: string; weergavenaam: string }[] } };
  return d.response.docs.map((x) => ({ id: x.id, label: x.weergavenaam }));
}

export interface AdresInfo { id: string; label: string; provincie: string; x: number; y: number; lat: number; lon: number; vboId: string }

export async function adresOpzoeken(id: string): Promise<AdresInfo> {
  const d = await json<{ response: { docs: Record<string, string>[] } }>(
    `${LOCATIE}/lookup?id=${encodeURIComponent(id)}&fl=id,weergavenaam,provincienaam,centroide_rd,centroide_ll,adresseerbaarobject_id`, 'PDOK Locatieserver');
  const doc = d.response.docs[0];
  if (!doc) throw new BronFout('adres', 'We vinden dit adres niet in het adressenregister. Controleer de link of zoek het adres opnieuw.');
  const [x, y] = punt(doc.centroide_rd), [lon, lat] = punt(doc.centroide_ll);
  return { id, label: doc.weergavenaam, provincie: doc.provincienaam, x, y, lat, lon, vboId: doc.adresseerbaarobject_id };
}

/* ---------------------------------------------------------------- BAG */
export interface BagPand { id: string; bouwjaar: number; gebruiksdoel: string; eenheden: number; footprint: [number, number][] }

export async function bagPand(x: number, y: number): Promise<BagPand | null> {
  const u = `${BAG_WFS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=bag:pand&outputFormat=application/json`
    + `&srsName=EPSG:28992&bbox=${x - 0.5},${y - 0.5},${x + 0.5},${y + 0.5},EPSG:28992`;
  const d = await json<{ features: { properties: Record<string, unknown>; geometry: { type: string; coordinates: number[][][] | number[][][][] } }[] }>(u, 'BAG');
  if (!d.features.length) return null;
  const opties = d.features.map((f) => {
    const ring = (f.geometry.type === 'MultiPolygon' ? (f.geometry.coordinates as number[][][][])[0][0] : (f.geometry.coordinates as number[][][])[0])
      .map((p) => [p[0], p[1]] as [number, number]);
    const p = f.properties;
    return { id: String(p.identificatie), bouwjaar: Number(p.bouwjaar), gebruiksdoel: String(p.gebruiksdoel ?? ''), eenheden: Number(p.aantal_verblijfsobjecten ?? 1), footprint: ring };
  });
  // Bij meerdere panden: het pand waar het adrespunt in ligt.
  return opties.find((o) => puntInVeelhoek(x, y, o.footprint)) ?? opties[0];
}

/**
 * Rijksmonument? Kijkt of er een monumentpunt van de RCE in het pand ligt (of hooguit 0,5 m erbuiten).
 * Krap gehouden zodat het monument van de buren in een rij niet meetelt. Gemeentelijke monumenten en
 * beschermde gezichten zitten niet in deze laag.
 */
export async function isRijksmonument(footprint: [number, number][]): Promise<boolean> {
  const xs = footprint.map((p) => p[0]), ys = footprint.map((p) => p[1]);
  const bbox = [Math.min(...xs) - 1.5, Math.min(...ys) - 1.5, Math.max(...xs) + 1.5, Math.max(...ys) + 1.5];
  const u = `${RCE_WFS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=ps-ch:rce_inspire_points&outputFormat=application/json`
    + `&count=20&bbox=${bbox.join(',')},EPSG:28992`;
  const d = await json<{ features: { geometry: { coordinates: number[] }; properties: { namespace?: string } }[] }>(u, 'Rijksmonumentenregister');
  return d.features.some((f) => {
    const [px, py] = f.geometry.coordinates;
    return /rijksmonument/.test(f.properties.namespace ?? '') && (puntInVeelhoek(px, py, footprint) || afstandTotRand(px, py, footprint) < 0.5);
  });
}

/* ---------------------------------------------------------------- 3DBAG */
export interface Transform { scale: number[]; translate: number[] }
export interface CityObject { type: string; attributes?: Record<string, unknown>; geometry?: { lod?: string; boundaries: unknown; semantics?: { surfaces: { type: string }[]; values: (number | null)[][] } }[] }
export interface CityFeature { id: string; CityObjects: Record<string, CityObject>; vertices: number[][] }

/** Alle panden binnen r m, met de transform van de eigen pagina (die verschilt per pagina). */
export async function panden3dbag(x: number, y: number, r: number): Promise<{ f: CityFeature; tr: Transform }[]> {
  let url: string | undefined = `${DRIEDBAG}?bbox=${x - r},${y - r},${x + r},${y + r}&limit=50`;
  const uit: { f: CityFeature; tr: Transform }[] = [];
  while (url && uit.length <= 500) {
    const d: { metadata: { transform: Transform }; features: CityFeature[]; links?: { rel: string; href: string }[] } = await json(url, '3DBAG');
    for (const f of d.features) uit.push({ f, tr: d.metadata.transform });
    url = d.links?.find((l) => l.rel === 'next')?.href;
  }
  return uit;
}

/* ---------------------------------------------------------------- AHN */
export async function ahn(dekking: 'dsm_05m' | 'dtm_05m', ox: number, oy: number, r: number): Promise<Raster> {
  const u = `${AHN_WCS}?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=${dekking}`
    + `&SUBSET=x(${ox - r},${ox + r})&SUBSET=y(${oy - r},${oy + r})&FORMAT=image/tiff`;
  const buf = await (await haal(u, 'AHN')).arrayBuffer();
  const tiff = await fromArrayBuffer(buf);
  const beeld = await tiff.getImage();
  const n = beeld.getWidth();
  const [band] = await beeld.readRasters();
  return { n, px: (2 * r) / n, ox, oy, r, data: schoon(band as ArrayLike<number>) };
}

/* ---------------------------------------------------------------- luchtfoto */
export function luchtfotoUrl(x: number, y: number, half: number, px: number): string {
  return `${LUCHTFOTO_WMS}?service=WMS&version=1.3.0&request=GetMap&layers=Actueel_orthoHR&styles=&crs=EPSG:28992`
    + `&bbox=${x - half},${y - half},${x + half},${y + half}&width=${px}&height=${px}&format=image/jpeg`;
}

/* ---------------------------------------------------------------- PVGIS */
export type Pvgis = (lat: number, lon: number, helling: number, aspect: number) => Promise<number>;

/**
 * Afgeronde invoer, zodat de cache vaak raakt en er weinig losse vragen nodig zijn:
 * 0,01 graad (~1 km) voor de plek en 5 graden voor helling en oriëntatie (scheelt hooguit ca. 1% opbrengst).
 */
export function pvgisSleutel(lat: number, lon: number, helling: number, aspect: number) {
  const r5 = (x: number) => Math.round(x / 5) * 5;
  return `lat=${lat.toFixed(2)}&lon=${lon.toFixed(2)}&angle=${Math.max(0, r5(helling))}&aspect=${r5(aspect)}`;
}

/** PVGIS met cache en hooguit een paar vragen tegelijk (PVGIS staat 30 per seconde toe). */
export function maakPvgis(vraag: (sleutel: string) => Promise<number>, tegelijk = 4): Pvgis {
  const cache = new Map<string, Promise<number>>();
  let bezig = 0;
  const wachtrij: (() => void)[] = [];
  const beurt = () => new Promise<void>((r) => { if (bezig < tegelijk) { bezig++; r(); } else wachtrij.push(() => { bezig++; r(); }); });
  const klaar = () => { bezig--; wachtrij.shift()?.(); };
  return (lat, lon, helling, aspect) => {
    const k = pvgisSleutel(lat, lon, helling, aspect);
    if (!cache.has(k)) {
      cache.set(k, beurt().then(() => vraag(k)).finally(klaar).then((ey) => {
        if (typeof ey !== 'number' || !Number.isFinite(ey)) throw new BronFout('PVGIS', 'Onverwacht antwoord');
        return ey;
      }));
    }
    return cache.get(k)!;
  };
}

/** Via onze eigen functie (browser): /api/pvgis geeft { ey } terug. */
export const pvgisViaProxy = (basis: string) => maakPvgis((k) => json<{ ey: number }>(`${basis}?${k}`, 'PVGIS').then((d) => d.ey));

/** Rechtstreeks (Node-scripts, Cloudflare-functie). */
export const PVGIS_URL = 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc';
export const pvgisDirect = () => maakPvgis((k) =>
  json<{ outputs: { totals: { fixed: { E_y: number } } } }>(`${PVGIS_URL}?${k}&peakpower=1&loss=14&outputformat=json`, 'PVGIS').then((d) => d.outputs.totals.fixed.E_y));
