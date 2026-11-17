import '@fontsource-variable/inter';
import 'leaflet/dist/leaflet.css';
import './scanner.css';
import L from 'leaflet';

import { controleerGebied, NetFout, oppervlakGebied, pandenInGebied, SOORT_TEKST, type Gebied, type Kandidaat } from './gebied';
import { download, naarCsv, naarZip } from './export';
import { links } from './links';
import { geraamdeKostenUsd, kostenUsd } from './oordeel';
import {
  alleScans, allePanden, beeld, bewaarPand, bewaarScan, opslagGebruik, pand as leesPand, scan as leesScan,
  voegKandidatenToe, vraagBlijvendeOpslag, type PandRecord, type ScanRecord,
} from './opslag';
import { rdNaarWgs, wgsNaarRd } from './rd';
import { ScanStop, voerScanUit } from './scan';

/* ---------- hulpjes ---------- */
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const nl = (n: number, d = 0) => n.toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d });
const dollar = (n: number) => '$ ' + (n < 0.1 ? nl(n, 3) : nl(n, 2));
const duur = (s: number) => (s < 90 ? `${Math.round(s)} seconden` : `${Math.round(s / 60)} minuten`);
const LOCATIE = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1';
const BASIS = location.href.split('#')[0];
const SEC_PER_PAND = 1.6; // gemeten richtwaarde bij 3 tegelijk; hangt af van PDOK en de API

const KLEUR: Record<string, string> = { waarschijnlijk: '#2b9a3b', twijfel: '#e39b12', 'niet-gevonden': '#8a94a6', fout: '#c2362b', wacht: '#ffffff' };
const OORDEEL_TEKST: Record<string, string> = { waarschijnlijk: 'Waarschijnlijk zonnepanelen', twijfel: 'Twijfel', 'niet-gevonden': 'Niet gevonden', fout: 'Fout bij ophalen', wacht: 'Nog niet bekeken' };
const statusVan = (p: PandRecord) => (p.status === 'klaar' ? p.oordeel! : p.status);

/* ---------- kaart ---------- */
const kaart = L.map('kaart', { zoomControl: true, preferCanvas: true }).setView([53.13, 6.43], 13);
const lucht = L.tileLayer('https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/{z}/{x}/{y}.jpeg', {
  maxZoom: 21, maxNativeZoom: 19, attribution: 'Luchtfoto: <a href="https://www.pdok.nl">PDOK</a> (Beeldmateriaal Nederland)',
}).addTo(kaart);
const brt = L.tileLayer('https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/{z}/{x}/{y}.png', {
  maxZoom: 21, maxNativeZoom: 19, attribution: 'Kaart: <a href="https://www.pdok.nl">PDOK</a> (BRT)',
});
L.control.layers({ 'Luchtfoto (actueel)': lucht, Kaart: brt }).addTo(kaart);
const gebiedLaag = L.layerGroup().addTo(kaart);
const pandLaag = L.layerGroup().addTo(kaart);
const ll = (x: number, y: number): L.LatLngTuple => { const w = rdNaarWgs(x, y); return [w.lat, w.lon]; };

/* ---------- staat ---------- */
let gebied: Gebied | null = null;
let gebiedNaam = '';
let kandidaten: Kandidaat[] = [];
let huidigeScan: string | null = null;
let nieuwTeBeoordelen = 0;
let lopend: AbortController | null = null;
let filter: string = 'waarschijnlijk';
let getoond = 60;
const markers = new Map<string, L.CircleMarker>();
const beeldUrls = new Map<string, string>();

/* ---------- gebied kiezen ---------- */
document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  document.querySelectorAll<HTMLElement>('[data-paneel]').forEach((p) => (p.hidden = p.dataset.paneel !== b.dataset.tab));
}));

