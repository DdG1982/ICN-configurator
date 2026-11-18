import { execFile } from 'node:child_process';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';
import Anthropic from '@anthropic-ai/sdk';
import { beoordeel, geldigBeeld } from './src/scanner/claude-kern';

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

/**
 * Lokaal testen van de dakscanner: /api/classificeer doet hier wat functions/api/classificeer.ts op Cloudflare doet.
 * Sleutel uit ANTHROPIC_API_KEY. Met SCANNER_PROEF=1 (alleen lokaal) komt er zonder sleutel een duidelijk gemarkeerd
 * proefantwoord terug, om de interface te testen; dat is géén beoordeling.
 */
function classificeerLokaal(): Plugin {
  const handel = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/api/classificeer') || req.method !== 'POST') return next();
    const stuur = (status: number, data: unknown) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(data)); };
    let tekst = '';
    req.on('data', (d) => { tekst += d; if (tekst.length > 2e6) req.destroy(); });
    req.on('end', async () => {
      let body: { beeld?: unknown; opp?: unknown; jaar?: unknown } = {};
      try { body = JSON.parse(tekst); } catch { return stuur(400, { fout: 'ongeldig' }); }
      if (!geldigBeeld(body.beeld)) return stuur(400, { fout: 'ongeldig' });
      if (!process.env.ANTHROPIC_API_KEY) {
        if (process.env.SCANNER_PROEF === '1') return stuur(200, { oordeel: 'twijfel', omvang: 'enkele', dekking: '10-25', zicht: 'onduidelijk', toelichting: 'PROEFMODUS: geen echte beoordeling.', model: 'proef', tokensIn: 0, tokensUit: 0 });
        return stuur(503, { fout: 'geen-sleutel', bericht: 'Er is geen API-sleutel ingesteld (ANTHROPIC_API_KEY).' });
      }
      try {
        stuur(200, await beoordeel(new Anthropic({ maxRetries: 3 }), body.beeld, { opp: Number(body.opp), jaar: Number(body.jaar) }));
      } catch (e) {
        stuur(502, { fout: 'api', bericht: e instanceof Error ? e.message : String(e) });
      }
    });
  };
  return {
    name: 'classificeer-lokaal',
    configureServer: (s) => { s.middlewares.use(handel); },
    configurePreviewServer: (s) => { s.middlewares.use(handel); },
  };
}

export default defineConfig({
  base: './',
  plugins: [pvgisLokaal(), classificeerLokaal()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 800,
    rollupOptions: { input: { main: 'index.html', scanner: 'scanner.html' } },
  },
  worker: { format: 'es' },
});
