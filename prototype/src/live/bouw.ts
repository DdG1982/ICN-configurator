/**
 * Live dakmodel voor elk adres in Nederland: dezelfde stappen als pipeline/bouw_dakdata.py, in de browser.
 * PDOK-adres -> BAG-pand -> 3DBAG LoD2.2 (woning + buren) -> AHN (schaduw en bomen) -> PVGIS -> paneelplekken.
 * Schaduw: anders dan de Python-pijplijn (driehoeken + boombollen) volgen we hier de zon over de AHN-hoogtekaart
 * van 0,5 m. Die bevat gebouwen, bomen en schoorstenen zoals ze gemeten zijn.
 */
import type { DakModel, DakStatus, Dakvlak, Mesh, Plek } from '../core/dak-model';
import {
  adresOpzoeken, ahn, bagPand, BronFout, isRijksmonument, luchtfotoUrl, panden3dbag,
  type CityFeature, type Pvgis, type Transform,
} from './bronnen';
import { basisVlak, dot, naarModel, newell, open, plekkenOpVlak, puntInVeelhoek, sub, trianguleer, zonstanden, type PaneelMaat, type V2, type V3 } from './geo';
import { bomenUitAhn, schaduwfactor, type Raster } from './hoogte';

/** Voortgang: elke stap wordt gemeld zodra hij klaar is, in deze volgorde. */
export const STAPPEN = ['adres', 'pand', '3d', 'hoogte', 'opbrengst', 'schaduw'] as const;
export type Stap = typeof STAPPEN[number];

export interface BouwOpties {
  pvgis: Pvgis;
  werkgebied: string[];
  maat: PaneelMaat;
  wp: number;
  voortgang?: (stap: Stap, info?: Record<string, unknown>) => void;
}

const STRAAL_BUREN = 70;
const STRAAL_AHN = 80;
const NABIJ = 80, WIJD = 800;
const ZONDAGEN = [21, 52, 80, 111, 141, 172, 202, 233, 264, 294, 325, 355];

const r2 = (x: number) => Math.round(x * 100) / 100;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

function zwaartepunt(ring: [number, number][]): [number, number] {
  const p = open(ring.map(([x, y]) => [x, y, 0] as V3));
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i], [x1, y1] = p[(i + 1) % p.length];
    const k = x0 * y1 - x1 * y0;
    a += k; cx += (x0 + x1) * k; cy += (y0 + y1) * k;
  }
  if (Math.abs(a) < 1e-9) return [p[0][0], p[0][1]];
  return [cx / (3 * a), cy / (3 * a)];
}

function hoekpunten(f: CityFeature, tr: Transform, ox: number, oy: number): V3[] {
  const [sx, sy, sz] = tr.scale, [tx, ty, tz] = tr.translate;
  return f.vertices.map((v) => [v[0] * sx + tx - ox, v[1] * sy + ty - oy, v[2] * sz + tz]);
}

/** Alle LoD2.2-vlakken (type + ringen in ENH, hoogte in m NAP). */
function lod22(f: CityFeature, V: V3[]): { type: string; ringen: V3[][] }[] {
  const uit: { type: string; ringen: V3[][] }[] = [];
  for (const o of Object.values(f.CityObjects)) {
    if (o.type !== 'BuildingPart') continue;
    const g = o.geometry?.find((x) => x.lod === '2.2');
    if (!g || !g.semantics) continue;
    const shells = g.boundaries as number[][][][];
    shells.forEach((shell, si) => shell.forEach((face, fi) => {
      const sv = g.semantics!.values[si]?.[fi];
      const type = sv !== null && sv !== undefined ? g.semantics!.surfaces[sv].type : 'WallSurface';
      uit.push({ type, ringen: face.map((ring) => ring.map((i) => V[i])) });
    }));
  }
  return uit;
}

