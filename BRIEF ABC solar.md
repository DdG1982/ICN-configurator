# BRIEF: 2050-zonnepanelen-configurator voor Installatie Comfort Nederland (abc solar)

> **Status 15-10-2026: dit is de oorspronkelijke opdracht van 14-10-2026 en wordt niet bijgewerkt.** Een deel is achterhaald. Fase 0 en Fase 1 zijn afgerond, Google Solar staat uit (Tier B), en er draait een live demo op elk adres in Nederland. De vragen in sectie 3 waren voor Danny en zijn beantwoord. **Stuur ze niet naar ICN.** De actuele stand staat in:
> - `docs/besluiten.md`: wat besloten is, met datum
> - `docs/open-punten.md`: wat nog open staat
> - `docs/databronnen-en-instellingen.md`: databronnen, vaste waarden en instellingen
> - `docs/vragen-icn.md`: de actuele, mailklare vragen aan ICN

Lees dit hele bestand. Werk daarna volgens de fases onderaan. Begin NIET met bouwen voordat Fase 0 klaar is. De Google-integratie komt pas na het besluit van Danny in Fase 1. De bron-onafhankelijke basis en de 2050-laag (sectie 4b) mogen eerder gebouwd worden.

**Harde eis 1:** de configurator moet er niet merkbaar minder "2050" uitzien als Google ontbreekt of tegenvalt. Google is een nauwkeurigheidsupgrade, geen voorwaarde voor de visuele ervaring. Zie sectie 4b.

**Harde eis 2:** het uiterlijk moet vanaf de eerste deelbare versie overtuigen en verkopen. Daarom komt het ontwerp eerst (Fase 2a, een klikbaar prototype met vaste voorbeelddata), en pas daarna de rekenmotor eronder. Zie sectie 4c.

**Harde eis 3:** de demo moet als link gedeeld kunnen worden met ICN, gratis draaien op Cloudflare, en later zonder herschrijven naar de echte hosting en de Elementor-site kunnen verhuizen. Zie sectie 6.

## 1. Context

- Opdrachtgever: Installatie Comfort Nederland (ICN, installatiecomfortnederland.nl), ook "abc solar". Verkoopt zonnepanelen, airco en warmtepompen (hybride en all-electric). Gevestigd in Roden. Werkgebied: Groningen, Drenthe, Friesland, Overijssel (+ Flevoland).
- Website: WordPress + Elementor + GTM. De configurator moet als embed (web component) in een Elementor-pagina passen.
- Huidige flow: offerte-aanvraagformulier -> binnen 24 uur gebeld -> schouw op locatie -> offerte. Er is nog geen online prijsindicatie.
- Opdrachtgever van mij (de consultant) is Danny (Merckwaardig). Taal van UI en communicatie: Nederlands.
- Doel: een configurator die zo indrukwekkend is dat hij leads oplevert, met zo min mogelijk invoer van de bezoeker (adres in, resultaat uit).
- **Doelgroep (opgave Danny):** 35 tot 70 jaar, hogeropgeleid, koopwoning. Aannames die jij moet toetsen en niet als feit mag behandelen: dit zijn rationele kopers die cijfers, bronnen en eerlijke aannames waarderen, en die zowel op telefoon als op desktop zitten (het aandeel mobiel is onbekend, meet het via tracking). Het uiterlijk moet indruk maken zonder gimmicky of speels over te komen.
- **Huisstijl van de huidige ICN-site (opgehaald op 14-10-2026 van installatiecomfortnederland.nl):** toon warm, toegankelijk, duurzaamheidsgericht en persoonlijk ("Duurzaam comfort met warmtepompen, zonnepanelen en airco's."). Hoofdknop "Offerte ontvangen". Logo: `https://installatiecomfortnederland.nl/wp-content/uploads/2024/10/cropped-logo-kleur-text-zwart-1024x134.png`. **Kleurwaarden en lettertypen zijn niet vastgesteld:** haal ze zelf uit de live CSS van de site (Danny: "pak maar van de website") en leg ze vast in `docs/huisstijl.md`. Op de site staan geen reviews, garanties, certificaten of merknamen zichtbaar. Dat is een gat voor vertrouwen: vraag ICN in Fase 0 wat ze kunnen aanleveren, en verzin niets.
- Er is op de site geen calculator zichtbaar; de offerteaanvraag loopt via `/offerte-aanvraag/`. Het formulier zelf is niet gecontroleerd.

## 2. Scope v1

