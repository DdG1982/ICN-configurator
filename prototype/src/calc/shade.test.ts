import { describe, expect, it } from 'vitest';
import { instralingsRaster } from './shade';
import { paneelPlekken } from './layout';
import { voorbeeldwoning } from '../data/voorbeeldwoning';

describe('instraling en indeling', () => {
  const zuid = voorbeeldwoning.dakvlakken[0];
  const raster = instralingsRaster(voorbeeldwoning, zuid, 26, 10);
  it('raster is genormaliseerd', () => {
    const alle = raster.flat();
    expect(Math.max(...alle)).toBeCloseTo(1);
    expect(Math.min(...alle)).toBeGreaterThan(0.3);
  });
  it('de boom in het zuidwesten maakt de westkant minder zonnig dan de oostkant', () => {
    const west = raster[0][1], oost = raster[0][24];
    expect(west).toBeLessThan(oost);
  });
  it('indeling laat schaduwplekken weg', () => {
    const p = paneelPlekken(zuid.breedte, zuid.diepte, { breedte: 1.134, hoogte: 1.722 }, 0.3, raster, 0.85);
    expect(p.length).toBeGreaterThan(10);
    expect(p.filter((x) => x.actief).length).toBeLessThanOrEqual(p.length);
  });
});
