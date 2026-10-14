/**
 * Geometrie voor het live dakmodel: dezelfde stappen als pipeline/bouw_dakdata.py, maar zonder numpy/shapely.
 * "ENH" = lokaal stelsel oost, noord, omhoog (m). Het dakmodel zelf gebruikt x = oost, y = omhoog, z = zuid.
 */
import earcut from 'earcut';

export type V3 = [number, number, number];
export type V2 = [number, number];

export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const schaal = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];

/** ENH -> modelstelsel (x oost, y omhoog, z zuid). */
export const naarModel = (p: V3): V3 => [p[0], p[2], -p[1]];

/** Normaal (eenheid) en oppervlak van een ring volgens Newell. */
export function newell(p: V3[]): { n: V3; opp: number } {
  const n: V3 = [0, 0, 0];
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    n[0] += (a[1] - b[1]) * (a[2] + b[2]);
    n[1] += (a[2] - b[2]) * (a[0] + b[0]);
    n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const l = len(n);
  return { n: schaal(n, 1 / (l + 1e-12)), opp: 0.5 * l };
}

/** Twee assen in het vlak: u horizontaal, v "omhoog langs het dak" (of noord bij een plat vlak). */
export function basisVlak(n: V3): { u: V3; v: V3 } {
  if (Math.abs(n[2]) > 0.995) return { u: [1, 0, 0], v: [0, 1, 0] };
  let u = cross([0, 0, 1], n);
  u = schaal(u, 1 / len(u));
  let v = cross(n, u);
  if (v[2] < 0) { v = schaal(v, -1); u = schaal(u, -1); }
  return { u, v };
}

const zelfde = (a: V3, b: V3) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9 && Math.abs(a[2] - b[2]) < 1e-9;
export const open = <T extends V3>(r: T[]) => (r.length > 1 && zelfde(r[0], r[r.length - 1]) ? r.slice(0, -1) : r);

/** Ringen (eerste = buitenrand, rest = gaten) in ENH -> driehoeken, plat achter elkaar (9 getallen per driehoek). */
export function trianguleer(ringen: V3[][]): V3[][] {
  const { n, opp } = newell(ringen[0]);
  if (opp < 1e-6) return [];
  const { u, v } = basisVlak(n);
  const o = ringen[0][0];
  const vlak: number[] = [], punten: V3[] = [], gaten: number[] = [];
  ringen.forEach((r, i) => {
    if (i > 0) gaten.push(punten.length);
    for (const p of open(r)) {
      const d = sub(p, o);
      vlak.push(dot(d, u), dot(d, v));
      punten.push(p);
    }
  });
  if (punten.length < 3) return [];
  const idx = earcut(vlak, gaten.length ? gaten : undefined, 2);
  const uit: V3[][] = [];
  for (let i = 0; i < idx.length; i += 3) uit.push([punten[idx[i]], punten[idx[i + 1]], punten[idx[i + 2]]]);
  return uit;
}

/* ---------------------------------------------------------------- 2D-veelhoeken */
export function puntInVeelhoek(x: number, y: number, p: V2[]): boolean {
  let binnen = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) binnen = !binnen;
  }
  return binnen;
}

