import '@fontsource-variable/inter';
import '@fontsource-variable/fraunces';
import './styles.css';

import market from '../config/market.json';
import pricing from '../config/pricing.json';
import showcase from '../config/showcase.json';
import { voorbeeldwoning as model } from './data/voorbeeldwoning';
import { instraling, instralingsRaster, jaarsomMidden, puntOpVlak } from './calc/shade';
import { paneelPlekken, type Plek } from './calc/layout';
import { vlakNormaal } from './calc/sun';
import {
  besparingBand, geschatVerbruik, investeringBand, opbrengstBand, rondAf, terugverdientijd, vermogenKwp,
  type Band, type MarktAannames, type Scenario,
} from './calc/opbrengst';
import { maakEnergiestroom } from './ui/energiestroom';
import type { SceneApi, Thema } from './ui/scene3d';

/* ---------- Hulpjes ---------- */
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const nl = (n: number, dec = 0) => n.toLocaleString('nl-NL', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const euro = (n: number) => '€\u00a0' + nl(n);
const band = (b: Band, f: (n: number) => string) => (Math.abs(b.high - b.low) < 1e-6 ? f(b.low) : `${f(b.low)}\u00a0– ${f(b.high)}`);
const wacht = (ms: number) => new Promise((r) => setTimeout(r, ms));
const params = new URLSearchParams(location.search);
const minderBeweging = matchMedia('(prefers-reduced-motion: reduce)').matches;

declare global { interface Window { dataLayer: unknown[] } }
window.dataLayer = window.dataLayer || [];
const meet = (event: string, extra: Record<string, unknown> = {}) => window.dataLayer.push({ event, ...extra });

const opslag = {
  lees(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  zet(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* geen opslag beschikbaar */ } },
};

/* ---------- Richting A/B ---------- */
let richting: Thema = (params.get('richting') as Thema) || (opslag.lees('icn-richting') as Thema) || 'goudenuur';
let scene: SceneApi | null = null;
function zetRichting(r: Thema) {
  richting = r === 'daglicht' ? 'daglicht' : 'goudenuur';
  document.body.dataset.richting = richting;
  document.querySelectorAll<HTMLButtonElement>('[data-richting-knop]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.richtingKnop === richting)));
  opslag.zet('icn-richting', richting);
  scene?.zetThema(richting);
}
zetRichting(richting);
document.querySelectorAll<HTMLButtonElement>('[data-richting-knop]').forEach((b) => b.addEventListener('click', () => zetRichting(b.dataset.richtingKnop as Thema)));
if (params.get('intern') === '1') document.querySelectorAll<HTMLElement>('[data-intern]').forEach((e) => (e.hidden = false));
document.querySelector('[data-terug]')?.addEventListener('click', (e) => { e.preventDefault(); location.href = location.pathname + location.search; });

/* ---------- Adresveld met suggesties ---------- */
interface Adres { label: string; provincie: string; soort: string }
const adressen: Adres[] = showcase.adressen;
const veld = $<HTMLInputElement>('#adres-veld');
const lijst = $<HTMLUListElement>('#adres-lijst');
let gekozen: Adres | null = null;
let actiefIndex = -1;
let treffers: Adres[] = [];

function toonSuggesties() {
  const q = veld.value.trim().toLowerCase().replace(/\s+/g, ' ');
  treffers = q.length < 2 ? [] : adressen.filter((a) => a.label.toLowerCase().replace(/\s+/g, ' ').includes(q)).slice(0, 6);
  lijst.innerHTML = treffers.map((a, i) => {
    const [straat, rest] = a.label.split(/,(.+)/);
    return `<li role="option" id="opt-${i}" aria-selected="${i === actiefIndex}"><span>${straat}</span><small>${rest?.trim() ?? ''}</small></li>`;
  }).join('');
  lijst.hidden = treffers.length === 0;
  veld.setAttribute('aria-expanded', String(!lijst.hidden));
  veld.setAttribute('aria-activedescendant', actiefIndex >= 0 ? `opt-${actiefIndex}` : '');
}
function kies(a: Adres) {
  gekozen = a; veld.value = a.label; lijst.hidden = true; veld.setAttribute('aria-expanded', 'false');
  $('#adres-fout').hidden = true;
}
veld.addEventListener('input', () => { gekozen = null; actiefIndex = -1; toonSuggesties(); });
veld.addEventListener('keydown', (e) => {
  if (lijst.hidden) return;
  if (e.key === 'ArrowDown') { actiefIndex = Math.min(treffers.length - 1, actiefIndex + 1); toonSuggesties(); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { actiefIndex = Math.max(0, actiefIndex - 1); toonSuggesties(); e.preventDefault(); }
  else if (e.key === 'Enter' && actiefIndex >= 0) { kies(treffers[actiefIndex]); e.preventDefault(); }
  else if (e.key === 'Escape') { lijst.hidden = true; }
});
lijst.addEventListener('mousedown', (e) => {
  const li = (e.target as HTMLElement).closest('li');
  if (!li) return;
  e.preventDefault();
  kies(treffers[Number(li.id.replace('opt-', ''))]);
});
veld.addEventListener('blur', () => setTimeout(() => (lijst.hidden = true), 120));

$('#adres-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const tekst = veld.value.trim();
  if (!gekozen) {
    const exact = adressen.find((a) => a.label.toLowerCase() === tekst.toLowerCase());
    if (exact) gekozen = exact;
  }
  if (!gekozen) {
    if (!/\d/.test(tekst)) {
      const fout = $('#adres-fout');
      fout.textContent = 'Vul je straat en huisnummer in, of kies een adres uit de lijst.';
      fout.hidden = false; veld.focus();
      return;
    }
    gekozen = { label: tekst, provincie: 'onbekend', soort: 'woning' };
  }
  start(gekozen);
});
$('#voorbeeld-knop').addEventListener('click', () => start({ label: 'Voorbeeldwoning', provincie: 'Drenthe', soort: 'voorbeeld' }));

/* ---------- Berekening ---------- */
const zuid = model.dakvlakken[0];
const noord = model.dakvlakken[1];
const raster = instralingsRaster(model, zuid, 26, 10);
let plekken: Plek[] = paneelPlekken(zuid.breedte, zuid.diepte, pricing.paneelMaat, 0.3, raster, 0.88);
const noordRatio = jaarsomMidden(model, noord) / jaarsomMidden(model, zuid);
const kwhPerKwp = 930; // Placeholder: PVGIS-orde voor Noord-Nederland bij zuid 40°, wordt live uit PVGIS gehaald.
const zuidNormaal = vlakNormaal(zuid.helling, zuid.azimut);

const staat = {
  scenario: 'na2026' as Scenario,
  personen: 3,
  verbruikEigen: null as number | null,
  batterij: false,
  eigen: null as null | { prijs: number; vergoeding: number; kosten: number },
  dag: 172,
  uur: richting === 'goudenuur' ? 19 : 13.5,
};

function aannames(): MarktAannames {
  if (!staat.eigen) return market;
  const v = (x: number) => ({ low: x, high: x });
  return { ...market, stroomprijsPerKwh: v(staat.eigen.prijs), terugleververgoedingPerKwh: v(staat.eigen.vergoeding), terugleverkostenPerKwh: v(staat.eigen.kosten) };
}
const verbruik = () => staat.verbruikEigen ?? geschatVerbruik(staat.personen);

function bereken() {
  const actief = plekken.filter((p) => p.actief);
  const kwp = vermogenKwp(actief.length, pricing.paneelWp);
  const kwh = actief.reduce((s, p) => s + (pricing.paneelWp / 1000) * kwhPerKwp * p.factor, 0);
  const opbrengst = opbrengstBand(kwh, market.opbrengstMarge);
  const zc = staat.batterij ? market.zelfconsumptie.metBatterij : market.zelfconsumptie.zonderBatterij;
  const besparing = besparingBand(opbrengst, verbruik(), zc, aannames(), staat.scenario);
  const investering = investeringBand(actief.length * pricing.paneelWp, pricing.prijsPerWp);
  return { aantal: actief.length, kwp, kwh, opbrengst, besparing, investering, terug: terugverdientijd(investering, besparing) };
}

function toonResultaat(aantalZichtbaar?: number) {
  const r = bereken();
  const n = aantalZichtbaar ?? r.aantal;
  $('#paneel-aantal').textContent = String(n);
  $('#vermogen').textContent = nl(vermogenKwp(n, pricing.paneelWp), 1);
  if (aantalZichtbaar !== undefined && aantalZichtbaar < r.aantal) return;
  const midden = rondAf(r.kwh, 100);
  $('#opbrengst').textContent = nl(midden);
  $('#opbrengst-band').textContent = `bandbreedte ${band({ low: rondAf(r.opbrengst.low, 100), high: rondAf(r.opbrengst.high, 100) }, nl)} kWh`;
  $('#besparing').textContent = band({ low: rondAf(r.besparing.low, 10), high: rondAf(r.besparing.high, 10) }, euro);
  $('#investering').textContent = band({ low: rondAf(r.investering.low, 100), high: rondAf(r.investering.high, 100) }, euro);
  const t = r.terug;
  const centraal = (r.investering.low + r.investering.high) / (r.besparing.low + r.besparing.high);
  const jr = (x: number) => nl(x, x % 1 ? 1 : 0);
  $('#terugverdien').innerHTML = !isFinite(t.high) || centraal <= 0 ? 'niet terug te verdienen'
    : `ca. ${jr(rondAf(centraal, 0.5))} jaar<small>${Math.abs(t.high - t.low) < 0.01 ? 'met jouw aannames' : `bandbreedte ${jr(rondAf(t.low, 0.5))}–${jr(rondAf(t.high, 0.5))} jaar`}</small>`;
  $('#cta-balk-getal').textContent = nl(midden);
  $<HTMLInputElement>('#a-verbruik').placeholder = nl(geschatVerbruik(staat.personen));
}

/* ---------- Zon, schaduw en live vermogen ---------- */
const stroomUpdate = maakEnergiestroom($('#stroom'));
const maanden = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
function datumLabel(dag: number) {
  const d = new Date(2026, 0, dag);
  return `${d.getDate()} ${maanden[d.getMonth()]}`;
}
function huisVerbruikKw(uur: number) {
  const vorm = 0.55 + 0.7 * Math.exp(-((uur - 8) ** 2) / 2) + 1.5 * Math.exp(-((uur - 18.5) ** 2) / 3);
  return (verbruik() / 8760) * vorm;
}
function vulSchuif(i: HTMLInputElement) {
  const f = (Number(i.value) - Number(i.min)) / (Number(i.max) - Number(i.min));
  i.style.setProperty('--vulling', `${f * 100}%`);
}
function updateZon() {
  const uur = staat.uur, dag = staat.dag;
  $('#uur-uit').textContent = `${String(Math.floor(uur)).padStart(2, '0')}:${String(Math.round((uur % 1) * 60)).padStart(2, '0')}`;
  $('#dag-uit').textContent = datumLabel(dag);
  let kw = 0, schaduw = 0, zonOp = false;
  const actief = plekken.filter((p) => p.actief);
  for (const p of actief) {
    const pt = puntOpVlak(model, zuid, p.u, p.v); pt.y += 0.15;
    const r = instraling(model, pt, zuidNormaal, dag, uur);
    if (r.wm2 > 0) zonOp = true;
    if (r.schaduw) schaduw++;
    kw += (pricing.paneelWp / 1000) * (r.wm2 / 1000) * 0.86;
  }
  $('#live-kw').textContent = nl(kw, 1);
  $('#schaduw-uitleg').textContent = !zonOp ? 'De zon staat onder de horizon.'
    : schaduw === 0 ? 'Geen schaduw op je panelen op dit moment.'
      : `Schaduw van de boom of de buren op ${schaduw} van de ${actief.length} panelen.`;
  $('#stroom-uitleg').textContent = stroomUpdate({ pv: kw, verbruik: huisVerbruikKw(uur) });
  scene?.zetZon(dag, uur);
}
const uurIn = $<HTMLInputElement>('#uur'), dagIn = $<HTMLInputElement>('#dag');
uurIn.value = String(staat.uur);
let zonGemeten = false;
for (const i of [uurIn, dagIn]) {
  vulSchuif(i);
  i.addEventListener('input', () => {
    staat.uur = Number(uurIn.value); staat.dag = Number(dagIn.value); vulSchuif(i); updateZon();
    if (!zonGemeten) { zonGemeten = true; meet('icn_zonbaan_gebruikt'); }
  });
}
let speelt = 0;
$('#speel-dag').addEventListener('click', (e) => {
  const knop = e.currentTarget as HTMLButtonElement;
  if (speelt) { cancelAnimationFrame(speelt); speelt = 0; knop.setAttribute('aria-pressed', 'false'); knop.innerHTML = '<span aria-hidden="true">▶</span> Speel een dag af'; return; }
  knop.setAttribute('aria-pressed', 'true'); knop.innerHTML = '<span aria-hidden="true">❚❚</span> Pauze';
  const t0 = performance.now(), van = 5, tot = 22, duur = 9000;
  const stap = (nu: number) => {
    const f = Math.min(1, (nu - t0) / duur);
    staat.uur = van + (tot - van) * f; uurIn.value = String(staat.uur); vulSchuif(uurIn); updateZon();
    if (f < 1) speelt = requestAnimationFrame(stap);
    else { speelt = 0; knop.setAttribute('aria-pressed', 'false'); knop.innerHTML = '<span aria-hidden="true">▶</span> Speel een dag af'; }
  };
  if (minderBeweging) { staat.uur = 13; uurIn.value = '13'; vulSchuif(uurIn); updateZon(); knop.setAttribute('aria-pressed', 'false'); knop.innerHTML = '<span aria-hidden="true">▶</span> Speel een dag af'; return; }
  speelt = requestAnimationFrame(stap);
});
$<HTMLInputElement>('#warmte-schakel').addEventListener('change', (e) => {
  const aan = (e.target as HTMLInputElement).checked;
  scene?.zetWarmtekaart(aan);
  $('#warmte-legenda').hidden = !aan;
});

/* ---------- Scenario en aannames ---------- */
document.querySelectorAll<HTMLButtonElement>('[data-scenario]').forEach((b) => b.addEventListener('click', () => {
  staat.scenario = b.dataset.scenario as Scenario;
  document.querySelectorAll('[data-scenario]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
  toonResultaat();
}));
const aIn = (id: string) => $<HTMLInputElement>(id);
function vulAannames() {
  aIn('#a-prijs').value = String(staat.eigen?.prijs ?? ((market.stroomprijsPerKwh.low + market.stroomprijsPerKwh.high) / 2).toFixed(2));
  aIn('#a-vergoeding').value = String(staat.eigen?.vergoeding ?? ((market.terugleververgoedingPerKwh.low + market.terugleververgoedingPerKwh.high) / 2).toFixed(2));
  aIn('#a-kosten').value = String(staat.eigen?.kosten ?? ((market.terugleverkostenPerKwh.low + market.terugleverkostenPerKwh.high) / 2).toFixed(2));
}
vulAannames();
aIn('#a-personen').addEventListener('input', (e) => { staat.personen = Number((e.target as HTMLInputElement).value) || 3; toonResultaat(); updateZon(); });
aIn('#a-verbruik').addEventListener('input', (e) => { const v = Number((e.target as HTMLInputElement).value); staat.verbruikEigen = v >= 500 ? v : null; toonResultaat(); updateZon(); });
$<HTMLSelectElement>('#a-batterij').addEventListener('change', (e) => { staat.batterij = (e.target as HTMLSelectElement).value === 'ja'; toonResultaat(); });
for (const id of ['#a-prijs', '#a-vergoeding', '#a-kosten']) {
  aIn(id).addEventListener('input', () => {
    staat.eigen = { prijs: Number(aIn('#a-prijs').value) || 0, vergoeding: Number(aIn('#a-vergoeding').value) || 0, kosten: Number(aIn('#a-kosten').value) || 0 };
    toonResultaat();
  });
}
$('#aannames-reset').addEventListener('click', () => { staat.eigen = null; staat.verbruikEigen = null; aIn('#a-verbruik').value = ''; vulAannames(); toonResultaat(); });

/* ---------- Leadformulier ---------- */
let modus: 'schouw' | 'mail' = 'schouw';
let formulierGemeten = false;
$('#lead-form').addEventListener('focusin', () => { if (!formulierGemeten) { formulierGemeten = true; meet('icn_formulier_geopend'); } });
$('#mail-knop').addEventListener('click', (e) => {
  modus = modus === 'schouw' ? 'mail' : 'schouw';
  const mail = modus === 'mail';
  for (const id of ['#l-naam', '#l-tel']) $(id).closest<HTMLElement>('.veld')!.hidden = mail;
  $('#lead-form button[type=submit]').textContent = mail ? 'Mail mij de indicatie' : 'Plan mijn gratis schouw';
  (e.currentTarget as HTMLElement).textContent = mail ? 'Toch liever een gratis schouw plannen' : 'Liever eerst de indicatie per e-mail';
  $('.cta-kaart h2').textContent = mail ? 'Ontvang je indicatie per e-mail' : 'Plan je gratis schouw';
});
$('#lead-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const fout: string[] = [];
  const naam = aIn('#l-naam').value.trim(), email = aIn('#l-email').value.trim(), tel = aIn('#l-tel').value.replace(/[^\d+]/g, '');
  if (modus === 'schouw' && naam.length < 2) fout.push('je naam');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) fout.push('een geldig e-mailadres');
  if (modus === 'schouw' && tel.replace('+', '').length < 10) fout.push('een telefoonnummer van 10 cijfers');
  if (!aIn('#l-ok').checked) fout.push('je toestemming');
  const el = $('#lead-fout');
  if (fout.length) { el.textContent = `Vul nog in: ${fout.join(', ')}.`; el.hidden = false; return; }
  el.hidden = true;
  meet(modus === 'schouw' ? 'icn_lead_verstuurd' : 'icn_indicatie_gemaild');
  $('#lead-form').hidden = true;
  const b = $('#bedankt'); b.hidden = false; b.focus();
});

/* ---------- De flow ---------- */
function heeftWebgl() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}
function soberApparaat() {
  const n = navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string }; deviceMemory?: number };
  return !!(n.connection?.saveData || /2g/.test(n.connection?.effectiveType ?? '') || (n.deviceMemory && n.deviceMemory <= 2) || params.get('licht') === '1');
}

