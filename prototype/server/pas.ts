/**
 * Botbescherming voor de API (gedeeld door functions/api/*).
 *
 * De bezoeker lost één keer Turnstile op (meestal onzichtbaar) en ruilt dat token via /api/pas in voor een
 * eigen pas: "<verloopt>.<HMAC>", 30 minuten geldig, mee te sturen als header x-icn-pas. Zo hoeft niet elke
 * PVGIS-vraag langs Turnstile (een Turnstile-token is maar 300 seconden geldig en maar één keer bruikbaar).
 * De pas zit in een header en niet in een cookie, zodat hij later ook werkt als de configurator als embed
 * op een ander domein draait (cookies van derden worden daar vaak geblokkeerd).
 *
 * Zonder TURNSTILE_SECRET staat alles open: lokaal testen en de demo achter de toegangscode.
 * Beperking: een pas is niet aan een IP gebonden en er wordt niet geteld per pas. Wie Turnstile oplost,
 * kan 30 minuten lang vragen. Tellen vraagt opslag (KV, Durable Objects of een rate-limit-regel).
 */
export const PAS_HEADER = 'x-icn-pas';
export const PAS_GELDIG_MS = 30 * 60 * 1000;
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function sleutel(geheim: string) {
  return crypto.subtle.importKey('raw', enc.encode(`icn-pas-v1:${geheim}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}
async function handtekening(geheim: string, verloopt: number) {
  return b64url(await crypto.subtle.sign('HMAC', await sleutel(geheim), enc.encode(String(verloopt))));
}

export async function maakPas(geheim: string, nu = Date.now()): Promise<{ pas: string; verloopt: number }> {
  const verloopt = nu + PAS_GELDIG_MS;
  return { pas: `${verloopt}.${await handtekening(geheim, verloopt)}`, verloopt };
}

/** Vergelijking in vaste tijd, zodat de handtekening niet stukje voor stukje te raden is. */
function gelijk(a: string, b: string) {
  if (a.length !== b.length) return false;
  let v = 0;
  for (let i = 0; i < a.length; i++) v |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return v === 0;
}

export async function pasGeldig(pas: string | null, geheim: string, nu = Date.now()): Promise<boolean> {
  if (!pas || pas.length > 200) return false;
  const [t, sig] = pas.split('.');
  const verloopt = Number(t);
  if (!Number.isFinite(verloopt) || verloopt < nu || verloopt > nu + PAS_GELDIG_MS || !sig) return false;
  return gelijk(sig, await handtekening(geheim, verloopt));
}

/** Voor de API-functies: null = doorgaan, anders het 401-antwoord. */
export async function vereisPas(req: Request, geheim: string | undefined): Promise<Response | null> {
  if (!geheim) return null;
  if (await pasGeldig(req.headers.get(PAS_HEADER), geheim)) return null;
  return new Response(JSON.stringify({ fout: 'pas ontbreekt of is verlopen' }), {
    status: 401, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

/** Controleert een Turnstile-token bij Cloudflare (eenmalig per token). */
export async function turnstileGoed(token: string, geheim: string, ip: string | null, doe: typeof fetch = fetch): Promise<boolean> {
  if (!token || token.length > 2048) return false;
  const form = new FormData();
  form.append('secret', geheim);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  try {
    const r = await doe(SITEVERIFY, { method: 'POST', body: form });
    const d = await r.json() as { success?: boolean };
    return d.success === true;
  } catch { return false; }
}
