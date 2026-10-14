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
  besparingBand, geschatVerbruik, investeringBand, jarenTotTerug, opbrengstBand, rondAf, terugverdientijd, vermogenKwp,
  type Band, type MarktAannames, type Scenario,
} from './calc/opbrengst';
import { maakEnergiestroom } from './ui/energiestroom';
import type { SceneApi, Thema } from './ui/scene3d';
import { suggesties, type Suggestie } from './live/bronnen';
import { maakWachtrij, naarApi, nieuwLeadId, utmUit, type Lead } from './core/lead';

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
document.querySelectorAll('[data-terug]').forEach((el) => el.addEventListener('click', (e) => {
  e.preventDefault();
  location.href = location.pathname + location.search;
}));

/* ---------- Adresveld: voorbeeldwoningen + elk adres in Nederland (PDOK) ---------- */
const BASIS = './data';
type Keuze = { soort: 'voorbeeld'; item: IndexItem } | { soort: 'live'; id: string; label: string };
let adressen: IndexItem[] = [];
const indexKlaar = fetch(`${BASIS}/index.json`).then((r) => r.json()).then((d: IndexItem[]) => { adressen = d; return d; }).catch(() => []);
const veld = $<HTMLInputElement>('#adres-veld');
const lijst = $<HTMLUListElement>('#adres-lijst');
let gekozen: Keuze | null = null;
let actiefIndex = -1;
let treffers: Keuze[] = [];
let liveTreffers: Suggestie[] = [];
let alleVoorbeelden = false;
let zoekTimer = 0;
let zoekAfbreken: AbortController | null = null;