async function start(adres: Adres) {
  meet('icn_adres_gekozen', { soort: adres.soort });
  $('#start').hidden = true; $('#stappen').hidden = true;
  $('#app').hidden = false;
  document.body.classList.add('app-actief');
  window.scrollTo(0, 0);
  $('#adres-regel').textContent = adres.label;
  const buiten = !showcase.werkgebiedProvincies.includes(adres.provincie) && adres.provincie !== 'onbekend';
  $('#badges').innerHTML = `<span class="badge badge-accent">Ontwerpvoorbeeld · illustratieve woning</span><span class="badge">Indicatie, definitief na schouw</span>`;
  $('#melding-buiten').hidden = !buiten;
  toonResultaat(0);
  updateZon();

  const sober = soberApparaat();
  const vlucht = !sober && !minderBeweging;
  if (!heeftWebgl() || params.get('webgl') === '0') {
    $('#fallback').hidden = false;
    document.body.classList.add('zonder-3d');
    toonResultaat(); klaar();
    return;
  }
  const scan = $('#scan-status');
  scan.hidden = false; $('#scan-tekst').textContent = 'Woning wordt geladen…';
  const { maakScene } = await import('./ui/scene3d');
  scene = maakScene({ canvas: $<HTMLCanvasElement>('#scene'), model, plekken, raster, paneel: pricing.paneelMaat, thema: richting, sober: sober || minderBeweging });
  window.addEventListener('resize', () => scene?.resize());
  new ResizeObserver(() => scene?.resize()).observe($('#podium'));
  scene.zetZon(staat.dag, staat.uur);
  scene.opKlikPlek((id) => {
    plekken = plekken.map((p) => (p.id === id ? { ...p, actief: !p.actief } : p));
    scene!.zetPanelen(plekken); toonResultaat(); updateZon();
    meet('icn_paneel_gewijzigd');
  });

  if (vlucht) {
    const sla = $('#sla-over'); sla.hidden = false;
    sla.onclick = () => scene?.sla();
    const label = $('#vlucht-label');
    const plaats = adres.label.split(',').pop()?.replace(/\d{4}\s?[A-Z]{2}/, '').trim() || 'jouw buurt';
    const reeks = [`${adres.provincie !== 'onbekend' ? adres.provincie : 'Nederland'}<small>PROVINCIE</small>`, `${plaats}<small>PLAATS</small>`, `Jouw dak<small>${adres.label.split(',')[0].toUpperCase()}</small>`];
    scan.hidden = true;
    const vliegt = scene.flyIn(3800);
    (async () => {
      for (const t of reeks) { label.innerHTML = t; label.classList.add('zichtbaar'); await wacht(1050); label.classList.remove('zichtbaar'); await wacht(220); }
    })();
    await vliegt;
    label.classList.remove('zichtbaar'); sla.hidden = true;
  } else {
    await scene.flyIn(0);
  }

  scan.hidden = false; scan.classList.remove('klaar');
  $('#scan-tekst').textContent = 'Dakvlakken meten…';
  await wacht(minderBeweging ? 0 : 450);
  $('#scan-tekst').textContent = 'Panelen plaatsen…';
  await scene.toonPanelen(minderBeweging ? 0 : 140, (n) => toonResultaat(n));
  toonResultaat();
  scan.classList.add('klaar');
  $('#scan-tekst').textContent = `${bereken().aantal} panelen · ca. ${nl(rondAf(bereken().kwh, 100))} kWh per jaar`;
  klaar();
}

function klaar() {
  meet('icn_resultaat_getoond', bereken());
  $('#podium-hint').hidden = !scene;
  const noordTekst = `Het noordvlak krijgt ongeveer ${nl(Math.round(noordRatio * 100))}% van de zon op het zuidvlak. Daar raden we geen panelen aan.`;
  $('.eerlijk').insertAdjacentHTML('afterend', `<p class="eerlijk">${noordTekst}</p>`);
  const balk = $('#cta-balk');
  balk.hidden = false;
  new IntersectionObserver(([e]) => { balk.hidden = e.isIntersecting; }).observe($('#cta'));
  setTimeout(() => $('#podium-hint').hidden = true, 9000);
  // Telefoon: het 3D-beeld blijft bovenin staan zolang je met de zon speelt, daarna scrolt het weg
  // zodat het formulier de volle hoogte heeft.
  const geld = $('.geld-kaart'), podium = $('#podium');
  const check = () => {
    if (matchMedia('(min-width: 901px)').matches) return document.body.classList.remove('podium-los');
    document.body.classList.toggle('podium-los', geld.getBoundingClientRect().top < podium.offsetHeight + 40);
  };
  addEventListener('scroll', check, { passive: true });
  addEventListener('resize', check);
}
