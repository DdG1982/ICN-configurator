/**
 * Rekenmodel voor de indicatie. Zuivere functies, geen DOM.
 * Alle invoer komt uit config/market.json en config/pricing.json (placeholders).
 */
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

/** Terugverdientijd in jaren: snel = lage investering / hoge besparing, traag = andersom. */
export function terugverdientijd(investering: Band, besparing: Band): Band {
  const jaren = (i: number, b: number) => (b > 0 ? i / b : Infinity);
  return { low: jaren(investering.low, besparing.high), high: jaren(investering.high, besparing.low) };
}

/** Grove schatting jaarverbruik uit huishoudgrootte (placeholder, later met BAG-woningtype). */
export function geschatVerbruik(personen: number): number {
  const tabel = [0, 1800, 2700, 3300, 3900, 4400];
  return tabel[Math.min(Math.max(Math.round(personen), 1), 5)];
}

/** Afronden voor weergave: geen schijnnauwkeurigheid. */
export function rondAf(n: number, op: number): number {
  return Math.round(n / op) * op;
}
