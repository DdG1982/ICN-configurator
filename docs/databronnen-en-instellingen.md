# Databronnen, vaste waarden en instellingen

Stand van de code op `main` (commit `b443c62`, 14-10-2026), bijgewerkt na de fixes van 15-10-2026 (leads versturen, verbruik uit woningtype en bouwjaar, degradatie in de terugverdientijd). Dit document beschrijft wat de configurator **nu echt doet**, gelezen uit de code. Niets is opnieuw doorgerekend of live getest bij het schrijven.

Legenda bij "Wie beslist": **ICN** = bedrijfskeuze of prijs van ICN, **Danny** = keuze in het project, **Techniek** = alleen aanpassen met een reden.

---

## 1. Databronnen

### 1a. Bronnen die de opbrengst direct bepalen

| Bron | Beheerder | Wat de configurator eruit haalt | Effect op de uitkomst | Code |
|---|---|---|---|---|
| **3DBAG** (LoD2.2, CityJSON) | TU Delft / 3DGI, CC BY 4.0 | Per dakvlak de helling, windrichting en het oppervlak. Ook de buurpanden binnen 70 m, het maaiveld en kwaliteitsgegevens (`b3_kwaliteitsindicator`, `b3_pw_datum`, `b3_dak_type`). Uit de aangrenzende buren volgt het woningtype (vrijstaand, hoekwoning, tussenwoning) | Bepaalt welke dakvlakken meetellen, de invoer voor PVGIS en waar panelen passen | `prototype/src/live/bronnen.ts`, `bouw.ts` |
| **PVGIS 5.3** | Europese Commissie (JRC) | De jaaropbrengst in kWh per kWp voor een plek, helling en windrichting (`E_y`) | **De basis van het kWh-getal** | `prototype/functions/api/pvgis.ts` (proxy met 30 dagen cache), `bronnen.ts` |
| **AHN** (DSM en DTM, 0,5 m) | Rijkswaterstaat, via PDOK | Een hoogtekaart binnen 80 m, met bomen, buren en schoorstenen zoals gemeten. Bomen zijn alles wat hoger is dan 2,5 m boven maaiveld en geen gebouw is | Een schaduwfactor per dakcel en per paneelplek | `prototype/src/live/hoogte.ts` |

**Berekening per paneel:** `kWh = (paneel-Wp / 1000) × PVGIS-kWh-per-kWp van het dakvlak × schaduwfactor`.

### 1b. Bronnen die de uitkomst indirect sturen

| Bron | Beheerder | Waarvoor |
|---|---|---|
| **PDOK Locatieserver** | Kadaster / PDOK | Adressuggesties, coördinaten en provincie (voor de check of het adres in het werkgebied ligt) |
| **BAG** (WFS) | Kadaster, via PDOK | Pand-id, voetafdruk, bouwjaar, gebruiksdoel en aantal verblijfsobjecten. Daaruit volgt de status: woning, appartement, zakelijk of bijgebouw. Het bouwjaar stuurt ook de verbruiksschatting (nieuwbouw zonder gas) |
| **Rijksmonumentenregister** (WFS) | RCE, via PDOK | Is het pand een rijksmonument? Zo ja, dan zet de configurator geen panelen neer |
| **PDOK luchtfoto** (WMS, `Actueel_orthoHR`) | Het Waterschapshuis, via PDOK, CC BY 4.0 | Alleen het beeld (fly-in en ondergrond). Geen invloed op de berekening |

### 1c. Bronnen die níet worden gebruikt

| Bron | Status |
|---|---|
| **Google Solar API** | Alleen getest in de spike (`spike/google_spike.py`, `docs/spike-google-solar.md`). Zit **niet** in de configurator. Besluit: Google blijft voorlopig uit (`docs/besluiten.md`) |
| **EP-Online** (energielabel) | Nog niet gebruikt. Komt later bij de warmtepomp-module |
| **Stroomprijzen of terugleververgoedingen** | Er is **geen externe bron**. Alles komt uit handmatige configbestanden (zie 2a) |
| **Gemeentelijke monumenten en beschermde dorpsgezichten** | Worden niet herkend. De footer zegt dat eerlijk |
| **Netcapaciteit (netbeheerder)** | Niet gekoppeld |

### 1d. Twee rekenroutes

