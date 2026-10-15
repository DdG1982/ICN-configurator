/// <reference lib="webworker" />
/** Web Worker: bouwt het live dakmodel op de achtergrond, zodat de pagina soepel blijft tijdens het rekenen. */
import { bouwModel, type BouwOpties } from './bouw';
import { BronFout, pvgisViaProxy } from './bronnen';

export interface WerkVraag { adresId: string; pvgisUrl: string; pvgisKopjes: Record<string, string>; werkgebied: string[]; maat: BouwOpties['maat']; wp: number }

self.onmessage = async (e: MessageEvent<WerkVraag>) => {
  const v = e.data;
  try {
    const model = await bouwModel(v.adresId, {
      pvgis: pvgisViaProxy(v.pvgisUrl, v.pvgisKopjes), werkgebied: v.werkgebied, maat: v.maat, wp: v.wp,
      voortgang: (stap, info) => self.postMessage({ soort: 'stap', stap, info }),
    });
    self.postMessage({ soort: 'klaar', model });
  } catch (err) {
    self.postMessage({ soort: 'fout', bron: err instanceof BronFout ? err.bron : 'onbekend', bericht: err instanceof Error ? err.message : String(err) });
  }
};
