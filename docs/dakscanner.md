# Dakscanner (branch `feature/dakscanner`)

Interne tool: kies een gebied, en de scanner zoekt naar daken waarop **al** zonnepanelen lijken te liggen. Openen via `scanner.html` (naast de configurator, achter dezelfde toegangscode). De configurator zelf werkt zoals voorheen.

## Hoe het werkt

| Stap | Bron | Waar |
|---|---|---|
| Plaats zoeken | PDOK Locatieserver `suggest`/`lookup` | browser |
| Kaart | PDOK luchtfoto (WMTS, actueel) en BRT | browser (Leaflet) |
| Gebouwen in het gebied | BAG WFS `bag:pand`, met paginering | browser |
| Adressen | BAG WFS `bag:verblijfsobject` (koppeling via `pandidentificatie`) | browser |
| Luchtfoto per pand | PDOK luchtfoto WMS, **jaarlaag** `2026_orthoHR` (anders 2025, 2024) | browser |
| Beoordeling | Claude Haiku 5.5 (vision) via `functions/api/classificeer.ts` | Cloudflare Pages Function |
| Opslag | IndexedDB (scans, panden, beelden) | alleen in deze browser |

- **Filter:** grondvlak ≥ 150 m² (instelbaar). Ronde bouwwerken zoals silo's en mestsilo's worden standaard overgeslagen.
- **Volgorde:** eerst panden zonder woonfunctie, daarna gemengde panden, daarna woningen; telkens de grootste eerst.
- **Type pand:** komt alleen uit de BAG:
  - "Bijgebouw (geen verblijfsobject)"
  - "Niet-woonfunctie"
  - "Woning met andere functie"
  - "Woning"

  De BAG zegt niets over agrarisch gebruik, en dat zeggen wij dus ook niet.
- **Uitsnede:** vierkant rond het pand, 8 cm per pixel, hooguit 768 px. Bij daken groter dan ca. 60 m worden de pixels dus grover. De BAG-contour is in magenta op het beeld getekend. Dat beeld wordt beoordeeld, bewaard en geëxporteerd.
- **Beeldjaar:** we vragen een vaste jaarlaag op, zodat het jaar zeker is. "Actueel" gebruiken we niet, want dan weet je het jaar niet. Is de jaarlaag op een plek leeg, dan nemen we het jaar ervoor.
- **Oordeel:** "waarschijnlijk zonnepanelen", "twijfel" of "niet gevonden", plus een korte zin van het model. Het model geeft geen aantallen, geen vermogen, geen percentages en geen namen.
- **Dubbele vondsten:** de sleutel is het BAG-pand-id. Een pand dat al beoordeeld is, wordt bij een overlappende scan overgeslagen en niet opnieuw betaald.
- **Stoppen en hervatten:** elk pand wordt direct opgeslagen. Hervatten gaat verder met de panden die nog niet klaar zijn. Panden met een fout worden opnieuw geprobeerd.
- **Kosten:** voor de start toont de scanner het aantal gebouwen, de geraamde kosten en de duur. Boven 300 gebouwen vraagt hij een extra bevestiging. Tijdens de scan zie je het verbruik volgens de tokentelling van de API.
- **Links per vondst** (ook als kolommen in de CSV), altijd op het zwaartepunt van het pand en niet op het adres:
  - **Bekijk dak:** `index.html#pand=<BAG-id>&x=<RD>&y=<RD>` opent het pand in de configurator, ingezoomd in 3D. Dit werkt ook voor een schuur zonder adres.
  - **Google Maps:** satellietweergave, zoom 20.
  - **PDOK-luchtfoto:** directe WMS-link naar de luchtfoto van het pand met omgeving, uit dezelfde jaarlaag. **Een link naar de PDOK-viewer zelf maken we niet:** `app.pdok.nl` was vanuit de ontwikkelomgeving niet bereikbaar en het URL-formaat staat nergens beschreven.