- **Live adressen:** rekenen in de browser (een Web Worker) met de bronnen hierboven (`prototype/src/live/`).
- **Voorbeeldwoningen:** vooraf berekende `model.json`-bestanden in `prototype/public/data/`, gemaakt met `prototype/scripts/bouw-voorbeelden.ts`. Volgens `docs/open-punten.md` zijn ze opnieuw berekend met dezelfde TS-code. Er bestaat ook nog een oudere Python-pijplijn (`pipeline/bouw_dakdata.py`) met een andere schaduwmethode. **Let op:** de voorbeelden worden pas bijgewerkt als iemand ze opnieuw bouwt. Ze lopen dus achter zodra je iets in de rekencode of de config wijzigt.

---

## 2. Waarden die ICN moet aanleveren of goedkeuren

### 2a. Prijzen en markt: `prototype/config/pricing.json` en `prototype/config/market.json`

**Allemaal placeholders.** Geen ICN-cijfers.

| Waarde | Nu | Betekenis | Wie beslist |
|---|---|---|---|
| `prijsPerWp` | € 0,80 – 1,50 | Investering per Wp, inclusief installatie, btw 0%. Marktgemiddelde uit de brief | **ICN** (echte prijslijst, liefst per systeemgrootte, want kleine systemen zijn per Wp duurder) |
| `paneelWp` | 430 Wp | Vermogen van één paneel | **ICN** (welk paneel leggen jullie standaard?) |
| `paneelMaat` | 1,134 × 1,722 m | Afmeting van één paneel. Bepaalt hoeveel er op een dak passen | **ICN** (moet bij het gekozen paneel horen) |
| `stroomprijsPerKwh` | € 0,24 – 0,32 | Wat de klant per kWh betaalt (all-in) | **ICN / Danny**, regelmatig bijwerken |
| `terugleververgoedingPerKwh` | € 0,04 – 0,07 | Wat de klant krijgt voor teruggeleverde stroom na 2026 | **ICN / Danny**, regelmatig bijwerken |
| `terugleverkostenPerKwh` | € 0,07 (voorzichtig) – 0,02 (gunstig) | Wat de leverancier rekent voor teruglevering. Bewust omgekeerd: "low" is het voorzichtige scenario | **ICN / Danny** |
| `zelfconsumptie.zonderBatterij` | 30% | Deel van de opbrengst dat direct in huis wordt gebruikt | **ICN** (ervaringscijfer?) |
| `zelfconsumptie.metBatterij` | 60% | Idem, met thuisbatterij | **ICN** |
| `opbrengstMarge` | ±8% | De bandbreedte rond de kWh-schatting. Een gekozen getal, uit geen bron afgeleid | **Danny / Techniek** |
| `prijsstijgingPerJaar` | 0% | Verandering van de stroomprijs per jaar in de terugverdientijd. 0% = gelijkblijvend, de voorzichtige keuze | **Danny / ICN** |
| `degradatiePerJaar` | 0,5% | Minder opbrengst per jaar door veroudering van de panelen, in de terugverdientijd | **ICN** (wat garandeert de paneelfabrikant?) |
| `verbruik.*` | zie 2d | Verbruiksschatting | **ICN / Danny** |

### 2b. Werkgebied en voorbeelden: `prototype/config/showcase.json`

| Waarde | Nu | Wie beslist |
|---|---|---|
| `werkgebiedProvincies` | Groningen, Drenthe, Friesland/Fryslân, Overijssel, Flevoland | **ICN**. Buiten deze provincies toont de configurator "buiten werkgebied ICN" |
| `adressen` (voorbeeldwoningen) | 14 adressen, waarvan een deel buiten het werkgebied (Aalsmeer, Amsterdam) | **Danny / ICN**. Alleen adressen met toestemming of zakelijke adressen (brief, sectie 4c) |

### 2c. Vaste waarden in de code die ICN moet bevestigen

Deze staan **niet** in een configbestand maar in de code. Aanpassen kan alleen via een ontwikkelaar.