- Alleen **zonnepanelen** voor **woningen**. Bedrijfsdaken: alleen een doorverwijzing met melding "netcapaciteit eerst checken" (zie sectie 8).
- Gedeelde kern (adres/woning, verbruik, contactgegevens, leadroute) + productmodules ervoor. Later komen airco en warmtepomp (hybride en all-electric) als extra modules. Bouw de kern dus niet zonnepanelen-specifiek.
- Prijzen zijn **placeholders** in een configbestand. De echte prijslijst volgt later.
- CRM is nog onbekend: de leadroute is een generieke webhook (JSON). Een adapter komt later.

## 3. Fase 0: stel eerst vragen (gebruik AskUserQuestion, in het Nederlands)

Stel deze vragen in een of twee rondes aan Danny, voordat je iets bouwt. Sla antwoorden op in `docs/besluiten.md`. Pas dingen aan die hierboven niet kloppen.

1. Google Cloud: bestaat er al een project en een betaalaccount? Op wiens naam en met welk factuuradres (EEA-voorwaarden gelden bij factuuradres in Nederland)? Wat is het maandbudget? (Voorstel: harde daglimiet via quota.)
2. Merk: Danny heeft gezegd dat je logo, kleuren en lettertype zelf van de ICN-website mag halen. Doe dat (zie sectie 1) en toon Danny de uitkomst ter bevestiging. Kan je de kleuren niet betrouwbaar afleiden, vraag dan om een huisstijlbestand of ga uit van een neutraal palet met een accentkleur, later aanpasbaar.
3. Hosting en embed: Danny heeft een gratis Cloudflare-account. De demo draait daar (Pages voor de interface, Workers voor de proxy). Vraag nog: welk subdomein of welke `*.pages.dev`-naam voor de demo? Is het ICN-domein zelf al via Cloudflare geleid (onbekend)? Wie gaat de productiehosting betalen en beheren (ICN of Danny)?
4. Leads: welke velden zijn verplicht (naam, e-mail, telefoon, adres)? Wie ontvangt ze? Welke toestemmingstekst (AVG) en privacyverklaring-link?
5. Verbruik: bezoeker geeft kWh in, of schatten we op basis van woningtype en huishoudgrootte als hij het niet weet?
6. Opslag: mag adresdata worden bewaard, en hoe lang? (Beïnvloedt caching en AVG.)
7. Meetbaar: welke tracking (GTM-events) wil ICN zien? Welke conversie telt als lead?
8. Testadressen: geef 15-20 echte adressen in het werkgebied (dorp, stad, nieuwbouw, rieten dak, plat dak, bedrijfspand) voor Fase 1. Anders kies ik er zelf. **Danny heeft deze zes opgegeven (14-10-2026):** Dwazziewegen 20, 9301 ZR Roden; Noordhoek 5, 9301 ZG Roden; Ruisvoornlaan 4, 1432 PH Aalsmeer; Arwerd 1, 9746 CM Groningen; Prinseneiland 517, 1013 EC Amsterdam; Amstelbeststraat 12A, Amsterdam. Gebruik ze als **interne testadressen** voor Fase 1 en de ontwikkeling. Drie zitten buiten het ICN-werkgebied (Aalsmeer, Amsterdam x2): dat is nuttig als contrast voor de dekkingstest, niet als showcase voor ICN. Het huidige aantal is te klein voor Fase 1: vul aan tot minstens 15 met adressen in het werkgebied, bij voorkeur met dakvarianten (nieuwbouw, rieten dak, plat dak, dakkapel, bedrijfspand). Bij "12A" en Prinseneiland 517 is onbekend of het appartementen zijn; controleer dat, want een appartement heeft vaak geen eigen dak.
9. Voortest: heeft Danny al Googles interactieve dekkingskaart of de Solar API-demo geprobeerd voor een paar adressen in het werkgebied (bijv. Roden)? Wat zag hij? (Dat is gratis en snel. De uitkomst stuurt Fase 1.)
10. Demo-gebruik: wie krijgt de demolink (alleen ICN, of ook hun klanten)? Danny verwacht weinig bezoekers vóór livegang, tientallen testers. Bevestig het aantal. Dat bepaalt de toegangsdrempel en of Google in de demo aan mag (zie sectie 6).
11. Elementor-site: heeft Danny of ICN beheerdersrechten, welke hosting en welke cache/optimalisatieplugin draait er (bijv. minify, Rocket Loader)? Mag er een verborgen testpagina op de echte site komen? Dit is voor de embed-test in Fase 2b.
12. Vertrouwen: Danny levert reviews, garanties, certificeringen en projectfoto's later aan. **Gebruik tot die tijd alleen wat op de ICN-site staat** (gelezen op 14-10-2026, alleen de homepage via een samenvatting; andere pagina's kunnen meer bevatten, controleer dat): "gecertificeerde installateurs" (zonder benoemd certificaat), vrijblijvende schouw op locatie, reactie binnen 24 uur, KvK-nummer, openingstijden, samenwerking met KlusWijs Nieuw-Roden. Ontwerp in de configurator een plek voor reviews, garanties en certificaten die **leeg of verborgen blijft** totdat ICN iets levert. Verzin nooit reviews, sterren, aantallen installaties, merknamen of certificaten, ook niet als plaatsvervanger in het prototype. Gebruik daar duidelijk neutrale plaatshouders ("hier komen reviews van ICN-klanten") en toon ze niet op een link die naar ICN gaat.
13. Voorbeeldwoningen: welke 5 tot 10 adressen in het werkgebied mogen als showcase dienen (liefst eerdere ICN-klanten die toestemming gaven, anders openbare of eigen adressen van Danny)? Zie sectie 4c. De zes adressen uit vraag 8 zijn nog **niet** goedgekeurd als publieke showcase: vraag Danny van wie ze zijn en of de bewoners weten dat hun dak in een demo voor ICN komt. Zonder bevestigde toestemming blijven ze intern en verschijnen ze niet in een gedeelde demo. Alleen de adressen in het werkgebied (Roden, Groningen) komen in aanmerking.

