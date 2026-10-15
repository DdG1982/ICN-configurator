/**
 * Ruilt een Turnstile-token in voor een pas van 30 minuten (zie server/pas.ts).
 * Zonder TURNSTILE_SECRET is er geen bescherming en geeft dit 404, zodat de client weet dat er geen pas nodig is.
 */
import { maakPas, turnstileGoed } from '../../server/pas';

interface Env { TURNSTILE_SECRET?: string }

const antwoord = (data: unknown, status: number) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const geheim = ctx.env.TURNSTILE_SECRET;
  if (!geheim) return antwoord({ fout: 'geen bescherming ingesteld' }, 404);
  let token = '';
  try { token = String(((await ctx.request.json()) as { token?: unknown }).token ?? ''); } catch { /* leeg token */ }
  if (!(await turnstileGoed(token, geheim, ctx.request.headers.get('cf-connecting-ip')))) return antwoord({ fout: 'controle mislukt' }, 403);
  return antwoord(await maakPas(geheim), 200);
};