function snijdt(a: V2, b: V2, c: V2, d: V2): boolean {
  const o = (p: V2, q: V2, r: V2) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Ligt de rechthoek [x0,x1] x [y0,y1] helemaal binnen de veelhoek? */
export function rechthoekBinnen(x0: number, y0: number, x1: number, y1: number, p: V2[]): boolean {
  const h: V2[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  if (!h.every(([x, y]) => puntInVeelhoek(x, y, p))) return false;
  for (const [x, y] of p) if (x > x0 + 1e-9 && x < x1 - 1e-9 && y > y0 + 1e-9 && y < y1 - 1e-9) return false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    for (let k = 0; k < 4; k++) if (snijdt(p[j], p[i], h[k], h[(k + 1) % 4])) return false;
  }
  return true;
}

/** Kortste afstand van een punt tot de rand van een veelhoek. */
export function afstandTotRand(x: number, y: number, p: V2[]): number {
  let best = Infinity;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [ax, ay] = p[j], [bx, by] = p[i];
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return best;
}

/* ---------------------------------------------------------------- paneelplekken */
export interface PaneelMaat { breedte: number; hoogte: number; rand: number; tussen: number }

/**
 * Rechthoekige paneelplekken (staand) binnen het dakvlak, met randmarge.
 * Geeft per plek de rij en vier hoekpunten in ENH, plus de 2D-hoeken in de basis van het vlak.
 * De randmarge geldt als vierkante marge rond elk paneel; bij schuine randen (wolfsdak) is dat iets voorzichtiger
 * dan de ronde marge van shapely in de Python-pijplijn (hooguit ca. 0,17 m).
 */
export function plekkenOpVlak(ring: V3[], n: V3, plat: boolean, m: PaneelMaat) {
  const { u, v } = basisVlak(n);
  const o = ring[0];
  const p2: V2[] = ring.map((q) => { const d = sub(q, o); return [dot(d, u), dot(d, v)]; });
  const xs = p2.map((p) => p[0]), ys = p2.map((p) => p[1]);
  const mnx = Math.min(...xs) + m.rand, mxx = Math.max(...xs) - m.rand;
  const mny = Math.min(...ys) + m.rand, mxy = Math.max(...ys) - m.rand;
  const past = (x: number, y: number) => rechthoekBinnen(x - m.rand, y - m.rand, x + m.breedte + m.rand, y + m.hoogte + m.rand, p2);
  // Dakranden zijn zelden precies recht (goot 5 cm scheef). Daarom proberen we een paar verticale verschuivingen
  // en zoekt elke rij van links naar rechts zelf de eerste plek die past (stapjes van 5 cm). Meeste panelen wint.
  const STAP = 0.05;
  let beste: { rij: number; x: number; y: number }[] = [];
  for (const dy of [0, 0.05, 0.1, 0.2, 0.3, 0.45, 0.6, 0.8]) {
    const deze: { rij: number; x: number; y: number }[] = [];
    let rij = 0;
    let yv = mny + dy;
    while (yv + m.hoogte <= mxy + 1e-6) {
      let xu = mnx;
      while (xu + m.breedte <= mxx + 1e-6) {
        if (past(xu, yv)) { deze.push({ rij, x: xu, y: yv }); xu += m.breedte + m.tussen; } else xu += STAP;
      }
      rij += 1;
      yv += m.hoogte + (plat && rij % 2 === 0 ? 0.5 : m.tussen);
    }
    if (deze.length > beste.length) beste = deze;
  }
  const uit = beste.map(({ rij, x: xu, y: yv }) => {
    const h2: V2[] = [[xu, yv], [xu + m.breedte, yv], [xu + m.breedte, yv + m.hoogte], [xu, yv + m.hoogte]];
    const hoeken = h2.map(([a, b]) => [o[0] + u[0] * a + v[0] * b, o[1] + u[1] * a + v[1] * b, o[2] + u[2] * a + v[2] * b] as V3);
    return { rij, hoeken, h2 };
  });
  return { u, v, o, p2, plekken: uit };
}

/* ---------------------------------------------------------------- zon */
/**
 * Zonvectoren (ENH, eenheid) en een helderehemel-DNI-gewicht voor een set dagen, per half uur, alleen boven 3 graden.
 * Zelfde formules als de Python-pijplijn (NOAA-benadering, luchtmassa-model van Meinel).
 */
export function zonstanden(lat: number, lon: number, dagen: number[], stapUur: number) {
  const richting: V3[] = [], gewicht: number[] = [];
  const phi = (lat * Math.PI) / 180;
  for (const dag of dagen) {
    for (let uur = 3; uur <= 21.0001; uur += stapUur) {
      const g = ((2 * Math.PI) / 365) * (dag - 1 + (uur - 12) / 24);
      const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g)
        + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
      const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
      const ha = (((uur * 60 + eqt + 4 * lon) / 4 - 180) * Math.PI) / 180;
      const cz = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha);
      const zen = Math.acos(Math.max(-1, Math.min(1, cz)));
      const hoogte = 90 - (zen * 180) / Math.PI;
      if (hoogte < 3) continue;
      let az = (Math.acos(Math.max(-1, Math.min(1, (Math.sin(phi) * Math.cos(zen) - Math.sin(decl)) / (Math.cos(phi) * Math.sin(zen) + 1e-12)))) * 180) / Math.PI;
      az = ha > 0 ? (az + 180) % 360 : (540 - az) % 360;
      const h = (hoogte * Math.PI) / 180, a = (az * Math.PI) / 180;
      richting.push([Math.cos(h) * Math.sin(a), Math.cos(h) * Math.cos(a), Math.sin(h)]);
      const am = 1 / Math.max(0.05, Math.sin(h));
      gewicht.push(1000 * 0.7 ** (am ** 0.678));
    }
  }
  return { richting, gewicht };
}