- **Adres:** heeft een pand een eigen adres in de BAG, dan tonen we dat. Zo niet (schuur, stal), dan tonen we het dichtstbijzijnde adres binnen 150 m, met de afstand en de tekst "niet van dit pand".
- **Export:**
  - CSV, met puntkomma als scheidingsteken en UTF-8 met BOM;
  - ZIP met de CSV en `beelden/<pand-id>_<jaar>.jpg`.

## Sneller selecteren (17-11-2026, versie 2)

Danny na de eerste echte run: ongeveer 35–40% klopt, 15% is twijfel en de rest heeft niets. Er moest alleen te veel worden geklikt. Daarom:

- **Omvang en zichtbaarheid:** het model geeft per dak twee extra antwoorden in vaste klassen:
  - omvang: "enkele panelen", "een blok", "groot deel van het dak";
  - zichtbaarheid: "duidelijk" of "onduidelijk".

  Er komt geen telling en geen percentage van het model. De lijst staat op volgorde van oordeel, daarna omvang, daarna zichtbaarheid.
- **Snel beoordelen:** één grote luchtfoto tegelijk. **B** = bevestigen, **A** = afwijzen, **→** of spatie = overslaan, **←** = vorige, **Esc** = sluiten. Na elke keuze gaat de scanner automatisch door naar het volgende dak. Je ziet alleen panden die nog niet beoordeeld zijn, de hoogste rang eerst.
- **Trefkans per klasse:** per klasse (oordeel · omvang · zicht) toont de scanner welk deel jij zelf hebt bevestigd van wat je in die klasse hebt bekeken.
  - Dat percentage is **gemeten**, geen schatting van het model.
  - Het verschijnt pas vanaf 10 zelf bekeken panden. Onder de 20 staat erbij "nog weinig".
  - Daarna kun je de rest van de klasse in één keer bevestigen of afwijzen. Je ziet dan eerst hoeveel fouten je ongeveer mag verwachten, en je kunt het ongedaan maken.
  - Panden die je zo in één keer beoordeelt, tellen niet mee in de trefkans. In de CSV staan ze als "(in één keer, per klasse)".
- **Opnieuw beoordelen:** vondsten uit de eerste versie hebben nog geen omvang. Die kun je opnieuw laten beoordelen met de bewaarde luchtfoto's. Er wordt niets opnieuw opgehaald; dat kost ca. $0,0002 per pand.
- **"Niet gevonden"** hoef je niet na te lopen.

## Minimaal aantal panelen en kosten verbergen (18-11-2026, versie 3)

- **Geschat aantal panelen:** het model **telt geen panelen**. Tientallen kleine rechthoeken tellen op één luchtfoto is onbetrouwbaar. In plaats daarvan kiest het een bedekkingsklasse:
  - geen;
  - minder dan 10%;
  - 10–25%;
  - 25–50%;
  - 50–75%;
  - meer dan 75% van het dak, van bovenaf gezien.

  De scanner rekent dat om naar een bandbreedte: grondvlak (BAG) × bedekking ÷ 1,8 tot 2,2 m² per paneel, afgerond op 5. Voorbeeld: 1.000 m² met 25–50% bedekking geeft ca. 110–280 panelen.
- **Hoe grof de schatting is:**
  - De bedekking is een inschatting van het model. Hoe goed die is, is niet gemeten.
  - Op een steil dak liggen meer panelen dan het bovenaanzicht doet vermoeden: bij 45° ongeveer 40% meer.
  - Gebruik het om te sorteren en te filteren, niet als aantal.
- **Filter "Minimaal geschat aantal panelen":** een pand blijft zichtbaar zolang de bovenkant van de bandbreedte het minimum haalt. Zo valt een twijfelgeval niet te snel weg. Panden zonder schatting (oude versie) blijven ook zichtbaar. Het filter geldt voor de lijst, de kaart, "Snel beoordelen", de trefkans en de export.
- **Export:** de CSV heeft nu ook de kolommen `dekking_dak`, `geschat_panelen_min` en `geschat_panelen_max`.
- **"Kosten tonen":** schakelaar rechtsboven, standaard uit en per browser onthouden. Staat hij uit, dan staan er geen bedragen op de knoppen en in de voortgang. **Bij grote opdrachten (meer dan 300 gebouwen) en bij "opnieuw beoordelen" toont de bevestigingsvraag de kosten altijd**, zodat er nooit ongemerkt een grote scan start.
- **Bestaande vondsten:** die hebben nog geen schatting. Met "Opnieuw beoordelen voor omvang en aantal" gebeurt dat met de bewaarde luchtfoto's.

