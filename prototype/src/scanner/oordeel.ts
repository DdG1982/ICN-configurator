/** Gedeelde typen en kostenraming voor de beoordeling. Geen SDK-import, zodat de browser dit licht kan laden. */
export const MODEL = 'claude-haiku-5-5';
/** Prijs per miljoen tokens voor prompts tot 100K tokens (november 2026). Alleen voor de kostenraming in de interface. */
export const PRIJS = { invoer: 0.1, uitvoer: 0.5 };

export const OORDELEN = ['waarschijnlijk', 'twijfel', 'niet-gevonden'] as const;
export type Oordeel = typeof OORDELEN[number];

export interface Beoordeling { oordeel: Oordeel; toelichting: string; model: string; tokensIn: number; tokensUit: number }

export const kostenUsd = (tokensIn: number, tokensUit: number) => (tokensIn * PRIJS.invoer + tokensUit * PRIJS.uitvoer) / 1e6;

/**
 * Raming per beoordeling: beeld (px²/750 tokens) + instructie (~500) in, ~150 uit (antwoord plus wat denkwerk).
 * Het werkelijke verbruik tonen we tijdens de scan uit de tellingen van de API.
 */
export const geraamdeKostenUsd = (px = 768) => kostenUsd(Math.round((px * px) / 750) + 500, 150);

/** Controle van de invoer: alleen een JPEG van redelijke grootte. */
export function geldigBeeld(b: unknown): b is string {
  return typeof b === 'string' && b.length > 1000 && b.length < 900_000 && b.startsWith('/9j/') && /^[A-Za-z0-9+/=]+$/.test(b);
}
