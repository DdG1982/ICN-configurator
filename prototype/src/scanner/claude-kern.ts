/**
 * Beoordeling van één luchtfoto-uitsnede door Claude (vision). Gedeeld door de Cloudflare-functie
 * (functions/api/classificeer.ts) en de lokale ontwikkelserver (vite.config.ts).
 * Uitkomst: alleen een oordeel in drie klassen en een korte zin. Geen aantallen, vermogens, percentages of namen.
 */
import Anthropic from '@anthropic-ai/sdk';

import { geldigBeeld, MODEL, OMVANGEN, OORDELEN, ZICHTEN, type Beoordeling, type Omvang, type Oordeel, type Zicht } from './oordeel';

export { geldigBeeld };

const SYSTEEM = `Je beoordeelt een luchtfoto van één gebouw in Nederland. Het is een orthofoto (recht van boven), ongeveer 8 cm per pixel of grover bij grote gebouwen.
Het te beoordelen gebouw is omlijnd met een dunne magenta lijn: de contour uit de BAG. Beoordeel alleen het dak binnen die lijn. Buren, erven, velden en zonneweides op de grond tellen niet.

Vraag: liggen er op dit dak al zonnepanelen?

Kenmerken van zonnepanelen:
- Rechthoekige panelen in regelmatige rijen of blokken, met een fijn raster en dunne voegen ertussen.
- Meestal donkerblauw of zwart. Door zonlicht kunnen ze ook lichtgrijs of zilverachtig glanzen; het regelmatige raster blijft dan zichtbaar.
- Op schuren en stallen ligt soms een heel dakvlak vol panelen, met hier en daar een open plek voor een lichtplaat.
- Op platte daken staan ze vaak in rijen op schuine frames, met schaduwstroken ertussen.
Lijkt erop maar is het niet: donkere dakpannen, bitumen of EPDM, golfplaten (lange evenwijdige ribbels, geen raster), lichtstraten en doorschijnende lichtplaten (losse lichte vlakken of stroken, vaak verspreid of langs de nok), dakramen, kassen, schaduwen van bomen of de nok, en natte plekken.

Kies precies één oordeel:
- "waarschijnlijk": duidelijke paneelvlakken op het omlijnde dak.
- "twijfel": misschien panelen, maar het beeld is onduidelijk, deels bedekt, of niet te onderscheiden van donker dakmateriaal of lichtplaten; of het gaat om een of twee losse collectoren. Kies twijfel liever dan een stellig oordeel als je het niet zeker weet.
- "niet-gevonden": geen aanwijzing voor panelen op dit dak.

Geef daarnaast de omvang van wat je ziet, als klasse (geen telling):
- "geen": geen panelen.
- "enkele": een paar losse panelen of één kleine groep.
- "blok": een of meer duidelijke blokken, maar het grootste deel van het dak is vrij.
- "groot-deel": een groot deel van een dakvlak of van het hele dak ligt vol.
En de zichtbaarheid: "duidelijk" als de panelen (of het ontbreken ervan) goed te zien zijn, "onduidelijk" bij schaduw, bomen, onscherpte, reflectie of twijfel over het materiaal.

Geef ook een toelichting van één korte zin in het Nederlands, over wat je ziet en waar op het dak (bijvoorbeeld: "blauwe paneelrijen op het zuidwestelijke dakvlak").
Noem geen aantallen panelen, geen vermogen, geen percentages en geen namen van bedrijven of personen.`;

const SCHEMA = {
  type: 'object',
  properties: {
    oordeel: { type: 'string', enum: [...OORDELEN] },
    omvang: { type: 'string', enum: [...OMVANGEN] },
    zichtbaarheid: { type: 'string', enum: [...ZICHTEN] },
    toelichting: { type: 'string' },
  },
  required: ['oordeel', 'omvang', 'zichtbaarheid', 'toelichting'],
  additionalProperties: false,
} as const;

/** Toelichting op één regel en kort houden. */
export function schoonToelichting(t: string): string {
  return t.replace(/\s+/g, ' ').trim().slice(0, 240);
}

export async function beoordeel(client: Anthropic, jpegBase64: string, context: { opp: number; jaar: number }): Promise<Beoordeling> {
  const r = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEEM,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpegBase64 } },
        { type: 'text', text: `Grondvlak volgens de BAG: ongeveer ${Math.round(context.opp)} m². Opnamejaar luchtfoto: ${context.jaar}.` },
      ],
    }],
  });
  const tokensIn = r.usage.input_tokens, tokensUit = r.usage.output_tokens;
  if (r.stop_reason === 'refusal') {
    return { oordeel: 'twijfel', toelichting: 'Het model gaf geen oordeel over dit beeld.', model: r.model, tokensIn, tokensUit };
  }
  const tekst = r.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  let d: { oordeel?: string; omvang?: string; zichtbaarheid?: string; toelichting?: string } = {};
  try { d = JSON.parse(tekst); } catch { /* valt hieronder op twijfel */ }
  if (!OORDELEN.includes(d.oordeel as Oordeel)) {
    return { oordeel: 'twijfel', toelichting: 'Geen geldig antwoord van het model.', model: r.model, tokensIn, tokensUit };
  }
  const oordeel = d.oordeel as Oordeel;
  // 'niet gevonden' met een omvang is tegenstrijdig: dan geldt het oordeel.
  const omvang: Omvang = oordeel === 'niet-gevonden' ? 'geen' : OMVANGEN.includes(d.omvang as Omvang) ? d.omvang as Omvang : 'enkele';
  const zicht: Zicht = ZICHTEN.includes(d.zichtbaarheid as Zicht) ? d.zichtbaarheid as Zicht : 'onduidelijk';
  return { oordeel, omvang, zicht, toelichting: schoonToelichting(d.toelichting ?? ''), model: r.model, tokensIn, tokensUit };
}