function zetGebied(g: Gebied, naam: string) {
  gebied = g; gebiedNaam = naam;
  gebiedLaag.clearLayers();
  const stijl = { color: '#ff00ff', weight: 2, fillOpacity: 0.04 };
  if (g.soort === 'cirkel') {
    L.circle(ll(g.x, g.y), { radius: g.r, ...stijl }).addTo(gebiedLaag);
    kaart.fitBounds(L.latLng(ll(g.x, g.y)).toBounds(g.r * 2.3));
  } else {
    const b = L.latLngBounds([ll(g.x0, g.y0), ll(g.x1, g.y1)]);
    L.rectangle(b, stijl).addTo(gebiedLaag);
    kaart.fitBounds(b.pad(0.1));
  }
  const fout = controleerGebied(g);
  meld('#gebied-melding', fout ?? `${naam} · ${nl(oppervlakGebied(g) / 1e6, 2)} km²`);
  $<HTMLButtonElement>('#zoek-knop').disabled = !!fout;
  $('#raming').hidden = true;
}

function meld(sel: string, tekst: string | null) {
  const el = $(sel);
  el.hidden = !tekst;
  el.textContent = tekst ?? '';
}

// Plaats zoeken via de PDOK Locatieserver
const veld = $<HTMLInputElement>('#plaats-veld'), plaatsLijst = $<HTMLUListElement>('#plaats-lijst');
let zoekTimer = 0, zoekAfbreken: AbortController | null = null;
veld.addEventListener('input', () => {
  clearTimeout(zoekTimer); zoekAfbreken?.abort();
  const q = veld.value.trim();
  if (q.length < 2) { plaatsLijst.hidden = true; return; }
  zoekTimer = window.setTimeout(async () => {
    zoekAfbreken = new AbortController();
    try {
      const r = await fetch(`${LOCATIE}/suggest?q=${encodeURIComponent(q)}&fq=type:(woonplaats OR adres OR weg)&rows=7`, { signal: zoekAfbreken.signal });
      const d = await r.json() as { response: { docs: { id: string; weergavenaam: string; type: string }[] } };
      plaatsLijst.innerHTML = d.response.docs.map((x) => `<li role="option" data-id="${esc(x.id)}">${esc(x.weergavenaam)} <small>${esc(x.type)}</small></li>`).join('');
      plaatsLijst.hidden = !d.response.docs.length;
    } catch { /* afgebroken */ }
  }, 180);
});
plaatsLijst.addEventListener('mousedown', async (e) => {
  const li = (e.target as HTMLElement).closest('li');
  if (!li) return;
  e.preventDefault();
  plaatsLijst.hidden = true;
  veld.value = li.firstChild?.textContent?.trim() ?? '';
  const r = await fetch(`${LOCATIE}/lookup?id=${encodeURIComponent(li.dataset.id!)}&fl=weergavenaam,centroide_rd`);
  const doc = (await r.json() as { response: { docs: Record<string, string>[] } }).response.docs[0];
  if (!doc) return;
  const [x, y] = (doc.centroide_rd.match(/[-\d.]+/g) ?? []).map(Number);
  zetGebied({ soort: 'cirkel', x, y, r: Number($<HTMLSelectElement>('#straal').value), naam: doc.weergavenaam }, `${doc.weergavenaam}, straal ${nl(Number($<HTMLSelectElement>('#straal').value))} m`);
});
veld.addEventListener('blur', () => setTimeout(() => (plaatsLijst.hidden = true), 150));
$<HTMLSelectElement>('#straal').addEventListener('change', () => {
  if (gebied?.soort === 'cirkel') {
    const r = Number($<HTMLSelectElement>('#straal').value);
    const naam = gebied.naam ?? 'Punt op de kaart';
    zetGebied({ ...gebied, r }, `${naam}, straal ${nl(r)} m`);
  }
});

// Klik op de kaart: middelpunt (alleen in de tab 'plaats' en niet tijdens tekenen)
let tekent = false;
kaart.on('click', (e: L.LeafletMouseEvent) => {
  if (tekent || $('[data-paneel="plaats"]').hidden || lopend) return;
  const { x, y } = wgsNaarRd(e.latlng.lat, e.latlng.lng);
  const r = Number($<HTMLSelectElement>('#straal').value);
  zetGebied({ soort: 'cirkel', x, y, r, naam: 'Punt op de kaart' }, `Punt op de kaart, straal ${nl(r)} m`);
});

