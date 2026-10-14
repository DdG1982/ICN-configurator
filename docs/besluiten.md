# Besluiten

Fase 0 loopt nog. Hier staan de antwoorden van Danny met datum.

## 14-10-2026: testadressen en voorbeeldwoningen (vraag 8 en 13)

- **De zes adressen van Danny mogen in de demo**, ook in de versie die ICN te zien krijgt. Danny besliste dit nadat hij was gewezen op de nadelen hieronder. Dit wijkt af van brief 4c, waar alleen adressen in het werkgebied als showcase in aanmerking kwamen.
  - Dwazziewegen 20, 9301 ZR Roden en Noordhoek 5, 9301 ZG Roden liggen allebei op Industrieterrein Roden. **Een van de twee is het pand van ICN zelf.** Welke het is, moet nog worden gemeld. Op Noordhoek 5 staat Audece B.V. ingeschreven (bron: oozo.nl), dus vermoedelijk is Dwazziewegen 20 het ICN-pand. Dat is nog niet bevestigd.
  - Arwerd 1, 9746 CM Groningen: de straat bestaat volgens postcode.site. Het type pand is niet gecontroleerd.
  - Prinseneiland 517, 1013 EC Amsterdam: dit is een **appartement op de 1e verdieping** zonder eigen dak (bron: Funda, verkocht in december 2025). In de demo dient het als voorbeeld van de route "appartement, geen eigen dak".
  - Ruisvoornlaan 4, 1432 PH Aalsmeer: ligt buiten het werkgebied en is niet gecontroleerd.
  - Amstelbeststraat 12A, 1096 GD Amsterdam: Gezondheidscentrum Amstelkwartier (correctie door Danny). Het is een zakelijk pand.
- **Bron van de extra adressen:** het eigen netwerk van Danny, met toestemming van de bewoners, plus openbare en zakelijke panden. Willekeurige privéwoningen van derden komen niet in de demo.

## 14-10-2026: definitieve adreslijst voor de demo (15 adressen)

Danny: "Zo is het genoeg, gebruik alle adressen die je nu hebt, alles kan zo in de demo." Dat de bewoners toestemming gaven, is alleen door Danny bevestigd. Ik heb dat niet zelf gecontroleerd.

| # | Adres | Bron | Type of variant (gecontroleerd in Fase 1) |
|---|---|---|---|
| 1 | Dwazziewegen 20, 9301 ZR Roden | Danny | Industrieterrein, mogelijk het ICN-pand |
| 2 | Noordhoek 5, 9301 ZG Roden | Danny | Industrieterrein, mogelijk het ICN-pand |
| 3 | Ruisvoornlaan 4, 1432 PH Aalsmeer | Danny | Buiten het werkgebied |
| 4 | Arwerd 1, 9746 CM Groningen | Danny | Onbekend |
| 5 | Prinseneiland 517, 1013 EC Amsterdam | Danny | Appartement op de 1e verdieping, buiten het werkgebied |
| 6 | Amstelbeststraat 12A, 1096 GD Amsterdam | Danny | Gezondheidscentrum, buiten het werkgebied |
| 7 | Zuidveldigerweg 1, 9334 TL Peest | Danny | Landelijk, Drenthe |
| 8 | Hoofdweg 31, 9761 EA Eelde | Danny | Half rieten dak, dakkapellen |
| 9 | Leeuwerikstraat 5, 9481 EN Vries | Danny | Woonwijk, Drenthe |
| 10 | Wethouder Deodatusplantsoen 27X, 9301 BS Roden | Danny | Toevoeging "X" nog controleren in de BAG |
| 11 | Raadhuisstraat 1, 9301 AA Roden | Claude | Gemeentehuis Noordenveld |
| 12 | Heerestraat 92, 9301 AH Roden | Claude | Jumbo (adres uit een overzichtssite), vermoedelijk plat dak |
| 13 | Julianaplein 13, 9301 LA Roden | Claude | Albert Heijn (adres uit een overzichtssite) |
| 14 | Raadhuisweg 7, 9251 GH Burgum | Claude | Gemeentehuis Tytsjerksteradiel, Friesland |
| 15 | Nienoord 1, 9351 AC Leek | Claude | Museum Nienoord, rijksmonument |

