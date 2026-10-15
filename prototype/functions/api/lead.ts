/**
 * Ontvangt een lead uit de configurator en stuurt hem als JSON door naar LEAD_WEBHOOK_URL (secret in het
 * Pages-project, niet in de repo). Optioneel LEAD_WEBHOOK_TOKEN: gaat mee als Authorization: Bearer.
 * Het CRM is nog onbekend; elke ontvanger die een JSON-POST aanneemt werkt (Make, Zapier, n8n, eigen script).
 * Antwoord 202 = doorgestuurd. Bij een fout bewaart de browser de lead en probeert het later opnieuw;
 * het lead-id is vast, zodat de ontvanger dubbele leveringen kan herkennen.
 * Valt achter de toegangscode van _middleware.ts, en vraagt een pas als TURNSTILE_SECRET is ingesteld (server/pas.ts).
 */
import { vereisPas } from '../../server/pas';

interface Env { LEAD_WEBHOOK_URL?: string; LEAD_WEBHOOK_TOKEN?: string; TURNSTILE_SECRET?: string }

const MAX_BYTES = 32 * 1024;

const antwoord = (data: unknown, status: number) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

function geldig(l: Record<string, unknown>): string | null {
  const c = l.contact as Record<string, unknown> | undefined;
  const t = l.toestemming as Record<string, unknown> | undefined;
  if (typeof l.id !== 'string' || !/^[\w-]{8,64}$/.test(l.id)) return 'id';
  if (l.modus !== 'schouw' && l.modus !== 'mail') return 'modus';
  if (!c || typeof c.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email)) return 'e-mail';
  if (l.modus === 'schouw' && (typeof c.naam !== 'string' || typeof c.telefoon !== 'string')) return 'naam of telefoon';
  if (!t || t.gegeven !== true || typeof t.tekst !== 'string' || typeof t.tijdstip !== 'string') return 'toestemming';
  return null;
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const geweigerd = await vereisPas(ctx.request, ctx.env.TURNSTILE_SECRET);
  if (geweigerd) return geweigerd;
  const doel = ctx.env.LEAD_WEBHOOK_URL;
  if (!doel) return antwoord({ fout: 'Er is nog geen ontvanger voor leads ingesteld (LEAD_WEBHOOK_URL).' }, 503);

  const tekst = await ctx.request.text();
  if (tekst.length > MAX_BYTES) return antwoord({ fout: 'te groot' }, 413);
  let lead: Record<string, unknown>;
  try { lead = JSON.parse(tekst); } catch { return antwoord({ fout: 'geen geldige JSON' }, 400); }
  const fout = geldig(lead);
  if (fout) return antwoord({ fout: `ongeldig veld: ${fout}` }, 400);

  const body = JSON.stringify({ ...lead, ontvangen: new Date().toISOString(), bron: 'icn-zonnepanelen-configurator' });
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (ctx.env.LEAD_WEBHOOK_TOKEN) headers.authorization = `Bearer ${ctx.env.LEAD_WEBHOOK_TOKEN}`;
  for (let poging = 0; poging < 3; poging++) {
    try {
      const r = await fetch(doel, { method: 'POST', headers, body });
      if (r.ok) return antwoord({ ok: true, id: lead.id }, 202);
      if (r.status >= 400 && r.status < 500 && r.status !== 429) break;
    } catch { /* volgende poging */ }
    await new Promise((r) => setTimeout(r, 400 * 2 ** poging));
  }
  return antwoord({ fout: 'De ontvanger van leads reageert niet.' }, 502);
};