Wat je zelf mag besluiten zonder te vragen: tech-stack, mappenstructuur, testaanpak, naamgeving. Noem je keuze in een zin in `docs/besluiten.md`.

## 4. Fase 1: validatiespike VOOR het bouwen (Google Solar API)

Danny wil Google Solar API gebruiken voor het beste resultaat. Onderzoek wijst echter op een hybride als beste uitgangspunt: eigen dakgeometrie uit 3DBAG (gemeten lidar, LoD2.2) en PDOK-luchtfoto voor de visuals, met Google voor schaduw/flux en paneelindeling waar het echt iets toevoegt. Dekking in het noorden is onbevestigd. Test met echte aanroepen:

- **Dekking in het noorden:** Google meldt uitbreiding van `MEDIUM`-kwaliteit in Nederland, maar het is niet bevestigd voor Groningen, Drenthe, Friesland en Overijssel. Roep `buildingInsights:findClosest` aan voor de testadressen met `requiredQuality=MEDIUM` en daarna zonder eis. Log per adres: 404 ja/nee, `imageryQuality`, `imageryDate`, aantal dakvlakken, `maxArrayPanelsCount`.
- **EEA-beperking:** volgens Googles EEA-pagina (geldig sinds 8 juli 2025, bij een EEA-factuuradres) ontbreken in Building Insights alleen `postalCode`, `administrativeArea` en `regionCode`. Dat is beperkt en niet essentieel. Controleer in de echte respons dat er verder niets ontbreekt, en dat `dataLayers` (flux-kaart, schaduw per uur) werkt. Documenteer dit.
- **Nauwkeurigheid versus 3DBAG:** Google noemt zelf dat 3D-modellen niet altijd precies zijn en beelden verouderd kunnen zijn. In Nederland is `MEDIUM` afgeleid uit luchtfoto's op 25 cm, tegen PDOK op 5-8 cm. Vergelijk per testadres dakhelling, windrichting en oppervlak met 3DBAG en met de luchtfoto, en noteer waar ze afwijken (nieuwbouw, rieten daken, platte daken, bomen).
- **Gebruiksvoorwaarden:** mag je Google-data cachen, en mag je het tonen op een niet-Google-kaart (PDOK-luchtfoto)? Lees de actuele voorwaarden en vat samen wat wel en niet mag. Als het onduidelijk is: markeer als open punt voor Danny, bouw niet door op een aanname.
- **Vergelijk** per adres met 3DBAG (helling, oriëntatie, oppervlak). Klopt Google met de werkelijkheid op de luchtfoto?
- **Kosten per bezoek:** Building Insights is $10 per 1000 aanvragen (1 cent per adres), Data Layers $75 per 1000 (7,5 cent per aanroep), tier-1-prijzen uit eerder onderzoek, niet opnieuw geverifieerd. Controleer de actuele prijspagina, inclusief of er een gratis maandtegoed of gratis gebruik per SKU geldt (onbekend). Reken uit wat een bezoeker kost bij 1 versus 3 aanroepen, en per adres, want een bezoeker kan meerdere adressen proberen. Het echte risico is misbruik of een lus in de code (100.000 aanroepen Building Insights is ongeveer $1.000), niet normale bezoekers: zie de kostenbescherming in sectie 6.

