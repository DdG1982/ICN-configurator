/**
 * Links per vondst, altijd op het zwaartepunt van het gevonden pand (niet op het adres:
 * een schuur of stal kan ver van het woonhuis staan).
 */
import { rdNaarWgs } from './rd';
import { kader, wmsUrl } from './uitsnede';

export interface Links { bekijkDak: string; googleMaps: string; pdokLuchtfoto: string }

/** Permanente link naar dit pand in de eigen configurator: pand-id plus coördinaat, zodat hij ook zonder adres werkt. */
export function bekijkDakUrl(basis: string, id: string, x: number, y: number): string {
  return new URL(`./#pand=${encodeURIComponent(id)}&x=${x.toFixed(1)}&y=${y.toFixed(1)}`, basis).href;
}

export function googleMapsUrl(x: number, y: number): string {
  const { lat, lon } = rdNaarWgs(x, y);
  return `https://www.google.com/maps/@?api=1&map_action=map&center=${lat.toFixed(6)},${lon.toFixed(6)}&zoom=20&basemap=satellite`;
}

/**
 * Directe PDOK-link: de luchtfoto van het pand met omgeving, rechtstreeks uit de PDOK-luchtfotodienst (WMS).
 * Een link naar de PDOK-viewer zelf maken we niet: het URL-formaat daarvan konden we niet controleren.
 */
export function pdokLuchtfotoUrl(footprint: [number, number][], laag: string): string {
  const k = kader(footprint);
  const zijde = Math.max(120, k.zijde * 2);
  const mx = k.x0 + k.zijde / 2, my = k.y0 + k.zijde / 2;
  return wmsUrl(laag, mx - zijde / 2, my - zijde / 2, zijde, 1200);
}

export function links(basis: string, p: { id: string; x: number; y: number; footprint: [number, number][]; laag?: string }): Links {
  return {
    bekijkDak: bekijkDakUrl(basis, p.id, p.x, p.y),
    googleMaps: googleMapsUrl(p.x, p.y),
    pdokLuchtfoto: pdokLuchtfotoUrl(p.footprint, p.laag ?? '2026_orthoHR'),
  };
}