| Waarde | Nu | Waar | Vraag aan ICN |
|---|---|---|---|
| Randmarge rond panelen | 40 cm | `prototype/src/live/live.ts` (`rand: 0.4`) | Welke afstand tot de dakrand houden jullie aan? |
| Ruimte tussen panelen | 2 cm | `live.ts` (`tussen: 0.02`) | Klopt dat met jullie montagesysteem? |
| Paneelstand | Alleen staand (portrait) | `prototype/src/live/geo.ts` | Leggen jullie ook liggend? Dat past soms beter |
| Plat dak: opstelling | Oost/west onder 10°, gemiddelde van beide richtingen | `prototype/src/live/bouw.ts` | Is oost/west 10° jullie standaard op plat dak, of zuid? |
| Plat dak: rijafstand | 0,5 m na elke tweede rij | `geo.ts` | Klopt met jullie oost/west-systeem? |
| Grens schuin/plat | Helling < 8° telt als plat | `bouw.ts` | Akkoord? |
| Geschikte windrichtingen | Oost via zuid naar west (azimut 85–275°). Noordvlakken krijgen standaard geen panelen | `bouw.ts` | Staat al open in `docs/open-punten.md`: klopt dit met jullie praktijk? |
| Te kleine of steile vlakken | Vlakken < 4 m² of > 65° vallen af | `bouw.ts` | Akkoord? |
| Standaard aan | Alleen plekken met ≥ 80% van de opbrengst van de beste plek | `bouw.ts` | Zou een installateur slechtere plekken ook leggen? |
| Standaard aantal | Vullen tot ongeveer het jaarverbruik (100%), minimaal 4 panelen | `prototype/src/calc/indeling.ts`, aangeroepen in `main.ts` | Na 2026 loont veel meer dan je verbruik minder. Is 100% het juiste advies? Wat is jullie minimum per installatie? |
| PVGIS-systeemverlies | 14% | `bronnen.ts`, `functions/api/pvgis.ts` | Dit is de standaardwaarde van PVGIS. Past die bij jullie omvormers en bekabeling? |

### 2d. Verbruik

| Waarde | Nu | Waar | Opmerking |
|---|---|---|---|
| Geschat jaarverbruik per huishoudgrootte (`verbruik.perPersonen`) | 1 persoon 1.800 · 2 personen 2.700 · 3 personen 3.300 · 4 personen 3.900 · 5+ personen 4.400 kWh | `prototype/config/market.json` | Bron van de getallen onbekend. **ICN / Danny:** bevestigen of vervangen |
| Factor per woningtype (`verbruik.woningtypeFactor`) | appartement 0,88 · tussenwoning 1,00 · hoekwoning 1,12 · vrijstaand 1,58 | `market.json` | Verhouding uit ANWB-cijfers voor 4 personen (bouwjaar 1992–2006), via een zoekmachine gelezen, de pagina zelf niet. Hoekwoning krijgt de factor van twee-onder-een-kap. **ICN:** bevestigen |
| Nieuwbouw zonder gas (`verbruik.gasloosVanafBouwjaar`, `extraKwhGasloos`) | bouwjaar 2020 of later: + 2.500 kWh voor een warmtepomp | `market.json` | Aanname zonder bron. Gasloos bouwen is verplicht voor vergunningen vanaf 1 juli 2018. Oudere woningen met een warmtepomp missen we; nieuwbouw op stadswarmte krijgt ten onrechte de toeslag. De bezoeker ziet de toeslag en kan het verbruik aanpassen. **ICN:** bevestigen |
| Woningtype bepalen | Aantal buurpanden van ≥ 30 m² binnen 0,5 m: 0 = vrijstaand, 1 = hoekwoning, 2+ = tussenwoning. Appartement uit de BAG | `prototype/src/live/bouw.ts` (`bepaalWoningtype`) | Een aangebouwde garage van de buren kan een vrijstaand huis tot hoekwoning maken. Getest op 5 adressen, 2 nagekeken op de luchtfoto |
| Standaard huishouden | 3 personen | `prototype/src/main.ts` | |
| Eigen verbruik invullen | Telt pas vanaf 500 kWh | `main.ts` | |
| Verbruik over de dag | Een zelfgekozen curve met pieken rond 8:00 en 18:30 | `main.ts` (`huisVerbruikKw`) | Alleen voor de animatie "live vermogen", niet voor de besparing |

De schatting staat met uitleg in beeld bij de aannames (bijvoorbeeld "geschat op 5.200 kWh: 3 personen, vrijstaand"), zodat de bezoeker ziet waarop hij rust.

### 2e. Teksten en beloftes in beeld (`prototype/index.html`)