/** Vergelijkbaar maken: kleine letters, enkele spaties, postcode zonder spatie. */
const norm = (t: string) => t.toLowerCase().replace(/\s+/g, ' ').replace(/(\d{4}) ?([a-z]{2})\b/g, '$1$2').trim();
const keuzeLabel = (k: Keuze) => (k.soort === 'voorbeeld' ? k.item.label : k.label);
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function toonSuggesties(alles = false) {
  alleVoorbeelden = alles;
  const q = norm(veld.value);
  // Voorbeeld past als elk getypt woord erin voorkomt (komma's en postcodespatie maken niet uit).
  const woorden = q.replace(/,/g, ' ').split(' ').filter(Boolean);
  const past = (label: string) => { const l = norm(label).replace(/,/g, ' '); return woorden.every((w) => l.includes(w)); };
  const vb: Keuze[] = (alles ? adressen.slice(0, 20) : q.length < 2 ? [] : adressen.filter((a) => past(a.label)).slice(0, 3))
    .map((item) => ({ soort: 'voorbeeld', item }));
  const lv: Keuze[] = alles ? [] : liveTreffers
    .filter((s) => !vb.some((v) => norm(keuzeLabel(v)) === norm(s.label)))
    .map((s) => ({ soort: 'live', id: s.id, label: s.label }));
  treffers = [...vb, ...lv].slice(0, 8);
  lijst.innerHTML = (alles && treffers.length ? '<li class="kopje" role="presentation">Voorbeeldwoningen</li>' : '') + treffers.map((k, i) => {
    const [straat, rest] = keuzeLabel(k).split(/,(.+)/);
    const tag = k.soort === 'voorbeeld' && !alles ? '<span class="tag">voorbeeld</span>' : '';
    return `<li role="option" id="opt-${i}" aria-selected="${i === actiefIndex}"><span>${esc(straat)}</span><span class="rechts"><small>${esc(rest?.trim() ?? '')}</small>${tag}</span></li>`;
  }).join('');
  lijst.hidden = treffers.length === 0;
  veld.setAttribute('aria-expanded', String(!lijst.hidden));
  veld.setAttribute('aria-activedescendant', actiefIndex >= 0 ? `opt-${actiefIndex}` : '');
}
function kies(k: Keuze) {
  gekozen = k; veld.value = keuzeLabel(k); lijst.hidden = true; veld.setAttribute('aria-expanded', 'false');
  $('#adres-fout').hidden = true;
}
function zoekLive(q: string) {
  clearTimeout(zoekTimer);
  zoekAfbreken?.abort();
  if (norm(q).length < 3) { liveTreffers = []; return; }
  zoekTimer = window.setTimeout(() => {
    zoekAfbreken = new AbortController();
    suggesties(q, zoekAfbreken.signal)
      .then((r) => { liveTreffers = r; if (document.activeElement === veld) toonSuggesties(); })
      .catch(() => { /* afgebroken of geen verbinding: dan alleen voorbeelden */ });
  }, 160);
}
veld.addEventListener('input', () => { gekozen = null; actiefIndex = -1; liveTreffers = []; toonSuggesties(); zoekLive(veld.value); });
veld.addEventListener('focus', () => { if (!veld.value) indexKlaar.then(() => toonSuggesties(true)); else if (treffers.length) toonSuggesties(); });
veld.addEventListener('keydown', (e) => {
  if (lijst.hidden) return;
  if (e.key === 'ArrowDown') { actiefIndex = Math.min(treffers.length - 1, actiefIndex + 1); toonSuggesties(alleVoorbeelden); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { actiefIndex = Math.max(0, actiefIndex - 1); toonSuggesties(alleVoorbeelden); e.preventDefault(); }
  else if (e.key === 'Enter' && actiefIndex >= 0) { kies(treffers[actiefIndex]); e.preventDefault(); }
  else if (e.key === 'Escape') { lijst.hidden = true; }
});
lijst.addEventListener('mousedown', (e) => {
  const li = (e.target as HTMLElement).closest('li');
  if (!li || !li.id) return;
  e.preventDefault();
  kies(treffers[Number(li.id.replace('opt-', ''))]);
});
veld.addEventListener('blur', () => setTimeout(() => (lijst.hidden = true), 150));

function adresFout(tekst: string, lijstTonen = false) {
  const fout = $('#adres-fout');
  fout.textContent = tekst; fout.hidden = false; veld.focus();
  if (lijstTonen) toonSuggesties();
}

$('#adres-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  await indexKlaar;
  const tekst = veld.value.trim();
  if (!gekozen && !tekst) return adresFout('Vul je adres in: straat, huisnummer en plaats.');
  if (!gekozen) {
    const vb = adressen.find((a) => norm(a.label) === norm(tekst));
    if (vb) gekozen = { soort: 'voorbeeld', item: vb };
  }
  if (!gekozen) {
    try {
      liveTreffers = await suggesties(tekst);
    } catch {
      return adresFout('Adressen zoeken lukt nu even niet. Controleer je verbinding en probeer het opnieuw.');
    }
    // Alleen zelf kiezen als het eerste deel (straat + huisnummer) precies overeenkomt; anders de lijst laten zien.
    const kaal = (t: string) => norm(t.replace(/,/g, ' ')) + ' ';
    const exact = liveTreffers.filter((s) => kaal(tekst).startsWith(kaal(s.label.split(',')[0])) && /\d/.test(s.label.split(',')[0]));
    const kandidaat = exact.sort((x, y) => y.label.split(',')[0].length - x.label.split(',')[0].length)[0]
      ?? (liveTreffers.length === 1 ? liveTreffers[0] : undefined);
    if (kandidaat) gekozen = { soort: 'live', id: kandidaat.id, label: kandidaat.label };
    else if (liveTreffers.length) return adresFout('Kies je adres uit de lijst.', true);
    else return adresFout('We vinden dit adres niet. Typ straat, huisnummer en plaats.');
  }
  start(gekozen);
});
$('#voorbeeld-knop').addEventListener('click', async () => {
  await indexKlaar;
  const peest = adressen.find((a) => a.slug.startsWith('zuidveldigerweg')) ?? adressen.find((a) => a.status === 'woning');
  if (peest) start({ soort: 'voorbeeld', item: peest });
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
const schatting = () => geschatVerbruik(staat.personen, market.verbruik, { type: model?.woningtype, bouwjaar: model?.pand?.bouwjaar });
const verbruik = () => staat.verbruikEigen ?? schatting().kwh;
const WONINGTYPE_TEKST = { vrijstaand: 'vrijstaand', hoekwoning: 'hoekwoning of twee-onder-een-kap', tussenwoning: 'tussenwoning', appartement: 'appartement' } as const;
function schattingUitleg() {
  const s = schatting();
  const delen = [`${staat.personen >= 5 ? '5 of meer' : staat.personen} ${staat.personen === 1 ? 'persoon' : 'personen'}`];
  if (model?.woningtype) delen.push(WONINGTYPE_TEKST[model.woningtype]);
  if (s.extraGasloos) delen.push(`plus ca. ${nl(s.extraGasloos)} kWh voor een warmtepomp (bouwjaar ${model?.pand?.bouwjaar}, waarschijnlijk zonder gas)`);
  return `geschat op ${nl(s.kwh)} kWh: ${delen.join(', ')}. Pas aan als je het weet.`;
}

function bereken() {
  const gekozen = plekken.filter((p) => actief.has(p.id));
  const kwp = vermogenKwp(gekozen.length, pricing.paneelWp);
  const kwh = gekozen.reduce((s, p) => s + p.kwh, 0);
  const opbrengst = opbrengstBand(kwh, market.opbrengstMarge);
  const zc = staat.batterij ? market.zelfconsumptie.metBatterij : market.zelfconsumptie.zonderBatterij;
  const besparing = besparingBand(opbrengst, verbruik(), zc, aannames(), staat.scenario);
  const investering = investeringBand(gekozen.length * pricing.paneelWp, pricing.prijsPerWp);
  return { aantal: gekozen.length, kwp, kwh, opbrengst, besparing, investering, terug: terugverdientijd(investering, besparing, market) };
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
  const centraal = jarenTotTerug((r.investering.low + r.investering.high) / 2, (r.besparing.low + r.besparing.high) / 2, market);
  const jr = (x: number) => nl(x, x % 1 ? 1 : 0);
  $('#terugverdien').innerHTML = !isFinite(t.high) || centraal <= 0 ? 'niet terug te verdienen'
    : `ca. ${jr(rondAf(centraal, 0.5))} jaar<small>${Math.abs(t.high - t.low) < 0.01 ? 'met jouw aannames' : `bandbreedte ${jr(rondAf(t.low, 0.5))}–${jr(rondAf(t.high, 0.5))} jaar`}</small>`;
  // Geen panelen (monument, appartement, alles weggetikt): dan geen "0 kWh" maar het advies.
  $('#cta-balk-getal').textContent = r.aantal ? nl(midden) : 'Advies op maat';
  $('#cta-balk-eenheid').textContent = r.aantal ? 'kWh per jaar' : 'van een adviseur';
  $<HTMLInputElement>('#a-verbruik').placeholder = nl(schatting().kwh);
  $('#a-verbruik-basis').textContent = schattingUitleg();
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
$('#a-degradatie').textContent = `${nl(market.degradatiePerJaar * 100, 1)}%`;
$('#a-prijsstijging').textContent = market.prijsstijgingPerJaar
  ? ` en ${nl(market.prijsstijgingPerJaar * 100, 1)}% ${market.prijsstijgingPerJaar > 0 ? 'hogere' : 'lagere'} stroomprijs per jaar`
  : ' en een gelijkblijvende stroomprijs';
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
/** Versie van de toestemmingstekst; ophogen zodra ICN de tekst wijzigt of goedkeurt. */
const TOESTEMMING_VERSIE = 'concept-2026-10-14';
const wachtrij = maakWachtrij(opslag, naarApi(new URL('/api/lead', location.href).href));
// Leads die bij een eerder bezoek niet aankwamen, opnieuw proberen.
void wachtrij.verwerk();
addEventListener('online', () => { void wachtrij.verwerk(); });

function maakLead(m: 'schouw' | 'mail', contact: Lead['contact']): Lead {
  const r = bereken();
  const nu = new Date().toISOString();
  return {
    id: nieuwLeadId(),
    modus: m,
    aangemaakt: nu,
    adres: model ? { label: model.adres.label, bagPandId: model.pand?.id ?? null, lat: model.adres.lat, lon: model.adres.lon, provincie: model.adres.provincie, buitenWerkgebied: model.buitenWerkgebied } : null,
    woning: model ? { status: model.status, woningtype: model.woningtype ?? null, bouwjaar: model.pand?.bouwjaar ?? null } : null,
    configuratie: { panelen: r.aantal, kwp: Math.round(r.kwp * 100) / 100, plekken: [...actief] },
    indicatie: {
      kwhPerJaar: Math.round(r.kwh), opbrengstBand: r.opbrengst, besparingPerJaar: r.besparing, investering: r.investering,
      terugverdientijdJaren: r.terug, scenario: staat.scenario, batterij: staat.batterij,
      verbruikKwh: verbruik(), verbruikGeschat: staat.verbruikEigen === null, personen: staat.personen,
      aannames: JSON.parse(JSON.stringify({ ...aannames(), paneelWp: pricing.paneelWp, prijsPerWp: pricing.prijsPerWp }), (k, v) => (k.startsWith('_') ? undefined : v)),
      tekst: 'Indicatie, definitief na schouw. Prijzen zijn placeholders.',
    },
    contact,
    toestemming: { gegeven: true, tijdstip: nu, versie: TOESTEMMING_VERSIE, tekst: ($('label.toestemming span').textContent ?? '').trim() },
    herkomst: { pagina: location.href, verwijzer: document.referrer, utm: utmUit(location.search) },
  };
}

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
$('#lead-form').addEventListener('submit', async (e) => {
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
  const knop = $<HTMLButtonElement>('#lead-form button[type=submit]');
  knop.disabled = true;
  const m = modus;
  const aangekomen = await wachtrij.plaats(maakLead(m, m === 'schouw' ? { naam, email, telefoon: tel } : { email }));
  knop.disabled = false;
  meet(aangekomen ? (m === 'schouw' ? 'icn_lead_verstuurd' : 'icn_indicatie_gemaild') : 'icn_lead_in_wachtrij');
  $('#bedankt-tekst').textContent = !aangekomen
    ? 'We konden je aanvraag nog niet versturen. Hij is bewaard op dit apparaat en we proberen het automatisch opnieuw, ook als je deze pagina later weer opent.'
    : m === 'schouw' ? 'Je aanvraag is verstuurd. ICN neemt binnen 24 uur contact met je op om de schouw te plannen.'
      : 'Je aanvraag is verstuurd. ICN mailt je de indicatie.';
  $('.bedankt-titel').textContent = aangekomen ? 'Dank je wel!' : 'Bijna gelukt';
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

/* ---------- Laadscherm voor live adressen ---------- */
const STAP_VOLGORDE = ['adres', 'pand', '3d', 'hoogte', 'opbrengst', 'schaduw'];
let stapRij: Promise<void> = Promise.resolve();
function ladenReset(label: string) {
  const l = $('#laden');
  l.hidden = false; l.classList.remove('weg');
  $('#laden-fout').hidden = true;
  $('#laden-titel').textContent = 'We meten je dak';
  $('#laden-adres').textContent = label;
  document.querySelectorAll<HTMLElement>('#laden-stappen li').forEach((li, i) => { li.className = i === 0 ? 'bezig' : ''; });
  document.body.classList.add('laadt');
}
/** Stappen komen soms vlak na elkaar binnen; we vinken ze rustig één voor één af. */
function ladenStap(stap: string, info: Record<string, unknown>) {
  stapRij = stapRij.then(async () => {
    const lis = [...document.querySelectorAll<HTMLElement>('#laden-stappen li')];
    const i = STAP_VOLGORDE.indexOf(stap);
    lis.forEach((li, j) => {
      if (li.classList.contains('overgeslagen')) return;
      li.classList.toggle('klaar', j <= i);
      li.classList.toggle('bezig', j === i + 1);
    });
    if (stap === 'adres' && info.label) $('#laden-adres').textContent = String(info.label);
    if (stap === 'adres' && typeof info.wijd === 'string') {
      const img = $<HTMLImageElement>('#laden-foto');
      img.crossOrigin = 'anonymous';
      img.onload = () => img.classList.add('geladen');
      img.src = info.wijd;
    }
    if (stap === '3d' && info.gevonden === false) lis.slice(3).forEach((li) => { li.classList.remove('bezig'); li.classList.add('overgeslagen'); });
    await wacht(minderBeweging ? 0 : 170);
  });
}
async function ladenKlaar() {
  await stapRij;
  await wacht(minderBeweging ? 0 : 260);
  $('#laden').classList.add('weg');
  document.body.classList.remove('laadt');
  setTimeout(() => ($('#laden').hidden = true), 700);
}
function ladenFout(bron: string, bericht: string, opnieuw: () => void) {
  const teksten: Record<string, string> = {
    PVGIS: 'De zonnedata van de Europese Commissie (PVGIS) reageert nu niet. Probeer het over een minuut opnieuw.',
    '3DBAG': 'De 3D-kaart van Nederland (3DBAG) reageert nu niet. Probeer het zo opnieuw.',
    'PDOK Locatieserver': 'Het adressenregister reageert nu niet. Probeer het zo opnieuw.',
    tijd: 'Het ophalen van de kaartdata duurt te lang. Probeer het opnieuw.',
  };
  $('#laden-titel').textContent = 'Dat lukte niet';
  $('#laden-fout-tekst').textContent = bron === 'adres' || (bron === 'BAG' && /geen gebouw/.test(bericht)) ? bericht : teksten[bron] ?? 'Er ging iets mis bij het ophalen van de kaartdata. Probeer het opnieuw.';
  $('#laden-fout').hidden = false;
  $('#laden-opnieuw').hidden = bron === 'adres' || bron === 'BAG';
  document.querySelectorAll('#laden-stappen li.bezig').forEach((li) => li.classList.remove('bezig'));
  $('#laden-opnieuw').onclick = opnieuw;
  meet('icn_live_fout', { bron });
}

/**
 * Het gekozen adres staat in de #-hash, niet in de query: zo blijft een link te delen en te herladen,
 * maar komt het adres niet in de paginaweergaven van analytics terecht (die laten de hash weg).
 */
const hashParams = () => new URLSearchParams(location.hash.slice(1));
function zetUrl(k: string, v: string) {
  history.replaceState(null, '', `${location.pathname}${location.search}#${k}=${encodeURIComponent(v)}`);
}

async function start(keuze: Keuze) {
  $('#start').hidden = true; $('#stappen').hidden = true;
  $('#app').hidden = false;
  document.body.classList.add('app-actief');
  window.scrollTo(0, 0);
  let basis = '';
  if (keuze.soort === 'voorbeeld') {
    zetUrl('voorbeeld', keuze.item.slug);
    basis = `${BASIS}/${keuze.item.slug}`;
    model = await (await fetch(`${basis}/model.json`)).json() as DakModel;
  } else {
    zetUrl('adres', keuze.id);
    ladenReset(keuze.label);
    const t0 = performance.now();
    try {
      const { bouwLive } = await import('./live/live');
      model = await bouwLive(keuze.id, ladenStap);
    } catch (e) {
      const f = e as { bron?: string; message?: string };
      ladenFout(f.bron ?? 'onbekend', f.message ?? '', () => start(keuze));
      return;
    }
    meet('icn_live_berekend', { ms: Math.round(performance.now() - t0) });
    await ladenKlaar();
  }
  meet('icn_adres_gekozen', { status: model.status, bron: keuze.soort });
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
  const ww = $('#melding-waarschuwing');
  ww.hidden = !model.waarschuwingen?.length;
  ww.textContent = model.waarschuwingen?.join(' ') ?? '';
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
  // Beste vlak waar ook echt panelen op passen (een klein zuiddakje zonder plekken telt niet).
  const metPlek = model.dakvlakken.filter((v) => model!.plekken?.some((p) => p.vlak === v.id));
  const beste = [...(metPlek.length ? metPlek : model.dakvlakken)].sort((a, b) => b.kwhPerKwp - a.kwhPerKwp)[0];
  const slot = ['appartement', 'monument'].includes(model.status)
    ? 'We plaatsen hier niets automatisch; een adviseur bekijkt wat kan.'
    : 'We vullen panelen tot ongeveer je jaarverbruik; tik op een lege plek om er een toe te voegen.';
  return `Je dak volgens 3DBAG: ${grote.join(', ')}. Het beste vlak levert volgens PVGIS ca. ${nl(beste.kwhPerKwp)} kWh per kWp per jaar, vóór schaduw. ${slot}`;
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

/* ---------- Direct openen via de link (#adres=… of #voorbeeld=…) ---------- */
const vanLink = hashParams();
if (vanLink.get('adres')) start({ soort: 'live', id: vanLink.get('adres')!, label: '' });
else if (vanLink.get('voorbeeld')) indexKlaar.then(() => {
  const item = adressen.find((a) => a.slug === vanLink.get('voorbeeld'));
  if (item) start({ soort: 'voorbeeld', item });
});
