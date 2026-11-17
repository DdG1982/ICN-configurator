/** CSV-export (puntkomma, UTF-8 met BOM, opent goed in Nederlandse Excel) en ZIP met CSV plus de beoordeelde uitsneden. */
import { strToU8, zipSync } from 'fflate';
import { SOORT_TEKST } from './gebied';
import { links } from './links';
import type { PandRecord } from './opslag';
import { rdNaarWgs } from './rd';

const OORDEEL_TEKST = { waarschijnlijk: 'waarschijnlijk zonnepanelen', twijfel: 'twijfel', 'niet-gevonden': 'niet gevonden' } as const;
export const beeldBestand = (p: PandRecord) => `beelden/${p.id}_${p.beeldjaar ?? 'onbekend'}.jpg`;

const KOLOMMEN = [
  'pand_id', 'oordeel', 'beoordeling', 'toelichting_model', 'type_volgens_bag', 'gebruiksdoel_bag', 'grondvlak_m2', 'bouwjaar',
  'adres', 'adres_herkomst', 'adres_afstand_m', 'rd_x', 'rd_y', 'lat', 'lon', 'beeldjaar', 'luchtfotolaag', 'beeld_bestand',
  'gescand_op', 'model', 'bekijk_dak', 'google_maps', 'pdok_luchtfoto',
];

const cel = (v: unknown) => {
  const s = v === undefined || v === null ? '' : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function naarCsv(panden: PandRecord[], basis: string): string {
  const regels = panden.map((p) => {
    const l = links(basis, p);
    const { lat, lon } = rdNaarWgs(p.x, p.y);
    return [
      p.id, p.oordeel ? OORDEEL_TEKST[p.oordeel] : p.status, p.beoordeling ?? '', p.toelichting ?? '', SOORT_TEKST[p.soort], p.gebruiksdoel, p.opp, p.bouwjaar || '',
      p.adres ?? '', { eigen: 'eigen adres van dit pand', nabij: 'dichtstbijzijnde adres (niet van dit pand)', geen: 'geen adres binnen 150 m' }[p.adresSoort],
      p.adresAfstand ?? '', p.x.toFixed(1), p.y.toFixed(1), lat.toFixed(6), lon.toFixed(6), p.beeldjaar ?? '', p.laag ?? '',
      p.beeldjaar ? beeldBestand(p) : '', p.gescand ?? '', p.model ?? '', l.bekijkDak, l.googleMaps, l.pdokLuchtfoto,
    ].map(cel).join(';');
  });
  return '﻿' + [KOLOMMEN.join(';'), ...regels].join('\r\n') + '\r\n';
}

export async function naarZip(panden: PandRecord[], basis: string, beeld: (id: string) => Promise<Blob | undefined>): Promise<Blob> {
  const bestanden: Record<string, Uint8Array> = { 'dakscanner.csv': strToU8(naarCsv(panden, basis)) };
  for (const p of panden) {
    const b = await beeld(p.id);
    if (b) bestanden[beeldBestand(p)] = new Uint8Array(await b.arrayBuffer());
  }
  return new Blob([zipSync(bestanden, { level: 0 })], { type: 'application/zip' });
}

export function download(blob: Blob, naam: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = naam;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
