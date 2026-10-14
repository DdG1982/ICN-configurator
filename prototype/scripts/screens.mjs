// Schermafbeeldingen voor de ontwerpronden: telefoon, kleine laptop, groot scherm, beide richtingen.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const basis = process.env.URL ?? 'http://localhost:4173/';
const ronde = process.env.RONDE ?? 'r1';
const datum = new Date().toISOString().slice(0, 10);
const map = new URL(`../../docs/screens/${datum}-${ronde}/`, import.meta.url).pathname;
mkdirSync(map, { recursive: true });

const maten = [
  { naam: 'telefoon', width: 390, height: 844, mobiel: true },
  { naam: 'laptop', width: 1366, height: 768 },
  { naam: 'groot', width: 1920, height: 1080 },
];
const richtingen = (process.env.RICHTING ?? 'natuur,goudenuur').split(',');

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const r of richtingen) {
  for (const m of maten) {
    const ctx = await browser.newContext({ viewport: { width: m.width, height: m.height }, deviceScaleFactor: m.mobiel ? 2 : 1, isMobile: !!m.mobiel, hasTouch: !!m.mobiel });
    const page = await ctx.newPage();
    page.setDefaultTimeout(120000);
    console.log('bezig', r, m.naam);
    const fouten = [];
    page.on('pageerror', (e) => fouten.push(e.message));
    page.on('console', (c) => { if (c.type() === 'error') fouten.push(c.text()); });
    await page.goto(`${basis}?richting=${r}`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${map}${r}-${m.naam}-1-start.png` });
    if (m.naam === 'laptop') await page.screenshot({ path: `${map}${r}-${m.naam}-1b-start-vol.png`, fullPage: true });
    await page.fill('#adres-veld', 'Dwazz');
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${map}${r}-${m.naam}-2-suggestie.png` });
    await page.click('#adres-lijst li');
    await page.click('#adres-form button[type=submit]');
    await page.waitForTimeout(1600);
    await page.screenshot({ path: `${map}${r}-${m.naam}-3-vlucht.png` });
    await page.waitForSelector('.scan-status.klaar', { timeout: 30000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${map}${r}-${m.naam}-4-resultaat.png` });
    await page.$eval('#warmte-schakel', (e) => e.click());
    await page.fill('#uur', '19.5');
    await page.dispatchEvent('#uur', 'input');
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${map}${r}-${m.naam}-5-zonkaart.png` });
    if (m.mobiel) await page.screenshot({ path: `${map}${r}-${m.naam}-6-vol.png`, fullPage: true });
    else {
      for (const [i, sel] of ['.stroom-kaart', '.cta-kaart'].entries()) {
        await page.$eval(sel, (e) => e.scrollIntoView({ block: 'start' }));
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${map}${r}-${m.naam}-6-paneel-${i + 1}.png` });
      }
    }
    if (fouten.length) console.log(r, m.naam, 'FOUTEN:', fouten.slice(0, 5));
    await ctx.close();
  }
}
await browser.close();
console.log('klaar:', map);
