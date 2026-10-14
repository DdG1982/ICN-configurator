/**
 * Rekenmodel voor de indicatie. Zuivere functies, geen DOM.
 * Alle invoer komt uit config/market.json en config/pricing.json (placeholders).
 */
import type { Woningtype } from '../core/dak-model';

export interface Band { low: number; high: number }

export interface MarktAannames {
  stroomprijsPerKwh: Band;
  terugleververgoedingPerKwh: Band;
  terugleverkostenPerKwh: Band;
  zelfconsumptie: { zonderBatterij: number; metBatterij: number };
  opbrengstMarge: number;
}

export type Scenario = 'na2026' | 'saldering2026';

export function vermogenKwp(panelen: number, paneelWp: number): number {
  return (panelen * paneelWp) / 1000;
}

/** Jaaropbrengst als band rond een centrale schatting. */
export function opbrengstBand(kwhCentraal: number, marge: number): Band {
  return { low: kwhCentraal * (1 - marge), high: kwhCentraal * (1 + marge) };
}

/**
 * Besparing per jaar. Na 2026: zelf verbruikte stroom bespaart de volle prijs, teruggeleverde
 * stroom levert de vergoeding min terugleverkosten op. Met saldering: alles tot het eigen
 * verbruik tegen de volle prijs, het overschot tegen de vergoeding.
 */
export function besparingBand(
  opbrengst: Band, verbruikKwh: number, zelfconsumptie: number, m: MarktAannames, scenario: Scenario,
): Band {
  const reken = (kwh: number, prijs: number, vergoeding: number, kosten: number) => {
    if (scenario === 'saldering2026') {
      const gesaldeerd = Math.min(kwh, verbruikKwh);
      return gesaldeerd * prijs + (kwh - gesaldeerd) * vergoeding;
    }
    const zelf = Math.min(kwh * zelfconsumptie, verbruikKwh);
    const terug = kwh - zelf;
    return zelf * prijs + terug * (vergoeding - kosten);
  };
  return {
    low: reken(opbrengst.low, m.stroomprijsPerKwh.low, m.terugleververgoedingPerKwh.low, m.terugleverkostenPerKwh.low),
    high: reken(opbrengst.high, m.stroomprijsPerKwh.high, m.terugleververgoedingPerKwh.high, m.terugleverkostenPerKwh.high),
  };
}

export function investeringBand(wp: number, prijsPerWp: Band): Band {
  return { low: wp * prijsPerWp.low, high: wp * prijsPerWp.high };
}

/** Veroudering van de panelen en verandering van de stroomprijs, per jaar (config/market.json). */
export interface Meerjarig { degradatiePerJaar: number; prijsstijgingPerJaar: number }

/** Hoe ver we vooruit rekenen; daarna geldt de investering als niet terug te verdienen. */
export const MAX_JAREN = 50;

/**
 * Jaren tot de opgetelde besparing de investering dekt. Jaar n (vanaf 0) bespaart
 * jaar1 x (1 - degradatie)^n x (1 + prijsstijging)^n. Het laatste jaar telt naar rato mee.
 */
export function jarenTotTerug(investering: number, besparingJaar1: number, m: Meerjarig): number {
  if (besparingJaar1 <= 0) return Infinity;
  let rest = investering;
  for (let j = 0; j < MAX_JAREN; j++) {
    const b = besparingJaar1 * (1 - m.degradatiePerJaar) ** j * (1 + m.prijsstijgingPerJaar) ** j;
    if (b <= 0) return Infinity;
    if (b >= rest) return j + rest / b;
    rest -= b;
  }
  return Infinity;
}

/** Terugverdientijd in jaren: snel = lage investering / hoge besparing, traag = andersom. */
export function terugverdientijd(investering: Band, besparing: Band, m: Meerjarig = { degradatiePerJaar: 0, prijsstijgingPerJaar: 0 }): Band {
  return { low: jarenTotTerug(investering.low, besparing.high, m), high: jarenTotTerug(investering.high, besparing.low, m) };
}


export interface VerbruikAannames {
  /** Jaarverbruik voor 1, 2, 3, 4 en 5+ personen (kWh). */
  perPersonen: number[];
  /** Vermenigvuldiging per woningtype; onbekend = 1. */
  woningtypeFactor: Record<Woningtype, number>;
  /** Vanaf dit bouwjaar gaan we uit van een woning zonder gas, dus met een warmtepomp. */
  gasloosVanafBouwjaar: number;
  extraKwhGasloos: number;
}

export interface VerbruikSchatting { kwh: number; basis: number; factor: number; extraGasloos: number }

/** Grove schatting jaarverbruik uit huishoudgrootte, woningtype en bouwjaar (placeholders in config/market.json). */
export function geschatVerbruik(personen: number, v: VerbruikAannames, woning: { type?: Woningtype; bouwjaar?: number } = {}): VerbruikSchatting {
  const basis = v.perPersonen[Math.min(Math.max(Math.round(personen), 1), v.perPersonen.length) - 1];
  const factor = woning.type ? v.woningtypeFactor[woning.type] : 1;
  const extraGasloos = woning.bouwjaar && woning.bouwjaar >= v.gasloosVanafBouwjaar ? v.extraKwhGasloos : 0;
  return { kwh: Math.round((basis * factor + extraGasloos) / 100) * 100, basis, factor, extraGasloos };
}

/** Afronden voor weergave: geen schijnnauwkeurigheid. */
export function rondAf(n: number, op: number): number {
  return Math.round(n / op) * op;
}
