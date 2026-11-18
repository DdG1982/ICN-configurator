import { describe, expect, it } from 'vitest';
import { controleerGebied, isRond, pandSoort, sorteer, vlakEnMidden, type Kandidaat } from './gebied';
import { googleMapsUrl, bekijkDakUrl, pdokLuchtfotoUrl } from './links';
import { naarCsv } from './export';
import type { PandRecord } from './opslag';
import { geldigBeeld, geraamdeKostenUsd, geschatAantal, klasse, rangScore } from './oordeel';
import { rdNaarWgs, wgsNaarRd } from './rd';
import { isLeeg, kader } from './uitsnede';

describe('RD <-> WGS84', () => {
  it('klopt met de PDOK Locatieserver (Peest) tot op ongeveer een meter', () => {
    const { lat, lon } = rdNaarWgs(229438.514, 563686.653);
    expect(lat).toBeCloseTo(53.05489772, 5);
    expect(lon).toBeCloseTo(6.49742953, 5);
  });
  it('heen en terug', () => {
    const { lat, lon } = rdNaarWgs(221447.5, 566764.2);
    const { x, y } = wgsNaarRd(lat, lon);
    expect(Math.abs(x - 221447.5)).toBeLessThan(1);
    expect(Math.abs(y - 566764.2)).toBeLessThan(1);
  });
});

describe('gebied en panden', () => {
  it('oppervlak en zwaartepunt van een rechthoek (gesloten ring)', () => {
    const r = vlakEnMidden([[0, 0], [20, 0], [20, 10], [0, 10], [0, 0]]);
    expect(r.opp).toBeCloseTo(200);
    expect(r.x).toBeCloseTo(10); expect(r.y).toBeCloseTo(5);
  });
  it('soort komt uit de BAG en heet nooit agrarisch', () => {
    expect(pandSoort('', 0)).toBe('bijgebouw');
    expect(pandSoort('woonfunctie', 1)).toBe('woning');
    expect(pandSoort('industriefunctie,woonfunctie', 2)).toBe('gemengd');
    expect(pandSoort('industriefunctie', 1)).toBe('bedrijf');
  });
  it('volgorde: eerst niet-woonpanden, groot eerst; woningen achteraan', () => {
    const k = (id: string, soort: Kandidaat['soort'], opp: number) => ({ id, soort, opp } as Kandidaat);
    const s = sorteer([k('w', 'woning', 900), k('b1', 'bijgebouw', 300), k('b2', 'bedrijf', 1200), k('g', 'gemengd', 400)]);
    expect(s.map((x) => x.id)).toEqual(['b2', 'b1', 'g', 'w']);
  });
  it('herkent ronde silo’s, niet een rechthoekige schuur', () => {
    const cirkel = Array.from({ length: 33 }, (_, i) => [10 * Math.cos((i / 32) * 2 * Math.PI), 10 * Math.sin((i / 32) * 2 * Math.PI)] as [number, number]);
    expect(isRond(cirkel)).toBe(true);
    expect(isRond([[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]])).toBe(false);
  });
  it('weigert te grote gebieden', () => {
    expect(controleerGebied({ soort: 'cirkel', x: 0, y: 0, r: 5000 })).toMatch(/straal/);
    expect(controleerGebied({ soort: 'cirkel', x: 0, y: 0, r: 1000 })).toBeNull();
    expect(controleerGebied({ soort: 'rechthoek', x0: 0, y0: 0, x1: 10000, y1: 10000 })).toMatch(/te groot/);
  });
});

describe('uitsnede', () => {
  it('kader: vierkant met marge, minstens 40 m, hooguit 768 px', () => {
    const k = kader([[0, 0], [100, 0], [100, 30], [0, 30]]);
    expect(k.zijde).toBeCloseTo(135);
    expect(k.px).toBe(768);
    expect(kader([[0, 0], [5, 0], [5, 5], [0, 5]]).zijde).toBe(40);
  });
  it('herkent een leeg (effen) beeld', () => {
    const effen = new Uint8ClampedArray(64 * 64 * 4).fill(255);
    expect(isLeeg(effen)).toBe(true);
    const ruis = effen.map((_, i) => (i * 37) % 251);
    expect(isLeeg(ruis)).toBe(false);
  });
});

