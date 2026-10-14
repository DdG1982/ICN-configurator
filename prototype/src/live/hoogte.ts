/**
 * AHN-hoogtekaart (0,5 m): schaduw door de zon langs de hoogtekaart te volgen, en bomen herkennen.
 * Raster gecentreerd op (ox, oy) in RD; rij 0 = noordrand. Hoogtes in m NAP; NaN = geen meting.
 */
import type { V2, V3 } from './geo';
import { puntInVeelhoek } from './geo';

export interface Raster { n: number; px: number; ox: number; oy: number; r: number; data: Float32Array }

export function schoon(data: ArrayLike<number>): Float32Array {
  const a = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) a[i] = data[i] > 1e30 || data[i] < -1000 ? NaN : data[i];
  return a;
}

/** Gaten opvullen met de dichtstbijzijnde meting (breedte-eerst, ongeveer de afstandstransformatie van scipy). */
function vulGaten(r: Raster): Float32Array {
  const { n, data } = r;
  const uit = Float32Array.from(data);
  const rij: number[] = [];
  const bezocht = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++) if (!Number.isNaN(data[i])) { rij.push(i); bezocht[i] = 1; }
  for (let k = 0; k < rij.length; k++) {
    const i = rij[k], y = (i / n) | 0, x = i % n;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
      const j = yy * n + xx;
      if (bezocht[j]) continue;
      bezocht[j] = 1; uit[j] = uit[i]; rij.push(j);
    }
  }
  return uit;
}

/**
 * Deel van de instraling dat overblijft na schaduw (direct + vast diffuus deel van 18%, onbeschaduwd).
 * punt en normaal in ENH t.o.v. (ox, oy), hoogte in m NAP. De straal start 0,3 m boven het dak.
 */
export function schaduwfactor(dsm: Raster, maxH: number, punt: V3, normaal: V3, zon: V3[], gewicht: number[]): number {
  const { n, px, r, data } = dsm;
  const sx = punt[0] + normaal[0] * 0.3, sy = punt[1] + normaal[1] * 0.3, sz = punt[2] + normaal[2] * 0.3;
  let direct = 0, vrij = 0;
  for (let k = 0; k < zon.length; k++) {
    const d = zon[k];
    const cos = d[0] * normaal[0] + d[1] * normaal[1] + d[2] * normaal[2];
    if (cos <= 0) continue;
    const w = gewicht[k] * cos;
    direct += w;
    const hl = Math.hypot(d[0], d[1]);
    const stijg = d[2] / Math.max(hl, 1e-6);
    const ex = d[0] / Math.max(hl, 1e-6), ey = d[1] / Math.max(hl, 1e-6);
    let geblokt = false;
    for (let s = 0.75; ; s += 0.5) {
      const z = sz + s * stijg;
      if (z > maxH) break;
      const col = Math.floor((sx + ex * s + r) / px), rw = Math.floor((r - (sy + ey * s)) / px);
      if (col < 0 || rw < 0 || col >= n || rw >= n) break;
      const h = data[rw * n + col];
      if (h > z + 0.2) { geblokt = true; break; }
    }
    if (!geblokt) vrij += w;
  }
  if (direct === 0) return 0;
  const diffuus = 0.18 * direct;
  return (vrij + diffuus) / (direct + diffuus);
}

export interface BoomRuw { x: number; z: number; h: number; r: number }

/**
 * Bomen uit AHN: alles hoger dan 2,5 m boven maaiveld dat geen gebouw is (footprints + 1 m).
 * Zelfde aanpak als bomen_uit_ahn in de Python-pijplijn. Resultaat in het modelstelsel (x oost, z zuid).
 */