## Straal tot 10 km en bevestiging vanaf 2.000 gebouwen (18-11-2026, versie 4)

- **Straal:** naast 0,5–3 km kun je nu ook 5 km en 10 km kiezen. Een getekende rechthoek mag tot 320 km² zijn.
- **Ophalen per tegel:** grote gebieden worden per tegel van 2 × 2 km bij de BAG opgevraagd, drie tegels tegelijk. Elk pand telt mee in de tegel waarin het zwaartepunt ligt, zodat er niets dubbel wordt geteld. Adressen worden alleen opgehaald voor tegels waarin kandidaten liggen.
- **Gemeten (vanuit de ontwikkelomgeving):**

  | Gebied | Panden | ≥ 150 m² | Ophalen | Geraamde scanduur |
  |---|---|---|---|---|
  | Peest, 1 km | 143 | 58 | 1 s | 2 min |
  | Peest, 5 km | 5.815 | 937 | 14 s | 25 min |
  | Peest, 10 km (met Roden, Leek) | 70.739 | 7.070 | 57 s | 3,1 uur |
  | Roden, 10 km | 61.751 | 8.176 | 62 s | 3,6 uur |

  De scanduur is een raming van 1,6 s per pand, en die raming is nog niet gemeten met echte beoordelingen. Een scan van 7.000 panden kost ca. 500 MB opslag in de browser.
- **Bevestigingsvraag met kosten:** pas vanaf 2.000 gebouwen (was 300). Dat geldt voor starten, hervatten en opnieuw beoordelen. Daaronder start de scan direct.

## Instellen op Cloudflare

1. Zet in het Pages-project `icn-zonnepanelen-demo` het secret **`ANTHROPIC_API_KEY`**. Zonder sleutel stopt de scan meteen met een duidelijke melding.
2. **Daglimiet (aanbevolen):**
   - Koppel een KV-namespace als binding `SCAN_TELLER`.
   - Zet eventueel `DAGLIMIET`; de standaard is 3000 beoordelingen per dag.
   - KV telt niet exact bij gelijktijdige verzoeken. Zet daarom ook een uitgavelimiet in de Anthropic Console.
3. Deploy zoals gewoonlijk (`npm run deploy`).

Lokaal:

```
cd prototype
npm run build
ANTHROPIC_API_KEY=… npx vite preview --port 4173      # echte beoordeling
SCANNER_PROEF=1 npx vite preview --port 4173           # zonder sleutel: gemarkeerd proefantwoord, alleen voor de interface
CHROMIUM=/opt/pw-browsers/chromium PLAATS=Peest STRAAL=1000 LIMIET=40 node scripts/scanner-test.mjs
```

## Kosten

- **Raming:** ca. $0,0002 per gebouw, dus ongeveer $0,20 per 1.000 gebouwen.
  - Haiku 5.5 kost $0,10 per miljoen inputtokens en $0,50 per miljoen outputtokens (november 2026).
  - Per gebouw: ca. 790 tokens beeld, 500 tokens instructie en 150 tokens uitvoer.
  - **Nog niet gemeten met echte aanroepen.** De echte telling staat tijdens de scan in beeld.
- **Opslag:** gemiddeld 68 KB per uitsnede (gemeten in de praktijktest), dus ca. 70 MB per 1.000 gescande panden.
- **Overig:** BAG, PDOK-luchtfoto en kaart zijn gratis.

## Praktijktest 17-11-2026: Peest (Drenthe), straal 1 km