Poort: schrijf een kort rapport `docs/spike-google-solar.md` met dekking per adres, ontbrekende velden, kosten en advies. Laat Danny beslissen voor je verdergaat. Valt de dekking of data tegen, dan gebruiken we **Tier B**: 3DBAG (dakgeometrie) + PVGIS (opbrengst) + eigen paneelindeling + eigen schaduwberekening. Tier B is geen noodoplossing maar een volwaardige route (sectie 4b). Houd de architectuur zo dat de bron van dakdata uitwisselbaar is (adapter-patroon).

## 4b. Visuele pariteit: de 2050-laag is bron-onafhankelijk (harde eis)

De hele UI en alle P1-effecten (sectie 10) lezen uitsluitend een genormaliseerd `RoofModel`: dakvlakken (polygonen met helling en windrichting), geschatte obstakels, omliggende gebouwen als schaduwwerper, een paneelindeling en een jaaropbrengst per cel of paneel. Geen enkele UI-code mag weten of de data uit Google of uit Tier B komt.

| Effect | Tier A (Google + 3DBAG) | Tier B (3DBAG + PVGIS + eigen berekening) |
|---|---|---|
| Fly-in | PDOK-luchtfoto | Identiek |
| 3D-dakmodel | Google-geometrie of 3DBAG | 3DBAG LoD2.2 |
| Paneelindeling | Google `solarPanelConfigs` | Eigen pakking langs dakranden, met randmarge, op de 3DBAG-vlakken |
| Zonnebaan en bewegende schaduw | Three.js met schaduw uit Google-flux of eigen berekening | Three.js schaduw-mapping met 3DBAG-gebouwen in de omgeving als werpers |
| Warmtekaart | Google flux-kaart | Eigen instralingsraster: per cel jaarsom uit PVGIS-instraling, gecorrigeerd voor schaduw per uur |
| Opbrengst | Google en/of PVGIS | PVGIS |

Beperkingen van Tier B, die je eerlijk moet tonen en loggen in `docs/open-punten.md`:
- Bomen en kleine obstakels (schoorsteen, dakkapel, dakramen) zitten niet in 3DBAG. Gebruik een conservatieve randmarge en een nauwkeurigheidsindicator ("indicatie, definitief na schouw"). Onderzoek of AHN-hoogtedata bomen redelijk kan meenemen. Zo niet, laat het weg en zeg het.
- 3DBAG kan voor nieuwbouw verouderd zijn (zie `b3_kwaliteitsindicator`, `b3_pw_datum` en `b3_pw_selectie_reden`). Toon bij onbetrouwbare modellen een nette terugval.

Acceptatiecriterium: bouw de 2050-laag eerst op Tier B (gratis, geen sleutel, geen kosten per bezoeker). Een kijker die de data niet kent, mag het verschil tussen Tier A en Tier B niet zien aan de interface. Het enige verschil is een kleine nauwkeurigheidsaanduiding. Laat Danny dit beoordelen met dezelfde adressen in beide tiers naast elkaar.

## 4c. Design en conversie: ontwerp eerst, motor daarna (harde eis)

Danny wil een geweldig uiterlijk vanaf het begin, en het moet verkopen. Een mooi uiterlijk komt niet vanzelf uit data; daarom wordt het ontworpen en beoordeeld voordat de rekenmotor eronder komt.

**Fase 2a: klikbaar prototype met vaste data.** Bouw de hele flow (adres, fly-in, dak, panelen, opbrengst en besparing, contact) voor mobiel en desktop, met vaste, handmatig gecontroleerde dakdata voor 1 of 2 adressen. Geen live bronnen. Maak **twee visuele richtingen** en laat Danny kiezen:
- **A "Goudenuur":** donker en warm (diep antraciet of nachtblauw, amber-zonlicht als accent en als lichtbron in het beeld).
- **B "Daglicht":** licht, helder, veel witruimte, zonlicht als accent.
Reden voor twee: ICN's toon is warm en toegankelijk en de doelgroep is 35-70 hogeropgeleid. Een koud donker sci-fi-thema kan botsen met het merk. Dat is een inschatting, geen feit. Danny beslist op beeld. Beide richtingen gebruiken ICN's logo en kleuren waar dat past (`docs/huisstijl.md`).

**Stijlinspiratie (uit eigen kennis, nu niet opnieuw bekeken; kijk zelf en kopieer niets):** scroll-gestuurde productverhalen zoals Apple-productpagina's; rustige, scherp afgewerkte donkere interfaces zoals Linear; de zakelijke helderheid van Stripe; de fly-in van Google Earth; configurators van autofabrikanten zoals Tesla. Bekijk daarnaast drie bestaande Nederlandse zonnepanelen-calculators van concurrenten als benchmark, en noteer wat zij goed en slecht doen. Doel: duidelijk beter dan wat de bezoeker nu elders ziet.