function footprints(f: CityFeature, V: V3[]): V2[][] {
  const g = f.CityObjects[f.id]?.geometry?.[0];
  if (!g) return [];
  return (g.boundaries as number[][][]).map((surf) => surf[0].map((i) => [V[i][0], V[i][1]] as V2)).filter((r) => r.length >= 3);
}

function maakMesh(vlakken: { type: string; ringen: V3[][] }[], oz: number, alleenDakEnMuur: boolean): Mesh {
  const pos: number[] = [], type: number[] = [];
  for (const v of vlakken) {
    const t = v.type === 'RoofSurface' ? 1 : v.type === 'WallSurface' ? 2 : 0;
    if (alleenDakEnMuur && t === 0) continue;
    for (const tri of trianguleer(v.ringen)) {
      for (const p of tri) pos.push(r2(p[0]), r2(p[2] - oz), r2(-p[1]));
      type.push(t);
    }
  }
  return { pos, type };
}

export function bepaalStatus(gebruiksdoel: string, eenheden: number, monument: boolean): DakStatus {
  const andere = gebruiksdoel.split(',').map((d) => d.trim()).filter((d) => d && d !== 'woonfunctie');
  if (gebruiksdoel.includes('woonfunctie') && !andere.length && eenheden >= 3) return 'appartement';
  if (monument) return 'monument';
  if (gebruiksdoel && !gebruiksdoel.includes('woonfunctie') && gebruiksdoel.includes('overige')) return 'bijgebouw';
  if (andere.length) return 'zakelijk';
  return 'woning';
}

