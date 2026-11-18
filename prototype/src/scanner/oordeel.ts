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

/**
 * Welk deel van het dak (van bovenaf gezien) met panelen bedekt is, in klassen. Het model telt geen panelen:
 * tellen van tientallen kleine rechthoeken op een luchtfoto is onbetrouwbaar. Een bedekkingsklasse is grover maar stabieler.
 */
export const DEKKINGEN = ['geen', 'tot-10', '10-25', '25-50', '50-75', '75-100'] as const;
export type Dekking = typeof DEKKINGEN[number];
const DEKKING_FRACTIE: Record<Dekking, [number, number]> = {
  geen: [0, 0], 'tot-10': [0.005, 0.1], '10-25': [0.1, 0.25], '25-50': [0.25, 0.5], '50-75': [0.5, 0.75], '75-100': [0.75, 1],
};
export const DEKKING_TEKST: Record<Dekking, string> = {
  geen: 'geen', 'tot-10': 'minder dan 10%', '10-25': '10–25%', '25-50': '25–50%', '50-75': '50–75%', '75-100': 'meer dan 75%',
};

/**
 * Geschat aantal panelen als bandbreedte: grondvlak (BAG, m²) × bedekkingsklasse ÷ ruimte per paneel.
 * Per paneel rekenen we 1,8 tot 2,2 m² van bovenaf gezien (paneel ca. 1,7 × 1,1 m plus voegen en tussenruimte).
 * Grof: de bedekking is een inschatting van het model op één luchtfoto, en op een steil dak liggen meer panelen
 * dan het bovenaanzicht doet vermoeden (bij 45° ca. 40% meer).
 */
export function geschatAantal(opp: number, dekking?: Dekking): { laag: number; hoog: number } | null {
  if (!dekking) return null;
  const [a, b] = DEKKING_FRACTIE[dekking];
  if (!b) return { laag: 0, hoog: 0 };
  const laag = Math.max(1, Math.floor((opp * a) / 2.2 / 5) * 5);
  const hoog = Math.max(laag + 5, Math.ceil((opp * b) / 1.8 / 5) * 5);
  return { laag, hoog };
}

export interface Beoordeling {
  oordeel: Oordeel; omvang?: Omvang; zicht?: Zicht; dekking?: Dekking; toelichting: string; model: string; tokensIn: number; tokensUit: number;
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
 * Raming per beoordeling, geijkt op de eerste echte run (18-11-2026: 1.491 daken voor $0,53, ca. $0,00036 per dak):
 * beeld (px²/750 tokens) + instructie (~500) in, ~450 uit (antwoord plus denkwerk van het model).
 * Het werkelijke verbruik tonen we tijdens de scan uit de tellingen van de API.
 */
export const geraamdeKostenUsd = (px = 768) => kostenUsd(Math.round((px * px) / 750) + 500, 450);

/** Controle van de invoer: alleen een JPEG van redelijke grootte. */
export function geldigBeeld(b: unknown): b is string {
  return typeof b === 'string' && b.length > 1000 && b.length < 900_000 && b.startsWith('/9j/') && /^[A-Za-z0-9+/=]+$/.test(b);
}