| Tekst | Status |
|---|---|
| "Reactie binnen 24 uur" (3×) | Door ICN bevestigd volgens `docs/besluiten.md` |
| "Gecertificeerde installateurs" | Staat op de ICN-site, maar zonder benoemd certificaat. **ICN:** welk certificaat? |
| Toestemmingstekst AVG | Gemarkeerd als *(concepttekst)*. De link naar de privacyverklaring werkt nog niet (`href="#"`). **ICN** moet de tekst goedkeuren en de link geven |
| Plek voor reviews, garanties en certificaten | Leeg, met een interne plaatshouder. **ICN** levert aan |
| Demobalk "Ontwerpvoorbeeld … placeholders" | Moet weg of aangepast bij livegang |
| Bedanktekst na verzenden | "ICN neemt binnen 24 uur contact met je op" (schouw) of "ICN mailt je de indicatie" (e-mail). **Let op:** de configurator mailt zelf niets; de ontvanger van de webhook moet die mail versturen |

---

## 3. Vaste rekenaannames (techniek)

Dit zijn modelkeuzes. ICN hoeft hier niets mee, maar ze bepalen wel de uitkomst.

| Aanname | Waarde | Waar | Kanttekening |
|---|---|---|---|
| Diffuus licht bij schaduw | Vast 18% van het directe licht, nooit beschaduwd | `hoogte.ts` | In Nederland is volgens mij ruwweg de helft van de jaarlijkse instraling diffuus (**niet geverifieerd**). Als dat klopt, rekent het model schaduwverlies te zwaar, dus te voorzichtig. Narekenen tegen PVGIS of Google-flux |
| Zonnebaan | 12 dagen (één per maand), elk half uur, alleen boven 3° zonhoogte | `bouw.ts`, `geo.ts` (`zonstanden`) | NOAA-benadering |
| Gewicht van de zon per moment | Directe instraling bij heldere lucht (luchtmassamodel van Meinel) | `geo.ts` | Houdt geen rekening met bewolking per seizoen. De schaduwfactor weegt winterzon daardoor mogelijk te zwaar (niet getoetst) |
| Afronding van de PVGIS-invoer | 0,01° plaats, 5° helling en richting | `bronnen.ts` | Volgens de code hooguit ca. 1% effect. Plausibel, niet gemeten |
| Straal buren (3DBAG) | 70 m | `bouw.ts` | Een hoge flat of boom op 100 m telt niet mee |
| Straal hoogtekaart (AHN) | 80 m | `bouw.ts` | Idem |
| Straal bomen in 3D-beeld | 45 m | `bouw.ts` | Alleen voor het beeld |
| Rasterstap warmtekaart | 1 m (< 150 m²), 2 m (< 600 m²), 4 m (groter) | `bouw.ts` | |
| Tijdslimiet live berekening | 60 seconden | `live.ts` | |
| Cache PVGIS | 30 dagen (Cloudflare) | `functions/api/pvgis.ts` | |

---

## 4. Hoe de euro's worden berekend (`prototype/src/calc/opbrengst.ts`)

- **Na 2026 (standaard):** de eigen verbruikte stroom (opbrengst × zelfconsumptie, nooit meer dan het jaarverbruik) levert de stroomprijs op. Teruggeleverde stroom levert vergoeding min terugleverkosten op. Dat kan negatief uitvallen.
- **Salderen tot eind 2026:** opbrengst tot het jaarverbruik tegen de stroomprijs, het overschot tegen de vergoeding. Terugleverkosten tellen in dit scenario niet mee.
- **Terugverdientijd:** de besparing wordt jaar voor jaar opgeteld tot de investering terug is, met `degradatiePerJaar` (0,5%) minder opbrengst en `prijsstijgingPerJaar` (0%) per jaar. Het laatste jaar telt naar rato. Wat na 50 jaar niet terug is, heet "niet terug te verdienen". Nog steeds **zonder** rente en **zonder** vervanging van de omvormer. Het is geen rendement over 25 jaar.
- **Bandbreedte:** "laag" combineert lage opbrengst, lage stroomprijs, lage vergoeding en hoge terugleverkosten. "Hoog" doet het omgekeerde. Daardoor is de band breed: een bewuste keuze tegen schijnnauwkeurigheid.
- **Afronding in beeld:** kWh op 100, euro's besparing op 10, investering op 100, terugverdientijd op een half jaar.
- De bezoeker kan stroomprijs, vergoeding, terugleverkosten, verbruik, huishoudgrootte en batterij zelf aanpassen. Dan vervangt één scenario de bandbreedte.

---

## 5. Overige belangrijke punten

### Wat nog niet werkt of ontbreekt

