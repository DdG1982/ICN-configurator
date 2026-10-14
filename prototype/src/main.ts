import '@fontsource-variable/inter';
import '@fontsource-variable/fraunces';
import '@fontsource/poppins/400.css';
import '@fontsource/poppins/500.css';
import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';
import './styles.css';

import market from '../config/market.json';
import pricing from '../config/pricing.json';
import type { DakModel, IndexItem, Plek } from './core/dak-model';
import { minderDanBeste, standaardIndeling } from './calc/indeling';
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
let richting: Thema = (params.get('richting') as Thema) || (opslag.lees('icn-richting') as Thema) || 'natuur';
let scene: SceneApi | null = null;
function zetRichting(r: Thema) {
  richting = r === 'goudenuur' ? 'goudenuur' : 'natuur';
  document.body.dataset.richting = richting;
  document.querySelectorAll<HTMLButtonElement>('[data-richting-knop]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.richtingKnop === richting)));
  opslag.zet('icn-richting', richting);
  scene?.zetThema(richting);
  pasUitsnedeAan();
}
function pasUitsnedeAan() {
  if (!scene) return;
  const zwevend = richting === 'natuur' && matchMedia('(min-width: 901px)').matches;
  scene.zetUitsnede(zwevend ? document.querySelector<HTMLElement>('#paneel')!.offsetWidth : 0);
}
zetRichting(richting);
document.querySelectorAll<HTMLButtonElement>('[data-richting-knop]').forEach((b) => b.addEventListener('click', () => zetRichting(b.dataset.richtingKnop as Thema)));
if (params.get('intern') === '1') document.querySelectorAll<HTMLElement>('[data-intern]').forEach((e) => (e.hidden = false));
document.querySelector('[data-terug]')?.addEventListener('click', (e) => { e.preventDefault(); location.href = location.pathname + location.search; });

/* ---------- Adresveld met suggesties ---------- */
const BASIS = './data';
let adressen: IndexItem[] = [];
const indexKlaar = fetch(`${BASIS}/index.json`).then((r) => r.json()).then((d: IndexItem[]) => { adressen = d; return d; }).catch(() => []);
const veld = $<HTMLInputElement>('#adres-veld');
const lijst = $<HTMLUListElement>('#adres-lijst');
let gekozen: IndexItem | null = null;
let actiefIndex = -1;
let treffers: IndexItem[] = [];

function toonSuggesties(alles = false) {
  const q = veld.value.trim().toLowerCase().replace(/\s+/g, ' ');
  treffers = alles ? adressen.slice(0, 20) : q.length < 2 ? [] : adressen.filter((a) => a.label.toLowerCase().replace(/\s+/g, ' ').includes(q)).slice(0, 8);
  lijst.innerHTML = treffers.map((a, i) => {
    const [straat, rest] = a.label.split(/,(.+)/);
    return `<li role="option" id="opt-${i}" aria-selected="${i === actiefIndex}"><span>${straat}</span><small>${rest?.trim() ?? ''}</small></li>`;
  }).join('');
  lijst.hidden = treffers.length === 0;
  veld.setAttribute('aria-expanded', String(!lijst.hidden));
  veld.setAttribute('aria-activedescendant', actiefIndex >= 0 ? `opt-${actiefIndex}` : '');
}
function kies(a: IndexItem) {
  gekozen = a; veld.value = a.label; lijst.hidden = true; veld.setAttribute('aria-expanded', 'false');
  $('#adres-fout').hidden = true;
}
veld.addEventListener('input', () => { gekozen = null; actiefIndex = -1; toonSuggesties(); });
veld.addEventListener('focus', () => { if (!veld.value) { indexKlaar.then(() => toonSuggesties(true)); } });
veld.addEventListener('keydown', (e) => {
  if (lijst.hidden) return;
  if (e.key === 'ArrowDown') { actiefIndex = Math.min(treffers.length - 1, actiefIndex + 1); toonSuggesties(!veld.value); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { actiefIndex = Math.max(0, actiefIndex - 1); toonSuggesties(!veld.value); e.preventDefault(); }
  else if (e.key === 'Enter' && actiefIndex >= 0) { kies(treffers[actiefIndex]); e.preventDefault(); }
  else if (e.key === 'Escape') { lijst.hidden = true; }
});
lijst.addEventListener('mousedown', (e) => {
  const li = (e.target as HTMLElement).closest('li');
  if (!li) return;
  e.preventDefault();
  kies(treffers[Number(li.id.replace('opt-', ''))]);
});
veld.addEventListener('blur', () => setTimeout(() => (lijst.hidden = true), 150));

$('#adres-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  await indexKlaar;
  const tekst = veld.value.trim().toLowerCase();
  if (!gekozen) gekozen = adressen.find((a) => a.label.toLowerCase() === tekst || a.label.toLowerCase().startsWith(tekst) && tekst.length > 6) ?? null;
  if (!gekozen) {
    const fout = $('#adres-fout');
    fout.textContent = tekst
      ? 'In dit ontwerpvoorbeeld werken alleen de voorbeeldadressen uit de lijst. Live zoeken op elk adres komt in de volgende versie.'
      : 'Kies een adres uit de lijst.';
    fout.hidden = false; veld.focus(); toonSuggesties(true);
    return;
  }
  start(gekozen);
});
$('#voorbeeld-knop').addEventListener('click', async () => {
  await indexKlaar;
  const peest = adressen.find((a) => a.slug.startsWith('zuidveldigerweg')) ?? adressen.find((a) => a.status === 'woning');
  if (peest) start(peest);
});

/* ---------- Berekening ---------- */
let model: DakModel | null = null;
let plekken: Plek[] = [];
let actief = new Set<string>();
let besteKwh = 1;

const staat = {
  scenario: 'na2026' as Scenario,
  personen: 3,
  verbruikEigen: null as number | null,
  batterij: false,
  eigen: null as null | { prijs: number; vergoeding: number; kosten: number },
  dag: 172,
  uur: richting === 'goudenuur' ? 19 : 15,
};

function aannames(): MarktAannames {
  if (!staat.eigen) return market;
  const v = (x: number) => ({ low: x, high: x });
  return { ...market, stroomprijsPerKwh: v(staat.eigen.prijs), terugleververgoedingPerKwh: v(staat.eigen.vergoeding), terugleverkostenPerKwh: v(staat.eigen.kosten) };
}
const verbruik = () => staat.verbruikEigen ?? geschatVerbruik(staat.personen);

function bereken() {
  const gekozen = plekken.filter((p) => actief.has(p.id));
  const kwp = vermogenKwp(gekozen.length, pricing.paneelWp);
  const kwh = gekozen.reduce((s, p) => s + p.kwh, 0);
  const opbrengst = opbrengstBand(kwh, market.opbrengstMarge);
  const zc = staat.batterij ? market.zelfconsumptie.metBatterij : market.zelfconsumptie.zonderBatterij;
  const besparing = besparingBand(opbrengst, verbruik(), zc, aannames(), staat.scenario);
  const investering = investeringBand(gekozen.length * pricing.paneelWp, pricing.prijsPerWp);
  return { aantal: gekozen.length, kwp, kwh, opbrengst, besparing, investering, terug: terugverdientijd(investering, besparing) };
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
  const r = scene ? scene.vermogenNu(actief, dag, uur) : { kw: 0, schaduw: 0, zonOp: true };
  const kw = r.kw, schaduw = r.schaduw, zonOp = r.zonOp;
  $('#live-kw').textContent = nl(kw, 1);
  $('#schaduw-uitleg').textContent = !zonOp ? 'De zon staat onder de horizon.'
    : schaduw === 0 ? 'Geen schaduw op je panelen op dit moment.'
      : `Schaduw van bomen of gebouwen op ${schaduw} van de ${actief.size} panelen.`;
  $('#stroom-uitleg').textContent = stroomUpdate({ pv: kw, verbruik: huisVerbruikKw(uur) });
}
const uurIn = $<HTMLInputElement>('#uur'), dagIn = $<HTMLInputElement>('#dag');
uurIn.value = String(staat.uur);
let zonGemeten = false;
for (const i of [uurIn, dagIn]) {
  vulSchuif(i);
  i.addEventListener('input', () => {
    staat.uur = Number(uurIn.value); staat.dag = Number(dagIn.value); vulSchuif(i); scene?.zetZon(staat.dag, staat.uur); updateZon();
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
    staat.uur = van + (tot - van) * f; uurIn.value = String(staat.uur); vulSchuif(uurIn); scene?.zetZon(staat.dag, staat.uur); updateZon();
    if (f < 1) speelt = requestAnimationFrame(stap);
    else { speelt = 0; knop.setAttribute('aria-pressed', 'false'); knop.innerHTML = '<span aria-hidden="true">▶</span> Speel een dag af'; }
  };
  if (minderBeweging) { staat.uur = 13; uurIn.value = '13'; vulSchuif(uurIn); scene?.zetZon(staat.dag, 13); updateZon(); knop.setAttribute('aria-pressed', 'false'); knop.innerHTML = '<span aria-hidden="true">▶</span> Speel een dag af'; return; }
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

const STATUS_TEKST: Record<string, string> = {
  zakelijk: 'Dit is een bedrijfspand. Voor bedrijven checken we eerst de netcapaciteit bij de netbeheerder; in delen van Groningen, Drenthe en Overijssel is die beperkt. De indicatie hieronder is daarom extra voorlopig.',
  bijgebouw: 'Dit adres is volgens de BAG een bijgebouw (bijvoorbeeld een garage of berging), geen woning. Zonnepanelen kunnen hier soms wel, maar de aansluiting op je huis bepaalt de mogelijkheden.',
  appartement: 'Dit gebouw heeft meerdere woningen. Zonnepanelen op een gedeeld dak regel je samen via de VvE. We tonen het dak, maar plaatsen geen panelen voor één woning.',
  monument: 'Dit is een monument. Zonnepanelen op een monument hebben meestal een vergunning nodig, en vaak mag het niet op het zichtbare dakvlak. Daarom plaatsen we hier niets automatisch.',
  'niet-in-3dbag': 'Dit pand is te nieuw voor de landelijke 3D-kaart (3DBAG). We hebben het dak daarom nog niet in 3D. We maken je indicatie na een korte check door een adviseur.',
};

async function start(item: IndexItem) {
  meet('icn_adres_gekozen', { status: item.status });
  $('#start').hidden = true; $('#stappen').hidden = true;
  $('#app').hidden = false;
  document.body.classList.add('app-actief');
  window.scrollTo(0, 0);
  const basis = `${BASIS}/${item.slug}`;
  model = await (await fetch(`${basis}/model.json`)).json() as DakModel;
  plekken = model.plekken ?? [];
  besteKwh = Math.max(1, ...plekken.map((p) => p.kwh));
  const magPanelen = !['appartement', 'monument', 'niet-in-3dbag'].includes(model.status);
  actief = magPanelen ? standaardIndeling(plekken, verbruik(), 1.0, 4) : new Set();

  $('#adres-regel').textContent = model.adres.label;
  const pj = model.kwaliteit?.puntenwolkJaar;
  $('#badges').innerHTML = [
    '<span class="badge badge-accent">Echte dakdata · 3DBAG en PDOK</span>',
    model.pand?.bouwjaar ? `<span class="badge">Bouwjaar ${model.pand.bouwjaar}</span>` : '',
    pj ? `<span class="badge">Dak gemeten in ${pj}</span>` : '',
    model.kwaliteit && !model.kwaliteit['3dbagGoed'] ? '<span class="badge badge-let-op">3D-model met lage zekerheid</span>' : '',
  ].join('');
  $('#melding-buiten').hidden = !model.buitenWerkgebied;
  const st = $('#melding-status');
  st.hidden = !STATUS_TEKST[model.status];
  st.textContent = STATUS_TEKST[model.status] ?? '';
  $('#vragen').hidden = !['woning', 'bijgebouw'].includes(model.status);
  const geenResultaat = model.status === 'niet-in-3dbag';
  for (const id of ['#resultaat', '.zon-kaart', '.stroom-kaart', '.geld-kaart']) $(id).hidden = geenResultaat;
  const vlakTekst = beschrijfDak();
  $('#dak-uitleg').textContent = vlakTekst;
  toonResultaat(0);

  const sober = soberApparaat();
  const vlucht = !sober && !minderBeweging;
  if (!heeftWebgl() || params.get('webgl') === '0') {
    $('#fallback').hidden = false;
    document.body.classList.add('zonder-3d');
    toonResultaat(); updateZon(); klaar();
    return;
  }
  const scan = $('#scan-status');
  scan.hidden = false; $('#scan-tekst').textContent = 'Woning wordt geladen…';
  const { maakScene } = await import('./ui/scene3d');
  scene = maakScene({ canvas: $<HTMLCanvasElement>('#scene'), model, basis, thema: richting, sober: sober || minderBeweging });
  window.addEventListener('resize', () => { scene?.resize(); pasUitsnedeAan(); });
  pasUitsnedeAan();
  new ResizeObserver(() => scene?.resize()).observe($('#podium'));
  scene.zetZon(staat.dag, staat.uur);
  scene.opKlikPlek((id) => {
    if (!magPanelen) { toast('Op dit dak plaatsen we in de indicatie geen panelen. Een adviseur bekijkt de mogelijkheden.'); return; }
    const p = plekken.find((x) => x.id === id)!;
    if (actief.has(id)) actief.delete(id);
    else {
      actief.add(id);
      const minder = minderDanBeste(p.kwh, besteKwh);
      if (minder >= 15) toast(`Deze plek levert ca. ${minder}% minder op dan je beste plek${p.schaduw < 0.85 ? ', vooral door schaduw' : ''}.`);
    }
    scene!.zetPanelen(actief); toonResultaat(); updateZon();
    meet('icn_paneel_gewijzigd');
  });

  if (vlucht) {
    const sla = $('#sla-over'); sla.hidden = false;
    sla.onclick = () => scene?.sla();
    const label = $('#vlucht-label');
    const plaats = model.adres.label.split(',').pop()?.replace(/\d{4}\s?[A-Z]{2}/, '').trim() || 'jouw buurt';
    const reeks = [`${model.adres.provincie}<small>PROVINCIE</small>`, `${plaats}<small>PLAATS</small>`, `Jouw dak<small>${model.adres.label.split(',')[0].toUpperCase()}</small>`];
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
  if (geenResultaat) {
    $('#scan-tekst').textContent = 'Nog niet in de 3D-kaart';
    scan.classList.add('klaar');
    klaar();
    return;
  }
  $('#scan-tekst').textContent = 'Dakvlakken meten…';
  await wacht(minderBeweging ? 0 : 450);
  $('#scan-tekst').textContent = 'Panelen plaatsen…';
  await scene.toonPanelen([...actief], minderBeweging ? 0 : Math.max(40, Math.min(140, 2400 / Math.max(1, actief.size))), (n) => toonResultaat(n));
  toonResultaat();
  updateZon();
  scan.classList.add('klaar');
  const r = bereken();
  $('#scan-tekst').textContent = magPanelen ? `${r.aantal} panelen · ca. ${nl(rondAf(r.kwh, 100))} kWh per jaar` : 'Dak gemeten';
  klaar();
}

function beschrijfDak(): string {
  if (!model?.dakvlakken?.length) return '';
  const richting = (az: number) => ['noord', 'noordoost', 'oost', 'zuidoost', 'zuid', 'zuidwest', 'west', 'noordwest'][Math.round(az / 45) % 8];
  const grote = [...model.dakvlakken].sort((a, b) => b.opp - a.opp).slice(0, 3)
    .map((v) => v.plat ? `plat (${nl(v.opp)} m²)` : `${richting(v.azimut)} ${nl(v.helling)}° (${nl(v.opp)} m²)`);
  const beste = [...model.dakvlakken].sort((a, b) => b.kwhPerKwp - a.kwhPerKwp)[0];
  return `Je dak volgens 3DBAG: ${grote.join(', ')}. Het beste vlak levert volgens PVGIS ca. ${nl(beste.kwhPerKwp)} kWh per kWp per jaar, vóór schaduw. We vullen panelen tot ongeveer je jaarverbruik; tik op een lege plek om er een toe te voegen.`;
}

let toastTimer = 0;
function toast(tekst: string) {
  const t = $('#toast');
  t.textContent = tekst; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (t.hidden = true), 4500);
}

/* Vragen die 3DBAG niet kan beantwoorden. */
const antwoorden: Record<string, string> = {};
document.querySelectorAll<HTMLButtonElement>('[data-vraag]').forEach((b) => b.addEventListener('click', () => {
  const v = b.dataset.vraag!, a = b.dataset.antwoord!;
  antwoorden[v] = a;
  document.querySelectorAll(`[data-vraag="${v}"]`).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  const uitleg = $(`#uitleg-${v}`);
  const teksten: Record<string, string> = {
    'panelen-ja': 'Bestaande panelen zitten niet in de 3D-kaart. Tik in het 3D-beeld de plekken weg waar al panelen liggen; de adviseur controleert het bij de schouw.',
    'riet-ja': 'Op riet plaatsen we geen panelen, vanwege brandveiligheid. Tik de plekken op het rieten deel weg. De adviseur kijkt naar alternatieven, zoals een bijgebouw.',
  };
  uitleg.textContent = teksten[`${v}-${a}`] ?? '';
  uitleg.hidden = !uitleg.textContent;
  meet('icn_vraag_beantwoord', { vraag: v, antwoord: a });
}));

function klaar() {
  meet('icn_resultaat_getoond', { status: model?.status, ...bereken() });
  $('#podium-hint').hidden = !scene || !(model?.plekken?.length);
  const balk = $('#cta-balk');
  balk.hidden = false;
  new IntersectionObserver(([e]) => { balk.hidden = e.isIntersecting; }).observe($('#cta'));
  setTimeout(() => $('#podium-hint').hidden = true, 9000);
  // Telefoon: het 3D-beeld blijft bovenin staan zolang je met de zon speelt, daarna scrolt het weg.
  const geld = $('.geld-kaart'), podium = $('#podium');
  const check = () => {
    if (matchMedia('(min-width: 901px)').matches) return document.body.classList.remove('podium-los');
    document.body.classList.toggle('podium-los', geld.getBoundingClientRect().top < podium.offsetHeight + 40);
  };
  addEventListener('scroll', check, { passive: true });
  addEventListener('resize', check);
}
