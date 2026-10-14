/**
 * Eigen instralings- en schaduwberekening (Tier B-aanpak): analytische stralen tegen
 * eenvoudige obstakels (bomen als bol, gebouwen als blok). Zuivere functies.
 */
import type { Dakvlak, Gebouw, RoofModel } from '../core/roof-model';
import { klokNaarUtc, vlakNormaal, zonstand, zonVector } from './sun';

export interface V3 { x: number; y: number; z: number }

const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;

/** Punt op een dakvlak van de woning: u langs de nok (-breedte/2..breedte/2), v vanaf de goot (0..diepte). */
export function puntOpVlak(model: RoofModel, vlak: Dakvlak, u: number, v: number): V3 {
  const w = model.woning;
  const t = (vlak.helling * Math.PI) / 180;
  const zuid = vlak.azimut > 90 && vlak.azimut < 270 ? 1 : -1;
  return {
    x: w.midden.x + u,
    y: w.gootHoogte + v * Math.sin(t),
    z: w.midden.z + zuid * (w.diepte / 2 - v * Math.cos(t)),
  };
}

function raakBol(o: V3, d: V3, c: V3, r: number): boolean {
  const oc = { x: o.x - c.x, y: o.y - c.y, z: o.z - c.z };
  const b = dot(oc, d);
  const cc = dot(oc, oc) - r * r;
  const disc = b * b - cc;
  if (disc < 0) return false;
  return -b - Math.sqrt(disc) > 0 || -b + Math.sqrt(disc) > 0 && cc < 0;
}

function raakBlok(o: V3, d: V3, g: Gebouw): boolean {
  // Gebouw als blok tot de gemiddelde dakhoogte: conservatief maar eenvoudig.
  const h = (g.gootHoogte + g.nokHoogte) / 2 + 0.6;
  const min = { x: g.midden.x - g.breedte / 2, y: 0, z: g.midden.z - g.diepte / 2 };
  const max = { x: g.midden.x + g.breedte / 2, y: h, z: g.midden.z + g.diepte / 2 };
  let tmin = 0.01, tmax = 1e6;
  for (const k of ['x', 'y', 'z'] as const) {
    if (Math.abs(d[k]) < 1e-9) {
      if (o[k] < min[k] || o[k] > max[k]) return false;
      continue;
    }
    let t1 = (min[k] - o[k]) / d[k];
    let t2 = (max[k] - o[k]) / d[k];
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}

/** Ligt dit punt in de schaduw voor de zon in richting s? */
export function inSchaduw(model: RoofModel, p: V3, s: V3): boolean {
  for (const b of model.omgeving.bomen) {
    const c = { x: b.positie.x, y: b.hoogte - b.kroonStraal, z: b.positie.z };
    if (raakBol(p, s, c, b.kroonStraal)) return true;
  }
  for (const g of model.omgeving.gebouwen) if (raakBlok(p, s, g)) return true;
  return false;
}

/** Instraling (W/m², heldere hemel) op een vlak met normaal n, inclusief schaduw. */
export function instraling(model: RoofModel, p: V3, n: V3, dag: number, klokuur: number): { wm2: number; schaduw: boolean } {
  const z = zonstand(model.breedtegraad, model.lengtegraad, dag, klokNaarUtc(dag, klokuur));
  if (z.hoogte <= 0.5) return { wm2: 0, schaduw: false };
  const s = zonVector(z);
  const am = 1 / Math.max(0.05, Math.sin((z.hoogte * Math.PI) / 180));
  const dni = 1000 * Math.pow(0.7, Math.pow(am, 0.678));
  const diffuus = 0.11 * dni * ((1 + n.y) / 2) + 40 * Math.sin((z.hoogte * Math.PI) / 180);
  const cos = dot(n, s);
  const schaduw = cos > 0 && inSchaduw(model, p, s);
  const direct = cos > 0 && !schaduw ? dni * cos : 0;
  return { wm2: direct + diffuus, schaduw };
}

const DAGEN = [17, 47, 75, 105, 135, 162, 198, 228, 258, 288, 318, 344];

/** Ongenormaliseerde jaarsom (heldere hemel) in het midden van een dakvlak, voor vergelijking tussen vlakken. */
export function jaarsomMidden(model: RoofModel, vlak: Dakvlak): number {
  const n = vlakNormaal(vlak.helling, vlak.azimut);
  const p = puntOpVlak(model, vlak, 0, vlak.diepte / 2);
  let som = 0;
  for (const dag of DAGEN) for (let h = 4; h <= 22; h += 0.5) som += instraling(model, p, n, dag, h).wm2;
  return som;
}

/** Relatieve jaarsom op een raster over het dakvlak (1 = beste cel zonder schaduw). */
export function instralingsRaster(model: RoofModel, vlak: Dakvlak, nu: number, nv: number): number[][] {
  const n = vlakNormaal(vlak.helling, vlak.azimut);
  const ruw: number[][] = [];
  let max = 0;
  for (let j = 0; j < nv; j++) {
    const rij: number[] = [];
    for (let i = 0; i < nu; i++) {
      const u = -vlak.breedte / 2 + ((i + 0.5) / nu) * vlak.breedte;
      const v = ((j + 0.5) / nv) * vlak.diepte;
      const p = puntOpVlak(model, vlak, u, v);
      p.y += 0.05;
      let som = 0;
      for (const dag of DAGEN) for (let h = 4; h <= 22; h += 0.5) som += instraling(model, p, n, dag, h).wm2;
      rij.push(som);
      max = Math.max(max, som);
    }
    ruw.push(rij);
  }
  return ruw.map((r) => r.map((x) => x / max));
}