**De verkoopvolgorde:**
1. Eén adresveld met PDOK-suggesties en bevestiging van het huisnummer.
2. Fly-in van hooguit ongeveer 4 seconden, met een "overslaan"-knop.
3. Het dak wordt "gescand": panelen verschijnen een voor een, een teller loopt op.
4. Eén groot getal: verwachte jaaropbrengst in kWh en besparing per jaar in euro's als bandbreedte, in het standaardscenario na 2026 (sectie 7).
5. Eén verdieping die indruk maakt: de zonnebaan-slider met bewegende schaduw.
6. Eerlijkheid zichtbaar in beeld: "indicatie, definitief na schouw", aannames uitklapbaar (stroomprijs, terugleververgoeding, zelfconsumptie).
7. Eén duidelijke vervolgstap, bijvoorbeeld "Plan je gratis schouw", plus de optie de indicatie te mailen. Kort formulier: naam, e-mail, telefoon, toestemming. Respecteer de bestaande ICN-belofte van reactie binnen 24 uur alleen als ICN dat bevestigt.
Streefwaarde: eerste resultaat binnen ongeveer 10 seconden op een gewone 4G-telefoon. Het is een streefwaarde: meet het en meld de werkelijke uitkomst.

**Voorbeeldwoningen:** bouw 5 tot 10 showcase-adressen in het werkgebied waarvan de dakdata handmatig is gecontroleerd tegen de luchtfoto (dakkapellen, bomen en dakramen met de hand gecorrigeerd). Toon ze als "Probeer een voorbeeldwoning". Regels: het label moet eerlijk zijn ("voorbeeldwoning, gecontroleerd"), live zoeken blijft ernaast werken met de gewone nauwkeurigheidsaanduiding, en een voorbeeldwoning mag nooit worden voorgesteld als wat elk adres krijgt. Gebruik alleen adressen waarvoor de bewoner toestemming gaf, of zakelijke of eigen adressen (bijv. ICN-kantoor of showroom). Geen privéadressen van derden.

**Ontwerpronden (verplicht):**
- Maak na elke visuele stap schermafbeeldingen op telefoon (ca. 390x844), kleine laptop (ca. 1366x768) en groot scherm (ca. 1920x1080), met Playwright of een gelijkwaardig hulpmiddel. Beoordeel ze zelf kritisch op lettergrootte, contrast, uitlijning, haperende animaties en laadtijd. Verbeter minimaal drie rondes voordat je het aan Danny toont. Bewaar de beelden in `docs/screens/` met datum.
- Meld bij oplevering eerlijk wat je zelf nog onaf of lelijk vindt. Zeg niet dat iets "geweldig" is; laat Danny dat beoordelen.

**Prestatie en toegankelijkheid:**
- De 3D-laag laadt pas ná het adres (lazy). Het eerste scherm werkt zonder Three.js. Voorstel voor het budget van het eerste scherm: ruwweg onder 200 kB gzip. Dat getal is een voorstel: meet en pas aan.
- Lichte modus zonder 3D bij trage verbinding of weinig geheugen, nette terugval zonder WebGL, en `prefers-reduced-motion` respecteren.
- Doelgroep 35-70: lettergrootte minimaal 16 px, contrast minimaal WCAG AA, tikdoelen minimaal 44 px, geen essentiële informatie alleen via hover of kleur.
- Animaties op 60 fps op een gemiddelde telefoon: test op echt of geëmuleerd middensegmentapparaat.

**Twee deelmomenten voor ICN:**
1. Einde Fase 2a: het prototype als deelbare link, duidelijk gelabeld als "ontwerpvoorbeeld met vaste voorbeelddata". Het laat uiterlijk en flow zien, geen live berekening.
2. Einde Fase 3: een werkende demo met live adressen op Tier B.
Het kale skelet uit Fase 2b is niet bedoeld om aan ICN te tonen. Danny deelt niets met ICN zonder dat hij het zelf heeft beoordeeld.

## 5. Databronnen

