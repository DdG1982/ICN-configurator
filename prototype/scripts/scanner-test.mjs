// Praktijktest dakscanner: plaats kiezen, gebouwen zoeken, scan van de eerste N panden, schermafbeeldingen,
// CSV en uitsneden naar een map (zodat ze met de hand te controleren zijn).
// Gebruik: PLAATS=Peest STRAAL=1000 LIMIET=40 node scripts/scanner-test.mjs   (preview-server op :4173)
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const basis = process.env.URL ?? 'http://localhost:4173/scanner.html';
const map = process.env.UIT ?? new URL(`../../docs/dakscanner/test-${new Date().toISOString().slice(0, 10)}/`, import.meta.url).pathname;
mkdirSync(`${map}beelden`, { recursive: true });
const proxy = process.env.HTTPS_PROXY ? [`--proxy-server=https=${process.env.HTTPS_PROXY.replace(/^https?:\/\//, '')}`] : [];
const browser = await chromium.launch({ args: proxy, ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ignoreHTTPSErrors: true, acceptDownloads: true });
const page = await ctx.newPage();
page.setDefaultTimeout(180000);
const fouten = [];
page.on('pageerror', (e) => fouten.push(e.message));
page.on('console', (c) => { if (c.type() === 'error') fouten.push(c.text()); });

await page.goto(basis);
await page.fill('#plaats-veld', process.env.PLAATS ?? 'Peest');
await page.waitForSelector('#plaats-lijst li');
await page.$eval('#plaats-lijst li', (e) => e.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
await page.selectOption('#straal', process.env.STRAAL ?? '1000');
await page.waitForTimeout(500);
const t0 = Date.now();
await page.click('#zoek-knop');
await page.waitForSelector('#raming:not([hidden])');
console.log('zoeken', Date.now() - t0, 'ms');
console.log((await page.textContent('#raming-cijfers')).replace(/\s+/g, ' '));
await page.fill('#limiet', process.env.LIMIET ?? '40');
console.log(await page.textContent('#start-knop'));
await page.screenshot({ path: `${map}1-raming.png` });
const t1 = Date.now();
await page.click('#start-knop');
await page.waitForFunction(() => document.querySelector('#stop-knop')?.hidden === true && !!document.querySelector('#scan-melding:not([hidden])'), null, { timeout: 900000 });
console.log('scan', Math.round((Date.now() - t1) / 1000), 's');
console.log(await page.textContent('#voortgang-tekst'));
console.log(await page.textContent('#scan-melding'));
await page.click('[data-filter="alle"]').catch(() => {});
await page.waitForTimeout(1500);
await page.screenshot({ path: `${map}2-resultaat.png`, fullPage: true });

const dl = page.waitForEvent('download');
await page.click('#csv-knop');
await (await dl).saveAs(`${map}dakscanner.csv`);

// Uitsneden uit IndexedDB halen voor handmatige controle
const beelden = await page.evaluate(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('icn-dakscanner'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const lees = (s) => new Promise((res) => { const t = db.transaction(s).objectStore(s); const keys = t.getAllKeys(); const vals = t.getAll(); vals.onsuccess = () => res(keys.result.map((k, i) => [k, vals.result[i]])); });
  const uit = [];
  for (const [k, b] of await lees('beelden')) {
    const buf = new Uint8Array(await b.arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    uit.push([k, btoa(s), buf.length]);
  }
  return uit;
});
let totaal = 0;
for (const [k, b64, n] of beelden) { writeFileSync(`${map}beelden/${k}.jpg`, Buffer.from(b64, 'base64')); totaal += n; }
console.log('beelden', beelden.length, 'gemiddeld', Math.round(totaal / Math.max(1, beelden.length) / 1024), 'KB');
console.log('fouten in console:', fouten.length ? fouten.slice(0, 5) : 'geen');
await browser.close();
