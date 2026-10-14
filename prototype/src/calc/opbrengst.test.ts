import { describe, expect, it } from 'vitest';
import { besparingBand, investeringBand, opbrengstBand, terugverdientijd, vermogenKwp, geschatVerbruik } from './opbrengst';
import market from '../../config/market.json';
import pricing from '../../config/pricing.json';

describe('rekenmodel', () => {
  it('rekent vermogen uit panelen', () => {
    expect(vermogenKwp(14, 430)).toBeCloseTo(6.02);
  });

  it('besparing na 2026 is lager dan met saldering', () => {
    const o = opbrengstBand(5000, 0.08);
    const na = besparingBand(o, 3300, 0.3, market, 'na2026');
    const sal = besparingBand(o, 3300, 0.3, market, 'saldering2026');
    expect(na.high).toBeLessThan(sal.high);
    expect(na.low).toBeLessThan(na.high);
  });

  it('zelfconsumptie kan niet boven het verbruik uitkomen', () => {
    const o = { low: 10000, high: 10000 };
    const b = besparingBand(o, 1000, 1, { ...market, terugleververgoedingPerKwh: { low: 0, high: 0 }, terugleverkostenPerKwh: { low: 0, high: 0 } }, 'na2026');
    expect(b.low).toBeCloseTo(1000 * market.stroomprijsPerKwh.low);
  });

  it('terugverdientijd volgt uit invoer en is een band', () => {
    const inv = investeringBand(6020, pricing.prijsPerWp);
    const t = terugverdientijd(inv, { low: 600, high: 900 });
    expect(t.low).toBeCloseTo(6020 * 0.8 / 900);
    expect(t.high).toBeCloseTo(6020 * 1.5 / 600);
  });

  it('geen besparing geeft oneindige terugverdientijd', () => {
    expect(terugverdientijd({ low: 1, high: 1 }, { low: 0, high: 0 }).high).toBe(Infinity);
  });

  it('verbruik schatten valt binnen de tabel', () => {
    expect(geschatVerbruik(0)).toBe(1800);
    expect(geschatVerbruik(9)).toBe(4400);
  });
});
