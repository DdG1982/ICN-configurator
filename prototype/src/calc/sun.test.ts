import { describe, expect, it } from 'vitest';
import { zonstand, klokNaarUtc } from './sun';

const roden = { lat: 53.14, lon: 6.43 };

describe('zonstand', () => {
  it('midzomer rond 13:40 klok: zon op het zuiden, ~60 graden hoog', () => {
    const z = zonstand(roden.lat, roden.lon, 172, klokNaarUtc(172, 13.6));
    expect(z.azimut).toBeGreaterThan(170);
    expect(z.azimut).toBeLessThan(190);
    expect(z.hoogte).toBeGreaterThan(58);
    expect(z.hoogte).toBeLessThan(62);
  });

  it('midwinter middag: zon laag, ~13 graden', () => {
    const z = zonstand(roden.lat, roden.lon, 355, klokNaarUtc(355, 12.6));
    expect(z.hoogte).toBeGreaterThan(11);
    expect(z.hoogte).toBeLessThan(15);
  });

  it('ochtend: zon in het oosten', () => {
    const z = zonstand(roden.lat, roden.lon, 172, klokNaarUtc(172, 8));
    expect(z.azimut).toBeGreaterThan(70);
    expect(z.azimut).toBeLessThan(120);
  });
});