// Rechthoek tekenen
$('#teken-knop').addEventListener('click', () => {
  tekent = true;
  kaart.dragging.disable();
  kaart.getContainer().style.cursor = 'crosshair';
  meld('#gebied-melding', 'Sleep nu een rechthoek op de kaart.');
  let begin: L.LatLng | null = null;
  let rh: L.Rectangle | null = null;
  const neer = (e: L.LeafletMouseEvent) => { begin = e.latlng; rh = L.rectangle(L.latLngBounds(begin, begin), { color: '#ff00ff', weight: 2 }).addTo(gebiedLaag); };
  const beweeg = (e: L.LeafletMouseEvent) => { if (begin && rh) rh.setBounds(L.latLngBounds(begin, e.latlng)); };
  const op = (e: L.LeafletMouseEvent) => {
    if (!begin) return;
    kaart.off('mousedown', neer).off('mousemove', beweeg).off('mouseup', op);
    kaart.dragging.enable();
    kaart.getContainer().style.cursor = '';
    setTimeout(() => (tekent = false), 50);
    const a = wgsNaarRd(begin.lat, begin.lng), b = wgsNaarRd(e.latlng.lat, e.latlng.lng);
    zetGebied({ soort: 'rechthoek', x0: a.x, y0: a.y, x1: b.x, y1: b.y }, 'Getekende rechthoek');
  };
  kaart.on('mousedown', neer).on('mousemove', beweeg).on('mouseup', op);
});

/* ---------- gebouwen zoeken en raming ---------- */
let zoekAbort: AbortController | null = null;
$('#zoek-knop').addEventListener('click', async () => {
  if (!gebied) return;
  const knop = $<HTMLButtonElement>('#zoek-knop');
  knop.disabled = true;
  zoekAbort?.abort(); zoekAbort = new AbortController();
  const minOpp = Math.max(50, Number($<HTMLInputElement>('#min-opp').value) || 150);
  try {
    const r = await pandenInGebied(gebied, minOpp, zoekAbort.signal, (t) => meld('#gebied-melding', t), $<HTMLInputElement>('#rond-overslaan').checked);
    kandidaten = r.kandidaten;
    const al = await Promise.all(kandidaten.map((k) => leesPand(k.id)));
    const bekend = al.filter((p) => p?.status === 'klaar').length;
    toonKandidatenOpKaart();
    toonRaming(r.totaal, minOpp, bekend, r.rond);
    meld('#gebied-melding', null);
  } catch (e) {
    meld('#gebied-melding', e instanceof NetFout ? e.message : `Zoeken mislukt: ${e instanceof Error ? e.message : e}`);
  } finally {
    knop.disabled = false;
  }
});

function toonKandidatenOpKaart() {
  pandLaag.clearLayers(); markers.clear();
  for (const k of kandidaten) zetMarker(k.id, k.x, k.y, 'wacht');
  // Gekleurd waar al een oordeel bekend is
  Promise.all(kandidaten.map((k) => leesPand(k.id))).then((ps) => ps.forEach((p) => p && werkMarkerBij(p)));
}

function toonRaming(totaal: number, minOpp: number, bekend: number, rond: number) {
  const nieuw = kandidaten.length - bekend;
  nieuwTeBeoordelen = nieuw;
  const soorten = kandidaten.reduce((m, k) => (m[k.soort] = (m[k.soort] ?? 0) + 1, m), {} as Record<string, number>);
  $('#raming-cijfers').innerHTML = `
    <dt>Panden in het gebied</dt><dd>${nl(totaal)}</dd>
    <dt>Met grondvlak ≥ ${nl(minOpp)} m²</dt><dd>${nl(kandidaten.length)}</dd>
    ${rond ? `<dt>Ronde bouwwerken overgeslagen</dt><dd>${nl(rond)}</dd>` : ''}
    <dd class="sc-sub" colspan="2">${(['bijgebouw', 'bedrijf', 'gemengd', 'woning'] as const).filter((s) => soorten[s]).map((s) => `${SOORT_TEKST[s]}: ${nl(soorten[s])}`).join(' · ')}</dd>
    <dt>Al eerder beoordeeld (worden overgeslagen)</dt><dd>${nl(bekend)}</dd>
    <dt>Te beoordelen</dt><dd><strong>${nl(nieuw)}</strong></dd>`;
  $('#raming').hidden = false;
  werkStartKnopBij();
}

