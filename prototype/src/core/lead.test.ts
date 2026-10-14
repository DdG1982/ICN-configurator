import { describe, expect, it } from 'vitest';
import { maakWachtrij, utmUit, type Lead } from './lead';

const geheugenOpslag = () => { const m = new Map<string, string>(); return { lees: (k: string) => m.get(k) ?? null, zet: (k: string, v: string) => void m.set(k, v), m }; };
const lead = (id: string) => ({ id, modus: 'mail', contact: { email: 'a@b.nl' } }) as unknown as Lead;

describe('leadwachtrij', () => {
  it('verstuurt en haalt de lead uit de wachtrij', async () => {
    const o = geheugenOpslag();
    const verstuurd: string[] = [];
    const w = maakWachtrij(o, async (l) => { verstuurd.push(l.id); return true; });
    expect(await w.plaats(lead('lead-0001'))).toBe(true);
    expect(verstuurd).toEqual(['lead-0001']);
    expect(w.wachtend()).toBe(0);
  });

  it('houdt een mislukte lead vast en stuurt hem later alsnog', async () => {
    const o = geheugenOpslag();
    let online = false;
    const w = maakWachtrij(o, async () => online);
    expect(await w.plaats(lead('lead-0002'))).toBe(false);
    expect(w.wachtend()).toBe(1);
    // Nieuw bezoek: nieuwe wachtrij op dezelfde opslag.
    online = true;
    const later = maakWachtrij(o, async () => online);
    expect(await later.verwerk()).toBe(0);
  });

  it('houdt de lead in het geheugen als opslag niet werkt', async () => {
    let online = false;
    const w = maakWachtrij({ lees: () => { throw new Error('geen opslag'); }, zet: () => { throw new Error('geen opslag'); } }, async () => online);
    expect(await w.plaats(lead('lead-0003'))).toBe(false);
    expect(w.wachtend()).toBe(1);
    online = true;
    expect(await w.verwerk()).toBe(0);
  });

  it('leest alleen utm-parameters', () => {
    expect(utmUit('?utm_source=fb&adres=x&utm_campaign=najaar')).toEqual({ utm_source: 'fb', utm_campaign: 'najaar' });
  });
});
