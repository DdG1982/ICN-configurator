/**
 * Luchtfoto-uitsnede per pand uit de PDOK-luchtfoto (WMS), met de BAG-contour erop getekend.
 * We vragen bewust een jaarlaag (2026_orthoHR, 2025_orthoHR …) en niet 'Actueel': dan weten we het beeldjaar zeker.
 * Is een jaarlaag op deze plek leeg (wit of effen), dan proberen we de volgende.
 */
const LUCHTFOTO_WMS = 'https://service.pdok.nl/hwh/luchtfotorgb/wms/v1_0';
export const JAARLAGEN = ['2026_orthoHR', '2025_orthoHR', '2024_orthoHR'];
export const CONTOURKLEUR = '#ff00ff';

export const jaarVanLaag = (laag: string) => Number(laag.slice(0, 4));

export interface UitsnedeKader { x0: number; y0: number; zijde: number; px: number }

/** Vierkant kader rond de contour met wat marge; 8 cm per pixel tot hooguit 768 px (grote daken krijgen dus grovere pixels). */
export function kader(footprint: [number, number][]): UitsnedeKader {
  const xs = footprint.map((p) => p[0]), ys = footprint.map((p) => p[1]);
  const mx = (Math.min(...xs) + Math.max(...xs)) / 2, my = (Math.min(...ys) + Math.max(...ys)) / 2;
  const zijde = Math.max(40, Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 1.25 + 10);
  const px = Math.min(768, Math.max(384, Math.round(zijde / 0.08)));
  return { x0: mx - zijde / 2, y0: my - zijde / 2, zijde, px };
}

export function wmsUrl(laag: string, x0: number, y0: number, zijde: number, px: number): string {
  const r = (v: number) => Math.round(v * 100) / 100;
  return `${LUCHTFOTO_WMS}?service=WMS&version=1.3.0&request=GetMap&layers=${laag}&styles=&crs=EPSG:28992`
    + `&bbox=${r(x0)},${r(y0)},${r(x0 + zijde)},${r(y0 + zijde)}&width=${px}&height=${px}&format=image/jpeg`;
}

/** Is het beeld (bijna) leeg? Effen wit/grijs/zwart betekent: geen opname van dit jaar op deze plek. */
export function isLeeg(data: Uint8ClampedArray): boolean {
  let n = 0, som = 0, som2 = 0;
  for (let i = 0; i < data.length; i += 4 * 16) {
    const g = (data[i] + data[i + 1] + data[i + 2]) / 3;
    som += g; som2 += g * g; n++;
  }
  const gem = som / n, sd = Math.sqrt(Math.max(0, som2 / n - gem * gem));
  return sd < 4;
}

export interface Uitsnede {
  blob: Blob;          // JPEG met contour: precies wat beoordeeld is
  base64: string;
  laag: string;
  jaar: number;
  bron: string;        // WMS-URL van het beeld zonder contour
  kader: UitsnedeKader;
}

async function naarBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function maakUitsnede(footprint: [number, number][], signaal?: AbortSignal, lagen = JAARLAGEN): Promise<Uitsnede> {
  const k = kader(footprint);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = k.px;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  for (const laag of lagen) {
    const bron = wmsUrl(laag, k.x0, k.y0, k.zijde, k.px);
    let beeld: ImageBitmap | null = null;
    for (let p = 0; p < 3 && !beeld; p++) {
      try {
        const r = await fetch(bron, { signal: signaal });
        if (r.ok && (r.headers.get('content-type') ?? '').startsWith('image/')) beeld = await createImageBitmap(await r.blob());
      } catch (e) { if (signaal?.aborted) throw e; }
      if (!beeld) await new Promise((res) => setTimeout(res, 800 * 2 ** p));
    }
    if (!beeld) throw new Error('PDOK-luchtfoto niet bereikbaar');
    ctx.drawImage(beeld, 0, 0, k.px, k.px);
    if (isLeeg(ctx.getImageData(0, 0, k.px, k.px).data)) continue;

    // Contour van het pand (BAG), zodat duidelijk is welk dak beoordeeld wordt.
    const s = k.px / k.zijde;
    ctx.strokeStyle = CONTOURKLEUR;
    ctx.lineWidth = Math.max(2, k.px / 320);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    footprint.forEach(([x, y], i) => {
      const u = (x - k.x0) * s, v = (k.y0 + k.zijde - y) * s;
      if (i) ctx.lineTo(u, v); else ctx.moveTo(u, v);
    });
    ctx.closePath();
    ctx.stroke();
    const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('JPEG maken mislukt'))), 'image/jpeg', 0.85));
    return { blob, base64: await naarBase64(blob), laag, jaar: jaarVanLaag(laag), bron, kader: k };
  }
  throw new Error('Geen luchtfoto van 2024–2026 op deze plek');
}