function teDoen() {
  const limiet = Number($<HTMLInputElement>('#limiet').value) || Infinity;
  return Math.min(nieuwTeBeoordelen, limiet);
}
function werkStartKnopBij() {
  const n = teDoen();
  const kosten = n * geraamdeKostenUsd();
  $('#start-knop').textContent = `Start scan van ${nl(n)} gebouwen (ca. ${dollar(kosten)})`;
  $<HTMLButtonElement>('#start-knop').disabled = n === 0;
  $('#raming-uitleg').textContent = `Raming: ca. ${dollar(geraamdeKostenUsd())} per gebouw aan Claude-API-kosten (Haiku 5.5, prijs november 2026), `
    + `samen ca. ${dollar(kosten)}. Werkelijke kosten kunnen hoger uitvallen; tijdens de scan zie je het verbruik volgens de API. `
    + `Duur ca. ${duur(n * SEC_PER_PAND)}. De luchtfoto's en BAG-gegevens zijn gratis.`;
}
$('#limiet').addEventListener('input', werkStartKnopBij);

$('#start-knop').addEventListener('click', async () => {
  if (!gebied || !kandidaten.length || lopend) return;
  const n = teDoen();
  const kosten = n * geraamdeKostenUsd();
  if (n > 300 && !confirm(`Je start een scan van ${nl(n)} gebouwen.\nGeraamde API-kosten: ca. ${dollar(kosten)}, duur ca. ${duur(n * SEC_PER_PAND)}.\nJe kunt altijd stoppen en later hervatten. Doorgaan?`)) return;
  const s: ScanRecord = {
    id: `scan-${Date.now()}`, naam: `${gebiedNaam} · ≥ ${$<HTMLInputElement>('#min-opp').value} m²`, gebied,
    minOpp: Number($<HTMLInputElement>('#min-opp').value), gemaakt: new Date().toISOString(),
    pandIds: kandidaten.map((k) => k.id), status: 'nieuw',
  };
  await bewaarScan(s);
  await voegKandidatenToe(s.id, kandidaten);
  vraagBlijvendeOpslag();
  huidigeScan = s.id;
  $('#raming').hidden = true;
  await vulScanKeuze();
  start(s.id, Number($<HTMLInputElement>('#limiet').value) || Infinity);
});

/* ---------- scan uitvoeren ---------- */
async function start(scanId: string, limiet = Infinity) {
  lopend = new AbortController();
  $('#voortgang').hidden = false;
  $('#stop-knop').hidden = false; $('#hervat-knop').hidden = true;
  meld('#scan-melding', null);
  const t0 = performance.now();
  try {
    const v = await voerScanUit(scanId, lopend.signal, (v) => {
      $<HTMLProgressElement>('#voortgang-balk').max = v.totaal;
      $<HTMLProgressElement>('#voortgang-balk').value = v.klaar;
      $('#voortgang-tekst').textContent = `${nl(v.klaar)} van ${nl(v.totaal)} beoordeeld`
        + (v.fouten ? ` · ${nl(v.fouten)} fout` : '')
        + (v.tokensIn ? ` · verbruik deze sessie ${dollar(kostenUsd(v.tokensIn, v.tokensUit))} (volgens API-telling)` : '');
      if (v.laatste) { werkMarkerBij(v.laatste); planLijst(); }
    }, limiet);
    meld('#scan-melding', `Klaar in ${duur((performance.now() - t0) / 1000)}.${v.klaar < v.totaal ? ' Niet alle gebouwen zijn beoordeeld; je kunt hervatten.' : ''}`);
  } catch (e) {
    const teksten: Record<string, string> = {
      'geen-sleutel': 'Er is geen (geldige) Anthropic API-sleutel ingesteld. Zet ANTHROPIC_API_KEY als secret in het Cloudflare Pages-project en probeer opnieuw.',
      daglimiet: 'De daglimiet voor beoordelingen is bereikt. Morgen kun je hervatten.',
    };
    meld('#scan-melding', e instanceof ScanStop ? (teksten[e.reden] ?? e.message) : `Scan gestopt: ${e instanceof Error ? e.message : e}`);
  } finally {
    lopend = null;
    $('#stop-knop').hidden = true;
    const s = await leesScan(scanId);
    $('#hervat-knop').hidden = !s || s.status === 'klaar';
    await vulScansLijst();
    planLijst();
  }
}
$('#stop-knop').addEventListener('click', () => lopend?.abort());
$('#hervat-knop').addEventListener('click', () => { if (huidigeScan && !lopend) start(huidigeScan); });

