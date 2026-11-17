/**
 * Dakscanner: beoordeelt één luchtfoto-uitsnede met Claude (zie src/scanner/claude-kern.ts).
 * - De sleutel staat als Pages-secret ANTHROPIC_API_KEY, nooit in de repo of in de browser.
 * - Valt achter de toegangscode van _middleware.ts.
 * - Daglimiet: als er een KV-namespace SCAN_TELLER gekoppeld is, telt hij per dag en weigert boven DAGLIMIET (standaard 3000).
 *   KV telt niet exact bij gelijktijdige verzoeken; zet daarom ook een uitgavelimiet in de Anthropic Console.
 */
import Anthropic from '@anthropic-ai/sdk';
import { beoordeel, geldigBeeld } from '../../src/scanner/claude-kern';

interface Env { ANTHROPIC_API_KEY?: string; SCAN_TELLER?: KVNamespace; DAGLIMIET?: string }

const antwoord = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  if (!ctx.env.ANTHROPIC_API_KEY) return antwoord({ fout: 'geen-sleutel', bericht: 'Er is geen API-sleutel ingesteld (ANTHROPIC_API_KEY).' }, 503);
  let body: { beeld?: unknown; opp?: unknown; jaar?: unknown };
  try { body = await ctx.request.json(); } catch { return antwoord({ fout: 'ongeldig' }, 400); }
  const opp = Number(body.opp), jaar = Number(body.jaar);
  if (!geldigBeeld(body.beeld) || !(opp > 0 && opp < 1e6) || !(jaar >= 2000 && jaar <= 2100)) return antwoord({ fout: 'ongeldig' }, 400);

  const kv = ctx.env.SCAN_TELLER;
  if (kv) {
    const sleutel = `dag-${new Date().toISOString().slice(0, 10)}`;
    const n = Number(await kv.get(sleutel)) || 0;
    if (n >= (Number(ctx.env.DAGLIMIET) || 3000)) return antwoord({ fout: 'daglimiet', bericht: 'De daglimiet voor beoordelingen is bereikt.' }, 429);
    ctx.waitUntil(kv.put(sleutel, String(n + 1), { expirationTtl: 60 * 60 * 48 }));
  }

  const client = new Anthropic({ apiKey: ctx.env.ANTHROPIC_API_KEY, maxRetries: 3 });
  try {
    return antwoord(await beoordeel(client, body.beeld, { opp, jaar }));
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return antwoord({ fout: 'geen-sleutel', bericht: 'De API-sleutel wordt geweigerd.' }, 503);
    if (e instanceof Anthropic.RateLimitError) return antwoord({ fout: 'druk', bericht: 'Te veel verzoeken; probeer het zo opnieuw.' }, 429);
    if (e instanceof Anthropic.APIError) return antwoord({ fout: 'api', bericht: `Claude API: ${e.status ?? ''}` }, 502);
    return antwoord({ fout: 'api', bericht: 'Claude API niet bereikbaar' }, 502);
  }
};