| Doel | Bron | Opmerkingen |
|---|---|---|
| Schaduw, flux, paneelindeling (Tier A, nauwkeurigheidsupgrade) | Google Solar API (`solar.googleapis.com/v1/buildingInsights:findClosest`, `dataLayers:get`) | Betaald. Server-side, sleutel afschermen. Pas integreren na het besluit in Fase 1. |
| Adres zoeken | PDOK Locatieserver | Gratis. Controleer de actuele endpoint-URL in de PDOK-docs. |
| Gebouw (BAG-id, bouwjaar) | PDOK BAG | Gratis, overwegend open data. |
| Dakgeometrie 3D | 3DBAG (`api.3dbag.nl`, CityJSON) | Gratis, CC BY 4.0, bronvermelding. Per dakvlak helling en azimut (LoD2.2), oppervlak plat/schuin, daktype, bouwjaar. Geen schaduwattribuut. Rate limits onbekend: voor productie liever tiles downloaden of cachen. |
| Luchtfoto | PDOK WMTS `https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0` | Gratis, CC BY 4.0, 5-8 cm. Bronvermelding in de UI. |
| Opbrengst (fallback/validatie) | PVGIS v5.3 `https://re.jrc.ec.europa.eu/api/v5_3/PVcalc` | Gratis, 30 calls/s per IP. **Alleen server-side** (AJAX/browser niet toegestaan). |
| Energielabel (later, warmtepomp) | EP-Online API | Gratis sleutel via apikey.ep-online.nl. Persoonsgebonden, niet delen met derden. |

## 6. Architectuur

- **Server-proxy is verplicht:** Google-sleutel geheim, PVGIS mag niet vanuit de browser, en elke Google-aanroep kost geld.
- **Kostenbescherming:** bot-bescherming (bijv. Cloudflare Turnstile), rate limiting per IP, **harde dagelijkse quota op de Solar API in Google Cloud** (een budgetmelding alleen stopt niets), één Building Insights-aanroep per adres per sessie, `dataLayers` alleen op aanvraag (bij "bekijk details"). Caching alleen zoals Fase 1 toestaat. Vraag Danny de quota in Google Cloud in te stellen en geef hem de stappen; ik weet niet precies hoe dat scherm er in zijn account uitziet.
- **Demo zonder Google:** de deelbare demo draait standaard op Tier B (geen sleutel, geen kosten per bezoeker). Zet Google in de demo pas aan na Fase 3b, achter de quota en Turnstile of een toegangscode, en alleen als Danny dat besluit.
- **Embed:** web component met shadow DOM zodat Elementor-CSS niet doorlekt. Eén script-tag, één element. Voor ICN zelf is een klein WordPress-pluginbestandje met een shortcode netter dan een HTML-widget, omdat sommige rollen geen scripts mogen plaatsen. Test vroeg op een verborgen testpagina op de echte site (Fase 2b), niet pas aan het eind. Let op: cache- en optimalisatieplugins (minify, JavaScript uitstellen, Rocket Loader) kunnen het script breken. Gebruik een uitzondering voor deze pagina.

### Demo-hosting en verhuisbaarheid (harde eis)

- **Cloudflare gratis:** Pages voor de interface, Workers voor de proxy. Volgens de Cloudflare-docs (gelezen 14-10-2026) geeft de gratis Workers-variant 100.000 requests per dag en 10 ms CPU-tijd per aanroep. Over commercieel gebruik staat op de prijspagina niets. De algemene voorwaarden zijn niet gelezen: controleer die. **Vercel Hobby is niet geschikt voor deze demo:** Vercel beperkt het gratis plan tot niet-commercieel, persoonlijk gebruik.
- **10 ms CPU is krap.** Wachttijd op externe servers telt volgens mijn kennis niet mee, maar het verwerken van grote 3DBAG-CityJSON-bestanden kan wel boven die limiet komen. Dat is een aanname: test het in Fase 2b. Valt het tegen, verplaats dan het zware ontleden naar de client, of werk met vooraf voorbewerkte dakdata, of rapporteer aan Danny dat het betaalde plan ($5 per maand voor Workers, indicatie, controleer) nodig is.
- **Bouw de proxy portable:** standaard `fetch`/Request-Response, bijvoorbeeld met Hono, zonder Cloudflare-specifieke aanroepen buiten één dunne adapterlaag. Dan draait dezelfde code later op Cloudflare, Vercel (betaald), of een gewone Node-server. Geheimen alleen via omgevingsvariabelen.
- **Toegangsdrempel op de demo:** eenvoudige toegangscode of Cloudflare Access (controleer of dat gratis is voor dit gebruik), `noindex` en `X-Robots-Tag`, zodat zoekmachines de demo niet indexeren.
- **Inloggen:** gebruik `wrangler login` of een API-token met beperkte rechten (alleen Pages en Workers voor dit project). Plak nooit een token in een chat, in de repo of in een bestand dat wordt gecommit.
- **Demo-etiket:** toon in de demo dat de prijzen placeholders zijn en dat het een demo is. Een klant of bezoeker mag dit niet voor een offerte houden.
- **Bronvermelding** voor PDOK en 3DBAG (CC BY 4.0) zichtbaar in de demo.
- **Structuur (voorstel, jij mag afwijken):** `core/` (adres, woning, verbruik, lead), `modules/solar/`, daarna `modules/airco/` en `modules/heatpump/` als lege interfaces, `data-sources/` met adapters (google, 3dbag, pvgis, pdok), `calc/` (zuivere functies met tests), `ui/`.
- **Tests:** rekenmodel met unit tests. Adapters met opgeslagen voorbeeldrespons. Geen echte API-aanroepen in CI.
- **Foutafhandeling:** geen dekking of 404 -> nette terugval ("we maken je indicatie na een korte check") plus het leadformulier. Nooit een lege pagina.