/* ---------- markers ---------- */
function zetMarker(id: string, x: number, y: number, status: string) {
  const m = L.circleMarker(ll(x, y), { radius: 6, color: '#0b1c6a', weight: 1, fillColor: KLEUR[status], fillOpacity: 0.95 });
  m.on('click', () => toonKaart(id));
  m.addTo(pandLaag);
  markers.set(id, m);
}
function werkMarkerBij(p: PandRecord) {
  const st = statusVan(p);
  const m = markers.get(p.id);
  if (!m) return zetMarker(p.id, p.x, p.y, st);
  m.setStyle({ fillColor: KLEUR[st], weight: p.beoordeling === 'bevestigd' ? 3 : 1, color: p.beoordeling === 'afgewezen' ? '#c2362b' : '#0b1c6a', radius: st === 'waarschijnlijk' ? 8 : 6 });
  if (st === 'waarschijnlijk' || st === 'twijfel') m.bringToFront();
}

async function toonKaart(id: string) {
  const p = await leesPand(id);
  if (!p) return;
  if (p.status === 'klaar' && filter !== statusVan(p) && filter !== 'alle') { filter = statusVan(p); getoond = 60; }
  await tekenLijst();
  const el = document.getElementById(`p-${id}`);
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el?.classList.add('sc-flits');
  setTimeout(() => el?.classList.remove('sc-flits'), 1600);
}

/* ---------- lijst ---------- */
async function pandenInWeergave(): Promise<PandRecord[]> {
  const keuze = $<HTMLSelectElement>('#weergave-scan').value;
  const alle = await allePanden();
  return keuze === 'alle' ? alle.filter((p) => p.status !== 'wacht') : alle.filter((p) => p.scans.includes(keuze));
}

let lijstTimer = 0;
function planLijst() { clearTimeout(lijstTimer); lijstTimer = window.setTimeout(tekenLijst, 400); }

async function tekenLijst() {
  const panden = await pandenInWeergave();
  const tel: Record<string, number> = {};
  for (const p of panden) tel[statusVan(p)] = (tel[statusVan(p)] ?? 0) + 1;
  const opties = ['waarschijnlijk', 'twijfel', 'niet-gevonden', 'fout', 'wacht', 'alle'];
  $('#filters').innerHTML = opties.filter((o) => o === 'alle' || tel[o] || o === filter).map((o) =>
    `<button type="button" data-filter="${o}" aria-pressed="${o === filter}">${o === 'alle' ? 'Alle' : OORDEEL_TEKST[o]} <span>${nl(o === 'alle' ? panden.length : tel[o] ?? 0)}</span></button>`).join('');
  const zicht = panden.filter((p) => filter === 'alle' || statusVan(p) === filter)
    .sort((a, b) => (b.beoordeling === 'bevestigd' ? 1 : 0) - (a.beoordeling === 'bevestigd' ? 1 : 0) || b.opp - a.opp);
  const lijst = $('#lijst');
  const deel = zicht.slice(0, getoond);
  lijst.innerHTML = deel.length ? deel.map(kaartHtml).join('') : '<li class="sc-leeg">Geen gebouwen in deze categorie.</li>';
  $('#meer-knop').hidden = zicht.length <= getoond;
  for (const p of deel) {
    if (!p.beeldjaar) continue;
    const img = lijst.querySelector<HTMLImageElement>(`#p-${p.id} img`);
    if (!img) continue;
    let url = beeldUrls.get(p.id);
    if (!url) { const b = await beeld(p.id); if (b) { url = URL.createObjectURL(b); beeldUrls.set(p.id, url); } }
    if (url) img.src = url;
  }
}