Er staan 15 rijen, omdat Danny 10 adressen leverde en Claude 5 openbare of zakelijke panden aanvulde. Overijssel en nieuwbouw ontbreken nog als variant. Dat staat in de open punten.

## 14-10-2026: Fase 0, overige antwoorden

- **ICN-pand:** Dwazziewegen 20, 9301 ZR Roden. In de demo is dit het zakelijke voorbeeld "ICN". Noordhoek 5 is een ander bedrijfspand en wordt gebruikt voor de route "bedrijfspand".
- **Google Cloud (vraag 1):** er bestaat nog niets. Het project en betaalaccount komen op naam van Danny of Merckwaardig, met een Nederlands factuuradres, dus de EEA-voorwaarden gelden. **Harde daglimiet: 50 Building Insights-aanroepen per dag** (besluit Danny, 14-10-2026), dus maximaal ongeveer $0,50 per dag. Data Layers krijgt een eigen, lagere limiet, voorstel 10 per dag. Danny past de limiet later aan als dat nodig is.
- **Merk (vraag 2):** we beginnen met een neutraal palet met één accentkleur, later aanpasbaar. De reden: de ICN-site was vanuit de ontwikkelomgeving niet bereikbaar. Het logo-URL staat in de brief.
- **Hosting (vraag 3):** Danny of Merckwaardig host en beheert de productie en factureert ICN. Het demo-adres wordt `icn-zonnepanelen-demo.pages.dev` (mijn keuze, aanpasbaar). Of het ICN-domein via Cloudflare loopt, is onbekend.
- **Leads (vraag 4):** naam, e-mail en telefoon zijn verplicht, plus een vinkje voor toestemming. In de demo gaan leads naar danny@merckwaardig.com. Het adres staat in een omgevingsvariabele en niet hardcoded in de code. De AVG-tekst is een concept met een link naar de privacyverklaring van ICN, en ICN keurt die goed vóór livegang.
- **Verbruik (vraag 5):** we schatten het verbruik uit woningtype, bouwjaar (BAG) en huishoudgrootte. De bezoeker kan dat optioneel overschrijven met zijn eigen kWh.
- **Opslag (vraag 6):** alleen open dakdata (3DBAG, PVGIS) wordt per BAG-pand gecachet, zonder gegevens die naar de bezoeker herleidbaar zijn. De bewaartermijn is maximaal 30 dagen. Google-data wordt alleen gecachet als de voorwaarden dat toestaan (Fase 1).
- **Tracking (vraag 7):** de conversie is "schouw aangevraagd", dus een verstuurd formulier. Daarnaast komen er GTM-events per stap om de uitval te meten.
- **Voortest Solar API (vraag 9):** Danny heeft die nog niet gedaan. Fase 1 doet het met echte aanroepen.
- **Demo-gebruik (vraag 10):** alleen ICN en Danny, met tientallen testers. De demo krijgt een eenvoudige toegangscode, noindex en `X-Robots-Tag`. Google staat in de demo uit tot Fase 3b.
- **Elementor (vraag 11):** er is nog geen beheerderstoegang. De embed-test in Fase 2b wacht daarop.
- **Vertrouwen (vraag 12):** de belofte "reactie binnen 24 uur" mag in de configurator, want ICN bevestigt die. Voor reviews, garanties en certificaten maken we lege plekken, zoals de brief voorschrijft.
- **Tech-keuzes (zelf besloten):** TypeScript, Vite met Lit voor de web component (shadow DOM), Hono voor de portable proxy, Vitest voor tests en Three.js lazy geladen. De mappen volgen het voorstel in brief §6.

## 14-10-2026: aanvullingen

- **Buiten werkgebied:** adressen buiten Groningen, Drenthe, Friesland, Overijssel en Flevoland krijgen in de interface een nette melding "buiten werkgebied ICN". Het resultaat blijft zichtbaar.
- **Adressen toevoegen kan later:** de voorbeeldadressen komen in een configbestand (`config/showcase.json`), zodat er zonder codewijziging adressen bij kunnen. Danny levert nog een adres in Overijssel en een nieuwbouwadres.
