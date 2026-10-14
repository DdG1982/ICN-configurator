import { describe, expect, it } from 'vitest';
import { minderDanBeste, standaardIndeling } from './indeling';

const plek = (id: string, kwh: number, actief = true) => ({ id, kwh, actief });

describe('standaardindeling', () => {
  it('kiest de beste plekken tot het verbruik gedekt is', () => {
    const p = [plek('a', 300), plek('b', 400), plek('c', 350), plek('d', 380), plek('e', 390), plek('f', 200)];
    const s = standaardIndeling(p, 1100, 1, 1);
    expect([...s]).toEqual(['b', 'e', 'd']);
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