function kaartHtml(p: PandRecord): string {
  const st = statusVan(p);
  const l = links(BASIS, p);
  const adres = p.adres
    ? p.adresSoort === 'eigen' ? esc(p.adres) : `<span class="sc-zacht">Dichtstbijzijnde adres (${nl(p.adresAfstand ?? 0)} m, niet van dit pand):</span> ${esc(p.adres)}`
    : '<span class="sc-zacht">Geen adres binnen 150 m</span>';
  return `<li class="sc-vondst" id="p-${p.id}" data-id="${p.id}">
    ${p.beeldjaar ? `<a class="sc-beeld" href="${esc(l.pdokLuchtfoto)}" target="_blank" rel="noopener"><img alt="Luchtfoto ${p.beeldjaar} van pand ${p.id}, contour in magenta" width="160" height="160" /></a>` : '<div class="sc-beeld sc-beeld-leeg"></div>'}
    <div class="sc-info">
      <p><span class="sc-label" style="--k:${KLEUR[st]}">${OORDEEL_TEKST[st]}</span>
        ${p.beoordeling ? `<span class="sc-label sc-label-${p.beoordeling}">${p.beoordeling === 'bevestigd' ? 'Bevestigd' : 'Afgewezen'}</span>` : ''}
        ${p.model === 'proef' ? '<span class="sc-label sc-label-afgewezen">PROEF</span>' : ''}</p>
      ${p.toelichting ? `<p class="sc-toel">Model: “${esc(p.toelichting)}”</p>` : ''}
      ${p.fout ? `<p class="sc-toel">${esc(p.fout)}</p>` : ''}
      <p>${adres}</p>
      <p class="sc-zacht">${SOORT_TEKST[p.soort]}${p.gebruiksdoel ? ` (${esc(p.gebruiksdoel)})` : ''} · grondvlak ${nl(p.opp)} m²${p.bouwjaar ? ` · bouwjaar ${p.bouwjaar}` : ''}${p.beeldjaar ? ` · luchtfoto ${p.beeldjaar}` : ''} · BAG ${p.id}</p>
      <p class="sc-links"><a href="${esc(l.bekijkDak)}" target="_blank" rel="noopener">Bekijk dak</a>
        <a href="${esc(l.googleMaps)}" target="_blank" rel="noopener">Google Maps</a>
        <a href="${esc(l.pdokLuchtfoto)}" target="_blank" rel="noopener">PDOK-luchtfoto</a></p>
      ${p.status === 'klaar' ? `<p class="sc-rij">
        <button type="button" class="sc-knop sc-klein-knop" data-beoordeel="bevestigd" aria-pressed="${p.beoordeling === 'bevestigd'}">Bevestigen</button>
        <button type="button" class="sc-knop sc-klein-knop" data-beoordeel="afgewezen" aria-pressed="${p.beoordeling === 'afgewezen'}">Afwijzen</button></p>` : ''}
    </div></li>`;
}

$('#filters').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-filter]');
  if (!b) return;
  filter = b.dataset.filter!; getoond = 60;
  tekenLijst();
});
$('#meer-knop').addEventListener('click', () => { getoond += 60; tekenLijst(); });
$('#lijst').addEventListener('click', async (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-beoordeel]');
  if (!b) {
    const li = (e.target as HTMLElement).closest<HTMLElement>('.sc-vondst');
    if (li && !(e.target as HTMLElement).closest('a')) { const m = markers.get(li.dataset.id!); if (m) kaart.setView(m.getLatLng(), Math.max(kaart.getZoom(), 17)); }
    return;
  }
  const id = b.closest<HTMLElement>('.sc-vondst')!.dataset.id!;
  const p = await leesPand(id);
  if (!p) return;
  const nieuw = b.dataset.beoordeel as PandRecord['beoordeling'];
  p.beoordeling = p.beoordeling === nieuw ? undefined : nieuw;
  p.beoordeeld = p.beoordeling ? new Date().toISOString() : undefined;
  await bewaarPand(p);
  werkMarkerBij(p);
  tekenLijst();
});

