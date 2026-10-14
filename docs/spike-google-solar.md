# Spike Google Solar API (Tier A) naast 3DBAG (Tier B)

Uitgevoerd op 14-10-2026 met `spike/google_spike.py`, met een echte sleutel (project ICN-zonnepanelen, sleutel alleen voor de Solar API). Ruwe antwoorden staan in `docs/spike-google/`.

**Verbruik:** 15 Building Insights-aanroepen (13 geslaagd, 2 keer een 404 voor Burgum), 1 Data Layers-aanroep en 3 GeoTIFF-downloads. Volgens Google valt dit ruim binnen het gratis maandtegoed, maar dat tegoed is niet rechtstreeks geverifieerd (zie Kosten).

## Dekking en kwaliteit

| Adres | Gevonden met | Kwaliteit | Opnamedatum | Afstand gebouw tot adrespunt | Juiste gebouw? | Dak Google | Dak 3DBAG (plat + schuin) | Oriëntatie Google vs 3DBAG |
|---|---|---|---|---|---|---|---|---|
| Dwazziewegen 20, Roden (ICN) | MEDIUM | MEDIUM | 19-03-2022 | **46,5 m** | **Nee**, een ander pand | 150 m² | – (ontbreekt in 3DBAG) | – |
| Noordhoek 5, Roden | MEDIUM | MEDIUM | 19-03-2022 | 1,3 m | Ja | 593 m² | 409 m² | ZW 33° / NO 32° vs ZW 29° / NO 29°: klopt |
| Wethouder Deodatusplantsoen 27X, Roden | MEDIUM | MEDIUM | 19-03-2022 | 11,9 m | **Nee**, het flatgebouw in plaats van de garagebox | 159 m² | 18 m² | – |
| Raadhuisstraat 1, Roden | MEDIUM | MEDIUM | 19-03-2022 | 1,9 m | Ja | 2.161 m² | 2.323 m² | 41° N / 40° W: vergelijkbaar |
| Heerestraat 92, Roden | MEDIUM | MEDIUM | 19-03-2022 | 21,4 m | Twijfelachtig | 1.852 m² | 2.152 m² | Plat: klopt |
| Leeuwerikstraat 5, Vries | MEDIUM | MEDIUM | 19-03-2022 | 3,2 m | **Deels**: neemt het hele blok mee | **226 m², 72 panelen** | 82 m² | ZO 41° vs ZO 30° |
| Zuidveldigerweg 1, Peest | MEDIUM | MEDIUM | 19-03-2022 | 1,6 m | Ja | 337 m² | 345 m² | W 45° / O 48° vs W 44° / O 44°: klopt |
| Hoofdweg 31, Eelde | MEDIUM | MEDIUM | 19-03-2022 | 8,4 m | Ja | 796 m² | 808 m² | ZW 45° / NO 46° vs ZW 43° / NO 45°: klopt |
| Arwerd 1, Groningen | MEDIUM | **HIGH** | 04-09-2023 | 3,8 m | Ja | 92 m² | 126 m² | Plat: klopt |
| Nienoord 1, Leek | MEDIUM | MEDIUM | 19-03-2022 | 14,7 m | Twijfelachtig | 431 m² | 442 m² | – |
| Raadhuisweg 7, Burgum | – | – | – | – | **404 bij MEDIUM en LOW** | – | 4.000 m² | – |
| Ruisvoornlaan 4, Aalsmeer | MEDIUM | MEDIUM | 06-06-2021 | 3,1 m | Ja | 128 m² | 101 m² | NO 54° / ZW 45° vs NO / ZW 47° |
| Prinseneiland 517, Amsterdam | MEDIUM | HIGH | 24-08-2022 | 11,4 m | Twijfelachtig | 287 m² | 473 m² | – |
| Amstelbeststraat 12A, Amsterdam | MEDIUM | HIGH | 24-08-2022 | 11,1 m | Twijfelachtig | 209 m² | 90 m² | – |

"Juiste gebouw?" is beoordeeld op de afstand tot het adrespunt en op de vergelijking met 3DBAG. Een afstand boven ongeveer 10 m is verdacht.

## Bevindingen