- **Gebouwen:** 143 panden in gebruik. Daarvan hebben er 62 een grondvlak ≥ 150 m²:
  - 28 bijgebouwen zonder verblijfsobject;
  - 2 met een niet-woonfunctie;
  - 8 woningen met een andere functie;
  - 24 woningen.
- **Ophalen:** gebouwen en adressen in 1,4 s. 40 uitsneden ophalen en opslaan in 5 s; dat is zonder de tijd van de API.
- **Keten getest van begin tot eind:** zoeken, uitsneden, opslag, kaart, lijst, CSV-export en "Bekijk dak" voor een schuur zonder adres. Er waren geen fouten in de browser.
- **De AI-beoordeling zelf is nog niet getest.** In de ontwikkelomgeving kan geen Anthropic-sleutel worden ingesteld. De scan draaide daarom in proefmodus: elk pand kreeg "twijfel" met de tekst "PROEFMODUS".
- **Handmatige controle:** de 40 uitsneden zijn met de hand bekeken door Claude in deze ontwikkelsessie. Dat is een indruk, geen gecontroleerde waarheid. Overzichtsvellen: `docs/dakscanner/vel1-4.jpg`.
  - **Duidelijk panelen (6):** nr. 3, 5, 15, 25, 35 en 39, met donkerblauwe of zwarte rasters.
  - **Twijfel (7):** nr. 2, 10, 18, 19, 20, 24 en 29.
    - Hele dakvlakken met een donker raster en lichte gaten (zou een vol paneeldak kunnen zijn).
    - Lichtgrijze, glanzende rasters (panelen of doorschijnende lichtplaten?).
  - **Niet (27):** waaronder 4 ronde (mest)silo's. Die worden nu standaard overgeslagen.
- **Wat we leerden:**
  - Panelen op stallen zijn op deze luchtfoto's niet altijd donker. Ze kunnen lichtgrijs glanzen, en lichtplaten lijken daar sterk op. De instructie voor het model is hierop aangepast. Ook voor een mens blijft een deel echt twijfel. Daarom zijn de knoppen "bevestigen" en "afwijzen" nodig.
  - Buurpanden met panelen staan vaak in de uitsnede (nr. 1 en 26). Het model krijgt de opdracht alleen het omlijnde dak te beoordelen. Of het zich daaraan houdt, is nog niet gemeten.

**Volgende stap:** na het instellen van de sleutel dezelfde 40 panden echt laten beoordelen, en het oordeel naast deze handmatige indruk leggen. De kosten zijn dan minder dan $0,05.

## Open punten

- **Nauwkeurigheid van Haiku 5.5 op deze beelden** is onbekend tot de eerste echte run. Valt die tegen, dan is Claude Sonnet 5.5 een optie: ca. 20 keer duurder, ongeveer $3–5 per 1.000 gebouwen. Het model staat op één plek: `src/scanner/oordeel.ts`.
- **Opslag alleen in de browser:** een andere computer ziet de scans niet. Wissen van de browsergegevens wist de scans. Exporteer de ZIP om ze te bewaren. Gedeelde opslag (Cloudflare D1 + R2) kan later; de opslaglaag is daarvoor apart gehouden.
- **PDOK-viewerlink:** niet gemaakt, zie hierboven. Als `app.pdok.nl` bereikbaar wordt, kan het formaat worden uitgezocht.
- **"Bekijk dak" opent de configurator,** en die legt standaard nieuwe panelen op het dak, ook als er al panelen liggen. Voor de scanner is dat verwarrend. Een aparte weergave zonder paneelindeling kan later.
- **AVG:** een lijst met adressen en "heeft zonnepanelen" van woningen is een persoonsgegeven. Bij bedrijfspanden speelt dat minder. Danny bepaalt het doel en de bewaartermijn.
- **De luchtfoto op de kaart is "actueel".** De uitsneden komen uit een vaste jaarlaag. Ze kunnen dus een ander jaar laten zien dan de kaart; het jaar staat bij elke vondst.