1. **Leads gaan via `/api/lead` naar een webhook** (`prototype/functions/api/lead.ts`). De browser zet elke lead eerst in een wachtrij (`localStorage`) en verstuurt pas daarna. Wat mislukt, blijft staan en gaat opnieuw bij de volgende poging, bij het terugkomen van de verbinding of bij een volgend bezoek. De lead bevat adres, BAG-pand-id, woningtype, gekozen panelen, de indicatie met alle aannames, contactgegevens, toestemming (tijdstip, versie, tekst) en UTM/herkomst. Elke lead heeft een vast `id`, zodat de ontvanger dubbele leveringen kan herkennen.
   - **Nog te doen door Danny:** een ontvanger kiezen en in Cloudflare Pages de secret `LEAD_WEBHOOK_URL` zetten (optioneel `LEAD_WEBHOOK_TOKEN`). Zonder die secret antwoordt `/api/lead` met 503 en blijven leads in de browser van de bezoeker wachten. Een ontvanger kan bijvoorbeeld Make, Zapier, n8n of een Google Apps Script zijn die de lead naar danny@merckwaardig.com mailt (besluit leads).
   - **Beperking:** een bezoeker die offline was en nooit terugkomt, of die geen opslag toestaat, kan een lead alsnog kwijtraken. Een volledig verliesvrije route vraagt opslag aan de serverkant (bijv. Cloudflare KV of D1); dat is nog niet gebouwd.
   - Lokaal (`npm run dev` of `preview`) wordt de lead alleen in de terminal getoond; met `LEAD_LOKAAL_FOUT=1` simuleer je een fout.
2. **Eén schaduwmethode, één rekenroute.** De oude Python-pijplijn rekent schaduw anders. Gebruik voor nieuwe voorbeelden alleen de TS-route, of haal de Python-versie weg om verwarring te voorkomen.
3. **Bedrijfspanden:** de configurator herkent "zakelijk" uit de BAG. Of de aparte route met de melding "netcapaciteit eerst checken" (brief, sectie 8) volledig werkt, heb ik niet gecontroleerd.
4. **Bestaande panelen, rieten daken, dakkapellen en dakramen** zitten niet in de data. De configurator stelt de bezoeker vragen over bestaande panelen en riet. Dakkapellen en dakramen worden niet herkend. De AHN-hoogtekaart vangt een deel van de schoorstenen op als schaduw, maar maakt er geen vrije plek van.
5. **Als AHN uitvalt**, rekent de configurator zonder schaduw. Er komt een waarschuwing, maar de opbrengst valt dan te hoog uit.
6. **De datum van de 3DBAG-meting** (`b3_pw_datum`) wordt opgeslagen. Bij nieuwbouw kan het model verouderd of leeg zijn: dan volgt de status `niet-in-3dbag` met een nette terugval.

### Juridisch en vertrouwen

7. **Bronvermelding** voor 3DBAG, PDOK, AHN, PVGIS en RCE staat in de footer. Dat is verplicht onder CC BY 4.0 en moet bij livegang blijven staan.
8. **PVGIS mag alleen via de server.** Dat gebeurt via `/api/pvgis`. Op Cloudflare is dit nog niet live getest (`docs/open-punten.md`).
9. **De toegangscode** van de demo staat als secret `TOEGANGSCODE` in Cloudflare, niet in de repo. Cookie 30 dagen. Zonder ingestelde code is de demo open.
10. **"Indicatie, definitief na schouw"** staat in beeld. Die tekst moet blijven, juist omdat de 3D-weergave nauwkeuriger oogt dan de data is.

### Onderhoud

11. **Stroomprijs, terugleververgoeding en terugleverkosten verouderen snel**, zeker na 1-1-2027. Er is niemand aangewezen om ze bij te werken. Voorstel: ICN of Danny controleert ze elk kwartaal.
12. **Na elke wijziging in `pricing.json`** (paneelmaat, Wp) moeten de voorbeeldwoningen opnieuw worden gebouwd. Anders tonen ze oude aantallen en opbrengsten.

---

## 6. Vragenlijst voor ICN (samengevat)