1. **Dekking in het noorden is er.** 13 van de 14 adressen geven MEDIUM terug, Groningen-stad zelfs HIGH. Alleen Burgum (Friesland) geeft niets. Dat het hele noorden gedekt is, mag je daar nog niet uit afleiden: dit zijn maar 14 adressen.
2. **De beelden zijn oud.** In het werkgebied zijn ze bijna allemaal van **19 maart 2022**, ruim 4,5 jaar oud. Panelen of gebouwen van na die datum ziet Google niet. Het ICN-pand uit 2024 ontbreekt, en Google kiest daar een gebouw op 46 m.
3. **Google kiest vaak het verkeerde gebouw.** `findClosest` neemt het dichtstbijzijnde gebouw dat Google kent, niet het pand van het adres. Dat ging fout of was twijfelachtig bij 6 van de 13 adressen. Voor gebruik in de configurator moet je het adres daarom eerst koppelen aan het BAG-pand, en Google alleen accepteren als het Google-gebouw binnen de BAG-footprint ligt.
4. **Rijtjeshuizen voegt Google samen.** Bij Leeuwerikstraat 5 telt Google het hele blok mee: 226 m² en 72 panelen, terwijl de woning in 3DBAG 82 m² dak heeft. Ongefilterd geeft dat een veel te hoge indicatie. Dit is waarschijnlijk het grootste risico van Tier A in Nederland.
5. **Waar het juiste gebouw gekozen is, kloppen helling en oriëntatie goed met 3DBAG**, meestal binnen ongeveer 3–5°. Dat geldt voor Peest, Eelde, Noordhoek en het gemeentehuis.
6. **De EEA-velden zitten er nog in.** `postalCode`, `administrativeArea` en `regionCode` worden gewoon teruggegeven. Volgens Google ontbreken die bij een EEA-factuuradres. Mogelijk telt het factuuradres nog niet als EEA, of past Google de regel (nog) niet toe. Het is niet belangrijk, maar wel een teken om het factuuradres te controleren.
7. **Data Layers werkt.** Er komen een hoogtekaart (DSM), een luchtfoto, een gebouwmasker, de zoninstraling per jaar en per maand, en **12 bestanden met schaduw per uur**. Mijn weergave van de zonkaart voor Peest (`docs/spike-google/datalayers/peest-flux.png`) is echter **niet overtuigend**. Het gebouwmasker valt niet netjes over het dak op Google's eigen luchtfoto, en de Google-foto is wazig. Of dat aan mijn weergave of aan de data ligt, heb ik niet kunnen vaststellen. Ik heb een pixelgrootte van 0,5 m gevraagd; 0,1 m is mogelijk beter.

## Voorwaarden (via zoekmachine gelezen, de pagina's zelf waren niet bereikbaar)

- Bron: [Policies and attributions for Solar API](https://developers.google.com/maps/documentation/solar/policies). Die zegt dat cachen of opslaan van content in het algemeen niet mag, behalve place-ID's. Solar-resultaten die op een kaart worden getoond, moeten op een Google-kaart staan, met Google-attributie.
- Bron: [EEA FAQ](https://developers.google.com/maps/comms/eea/faq) en [EEA Service Specific Terms](https://cloud.google.com/terms/maps-platform/eea/maps-service-terms). De EEA-voorwaarden schrappen in het algemeen het verbod op gebruik met kaarten van anderen. Voor de Solar API specifiek heb ik geen eenduidige tekst gevonden.
- **Gevolg:** het is onzeker of we Google-data mogen tonen op de PDOK-luchtfoto of in onze eigen 3D-scène. Dit is een **open punt voor Danny**, eventueel met een jurist of Google-support. Bouw hier niet op door zolang dit onduidelijk is.

## Kosten (via zoekmachine, officiële prijspagina niet rechtstreeks gelezen)

- Bron: [Google Maps Platform pricing](https://developers.google.com/maps/billing-and-pricing/pricing) en [Solar API Usage and Billing](https://developers.google.com/maps/documentation/solar/usage-and-billing).
- **Building Insights:** 10.000 gratis per maand, daarna $10 per 1.000 (lagere prijzen bij meer volume).
- **Data Layers:** 1.000 gratis per maand, daarna $75 per 1.000.
- Een 404 wordt niet gefactureerd, maar telt wel mee voor de limieten.
- **Per bezoeker:**
  - Een gewone bezoeker kost 1 aanroep. Met "bekijk details" erbij komen daar 1 Data Layers-aanroep en een paar GeoTIFFs bij.
  - Bij tientallen testers valt alles binnen het gratis tegoed.
  - Bij 1.000 bezoekers per maand met 3 adressen elk: 3.000 aanroepen, nog steeds binnen 10.000. De kosten zijn dan **€ 0**.

## Advies

**Bouw de demo op Tier B (3DBAG, BAG en PVGIS).** Google voegt in dit werkgebied weinig toe en brengt drie echte risico's mee:
- verkeerde gebouwen;
- samengevoegde rijtjeshuizen;
- beelden uit maart 2022.

Daarbij komt dat de voorwaarden voor tonen op niet-Google-kaarten onduidelijk zijn.

Google kan later nog iets toevoegen voor **schaduw van bomen** (via de schaduw per uur). Dat kan alleen als:
1. we het Google-gebouw controleren tegen het BAG-pand (binnen de footprint, ongeveer even groot);
2. de vraag over de voorwaarden beantwoord is;
3. Data Layers visueel overtuigt. Dat heeft deze ene test nog niet laten zien.

De sleutel `solar-test-fase1` kan blijven bestaan. Hij wordt pas weer gebruikt als Danny tot Fase 3b besluit.
