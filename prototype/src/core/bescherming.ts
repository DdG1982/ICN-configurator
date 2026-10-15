/**
 * Browserkant van de botbescherming (zie server/pas.ts). Alleen actief als de build een Turnstile-sitekey
 * heeft (VITE_TURNSTILE_SITEKEY). Turnstile laadt pas bij de eerste live berekening of lead, niet bij het openen
 * van de pagina, zodat het eerste scherm licht blijft.
 */
export const PAS_HEADER = 'x-icn-pas';
const SITEKEY = import.meta.env.VITE_TURNSTILE_SITEKEY as string | undefined;
const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface Turnstile {
  render(el: HTMLElement, opties: Record<string, unknown>): string;
  execute(id: string): void;
  reset(id: string): void;
}
declare global { interface Window { turnstile?: Turnstile } }

export class ControleFout extends Error {}

let script: Promise<Turnstile> | null = null;
function laadTurnstile(): Promise<Turnstile> {
  script ??= new Promise<Turnstile>((ok, nee) => {
    const s = document.createElement('script');
    s.src = SCRIPT; s.async = true;
    s.onload = () => (window.turnstile ? ok(window.turnstile) : nee(new ControleFout('Turnstile niet geladen')));
    s.onerror = () => { script = null; nee(new ControleFout('Turnstile niet bereikbaar')); };
    document.head.appendChild(s);
  });
  return script;
}

let widget: { id: string; el: HTMLElement } | null = null;
let wachtend: { ok: (t: string) => void; nee: (e: Error) => void } | null = null;

/** Eén Turnstile-token. De widget blijft onzichtbaar, tenzij Cloudflare de bezoeker iets wil laten aanklikken. */
async function turnstileToken(): Promise<string> {
  const t = await laadTurnstile();
  return new Promise<string>((ok, nee) => {
    wachtend = { ok, nee };
    if (!widget) {
      const el = document.createElement('div');
      el.className = 'turnstile-vak';
      document.body.appendChild(el);
      const id = t.render(el, {
        sitekey: SITEKEY, execution: 'execute', appearance: 'interaction-only', language: 'nl',
        callback: (token: string) => { el.classList.remove('zichtbaar'); wachtend?.ok(token); wachtend = null; },
        'error-callback': () => { wachtend?.nee(new ControleFout('Turnstile-fout')); wachtend = null; },
        'before-interactive-callback': () => el.classList.add('zichtbaar'),
        'after-interactive-callback': () => el.classList.remove('zichtbaar'),
      });
      widget = { id, el };
    } else {
      t.reset(widget.id);
    }
    t.execute(widget.id);
  });
}

let pas: { waarde: string; verloopt: number } | null = null;
let bezig: Promise<string | null> | null = null;
/** Geen bescherming ingebouwd of ingesteld: dan is er geen pas nodig. */
let uit = !SITEKEY;

/** Geeft een geldige pas, of null als de server geen bescherming heeft. Gooit ControleFout als de controle mislukt. */
export function haalPas(): Promise<string | null> {
  if (uit) return Promise.resolve(null);
  if (pas && pas.verloopt - Date.now() > 2 * 60 * 1000) return Promise.resolve(pas.waarde);
  bezig ??= (async () => {
    const token = await turnstileToken();
    const r = await fetch(new URL('/api/pas', location.href), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
    if (r.status === 404) { uit = true; return null; }
    if (!r.ok) throw new ControleFout(`pas geweigerd (${r.status})`);
    const d = await r.json() as { pas: string; verloopt: number };
    pas = { waarde: d.pas, verloopt: d.verloopt };
    return d.pas;
  })().finally(() => { bezig = null; });
  return bezig;
}

/** Na een 401: de pas is verlopen of ongeldig, vraag de volgende keer een nieuwe. */
export function vergeetPas() { pas = null; }

export const pasKopjes = (p: string | null): Record<string, string> => (p ? { [PAS_HEADER]: p } : {});
