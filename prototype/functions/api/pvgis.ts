/**
 * Doorgeefluik naar PVGIS 5.3 (EC JRC). PVGIS stuurt geen CORS-headers, dus de browser kan het niet zelf vragen.
 * Alleen de jaaropbrengst per kWp (E_y) gaat terug. Antwoorden blijven 30 dagen in de Cloudflare-cache;
 * de invoer is al afgerond (0,01 graad, 5 graden), dus buren delen dezelfde antwoorden.
 * Valt achter de toegangscode van _middleware.ts, en vraagt een pas als TURNSTILE_SECRET is ingesteld (server/pas.ts).
 */
import { vereisPas } from '../../server/pas';

interface Env { TURNSTILE_SECRET?: string }
const PVGIS = 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc';
const DERTIG_DAGEN = 60 * 60 * 24 * 30;

function getal(v: string | null, min: number, max: number): number | null {
  if (v === null || !/^-?\d+(\.\d+)?$/.test(v)) return null;
  const n = Number(v);
  return n >= min && n <= max ? n : null;
}

const antwoord = (data: unknown, status = 200, cache = 'no-store') =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': cache } });

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const geweigerd = await vereisPas(ctx.request, ctx.env.TURNSTILE_SECRET);
  if (geweigerd) return geweigerd;
  const q = new URL(ctx.request.url).searchParams;
  // Alleen Nederland (ruim) en zinnige dakhoeken.
  const lat = getal(q.get('lat'), 50.5, 53.8), lon = getal(q.get('lon'), 3.1, 7.4);
  const angle = getal(q.get('angle'), 0, 90), aspect = getal(q.get('aspect'), -180, 180);
  if (lat === null || lon === null || angle === null || aspect === null) return antwoord({ fout: 'ongeldige invoer' }, 400);

  const sleutel = `lat=${lat.toFixed(2)}&lon=${lon.toFixed(2)}&angle=${Math.round(angle)}&aspect=${Math.round(aspect)}`;
  const cacheUrl = new Request(`https://pvgis-cache.icn.invalid/v1?${sleutel}`);
  const cache = (caches as unknown as { default: Cache }).default;
  const bewaard = await cache.match(cacheUrl);
  if (bewaard) return bewaard;

  let ey: number | null = null;
  for (let poging = 0; poging < 3 && ey === null; poging++) {
    try {
      const r = await fetch(`${PVGIS}?${sleutel}&peakpower=1&loss=14&outputformat=json`, { headers: { 'user-agent': 'ICN-zonnepanelen-demo' } });
      if (r.ok) {
        const d = await r.json() as { outputs?: { totals?: { fixed?: { E_y?: number } } } };
        const v = d.outputs?.totals?.fixed?.E_y;
        if (typeof v === 'number') ey = v;
      }
    } catch { /* volgende poging */ }
    if (ey === null) await new Promise((r) => setTimeout(r, 400 * 2 ** poging));
  }
  if (ey === null) return antwoord({ fout: 'PVGIS niet bereikbaar' }, 502);

  const res = antwoord({ ey, bron: 'PVGIS 5.3, EC JRC' }, 200, `public, max-age=${DERTIG_DAGEN}`);
  ctx.waitUntil(cache.put(cacheUrl, res.clone()));
  return res;
};
