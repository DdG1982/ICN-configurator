import { execFile } from 'node:child_process';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';

/**
 * Lokaal testen: /api/pvgis doet hier wat functions/api/pvgis.ts op Cloudflare doet.
 * Via curl, zodat de proxy van de ontwikkelomgeving gewoon werkt.
 */
function pvgisLokaal(): Plugin {
  const cache = new Map<string, string>();
  const handel = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/api/pvgis')) return next();
    const q = new URL(req.url, 'http://x').searchParams;
    const sleutel = ['lat', 'lon', 'angle', 'aspect'].map((k) => `${k}=${Number(q.get(k))}`).join('&');
    const stuur = (status: number, body: string) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(body); };
    if (cache.has(sleutel)) return stuur(200, cache.get(sleutel)!);
    execFile('curl', ['-sS', '-m', '60', `https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?${sleutel}&peakpower=1&loss=14&outputformat=json`], (fout, uit) => {
      try {
        const ey = JSON.parse(uit).outputs.totals.fixed.E_y;
        const body = JSON.stringify({ ey, bron: 'PVGIS 5.3, EC JRC' });
        cache.set(sleutel, body);
        stuur(200, body);
      } catch { stuur(502, JSON.stringify({ fout: String(fout ?? 'PVGIS niet bereikbaar') })); }
    });
  };
  return {
    name: 'pvgis-lokaal',
    configureServer: (s) => { s.middlewares.use(handel); },
    configurePreviewServer: (s) => { s.middlewares.use(handel); },
  };
}

export default defineConfig({
  base: './',
  plugins: [pvgisLokaal()],
  build: { target: 'es2020', chunkSizeWarningLimit: 800 },
  worker: { format: 'es' },
});
