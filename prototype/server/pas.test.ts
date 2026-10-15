import { describe, expect, it } from 'vitest';
import { maakPas, pasGeldig, PAS_GELDIG_MS, turnstileGoed, vereisPas } from './pas';

const GEHEIM = 'test-geheim';

describe('pas van de botbescherming', () => {
  it('een verse pas is geldig', async () => {
    const { pas } = await maakPas(GEHEIM);
    expect(await pasGeldig(pas, GEHEIM)).toBe(true);
  });

  it('een verlopen pas, een ander geheim of geknoei wordt geweigerd', async () => {
    const nu = Date.now();
    const { pas, verloopt } = await maakPas(GEHEIM, nu);
    expect(await pasGeldig(pas, GEHEIM, nu + PAS_GELDIG_MS + 1)).toBe(false);
    expect(await pasGeldig(pas, 'ander-geheim', nu)).toBe(false);
    expect(await pasGeldig(`${verloopt + 1000}.${pas.split('.')[1]}`, GEHEIM, nu)).toBe(false);
    expect(await pasGeldig(null, GEHEIM)).toBe(false);
    expect(await pasGeldig('onzin', GEHEIM)).toBe(false);
  });

  it('zonder geheim staat de API open, met geheim is een pas nodig', async () => {
    const zonder = new Request('https://x/api/pvgis');
    expect(await vereisPas(zonder, undefined)).toBeNull();
    expect((await vereisPas(zonder, GEHEIM))?.status).toBe(401);
    const { pas } = await maakPas(GEHEIM);
    expect(await vereisPas(new Request('https://x/api/pvgis', { headers: { 'x-icn-pas': pas } }), GEHEIM)).toBeNull();
  });

  it('Turnstile: alleen success=true telt, netwerkfout = afgewezen', async () => {
    const antw = (d: unknown) => (async () => new Response(JSON.stringify(d))) as typeof fetch;
    expect(await turnstileGoed('tok', GEHEIM, null, antw({ success: true }))).toBe(true);
    expect(await turnstileGoed('tok', GEHEIM, null, antw({ success: false }))).toBe(false);
    expect(await turnstileGoed('', GEHEIM, null, antw({ success: true }))).toBe(false);
    expect(await turnstileGoed('tok', GEHEIM, null, (async () => { throw new Error('weg'); }) as typeof fetch)).toBe(false);
  });
});
