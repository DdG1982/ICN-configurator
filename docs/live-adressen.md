# Live adressen (14-10-2026)

Elk adres in Nederland werkt. De bezoeker typt een adres, kiest het uit de PDOK-suggesties, en ziet binnen ongeveer 3 tot 8 seconden het eigen dak in 3D, met panelen, schaduw en opbrengst.

## Hoe het werkt

| Stap | Bron | Waar |
|---|---|---|
| Suggesties tijdens typen | PDOK Locatieserver `suggest` | browser |
| Adres → coördinaten, provincie | PDOK Locatieserver `lookup` | Web Worker |
| Pand, bouwjaar, gebruiksdoel, eenheden | BAG WFS (PDOK) | Web Worker |
| Rijksmonument? | RCE (PDOK, `ps-ch`) | Web Worker |
| Dak en buren in 3D (LoD2.2, 70 m) | 3DBAG API | Web Worker |
| Hoogtekaart (DSM, DTM, 0,5 m, 160 x 160 m) | AHN WCS (PDOK) | Web Worker |
| Opbrengst per dakvlak (kWh/kWp) | PVGIS 5.3 via `/api/pvgis` | Pages Function, 30 dagen cache |
| Luchtfoto's | PDOK luchtfoto WMS | browser (three.js) |

- Alle PDOK-, 3DBAG- en AHN-diensten sturen `Access-Control-Allow-Origin: *`. PVGIS niet, en loopt daarom via `functions/api/pvgis.ts`.
- **Schaduw:**
  - Voor elke cel van een dakvlak volgen we de zon over de AHN-hoogtekaart. Dat gebeurt voor 12 dagen per jaar, elk half uur, met stappen van 0,5 m.
  - Een zonstand telt als geblokt als de kaart ergens hoger is dan de straal.
  - Het diffuse licht (18%) telt altijd mee.
  - Dat geeft dezelfde schaduwfactor als de oude methode (Peest 0,987 tegen 0,980, Vries 0,970 tegen 0,960). Bij grote platte daken is hij beter, zie docs/open-punten.md.
- **Code:**
  - `prototype/src/live/geo.ts`: geometrie, paneelplekken, zonnestand.
  - `prototype/src/live/hoogte.ts`: schaduw en bomen uit AHN.
  - `prototype/src/live/bronnen.ts`: ophalen van de bronnen.
  - `prototype/src/live/bouw.ts`: bouwt het dakmodel.
  - `prototype/src/live/werker.ts`: de Web Worker.
  - `prototype/src/live/live.ts`: aanroep vanuit de pagina.
- **Laadscherm:**
  - De luchtfoto van de buurt verschijnt meteen en zoomt langzaam in.
  - Zes stappen vinken af: Adres, Gebouw, 3D, Bomen, Opbrengst, Schaduw.
  - Daarna volgt dezelfde vlucht als bij de voorbeelden.
- **Foutroutes:**
  - Adres niet gevonden, of geen gebouw op dit adres: een duidelijke melding, zonder knop "opnieuw".
  - Een bron reageert niet: een melding die de bron noemt, met de knop "Probeer opnieuw".
  - AHN niet bereikbaar: het dak wordt toch getoond, met de melding dat de schaduw niet is meegerekend.
  - 3DBAG kent het pand niet (nieuwbouw): dezelfde route als Dwazziewegen 20.

## Gemeten (vanuit de ontwikkelomgeving)

| Adres | Rekentijd (Node) | Van klik tot panelen (browser, incl. vlucht van 3,8 s) |
|---|---|---|
| Zuidveldigerweg 1, Peest | 1,7–4 s | 8 s (voorbeeld) |
| Dorpsstraat 10, Nieuw-Roden | – | 12,7 s |
| Hereweg 100, Groningen | – | 15,1 s |
| Kerkstraat 1, Zuidlaren | – | 14,4 s |
| Brink 1, Dwingeloo (rijksmonument herkend) | – | 10,7 s (telefoon) |
| Stationsstraat 5, Assen | – | 11 s |

De browsertijden zijn gemeten met software-rendering en via een proxy. Op een echte telefoon met 4G is dit **niet gemeten**.

## Lokaal draaien

```
cd prototype
npm run build && npx vite preview --port 4173        # /api/pvgis werkt lokaal via curl
NODE_USE_ENV_PROXY=1 npx vite-node scripts/bouw-voorbeelden.ts   # voorbeelden opnieuw opbouwen
ADRESSEN="Brink 1 Dwingeloo" node scripts/live-test.mjs          # rooktest in de browser
```

## Beperkingen (eerlijk)

- Bestaande panelen, riet, dakramen en dakkapellen zitten niet in de data. Daarom stellen we de twee vragen en geldt: definitief na schouw.
- De 3DBAG-dakvlakken zijn een model. Kleine uitbouwen en schoorstenen kunnen afwijken.
- AHN is van 2019–2023, afhankelijk van de regio. Bomen die later zijn geplant of gekapt kloppen dan niet.
- Gemeentelijke monumenten en beschermde gezichten herkennen we niet.
- Er is geen limiet per bezoeker op de PVGIS-functie, behalve de toegangscode. Voor productie is een rate limit of Turnstile nodig.
