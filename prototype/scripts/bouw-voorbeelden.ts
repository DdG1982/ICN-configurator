/**
 * Voorbeeldadressen opnieuw opbouwen met dezelfde code als het live opzoeken (src/live/bouw.ts),
 * zodat voorbeelden en live adressen precies hetzelfde rekenen. Vervangt pipeline/bouw_dakdata.py.
 * Schrijft public/data/<slug>/{model.json, lucht-dichtbij.jpg, lucht-wijd.jpg} en public/data/index.json.
 * Draai: NODE_USE_ENV_PROXY=1 npx vite-node scripts/bouw-voorbeelden.ts [filter]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { bouwModel } from '../src/live/bouw';
import { pvgisDirect } from '../src/live/bronnen';
import type { DakModel, IndexItem } from '../src/core/dak-model';
import showcase from '../config/showcase.json';
import pricing from '../config/pricing.json';

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const filter = process.argv[2] ?? '';
const pvgis = pvgisDirect();
const index: IndexItem[] = [];

async function bewaar(url: string, pad: string) {
  for (let p = 0; p < 4; p++) {
    const r = await fetch(url).catch(() => null);
    if (r?.ok) { writeFileSync(pad, Buffer.from(await r.arrayBuffer())); return; }
    await new Promise((res) => setTimeout(res, 1000 * 2 ** p));
  }
  throw new Error(`luchtfoto mislukt: ${url}`);
}

for (const a of showcase.adressen) {
  const s = slug(a.label);
  if (filter && !s.includes(filter)) continue;
  const d = await (await fetch(`https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=${encodeURIComponent(a.label)}&fq=type:adres&rows=10&fl=id,weergavenaam`)).json();
  const docs = d.response.docs as { id: string; weergavenaam: string }[];
  const straat = a.label.split(',')[0].trim().toLowerCase();
  const doc = docs.find((x) => x.weergavenaam.split(',')[0].trim().toLowerCase() === straat) ?? docs[0];
  const t0 = Date.now();
  let m: DakModel;
  try {
    m = await bouwModel(doc.id, {
      pvgis, werkgebied: showcase.werkgebiedProvincies, wp: pricing.paneelWp,
      maat: { breedte: pricing.paneelMaat.breedte, hoogte: pricing.paneelMaat.hoogte, rand: 0.4, tussen: 0.02 },
    });
  } catch (e) {
    console.log(a.label, 'FOUT', e);
    continue;
  }
  m.adres.label = a.label;
  m.adres.soort = a.soort;
  // Handmatig als monument aangemerkt (showcase) telt ook als het register het punt net naast het pand legt.
  if (a.soort === 'monument' && m.status !== 'appartement' && m.status !== 'niet-in-3dbag') {
    m.status = 'monument';
    for (const p of m.plekken ?? []) p.actief = false;
  }
  const map = `public/data/${s}`;
  mkdirSync(map, { recursive: true });
  await bewaar(m.luchtfoto.dichtbij.bestand, `${map}/lucht-dichtbij.jpg`);
  await bewaar(m.luchtfoto.wijd.bestand, `${map}/lucht-wijd.jpg`);
  m.luchtfoto.dichtbij.bestand = 'lucht-dichtbij.jpg';
  m.luchtfoto.wijd.bestand = 'lucht-wijd.jpg';
  writeFileSync(`${map}/model.json`, JSON.stringify(m));
  const actief = (m.plekken ?? []).filter((p) => p.actief);
  index.push({ slug: s, label: a.label, provincie: m.adres.provincie, status: m.status, buitenWerkgebied: m.buitenWerkgebied, panelen: actief.length, kwh: actief.reduce((t, p) => t + p.kwh, 0) });
  console.log(a.label, `${((Date.now() - t0) / 1000).toFixed(1)}s`, m.status, `${m.dakvlakken?.length ?? 0} vlakken, ${m.plekken?.length ?? 0} plekken, ${actief.length} actief, ${m.bomen?.length ?? 0} bomen`, m.waarschuwingen ?? '');
}
if (!filter) writeFileSync('public/data/index.json', JSON.stringify(index, null, 1));
else console.log('Met filter: index.json niet bijgewerkt.');
