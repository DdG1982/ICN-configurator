// Rooktest live adressen: typen, suggestie kiezen, laadscherm, resultaat. Schermafbeeldingen in docs/screens.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const basis = process.env.URL ?? 'http://localhost:4173/';
const map = new URL(`../../docs/screens/${new Date().toISOString().slice(0, 10)}-${process.env.RONDE ?? 'live'}/`, import.meta.url).pathname;
mkdirSync(map, { recursive: true });
const adressen = (process.env.ADRESSEN ?? 'Dorpsstraat 10 Nieuw-Roden').split(';');
const maat = process.env.MAAT === 'telefoon' ? { width: 390, height: 844, mobiel: true } : { width: 1366, height: 768 };
// Alleen https via de proxy van de ontwikkelomgeving; de lokale preview (http) gaat direct.
const proxy = process.env.HTTPS_PROXY ? [`--proxy-server=https=${process.env.HTTPS_PROXY.replace(/^https?:\/\//, '')}`] : [];
const browser = await chromium.launch({ args: [...proxy, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [i, adres] of adressen.entries()) {
  const ctx = await browser.newContext({ viewport: maat, ignoreHTTPSErrors: true, deviceScaleFactor: maat.mobiel ? 2 : 1, isMobile: !!maat.mobiel, hasTouch: !!maat.mobiel });
  const page = await ctx.newPage();
  page.setDefaultTimeout(90000);
  const fouten = [];
  page.on('pageerror', (e) => fouten.push(e.message));
  page.on('console', (c) => { if (c.type() === 'error') fouten.push(c.text()); });
  await page.goto(`${basis}?richting=${process.env.RICHTING ?? 'natuur'}`);
  await page.fill('#adres-veld', adres);
  await page.waitForSelector('#adres-lijst li[role=option]');
  await page.waitForTimeout(600);
  const pre = `${map}${maat.mobiel ? 'telefoon' : 'laptop'}-${i}`;
  await page.screenshot({ path: `${pre}-1-suggestie.png` });
  await page.$eval('#adres-lijst li[role=option]', (e) => e.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
  const t0 = Date.now();
  await page.click('#adres-form button[type=submit]');
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${pre}-2-laden.png` });
  await page.waitForSelector('.scan-status.klaar, .laden-fout:not([hidden])', { timeout: 90000 });
  const t = ((Date.now() - t0) / 1000).toFixed(1);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${pre}-3-resultaat.png` });
  const info = await page.evaluate(() => ({
    hash: location.hash, adres: document.querySelector('#adres-regel')?.textContent, scan: document.querySelector('#scan-tekst')?.textContent,
    status: document.querySelector('#melding-status')?.textContent, waarsch: document.querySelector('#melding-waarschuwing')?.textContent,
    fout: document.querySelector('#laden-fout-tekst')?.textContent, uitleg: document.querySelector('#dak-uitleg')?.textContent,
  }));
  console.log(adres, `${t}s`, JSON.stringify(info), fouten.length ? `FOUTEN: ${fouten.join(' | ')}` : '');
  await ctx.close();
}
await browser.close();
