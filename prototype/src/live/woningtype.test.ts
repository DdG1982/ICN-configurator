import { describe, expect, it } from 'vitest';
import { bepaalWoningtype } from './bouw';
import type { V2 } from './geo';

/** Rechthoek van b x d meter met linkeronderhoek op (x, y). */
const vak = (x: number, y: number, b = 6, d = 10): V2[] => [[x, y], [x + b, y], [x + b, y + d], [x, y + d]];

describe('woningtype uit de buren', () => {
  const eigen = [vak(0, 0)];

  it('geen aangrenzend pand: vrijstaand', () => {
    expect(bepaalWoningtype('woning', eigen, [[vak(20, 0)]])).toBe('vrijstaand');
  });

  it('één gedeelde muur: hoekwoning', () => {
    expect(bepaalWoningtype('woning', eigen, [[vak(6, 0)], [vak(30, 0)]])).toBe('hoekwoning');
  });

  it('twee gedeelde muren: tussenwoning', () => {
    expect(bepaalWoningtype('woning', eigen, [[vak(6, 0)], [vak(-6, 0)]])).toBe('tussenwoning');
  });

  it('een aangebouwde schuur telt niet mee', () => {
    expect(bepaalWoningtype('woning', eigen, [[vak(6, 0, 3, 3)]])).toBe('vrijstaand');
  });

  it('appartement komt uit de BAG, bedrijfspand krijgt geen woningtype', () => {
    expect(bepaalWoningtype('appartement', eigen, [])).toBe('appartement');
    expect(bepaalWoningtype('zakelijk', eigen, [[vak(6, 0)]])).toBeUndefined();
  });
});
