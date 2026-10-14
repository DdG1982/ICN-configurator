import { describe, expect, it } from 'vitest';
import { minderDanBeste, standaardIndeling } from './indeling';

const plek = (id: string, kwh: number, actief = true) => ({ id, kwh, actief });

describe('standaardindeling', () => {
  it('vult eerst het beste dakvlak, rij voor rij, tot het verbruik gedekt is', () => {
    const p = [
      { id: 'n1', kwh: 250, actief: true, vlak: 'noord', rij: 0 },
      { id: 'z1', kwh: 380, actief: true, vlak: 'zuid', rij: 0 },
      { id: 'z2', kwh: 400, actief: true, vlak: 'zuid', rij: 1 },
      { id: 'z0', kwh: 390, actief: true, vlak: 'zuid', rij: 0 },
      { id: 'z3', kwh: 400, actief: true, vlak: 'zuid', rij: 2 },
    ];
    expect([...standaardIndeling(p, 1100, 1, 1)]).toEqual(['z1', 'z0', 'z2']);
  });
  it('neemt alleen kandidaten', () => {
    const s = standaardIndeling([plek('a', 500, false), plek('b', 100)], 1000, 1, 1);
    expect([...s]).toEqual(['b']);
  });
  it('houdt een minimum aan', () => {
    expect(standaardIndeling([plek('a', 400), plek('b', 390), plek('c', 380)], 100, 1, 2).size).toBe(2);
  });
  it('rekent het verschil met de beste plek', () => {
    expect(minderDanBeste(300, 400)).toBe(25);
    expect(minderDanBeste(500, 400)).toBe(0);
  });
});