## 7. Rekenmodel (alles configureerbaar in `config/pricing.json` en `config/market.json`)

- Opbrengst: uit Google (per dakvlak) of PVGIS. Toon bandbreedte, geen schijnnauwkeurigheid.
- **Saldering:** t/m 31-12-2026 volledige saldering. Vanaf 1-1-2027 geen saldering. Terugleververgoeding 2027-2030 wettelijk minimaal 50% van de kale leveringsprijs (excl. belasting en btw), hoogte per leverancier. Terugleverkosten blijven bestaan. Model het als twee scenario's: "salderen tot eind 2026" en "na 2026". Vandaag is 14 oktober 2026, dus vrijwel elke nieuwe installatie valt onder het regime na 2026. Maak dat standaardscenario.
- Zelfconsumptie-aandeel als parameter (met en zonder thuisbatterij).
- Placeholderprijs: begin met een range van circa EUR 0,80-1,50 per Wp inclusief installatie en btw 0% op zonnepanelen. Dit zijn marktgemiddelden, geen ICN-prijzen. Toon altijd een bandbreedte en de tekst "indicatie, definitief na schouw".
- Terugverdientijd NIET hardcoden. Bronnen lopen uiteen van ruwweg 6 tot 15 jaar. Toon hem als resultaat van de invoer, met gevoeligheid voor stroomprijs en terugleververgoeding.
- Geen claims als "tot 70% besparing" overnemen van de ICN-site: onbevestigd.

## 8. Netcongestie en bedrijven

Enexis meldt in Groningen, Drenthe en Overijssel nog steeds knelpunten voor teruglevering (wachtlijsten vooral voor grootverbruikers), en Friesland had een vol net voor grote producenten. Voor woningen heb ik geen blokkade gevonden, maar dat is niet uitputtend gecontroleerd. v1: als de bezoeker "bedrijfspand" kiest, toon een aparte route met uitleg dat netcapaciteit eerst gecheckt moet worden, en vang de lead op. Onderzoek of de netcapaciteitskaart van de netbeheerder programmatisch beschikbaar is; zo niet, laat het bij de doorverwijzing.

## 9. Leadroute

- Generieke webhook (POST JSON) met: adres, BAG-id, gekozen configuratie, indicatie (met aannames), contactgegevens, toestemming (tijdstempel en tekstversie), UTM/bron.
- Verstuur naar een configureerbare URL. Bij falen: retry en lokale wachtrij, nooit een lead verliezen.
- Stuur de bezoeker ook een samenvatting per e-mail (optioneel, vraag in Fase 0).
- AVG: alleen verzamelen wat nodig is, duidelijke toestemming, verwijderroute.

## 10. De 2050-laag (prioriteit P1 = in v1, P2 = direct erna, P3 = stretch)

- **P1 Fly-in:** adres invoeren en de camera vliegt van landelijk niveau naar jouw dak (PDOK-luchtfoto, geleidelijke zoom).
- **P1 Digitale tweeling van het dak:** 3D-model uit 3DBAG of Google-geometrie in Three.js. Panelen verschijnen een voor een, en de bezoeker kan ze slepen, toevoegen, verwijderen.
- **P1 Zonnebaan en schaduw:** slider voor tijdstip en seizoen. De schaduw beweegt mee. Het live vermogen verandert.
- **P1 Dakwarmtekaart:** een instralings-heatmap over het dak, zodat je zonnige en schaduwrijke zones ziet. Google-flux in Tier A, eigen raster in Tier B (zie sectie 4b). Moet er in beide gevallen even sterk uitzien.
- **P1 Energiestroom-animatie:** een dag in het leven van het huis: zon, huis, net, later batterij en auto, met stromende deeltjes.
- **P2 Tijdlijn 2026 versus 2027:** een animatie van wat het einde van salderen voor deze woning betekent, jaar voor jaar over 25 jaar.
- **P2 Praat met je dak:** een korte AI-assistent die in gewone taal uitlegt ("waarom staan er geen panelen op het noordvlak?"). Zorg dat hij alleen uit de berekende data put en geen prijzen of beloftes verzint.
- **P2 Straatcontext:** "in jouw straat liggen al X installaties" (Google `detectedArrays`, indien beschikbaar in NL).
- **P2 Deelbare dakpaspoort:** een mooie kaart/pdf om te delen of te mailen.
- **P3 Uitbreidbaar twin-model:** dezelfde digitale tweeling later met warmtepomp, laadpaal en batterij, voor de all-electric roadmap.
- **P3 AR op de telefoon:** richt de camera op het dak. WebXR-ondersteuning op iOS is beperkt, dus alleen als onderzoek, niet als belofte.
- Design: de visuele richting wordt in Fase 2a gekozen door Danny (sectie 4c: "Goudenuur" donker-warm of "Daglicht" licht). Rustig, soepele animaties op 60 fps, glas-effecten alleen als ze de leesbaarheid niet schaden. Moet goed werken op een telefoon en op desktop (aandeel onbekend, meten). Fallback zonder WebGL en een lichte modus voor trage verbindingen. Elk effect moet het begrip of het vertrouwen dienen; een effect dat alleen indruk maakt maar de doelgroep (35-70, rationeel) niet helpt, mag sneuvelen.

