/**
 * Eenvoudige toegangsdrempel voor de demo op Cloudflare Pages.
 * De code staat als secret TOEGANGSCODE in het Pages-project (niet in de repo).
 * Na de juiste code krijgt de bezoeker een cookie voor 30 dagen.
 */
interface Env { TOEGANGSCODE?: string }

const COOKIE = 'icn_demo_toegang';

async function hash(tekst: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(tekst));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function formulier(fout: boolean): Response {
  const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Toegang · ICN zonnepanelen-demo</title>
<style>body{margin:0;min-height:100svh;display:grid;place-items:center;background:#f3f7f1;font:17px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif;color:#111a3a;padding:16px}
form{background:#fff;border:1px solid rgba(11,28,106,.12);border-radius:20px;padding:28px;max-width:380px;width:100%;box-shadow:0 18px 50px rgba(11,28,106,.1)}
h1{font-size:22px;margin:0 0 6px}p{margin:0 0 18px;color:#45506b}label{display:block;font-weight:600;margin-bottom:6px}
input{width:100%;box-sizing:border-box;min-height:52px;border-radius:12px;border:1px solid rgba(11,28,106,.2);padding:0 14px;font-size:17px}
button{margin-top:14px;width:100%;min-height:52px;border:0;border-radius:12px;background:#2b9a3b;color:#fff;font-weight:700;font-size:17px;cursor:pointer}
.fout{color:#b42318;margin-top:10px}</style></head><body>
<form method="post"><h1>Ontwerpvoorbeeld</h1><p>Deze demo van de zonnepanelen-check voor Installatie Comfort Nederland is afgeschermd.</p>
<label for="code">Toegangscode</label><input id="code" name="code" type="password" autocomplete="current-password" required autofocus>
${fout ? '<p class="fout" role="alert">Die code klopt niet. Probeer het opnieuw.</p>' : ''}<button type="submit">Open de demo</button></form></body></html>`;
  return new Response(html, { status: fout ? 401 : 200, headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex, nofollow', 'cache-control': 'no-store' } });
}

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const code = ctx.env.TOEGANGSCODE;
  if (!code) return ctx.next(); // geen code ingesteld: open (alleen bij lokaal testen)
  const verwacht = await hash(code);
  const cookie = ctx.request.headers.get('cookie') ?? '';
  if (cookie.split(/;\s*/).includes(`${COOKIE}=${verwacht}`)) return ctx.next();
  if (ctx.request.method === 'POST') {
    const form = await ctx.request.formData();
    if (String(form.get('code') ?? '').trim() === code) {
      return new Response(null, {
        status: 303,
        headers: { location: new URL(ctx.request.url).pathname, 'set-cookie': `${COOKIE}=${verwacht}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax` },
      });
    }
    return formulier(true);
  }
  return formulier(false);
};