/* ---------- export ---------- */
async function exportPanden() {
  const ps = (await pandenInWeergave()).filter((p) => filter === 'alle' || statusVan(p) === filter);
  return ps.sort((a, b) => b.opp - a.opp);
}
const datum = () => new Date().toISOString().slice(0, 10);
$('#csv-knop').addEventListener('click', async () => {
  download(new Blob([naarCsv(await exportPanden(), BASIS)], { type: 'text/csv;charset=utf-8' }), `dakscanner-${filter}-${datum()}.csv`);
});
$('#zip-knop').addEventListener('click', async () => {
  const knop = $<HTMLButtonElement>('#zip-knop');
  knop.disabled = true;
  try { download(await naarZip(await exportPanden(), BASIS, beeld), `dakscanner-${filter}-${datum()}.zip`); } finally { knop.disabled = false; }
});

/* ---------- bewaarde scans ---------- */
async function vulScanKeuze() {
  const scans = await alleScans();
  const sel = $<HTMLSelectElement>('#weergave-scan');
  sel.innerHTML = `<option value="alle">Alle scans</option>` + scans.map((s) => `<option value="${s.id}">${esc(s.naam)} (${new Date(s.gemaakt).toLocaleDateString('nl-NL')})</option>`).join('');
  sel.value = huidigeScan ?? 'alle';
}
$('#weergave-scan').addEventListener('change', async () => {
  const v = $<HTMLSelectElement>('#weergave-scan').value;
  huidigeScan = v === 'alle' ? null : v;
  await toonScanOpKaart();
  tekenLijst();
});

async function toonScanOpKaart() {
  pandLaag.clearLayers(); markers.clear();
  const ps = await pandenInWeergave();
  for (const p of ps) zetMarker(p.id, p.x, p.y, statusVan(p));
  ps.forEach(werkMarkerBij);
  if (huidigeScan) {
    const s = await leesScan(huidigeScan);
    if (s) { zetGebied(s.gebied, s.naam); $('#raming').hidden = true; }
  } else if (ps.length) kaart.fitBounds(L.latLngBounds(ps.map((p) => ll(p.x, p.y))).pad(0.1));
}

async function vulScansLijst() {
  const scans = await alleScans();
  const ps = await allePanden();
  $('#scans').innerHTML = scans.length ? scans.map((s) => {
    const klaar = s.pandIds.filter((id) => ps.find((p) => p.id === id)?.status === 'klaar').length;
    return `<li><button type="button" class="sc-link" data-open="${s.id}">${esc(s.naam)}</button>
      <small>${new Date(s.gemaakt).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' })} · ${nl(klaar)}/${nl(s.pandIds.length)} beoordeeld</small>
      ${klaar < s.pandIds.length ? `<button type="button" class="sc-knop sc-klein-knop" data-hervat="${s.id}">Hervatten</button>` : ''}</li>`;
  }).join('') : '<li class="sc-zacht">Nog geen scans.</li>';
  const gebruik = await opslagGebruik();
  $('#opslag-info').textContent = `Opgeslagen in deze browser${gebruik !== null ? ` (${nl(gebruik / 1e6, 1)} MB)` : ''}. Op een ander apparaat zie je deze scans niet; exporteer de ZIP om ze te bewaren of te delen.`;
}
$('#scans').addEventListener('click', async (e) => {
  const t = e.target as HTMLElement;
  const open = t.closest<HTMLElement>('[data-open]')?.dataset.open, hervat = t.closest<HTMLElement>('[data-hervat]')?.dataset.hervat;
  const id = open ?? hervat;
  if (!id || lopend) return;
  huidigeScan = id;
  await vulScanKeuze();
  await toonScanOpKaart();
  tekenLijst();
  if (hervat) {
    const s = await leesScan(id);
    const ps = await allePanden();
    const rest = s ? s.pandIds.filter((pid) => ps.find((p) => p.id === pid)?.status !== 'klaar').length : 0;
    if (rest > 300 && !confirm(`Nog ${nl(rest)} gebouwen te beoordelen, ca. ${dollar(rest * geraamdeKostenUsd())}. Doorgaan?`)) return;
    start(id);
  }
});

/* ---------- start ---------- */
(async () => {
  await vulScanKeuze();
  await vulScansLijst();
  const scans = await alleScans();
  if (scans.length) { huidigeScan = scans[0].id; await vulScanKeuze(); await toonScanOpKaart(); }
  tekenLijst();
})();

