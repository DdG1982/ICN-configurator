import { describe, expect, it } from 'vitest';
import { basisVlak, newell, plekkenOpVlak, rechthoekBinnen, trianguleer, zonstanden, type V3 } from './geo';
import { pvgisSleutel } from './bronnen';
import { bepaalStatus } from './bouw';

const MAAT = { breedte: 1.134, hoogte: 1.722, rand: 0.4, tussen: 0.02 };

describe('geometrie', () => {
  it('newell geeft normaal en oppervlak van een schuin zuiddak', () => {
    // 10 m breed, 6 m langs de helling van 30 graden, oplopend naar het noorden
    const h = 6 * Math.sin(Math.PI / 6), d = 6 * Math.cos(Math.PI / 6);
    const ring: V3[] = [[0, 0, 0], [10, 0, 0], [10, d, h], [0, d, h]];
    const { n, opp } = newell(ring);
    expect(opp).toBeCloseTo(60, 5);
    expect(Math.acos(n[2]) * 180 / Math.PI).toBeCloseTo(30, 5);
    expect(n[1]).toBeLessThan(0); // normaal wijst naar het zuiden
    const { u, v } = basisVlak(n);
    expect(v[2]).toBeGreaterThan(0);
    expect(Math.abs(u[2])).toBeLessThan(1e-9);
  });

  it('trianguleert een vlak met een gat', () => {
    const buiten: V3[] = [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0]];
    const gat: V3[] = [[4, 4, 0], [6, 4, 0], [6, 6, 0], [4, 6, 0]];
    const tri = trianguleer([buiten, gat]);
    const opp = tri.reduce((s, [a, b, c]) => s + Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2, 0);
    expect(opp).toBeCloseTo(96, 5);
  });

  it('rechthoek binnen een L-vorm', () => {
    const L: [number, number][] = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]];
    expect(rechthoekBinnen(1, 1, 3, 3, L)).toBe(true);
    expect(rechthoekBinnen(3, 3, 6, 6, L)).toBe(false); // over de binnenhoek
    expect(rechthoekBinnen(-1, 1, 2, 2, L)).toBe(false);
  });

  it('plaatst panelen met randmarge op een plat dak', () => {
    const ring: V3[] = [[0, 0, 5], [10, 0, 5], [10, 6, 5], [0, 6, 5]];
    const { plekken } = plekkenOpVlak(ring, [0, 0, 1], true, MAAT);
    // 9,2 m bruikbare breedte: 7 panelen per rij. Elke rij is even lang; alle hoeken blijven 0,4 m van de rand.
    const rijen = new Set(plekken.map((p) => p.rij));
    expect(plekken.length % 7).toBe(0);
    expect(rijen.size).toBeGreaterThanOrEqual(2);
    for (const p of plekken) for (const h of p.hoeken) {
      expect(h[0]).toBeGreaterThanOrEqual(0.4 - 1e-9);
      expect(h[0]).toBeLessThanOrEqual(9.6 + 1e-9);
      expect(h[1]).toBeGreaterThanOrEqual(0.4 - 1e-9);
      expect(h[1]).toBeLessThanOrEqual(5.6 + 1e-9);
    }
  });

  it('zon staat op 21 juni rond het middaguur hoog in het zuiden (Roden)', () => {
    const { richting } = zonstanden(53.14, 6.43, [172], 0.5);
    const hoogste = richting.reduce((a, b) => (b[2] > a[2] ? b : a));
    expect(Math.asin(hoogste[2]) * 180 / Math.PI).toBeGreaterThan(59);
    expect(hoogste[1]).toBeLessThan(0); // naar het zuiden
  });
});

describe('PVGIS en status', () => {
  it('rondt af voor de cache', () => {
    expect(pvgisSleutel(53.1349, 6.4251, 37.4, -12)).toBe('lat=53.13&lon=6.43&angle=35&aspect=-10');
    expect(pvgisSleutel(53.1, 6.4, 1, 92)).toBe('lat=53.10&lon=6.40&angle=0&aspect=90');
  });
  it('herkent de soorten panden', () => {
    expect(bepaalStatus('woonfunctie', 1, false)).toBe('woning');
    expect(bepaalStatus('woonfunctie', 12, false)).toBe('appartement');
    expect(bepaalStatus('woonfunctie', 1, true)).toBe('monument');
    expect(bepaalStatus('woonfunctie,winkelfunctie', 2, false)).toBe('zakelijk');
    expect(bepaalStatus('overige gebruiksfunctie', 1, false)).toBe('bijgebouw');
    expect(bepaalStatus('kantoorfunctie', 1, false)).toBe('zakelijk');
  });
});
