/**
 * Leads versturen zonder ze kwijt te raken: eerst in een wachtrij in de browser (localStorage), dan naar
 * /api/lead. Wat niet lukt, blijft staan en gaat opnieuw bij de volgende poging of het volgende bezoek.
 * Beperking: wie de site daarna nooit meer opent (of geen opslag toestaat) en offline was, verliest de lead alsnog.
 */
export interface Lead {
  /** Vast per lead, zodat de ontvanger dubbele leveringen kan herkennen. */
  id: string;
  modus: 'schouw' | 'mail';
  aangemaakt: string;
  adres: { label: string; bagPandId: string | null; lat: number; lon: number; provincie: string; buitenWerkgebied: boolean } | null;
  woning: { status: string; woningtype: string | null; bouwjaar: number | null } | null;
  configuratie: { panelen: number; kwp: number; plekken: string[] };
  indicatie: Record<string, unknown>;
  contact: { naam?: string; email: string; telefoon?: string };
  toestemming: { gegeven: true; tijdstip: string; versie: string; tekst: string };
  herkomst: { pagina: string; verwijzer: string; utm: Record<string, string> };
}

type Opslag = { lees(k: string): string | null; zet(k: string, v: string): void };
type Versturen = (lead: Lead) => Promise<boolean>;

const SLEUTEL = 'icn-lead-wachtrij';

export function nieuwLeadId(): string {
  try { return crypto.randomUUID(); } catch { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`; }
}

/** UTM-parameters uit de pagina-URL (alleen utm_*, ingekort). */
export function utmUit(zoek: string): Record<string, string> {
  const uit: Record<string, string> = {};
  new URLSearchParams(zoek).forEach((v, k) => { if (k.startsWith('utm_')) uit[k] = v.slice(0, 200); });
  return uit;
}

export const naarApi = (url: string): Versturen => async (lead) => {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(lead), keepalive: true });
    return r.ok;
  } catch { return false; }
};

export function maakWachtrij(opslag: Opslag, verstuur: Versturen) {
  const lees = (): Lead[] => { try { return JSON.parse(opslag.lees(SLEUTEL) ?? '[]') as Lead[]; } catch { return []; } };
  const schrijf = (l: Lead[]) => { try { opslag.zet(SLEUTEL, JSON.stringify(l)); } catch { /* dan alleen in het geheugen */ } };
  /** Leads die in dit tabblad niet opgeslagen konden worden, blijven in elk geval in het geheugen. */
  let geheugen: Lead[] = [];
  const alle = () => { const o = lees(); return [...o, ...geheugen.filter((g) => !o.some((x) => x.id === g.id))]; };
  let bezig: Promise<number> | null = null;

  /** Probeert alles in de wachtrij; geeft het aantal leads terug dat nog wacht. */
  function verwerk(): Promise<number> {
    bezig ??= (async () => {
      for (const l of alle()) {
        if (await verstuur(l)) {
          schrijf(lees().filter((x) => x.id !== l.id));
          geheugen = geheugen.filter((x) => x.id !== l.id);
        }
      }
      return alle().length;
    })().finally(() => { bezig = null; });
    return bezig;
  }

  return {
    /** Zet de lead in de wachtrij en probeert meteen te versturen. true = deze lead is aangekomen. */
    async plaats(lead: Lead): Promise<boolean> {
      geheugen.push(lead);
      schrijf([...lees().filter((x) => x.id !== lead.id), lead]);
      if (bezig) await bezig;
      await verwerk();
      return !alle().some((x) => x.id === lead.id);
    },
    verwerk,
    wachtend: () => alle().length,
  };
}