## 11. Risico's en onbekenden (houd dit bij in `docs/open-punten.md`)

- Google-dekking in het noorden en EEA-beperkingen (Fase 1).
- Google-voorwaarden voor caching en weergave naast niet-Google-kaarten.
- Rate limits van de 3DBAG-API: onbekend.
- Echte prijzen, CRM en tracking van ICN: later.
- Nauwkeurigheid: het is een indicatie. Stel de verwachting op de pagina en in de leadtekst, ook als het er bijzonder precies uitziet. Gevaar: een mooie warmtekaart wekt vertrouwen dat de data (vooral Tier B, bomen en dakkapellen) niet altijd waarmaakt.
- Het 3D-model uit 3DBAG is schoner dan het echte huis. Een bewoner met een dakkapel ziet een dak zonder dakkapel. Hoe vaak dat voorkomt in het werkgebied is onbekend: meet het bij de testadressen.
- Voorbeeldwoningen kunnen de indruk wekken dat elk adres zo goed wordt (sectie 4c). Houd het label eerlijk.
- Cloudflare gratis: 10 ms CPU per aanroep is mogelijk te krap voor het verwerken van 3DBAG-data (sectie 6). Algemene voorwaarden voor commercieel gebruik niet gelezen.
- Doelgroep (35-70, hogeropgeleid, koopwoning) is door Danny opgegeven. Het aandeel mobiel en wat ze overtuigt, is niet gemeten.
- Op de ICN-site staan geen zichtbare reviews, garanties of certificaten: het vertrouwenselement in de configurator hangt af van wat ICN aanlevert.

## 12. Fases

1. **Fase 0:** vragen stellen (sectie 3), antwoorden vastleggen, huisstijl uit de ICN-site halen (`docs/huisstijl.md`).
2. **Fase 1:** validatiespike (sectie 4), rapport, besluit van Danny over Google. Dit blokkeert Fase 2 en 3 niet.
3. **Fase 2a:** klikbaar ontwerpprototype met vaste data, twee visuele richtingen, minimaal drie ontwerprondes met schermafbeeldingen (sectie 4c). Deploy op Cloudflare Pages achter een toegangsdrempel. **Deelmoment 1:** Danny kiest de richting en beoordeelt; daarna mag hij het als "ontwerpvoorbeeld" met ICN delen.
4. **Fase 2b:** skelet op Tier B: kern, portable serverproxy op Cloudflare Workers, `RoofModel`, adres -> 3DBAG-dakdata -> eenvoudige uitkomst en lead. Eerst zonder 3D. Test of 10 ms CPU volstaat. Verborgen embed-testpagina op de echte ICN-site als Danny of ICN toegang geeft (Fase 0, vraag 11). Niet tonen aan ICN.
5. **Fase 3:** 2050-laag P1 op Tier B, in de gekozen visuele richting (sectie 4b, 4c en 10), plus 5-10 voorbeeldwoningen. **Deelmoment 2:** werkende demo met live adressen.
6. **Fase 3b:** Google-adapter (Tier A) naast Tier B, na het besluit in Fase 1 en met de harde Google-quota ingesteld. Danny beoordeelt dezelfde adressen in beide tiers naast elkaar.
7. **Fase 4:** rekenmodel verfijnen, tests, tracking, verhuizing van de demo naar de productiehosting, definitieve embed in Elementor (shortcode-plugin).
8. **Fase 5:** P2-features, daarna warmtepomp- en airco-modules.

Werk in kleine commits, houd `docs/besluiten.md` en `docs/open-punten.md` actueel, en meld Danny na elke fase kort wat klaar is en wat nog open staat.
