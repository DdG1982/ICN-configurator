/**
 * Live dakmodel ophalen voor een PDOK-adres-id. Rekent in een Web Worker; zonder Worker op de hoofdthread.
 * Per sessie onthouden we het resultaat, zodat terug en opnieuw kiezen direct gaat.
 */
import type { DakModel } from '../core/dak-model';
import type { BouwBron, Stap } from './bouw';
import type { WerkVraag } from './werker';
import showcase from '../../config/showcase.json';
import pricing from '../../config/pricing.json';

export class LiveFout extends Error {
  constructor(public bron: string, bericht: string) { super(bericht); }
}

const onthouden = new Map<string, DakModel>();

export function bouwLive(bron: BouwBron, voortgang: (stap: Stap, info: Record<string, unknown>) => void): Promise<DakModel> {
  const sleutel = typeof bron === 'string' ? bron : `pand:${bron.pandId}`;
  const klaar = onthouden.get(sleutel);
  if (klaar) return Promise.resolve(klaar);
  const vraag: WerkVraag = {
    bron,
    pvgisUrl: new URL('/api/pvgis', location.href).href,
    werkgebied: showcase.werkgebiedProvincies,
    maat: { breedte: pricing.paneelMaat.breedte, hoogte: pricing.paneelMaat.hoogte, rand: 0.4, tussen: 0.02 },
    wp: pricing.paneelWp,
  };
  if (typeof Worker === 'undefined') {
    return import('./bouw').then(async ({ bouwModel }) => {
      const { pvgisViaProxy } = await import('./bronnen');
      try {
        const m = await bouwModel(bron, { ...vraag, pvgis: pvgisViaProxy(vraag.pvgisUrl), voortgang: (s, i) => voortgang(s, i ?? {}) });
        onthouden.set(sleutel, m);
        return m;
      } catch (e) {
        throw new LiveFout((e as { bron?: string }).bron ?? 'onbekend', e instanceof Error ? e.message : String(e));
      }
    });
  }
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./werker.ts', import.meta.url), { type: 'module' });
    const stop = setTimeout(() => { w.terminate(); reject(new LiveFout('tijd', 'Het ophalen duurt te lang.')); }, 60000);
    w.onmessage = (e) => {
      const d = e.data;
      if (d.soort === 'stap') voortgang(d.stap, d.info ?? {});
      else {
        clearTimeout(stop);
        w.terminate();
        if (d.soort === 'klaar') { onthouden.set(sleutel, d.model); resolve(d.model); }
        else reject(new LiveFout(d.bron, d.bericht));
      }
    };
    w.onerror = (e) => { clearTimeout(stop); w.terminate(); reject(new LiveFout('onbekend', e.message || 'Rekenfout')); };
    w.postMessage(vraag);
  });
}