describe('links en export', () => {
  const p: PandRecord = {
    id: '1699100000000524', footprint: [[229000, 563000], [229030, 563000], [229030, 563020], [229000, 563020]], opp: 600,
    x: 229015, y: 563010, bouwjaar: 1978, gebruiksdoel: '', eenheden: 0, soort: 'bijgebouw', adres: 'Schaapdijk 7, 9334 TJ Peest',
    adresSoort: 'nabij', adresAfstand: 85, scans: ['s'], status: 'klaar', oordeel: 'waarschijnlijk',
    toelichting: 'blauwe rijen; "zuid"', beeldjaar: 2026, laag: '2026_orthoHR', model: 'claude-haiku-5-5', gescand: '2026-11-17T10:00:00Z',
  };
  it('Google Maps en Bekijk dak gebruiken het pand, niet het adres', () => {
    const { lat, lon } = rdNaarWgs(p.x, p.y);
    expect(googleMapsUrl(p.x, p.y)).toContain(`center=${lat.toFixed(6)},${lon.toFixed(6)}`);
    expect(googleMapsUrl(p.x, p.y)).toContain('basemap=satellite');
    expect(bekijkDakUrl('https://demo.example/scanner.html', p.id, p.x, p.y)).toBe('https://demo.example/#pand=1699100000000524&x=229015.0&y=563010.0');
    expect(pdokLuchtfotoUrl(p.footprint, '2026_orthoHR')).toContain('layers=2026_orthoHR');
  });
  it('CSV: kolommen voor de drie links, beeldjaar en nette quoting', () => {
    const csv = naarCsv([p], 'https://demo.example/scanner.html');
    const [kop, regel] = csv.replace('﻿', '').trim().split('\r\n');
    const kolommen = kop.split(';');
    expect(kolommen).toEqual(expect.arrayContaining(['bekijk_dak', 'google_maps', 'pdok_luchtfoto', 'beeldjaar', 'beeld_bestand']));
    expect(regel).toContain('"blauwe rijen; ""zuid"""');
    expect(regel).toContain('dichtstbijzijnde adres (niet van dit pand)');
    expect(regel).toContain('beelden/1699100000000524_2026.jpg');
  });
});

describe('beoordeling', () => {
  it('accepteert alleen JPEG-base64', () => {
    expect(geldigBeeld('/9j/' + 'A'.repeat(2000))).toBe(true);
    expect(geldigBeeld('iVBOR' + 'A'.repeat(2000))).toBe(false);
    expect(geldigBeeld('/9j/<script>' + 'A'.repeat(2000))).toBe(false);
  });
  it('raming per gebouw ligt rond een paar honderdste cent', () => {
    expect(geraamdeKostenUsd()).toBeGreaterThan(0.0001);
    expect(geraamdeKostenUsd()).toBeLessThan(0.001);
  });
});

describe('rang en klasse', () => {
  it('volgorde: oordeel, dan omvang, dan zichtbaarheid', () => {
    const r = (o: Parameters<typeof rangScore>[0]) => rangScore(o);
    expect(r({ oordeel: 'waarschijnlijk', omvang: 'groot-deel', zicht: 'duidelijk' })).toBeGreaterThan(r({ oordeel: 'waarschijnlijk', omvang: 'groot-deel', zicht: 'onduidelijk' }));
    expect(r({ oordeel: 'waarschijnlijk', omvang: 'enkele', zicht: 'onduidelijk' })).toBeGreaterThan(r({ oordeel: 'twijfel', omvang: 'groot-deel', zicht: 'duidelijk' }));
    expect(r({ oordeel: 'twijfel', omvang: 'blok' })).toBeGreaterThan(r({ oordeel: 'twijfel', omvang: 'enkele' }));
  });
  it('klasse is leesbaar en markeert oude vondsten zonder omvang', () => {
    expect(klasse({ oordeel: 'waarschijnlijk', omvang: 'groot-deel', zicht: 'duidelijk' })).toBe('Waarschijnlijk · groot deel van het dak · duidelijk');
    expect(klasse({ oordeel: 'twijfel' })).toMatch(/oude versie/);
  });
});

describe('geschat aantal panelen', () => {
  it('bandbreedte uit grondvlak en bedekkingsklasse, afgerond op 5', () => {
    // 1000 m² × 25–50%: 250/2,2 = 113 -> 110; 500/1,8 = 278 -> 280
    expect(geschatAantal(1000, '25-50')).toEqual({ laag: 110, hoog: 280 });
    expect(geschatAantal(1000, 'geen')).toEqual({ laag: 0, hoog: 0 });
    expect(geschatAantal(1000, undefined)).toBeNull();
  });
  it('klein dak met weinig bedekking haalt geen 50 panelen', () => {
    expect(geschatAantal(200, 'tot-10')!.hoog).toBeLessThan(50);
    expect(geschatAantal(2000, '50-75')!.laag).toBeGreaterThan(400);
  });
});