1. Prijslijst: prijs per Wp of per systeemgrootte, inclusief installatie.
2. Standaardpaneel: merk, vermogen (Wp) en afmetingen.
3. Montage: randmarge, ruimte tussen panelen, staand en/of liggend, opstelling op plat dak (oost/west of zuid, hoek, rijafstand).
4. Leggen jullie op oost- en westdaken? Op noorddaken nooit?
5. Minimum en maximum aantal panelen per woning. Adviseren jullie tot het verbruik of meer?
6. Ervaringscijfers zelfconsumptie, met en zonder batterij.
7. Is het systeemverlies van 14% realistisch voor jullie omvormers?
8. Welk certificaat bedoelen jullie met "gecertificeerde installateurs"?
9. AVG-toestemmingstekst en de link naar de privacyverklaring.
10. Wie ontvangt de leads, in welk systeem (CRM), en wie houdt de stroomprijzen bij?
11. Reviews, garanties en projectfoto's voor het vertrouwensblok.
12. Werkgebied: klopt de provinciegrens, of liever een straal rond Roden?
13. Verbruiksschatting: kloppen de getallen per huishouden, de factoren per woningtype en de toeslag van 2.500 kWh voor nieuwbouw zonder gas?
14. Degradatie: welk jaarlijks opbrengstverlies garandeert de fabrikant van jullie paneel?

---

## 7. Botbescherming en Cloudflare-routes (voorbereid 15-10-2026)

### `_routes.json` (`prototype/public/_routes.json`)

- Alles gaat via de Functions (toegangscode, `/api/*`), **behalve** `/assets/*` (gebundelde code en lettertypen), het logo en `robots.txt`. Die komen rechtstreeks van Pages: gratis, en ze tellen niet mee voor de Functions-limiet van 100.000 per dag.
- `/data/*` blijft bewust achter de toegangscode, want daar staan de voorbeeldadressen en luchtfoto's.
- Volgens de Cloudflare-docs wint `exclude` van `include`. Die docs zijn alleen via een zoekmachine gelezen; de pagina's zelf waren vanuit de ontwikkelomgeving niet bereikbaar. **Na de eerste deploy controleren** (Pages → Functions → zie het aantal aanroepen per bezoek).

### Turnstile + pas (`prototype/server/pas.ts`, `functions/api/pas.ts`, `src/core/bescherming.ts`)

Hoe het werkt:
1. Bij de eerste live berekening of lead lost de bezoeker Turnstile op. Meestal ziet de bezoeker niets; soms verschijnt rechtsonder een vinkje.
2. `/api/pas` controleert het token bij Cloudflare en geeft een eigen pas terug, 30 minuten geldig.
3. `/api/pvgis` en `/api/lead` weigeren elk verzoek zonder geldige pas (401). De pas gaat mee als header `x-icn-pas`, niet als cookie, zodat hij later ook in de embed op de ICN-site werkt.

Aanzetten (**beide nodig**, anders werkt het niet of staat het open):
1. Cloudflare-dashboard → Turnstile → widget toevoegen. Domeinen: de `*.pages.dev`-naam van de demo, later ook het ICN-domein. Widgettype: *Invisible* of *Managed*.
2. Build-variabele `VITE_TURNSTILE_SITEKEY` = de sitekey (openbaar, mag in de build).
3. Pages-secret `TURNSTILE_SECRET` = de geheime sleutel.

Gedrag zonder instellingen:
- Zonder sitekey in de build: de browser vraagt geen pas.
- Zonder secret op de server: alles staat open.
- **Alleen het secret zonder sitekey**: elke live berekening mislukt (401). Zet ze dus samen aan.

Getest:
- Unit tests voor de pas, de Turnstile-controle en het opnieuw proberen na een 401.
- In de browser: zonder sitekey werkt alles als voorheen. Met sitekey maar zonder bereikbare Turnstile verschijnt een nette foutmelding met "opnieuw".
- **Niet getest:** een echte Turnstile-controle. `challenges.cloudflare.com` was vanuit de ontwikkelomgeving geblokkeerd. Na deploy testen met de officiële testsleutels (sitekey `1x00000000000000000000AA`, secret `1x0000000000000000000000000000000AA`, altijd goed) en daarna met de echte.

Beperkingen:
- Een pas wordt niet geteld. Wie Turnstile één keer oplost, kan 30 minuten onbeperkt vragen. Voor echte rate limiting is opslag nodig (KV of Durable Objects) of een rate-limit-regel in de Cloudflare WAF. Die regel werkt alleen op een eigen domein dat via Cloudflare loopt, niet op `*.pages.dev`. Of de gratis WAF-regel hiervoor volstaat, is niet gecontroleerd.
- Voor de embed op een ander domein zijn nog CORS-headers nodig op `/api/*` (inclusief toestemming voor de header `x-icn-pas`). Die zijn er nog niet.
- Turnstile laadt een script van Cloudflare. Dat moet in de privacyverklaring van ICN staan; dit is niet juridisch gecontroleerd.
