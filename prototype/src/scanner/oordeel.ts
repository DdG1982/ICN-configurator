/** Gedeelde typen en kostenraming voor de beoordeling. Geen SDK-import, zodat de browser dit licht kan laden. */
export const MODEL = 'claude-haiku-5-5';
/** Prijs per miljoen tokens voor prompts tot 100K tokens (november 2026). Alleen voor de kostenraming in de interface. */
export const PRIJS = { invoer: 0.1, uitvoer: 0.5 };

export const OORDELEN = ['waarschijnlijk', 'twijfel', 'niet-gevonden'] as const;
export type Oordeel = typeof OORDELEN[number];

/** Wat het model ziet, in vaste klassen (geen telling, geen percentage). */
export const OMVANGEN = ['geen', 'enkele', 'blok', 'groot-deel'] as const;
export type Omvang = typeof OMVANGEN[number];
export const ZICHTEN = ['duidelijk', 'onduidelijk'] as const;
export type Zicht = typeof ZICHTEN[number];

export const OMVANG_TEKST: Record<Omvang, string> = { geen: 'geen panelen', enkele: 'enkele panelen', blok: 'een blok panelen', 'groot-deel': 'groot deel van het dak' };

export interface Beoordeling {
  oordeel: Oordeel; omvang?: Omvang; zicht?: Zicht; toelichting: string; model: string; tokensIn: number; tokensUit: number;
}

/** Rangscore voor de volgorde in de lijst: oordeel eerst, dan omvang, dan zichtbaarheid. Geen kans, alleen een volgorde. */
export function rangScore(p: { oordeel?: Oordeel; omvang?: Omvang; zicht?: Zicht }): number {
  const o = { waarschijnlijk: 300, twijfel: 200, 'niet-gevonden': 100 }[p.oordeel ?? 'niet-gevonden'] ?? 0;
  const m = { 'groot-deel': 30, blok: 20, enkele: 10, geen: 0 }[p.omvang ?? 'geen'] ?? 0;
  return o + m + (p.zicht === 'duidelijk' ? 5 : 0);
}

/** Klasse voor de gemeten trefkans (bevestigd / beoordeeld) per groep. */
export function klasse(p: { oordeel?: Oordeel; omvang?: Omvang; zicht?: Zicht }): string {
  const oordeel = { waarschijnlijk: 'Waarschijnlijk', twijfel: 'Twijfel', 'niet-gevonden': 'Niet gevonden' }[p.oordeel ?? 'niet-gevonden'];
  if (!p.omvang) return `${oordeel} · (oude versie, zonder omvang)`;
  return `${oordeel} · ${OMVANG_TEKST[p.omvang]} · ${p.zicht ?? 'onduidelijk'}`;
}

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
