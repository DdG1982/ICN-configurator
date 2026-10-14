import { describe, expect, it } from 'vitest';
import { besparingBand, investeringBand, jarenTotTerug, opbrengstBand, terugverdientijd, vermogenKwp, geschatVerbruik } from './opbrengst';
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

  it('degradatie maakt de terugverdientijd langer, prijsstijging korter', () => {
    const vlak = jarenTotTerug(8000, 800, { degradatiePerJaar: 0, prijsstijgingPerJaar: 0 });
    expect(vlak).toBeCloseTo(10);
    const oud = jarenTotTerug(8000, 800, { degradatiePerJaar: 0.005, prijsstijgingPerJaar: 0 });
    expect(oud).toBeGreaterThan(10);
    expect(oud).toBeLessThan(10.5);
    expect(jarenTotTerug(8000, 800, { degradatiePerJaar: 0, prijsstijgingPerJaar: 0.03 })).toBeLessThan(10);
  });

  it('telt het laatste jaar naar rato', () => {
    expect(jarenTotTerug(1500, 1000, { degradatiePerJaar: 0, prijsstijgingPerJaar: 0 })).toBeCloseTo(1.5);
  });

  it('wat binnen 50 jaar niet terugkomt, is oneindig', () => {
    expect(jarenTotTerug(100000, 100, { degradatiePerJaar: 0.005, prijsstijgingPerJaar: 0 })).toBe(Infinity);
    expect(jarenTotTerug(1000, 100, { degradatiePerJaar: 0, prijsstijgingPerJaar: -1 })).toBe(Infinity);
  });

  it('verbruik schatten valt binnen de tabel', () => {
    expect(geschatVerbruik(0, market.verbruik).kwh).toBe(1800);
    expect(geschatVerbruik(9, market.verbruik).kwh).toBe(4400);
  });

  it('woningtype en bouwjaar sturen het verbruik', () => {
    const v = market.verbruik;
    const tussen = geschatVerbruik(3, v, { type: 'tussenwoning', bouwjaar: 1975 });
    expect(tussen.kwh).toBe(3300);
    expect(geschatVerbruik(3, v, { type: 'vrijstaand', bouwjaar: 1975 }).kwh).toBeGreaterThan(tussen.kwh);
    expect(geschatVerbruik(3, v, { type: 'appartement' }).kwh).toBeLessThan(tussen.kwh);
    const nieuw = geschatVerbruik(3, v, { type: 'tussenwoning', bouwjaar: v.gasloosVanafBouwjaar });
    expect(nieuw.extraGasloos).toBe(v.extraKwhGasloos);
    expect(nieuw.kwh).toBe(3300 + v.extraKwhGasloos);
  });
});