export function bomenUitAhn(dsm: Raster, dtm: Raster, gebouwen: V2[][], straal: number): BoomRuw[] {
  const { n, px, r } = dsm;
  const grond = vulGaten(dtm);
  const hoogte = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) hoogte[i] = dsm.data[i] - grond[i];
  // Gebouwmasker
  const gebouw = new Uint8Array(n * n);
  for (const g of gebouwen) {
    let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
    for (const [x, y] of g) { mnx = Math.min(mnx, x); mxx = Math.max(mxx, x); mny = Math.min(mny, y); mxy = Math.max(mxy, y); }
    const c0 = Math.max(0, Math.floor((mnx - 1 + r) / px)), c1 = Math.min(n - 1, Math.floor((mxx + 1 + r) / px));
    const r0 = Math.max(0, Math.floor((r - mxy - 1) / px)), r1 = Math.min(n - 1, Math.floor((r - mny + 1) / px));
    for (let y = r0; y <= r1; y++) for (let x = c0; x <= c1; x++) {
      if (puntInVeelhoek(-r + (x + 0.5) * px, r - (y + 0.5) * px, g)) gebouw[y * n + x] = 1;
    }
  }
  // 1 m buffer = 2 pixels verdikken
  let buf = gebouw;
  for (let it = 0; it < 2; it++) buf = morf(buf, n, true);
  let veg = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++) veg[i] = hoogte[i] > 2.5 && !buf[i] ? 1 : 0;
  veg = morf(morf(veg, n, false), n, true); // opening
  // Vlekken labelen (4-buren)
  const lab = new Int32Array(n * n);
  const bomen: BoomRuw[] = [];
  let nlab = 0;
  for (let start = 0; start < n * n; start++) {
    if (!veg[start] || lab[start]) continue;
    nlab++;
    const cel = [start];
    lab[start] = nlab;
    for (let k = 0; k < cel.length; k++) {
      const i = cel[k], y = (i / n) | 0, x = i % n;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
        const j = yy * n + xx;
        if (veg[j] && !lab[j]) { lab[j] = nlab; cel.push(j); }
      }
    }
    const opp = cel.length * px * px;
    if (opp < 3) continue;
    if (opp > 60) {
      // Bomenrij of bos: per ~5 m een boom op lokale maxima.
      const w = Math.floor(5 / px / 2);
      for (const i of cel) {
        const h = hoogte[i];
        if (!(h > 3)) continue;
        const y = (i / n) | 0, x = i % n;
        let max = true;
        for (let yy = Math.max(0, y - w); yy < Math.min(n, y + w) && max; yy++) {
          for (let xx = Math.max(0, x - w); xx < Math.min(n, x + w); xx++) {
            const j = yy * n + xx;
            if (lab[j] === nlab && hoogte[j] > h) { max = false; break; }
          }
        }
        if (max) bomen.push({ x: -r + (x + 0.5) * px, z: -(r - (y + 0.5) * px), h, r: 3 });
      }
    } else {
      const hs = cel.map((i) => hoogte[i]).filter((h) => !Number.isNaN(h)).sort((a, b) => a - b);
      const h95 = hs[Math.min(hs.length - 1, Math.floor(0.95 * (hs.length - 1) + 0.5))];
      let sx = 0, sy = 0;
      for (const i of cel) { sx += i % n; sy += (i / n) | 0; }
      const cx = sx / cel.length, cy = sy / cel.length;
      bomen.push({ x: -r + (cx + 0.5) * px, z: -(r - (cy + 0.5) * px), h: h95, r: Math.min(Math.max(Math.sqrt(opp / Math.PI), 1.2), 6) });
    }
  }
  return bomen.filter((b) => Math.abs(b.x) <= straal && Math.abs(b.z) <= straal && Number.isFinite(b.h));
}

/** Verdikken (dilate) of verdunnen (erode) met een kruis van 3x3. */
function morf(m: Uint8Array, n: number, dik: boolean): Uint8Array {
  const uit = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x;
    const b = [m[i], x > 0 ? m[i - 1] : dik ? 0 : 1, x < n - 1 ? m[i + 1] : dik ? 0 : 1, y > 0 ? m[i - n] : dik ? 0 : 1, y < n - 1 ? m[i + n] : dik ? 0 : 1];
    uit[i] = dik ? (b.some((v) => v) ? 1 : 0) : (b.every((v) => v) ? 1 : 0);
  }
  return uit;
}
