/**
 * De scan zelf: per pand een uitsnede maken, laten beoordelen en direct opslaan.
 * Stoppen kan altijd; hervatten slaat panden over die al klaar zijn. Panden die al in een eerdere scan beoordeeld zijn,
 * worden niet opnieuw beoordeeld (en dus niet opnieuw betaald).
 */
import { beeld as leesBeeld, bewaarBeeld, bewaarPand, bewaarScan, pand, scan as leesScan, type PandRecord } from './opslag';
import type { Beoordeling } from './oordeel';
import { maakUitsnede } from './uitsnede';

export interface ScanVoortgang { klaar: number; totaal: number; fouten: number; tokensIn: number; tokensUit: number; laatste?: PandRecord }

export class ScanStop extends Error {
  constructor(public reden: 'gebruiker' | 'geen-sleutel' | 'daglimiet' | 'te-veel-fouten', bericht: string) { super(bericht); }
}

const TEGELIJK = 3;
const MAX_FOUTEN_OP_RIJ = 6;

async function vraagOordeel(base64: string, opp: number, jaar: number, signaal: AbortSignal): Promise<Beoordeling> {
  for (let p = 0; ; p++) {
    const r = await fetch(new URL('./api/classificeer', location.href), {
      method: 'POST', signal: signaal, headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ beeld: base64, opp, jaar }),
    });
    if (r.ok) return r.json();
    const d = await r.json().catch(() => ({})) as { fout?: string; bericht?: string };
    if (d.fout === 'geen-sleutel') throw new ScanStop('geen-sleutel', d.bericht ?? 'Er is geen API-sleutel ingesteld.');
    if (d.fout === 'daglimiet') throw new ScanStop('daglimiet', d.bericht ?? 'De daglimiet is bereikt.');
    if ((r.status === 429 || r.status >= 500) && p < 3) { await new Promise((res) => setTimeout(res, 2000 * 2 ** p)); continue; }
    throw new Error(d.bericht ?? `Beoordeling mislukt (HTTP ${r.status})`);
  }
}

export async function voerScanUit(scanId: string, signaal: AbortSignal, melding: (v: ScanVoortgang) => void, limiet = Infinity): Promise<ScanVoortgang> {
  const s = await leesScan(scanId);
  if (!s) throw new Error('Scan niet gevonden');
  s.status = 'bezig';
  await bewaarScan(s);

  const te_doen: string[] = [];
  let klaar = 0;
  for (const id of s.pandIds) {
    const p = await pand(id);
    if (p?.status === 'klaar') klaar++;
    else if (te_doen.length < limiet) te_doen.push(id);
  }
  const v: ScanVoortgang = { klaar, totaal: s.pandIds.length, fouten: 0, tokensIn: 0, tokensUit: 0 };
  melding(v);

  let foutenOpRij = 0;
  let stop: ScanStop | null = null;
  let i = 0;
  const werker = async () => {
    while (!stop && !signaal.aborted && i < te_doen.length) {
      const p = await pand(te_doen[i++]);
      if (!p || p.status === 'klaar') continue;
      try {
        const u = await maakUitsnede(p.footprint, signaal);
        const o = await vraagOordeel(u.base64, p.opp, u.jaar, signaal);
        await bewaarBeeld(p.id, u.blob);
        Object.assign(p, {
          status: 'klaar', oordeel: o.oordeel, omvang: o.omvang, dekking: o.dekking, zicht: o.zicht, toelichting: o.toelichting, model: o.model, beeldjaar: u.jaar, laag: u.laag,
          beeldBron: u.bron, gescand: new Date().toISOString(), fout: undefined, tokensIn: o.tokensIn, tokensUit: o.tokensUit,
        } satisfies Partial<PandRecord>);
        await bewaarPand(p);
        v.klaar++; v.tokensIn += o.tokensIn; v.tokensUit += o.tokensUit;
        foutenOpRij = 0;
      } catch (e) {
        if (signaal.aborted) break;
        if (e instanceof ScanStop) { stop = e; break; }
        p.status = 'fout';
        p.fout = e instanceof Error ? e.message : String(e);
        await bewaarPand(p);
        v.fouten++;
        if (++foutenOpRij >= MAX_FOUTEN_OP_RIJ) stop = new ScanStop('te-veel-fouten', `Gestopt na ${MAX_FOUTEN_OP_RIJ} fouten op rij. Laatste fout: ${p.fout}`);
      }
      v.laatste = p;
      melding({ ...v });
    }
  };
  await Promise.all(Array.from({ length: TEGELIJK }, werker));

  const na = await leesScan(scanId);
  if (na) {
    na.status = signaal.aborted || stop ? 'gestopt' : (v.klaar >= v.totaal ? 'klaar' : 'gestopt');
    await bewaarScan(na);
  }
  if (stop) throw stop;
  if (signaal.aborted) throw new ScanStop('gebruiker', 'Scan gestopt.');
  return v;
}

async function naarBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * Opnieuw beoordelen met de huidige instructie, op basis van de bewaarde uitsnede (niets opnieuw ophalen).
 * Een eerdere bevestiging of afwijzing blijft staan.
 */
export async function herbeoordeel(ids: string[], signaal: AbortSignal, melding: (v: ScanVoortgang) => void): Promise<ScanVoortgang> {
  const v: ScanVoortgang = { klaar: 0, totaal: ids.length, fouten: 0, tokensIn: 0, tokensUit: 0 };
  let i = 0;
  let stop: ScanStop | null = null;
  const werker = async () => {
    while (!stop && !signaal.aborted && i < ids.length) {
      const p = await pand(ids[i++]);
      const b = p && await leesBeeld(p.id);
      if (!p || !b || !p.beeldjaar) { v.fouten++; continue; }
      try {
        const o = await vraagOordeel(await naarBase64(b), p.opp, p.beeldjaar, signaal);
        Object.assign(p, { oordeel: o.oordeel, omvang: o.omvang, dekking: o.dekking, zicht: o.zicht, toelichting: o.toelichting, model: o.model,
          tokensIn: (p.tokensIn ?? 0) + o.tokensIn, tokensUit: (p.tokensUit ?? 0) + o.tokensUit } satisfies Partial<PandRecord>);
        await bewaarPand(p);
        v.klaar++; v.tokensIn += o.tokensIn; v.tokensUit += o.tokensUit;
      } catch (e) {
        if (signaal.aborted) break;
        if (e instanceof ScanStop) { stop = e; break; }
        v.fouten++;
      }
      v.laatste = p;
      melding({ ...v });
    }
  };
  await Promise.all(Array.from({ length: TEGELIJK }, werker));
  if (stop) throw stop;
  if (signaal.aborted) throw new ScanStop('gebruiker', 'Gestopt.');
  return v;
}