export async function bouwModel(adresId: string, o: BouwOpties): Promise<DakModel> {
  const meld = o.voortgang ?? (() => {});
  const adres = await adresOpzoeken(adresId);
  // De wijde luchtfoto hangt alleen van het adrespunt af, zodat het laadscherm hem meteen kan tonen.
  const wijdUrl = luchtfotoUrl(adres.x, adres.y, WIJD, 1024);
  meld('adres', { label: adres.label, provincie: adres.provincie, wijd: wijdUrl });

  const bag = await bagPand(adres.x, adres.y);
  if (!bag) throw new BronFout('BAG', 'Op dit adres staat volgens de BAG geen gebouw.');
  const [ox, oy] = zwaartepunt(bag.footprint);
  const luchtfoto = {
    dichtbij: { bestand: luchtfotoUrl(ox, oy, NABIJ, 1280), half: NABIJ },
    wijd: { bestand: wijdUrl, half: WIJD, midden: [r2(adres.x - ox), r2(-(adres.y - oy))] as [number, number] },
  };
  meld('pand', { bouwjaar: bag.bouwjaar });

  const waarschuwingen: string[] = [];
  const [rond, monument, dsm, dtm] = await Promise.all([
    panden3dbag(ox, oy, STRAAL_BUREN),
    isRijksmonument(bag.footprint).catch(() => { waarschuwingen.push('Het monumentenregister was niet bereikbaar; we konden niet controleren of dit een rijksmonument is.'); return false; }),
    ahn('dsm_05m', ox, oy, STRAAL_AHN).catch(() => null),
    ahn('dtm_05m', ox, oy, STRAAL_AHN).catch(() => null),
  ]);
  const doel = rond.find(({ f }) => f.id.endsWith(bag.id));
  meld('3d', { panden: rond.length, gevonden: !!doel });

  const model: DakModel = {
    versie: 2,
    status: 'woning',
    adres: { label: adres.label, bag: adres.label, provincie: adres.provincie, lat: adres.lat, lon: adres.lon, soort: monument ? 'monument' : undefined },
    pand: { id: bag.id, bouwjaar: bag.bouwjaar, gebruiksdoel: bag.gebruiksdoel, eenheden: bag.eenheden },
    buitenWerkgebied: !o.werkgebied.includes(adres.provincie),
    bronnen: ['PDOK Locatieserver', 'BAG (Kadaster)', '3DBAG (TU Delft, 3DGI)', 'AHN (Rijkswaterstaat)', 'PDOK luchtfoto', 'PVGIS (EC JRC)', 'Rijksmonumentenregister (RCE)'],
    luchtfoto,
  };
  if (!doel) {
    model.status = 'niet-in-3dbag';
    model.footprint = bag.footprint.map(([x, y]) => [r2(x - ox), r2(-(y - oy))]);
    return model;
  }
  model.status = bepaalStatus(bag.gebruiksdoel, bag.eenheden, monument);

  const attr = doel.f.CityObjects[doel.f.id]?.attributes ?? {};
  const oz = Number(attr.b3_h_maaiveld ?? 0);
  model.kwaliteit = { '3dbagGoed': !!attr.b3_kwaliteitsindicator, puntenwolkJaar: Number(attr.b3_pw_datum) || 0, dakType: String(attr.b3_dak_type ?? '') };

  const Vw = hoekpunten(doel.f, doel.tr, ox, oy);
  const woningVlakken = lod22(doel.f, Vw);
  model.woning = maakMesh(woningVlakken, oz, false);
  const buren: Mesh = { pos: [], type: [] };
  const gebouwVoetafdruk: V2[][] = footprints(doel.f, Vw);
  for (const { f, tr } of rond) {
    if (f === doel.f) continue;
    const V = hoekpunten(f, tr, ox, oy);
    const m = maakMesh(lod22(f, V), oz, true);
    for (const x of m.pos) buren.pos.push(x);
    for (const x of m.type) buren.type.push(x);
    gebouwVoetafdruk.push(...footprints(f, V));
  }
  model.buren = buren;

  if (dsm && dtm) {
    model.bomen = bomenUitAhn(dsm, dtm, gebouwVoetafdruk, 45).map((b) => ({ x: r2(b.x), z: r2(b.z), h: r2(b.h), r: r2(b.r) }));
  } else {
    model.bomen = [];
    waarschuwingen.push('De AHN-hoogtekaart was niet bereikbaar. Schaduw van bomen en buren is daarom niet meegerekend.');
  }
  meld('hoogte', { ahn: !!dsm, bomen: model.bomen.length });

  // Dakvlakken, PVGIS per vlak (parallel), daarna schaduw per cel en paneelplek.
  const daken = woningVlakken.filter((v) => v.type === 'RoofSurface').map((v) => {
    let rn = open(v.ringen[0]).map((p) => [p[0], p[1], p[2] - oz] as V3);
    let { n, opp } = newell(rn);
    if (n[2] < 0) { n = [-n[0], -n[1], -n[2]]; rn = rn.slice().reverse(); }
    const helling = (Math.acos(Math.min(1, n[2])) * 180) / Math.PI;
    const azimut = ((Math.atan2(n[0], n[1]) * 180) / Math.PI + 360) % 360;
    return { rn, n, opp, helling, azimut, plat: helling < 8 };
  }).filter((d) => d.opp >= 4 && d.helling <= 65);

  const kwhPerKwp = await Promise.all(daken.map(async (d) => d.plat
    ? ((await o.pvgis(adres.lat, adres.lon, 10, -90)) + (await o.pvgis(adres.lat, adres.lon, 10, 90))) / 2
    : o.pvgis(adres.lat, adres.lon, d.helling, d.azimut - 180)));
  meld('opbrengst', { vlakken: daken.length });

  const zon = zonstanden(adres.lat, adres.lon, ZONDAGEN, 0.5);
  let maxH = -Infinity;
  if (dsm) for (const h of dsm.data) if (h > maxH) maxH = h;
  const factor = (q: V3, n: V3) => (dsm ? schaduwfactor(dsm as Raster, maxH, [q[0], q[1], q[2] + oz], n, zon.richting, zon.gewicht) : 1);

  const dakvlakken: Dakvlak[] = [], plekken: Plek[] = [];
  daken.forEach((d, i) => {
    const vid = `v${dakvlakken.length}`;
    const kwh = kwhPerKwp[i];
    const { u, v } = basisVlak(d.n);
    const oP = d.rn[0];
    const p2: V2[] = d.rn.map((q) => { const t = sub(q, oP); return [dot(t, u), dot(t, v)]; });
    const xs = p2.map((p) => p[0]), ys = p2.map((p) => p[1]);
    const stap = d.opp < 150 ? 1 : d.opp < 600 ? 2 : 4;
    const cellen: [number, number, number, number][] = [];
    const cel2d: [number, number, number][] = [];
    for (let a = Math.min(...xs) + stap / 2; a < Math.max(...xs); a += stap) {
      for (let b = Math.min(...ys) + stap / 2; b < Math.max(...ys); b += stap) {
        if (!puntInVeelhoek(a, b, p2)) continue;
        const q: V3 = [oP[0] + u[0] * a + v[0] * b, oP[1] + u[1] * a + v[1] * b, oP[2] + u[2] * a + v[2] * b];
        const f = factor(q, d.n);
        const m = naarModel(q);
        cellen.push([r2(m[0]), r2(m[1]), r2(m[2]), r2(f)]);
        cel2d.push([a, b, f]);
      }
    }
    dakvlakken.push({
      id: vid, helling: Math.round(d.helling * 10) / 10, azimut: Math.round(d.azimut), opp: Math.round(d.opp * 10) / 10, plat: d.plat,
      kwhPerKwp: Math.round(kwh), // Oost en west tellen mee (in Nederland gangbaar, ca. 80% van zuid); noordelijker niet.
      geschikt: d.plat || (d.azimut >= 85 && d.azimut <= 275),
      normaal: naarModel(d.n).map((x) => Math.round(x * 1e4) / 1e4) as V3,
      rand: d.rn.map((q) => naarModel(q).map(r2) as V3),
      warmte: { stap, u: naarModel(u).map((x) => Math.round(x * 1e4) / 1e4) as V3, v: naarModel(v).map((x) => Math.round(x * 1e4) / 1e4) as V3, cellen },
    });
    for (const p of plekkenOpVlak(d.rn, d.n, d.plat, o.maat).plekken) {
      const x0 = Math.min(...p.h2.map((h) => h[0])), x1 = Math.max(...p.h2.map((h) => h[0]));
      const y0 = Math.min(...p.h2.map((h) => h[1])), y1 = Math.max(...p.h2.map((h) => h[1]));
      const binnen = cel2d.filter(([a, b]) => a >= x0 && a <= x1 && b >= y0 && b <= y1);
      let f = 1;
      if (binnen.length) f = binnen.reduce((s, c) => s + c[2], 0) / binnen.length;
      else if (cel2d.length) {
        const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
        f = cel2d.reduce((best, c) => ((c[0] - mx) ** 2 + (c[1] - my) ** 2 < (best[0] - mx) ** 2 + (best[1] - my) ** 2 ? c : best))[2];
      }
      plekken.push({
        id: `${vid}p${plekken.length}`, vlak: vid, rij: p.rij, hoeken: p.hoeken.map((h) => naarModel(h).map(r3) as V3),
        schaduw: r3(f), kwh: Math.round((o.wp / 1000) * kwh * f), actief: false,
      });
    }
  });
  const beste = Math.max(1, ...plekken.map((p) => p.kwh));
  const magPanelen = !['appartement', 'monument'].includes(model.status);
  for (const p of plekken) {
    const vl = dakvlakken.find((v) => v.id === p.vlak)!;
    p.actief = vl.geschikt && p.kwh >= 0.8 * beste && magPanelen;
  }
  model.dakvlakken = dakvlakken;
  model.plekken = plekken;
  if (waarschuwingen.length) model.waarschuwingen = waarschuwingen;
  meld('schaduw', { plekken: plekken.length });
  return model;
}
