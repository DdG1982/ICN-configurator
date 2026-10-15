# Vragen aan ICN

Stand 15-10-2026. Deel 1 is mailklaar. Deel 2 is alleen voor Danny: waar elk antwoord in de configurator terechtkomt.

---

## Deel 1: mail aan ICN

**Onderwerp:** Zonnepanelen-configurator: vragen om de berekening op jullie praktijk af te stemmen

Beste [naam],

De configurator rekent nu voor elk adres in Nederland een indicatie uit: hoeveel panelen er passen, wat ze opleveren en wat dat bespaart. Daarvoor gebruiken we open data van de overheid (kadaster, 3D-kaart, hoogtekaart) en de zonnedata van de Europese Commissie.

Een deel van de berekening rust nog op marktgemiddelden en aannames. Die willen we vervangen door jullie cijfers en werkwijze, zodat de uitkomst klopt met wat jullie bij de schouw zien. Daarom onderstaande vragen. Waar we nu een waarde gebruiken, staat die erbij. "Klopt" is dus ook een prima antwoord.

Niet alles hoeft in één keer. De vragen met een ★ hebben we het eerst nodig.

### A. Prijzen en producten

1. ★ **Prijzen.** Kunnen jullie richtprijzen geven inclusief installatie, bijvoorbeeld voor 6, 10 en 16 panelen? Of een prijs per Wp. *Nu: € 0,80 – 1,50 per Wp, een marktgemiddelde.* In beeld blijft altijd "indicatie, definitief na schouw" staan.
2. ★ **Standaardpaneel.** Welk paneel leggen jullie meestal: merk, vermogen en afmetingen? *Nu: 430 Wp, 1,13 × 1,72 m.*
3. **Veroudering.** Hoeveel procent minder per jaar mag het paneel opleveren volgens de garantie van de fabrikant? *Nu: 0,5% per jaar.*
4. **Thuisbatterij.** Bieden jullie een thuisbatterij aan? Zo ja, welke en met welke richtprijs?

### B. Hoe jullie panelen leggen

5. ★ **Ruimte.** Hoeveel ruimte houden jullie aan tot de dakrand, en tussen de panelen? *Nu: 40 cm tot de rand en 2 cm tussen de panelen.*
6. **Staand of liggend.** Leggen jullie alleen staand, of ook liggend als dat beter past? *Nu: alleen staand.*
7. **Plat dak.** Leggen jullie op een plat dak oost-west of op het zuiden? Onder welke hoek, en met hoeveel ruimte tussen de rijen? *Nu: oost-west onder 10°.*
8. ★ **Windrichting.** Leggen jullie ook op daken op het oosten en het westen? En op het noorden nooit? *Nu: oost, zuid en west wel, noord niet.*
9. ★ **Aantal panelen.** Wat is jullie minimum per installatie? Adviseren jullie panelen tot ongeveer het eigen verbruik, of meer? *Nu: we vullen tot het jaarverbruik, met minimaal 4 panelen.*
10. **Bijzondere daken.** Wat doen jullie bij een rieten dak, een monument of een bedrijfspand? *Nu staat er bij riet: "Op riet plaatsen we geen panelen, vanwege brandveiligheid. De adviseur kijkt naar alternatieven, zoals een bijgebouw." Bij een monument plaatsen we niets automatisch en verwijzen we naar een adviseur. Bij een bedrijfspand melden we dat de netcapaciteit eerst gecheckt moet worden. Kloppen deze teksten met jullie beleid?*

### C. Rekenaannames

11. **Eigen verbruik van de opgewekte stroom.** Welk deel van de opgewekte stroom gebruiken jullie klanten ongeveer zelf, zonder en met batterij? *Nu: 30% zonder en 60% met batterij.*
12. **Stroomverbruik van een huishouden.** Herkennen jullie deze schatting? Een tussenwoning met 3 personen verbruikt ca. 3.300 kWh. Vrijstaand ligt ongeveer 60% hoger, een appartement ongeveer 10% lager. Een nieuwbouwwoning zonder gas krijgt er ca. 2.500 kWh bij voor de warmtepomp. De bezoeker kan het verbruik altijd zelf aanpassen.
13. ★ **Stroomprijs en terugleveren.** Welke stroomprijs, terugleververgoeding en terugleverkosten willen jullie laten zien? En wie houdt die bij, bijvoorbeeld elk kwartaal? *Nu: stroom € 0,24 – 0,32, vergoeding € 0,04 – 0,07, terugleverkosten € 0,02 – 0,07 per kWh.* Vanaf 2027 stopt de salderingsregeling; daar rekent de configurator al mee.

### D. Aanvragen en opvolging

14. ★ **Wie ontvangt de aanvragen?** Een e-mailadres of een systeem (CRM)? Zo ja, welk systeem? Een aanvraag bevat het adres, de gekozen panelen, de indicatie met alle aannames en de contactgegevens.
15. **"Mail mij de indicatie."** Bezoekers kunnen de indicatie ook per e-mail vragen. Willen jullie dat de configurator die mail automatisch verstuurt, of sturen jullie hem zelf? Vanaf welk afzenderadres?
16. **Werkgebied.** Klopt het werkgebied Groningen, Drenthe, Friesland, Overijssel en Flevoland? Of liever een straal rond Roden? Wat moet er gebeuren met aanvragen van buiten het werkgebied?

### E. Privacy en vertrouwen

17. ★ **Toestemming en privacy.** Mogen jullie de toestemmingstekst bij het formulier goedkeuren of aanleveren, en de link naar jullie privacyverklaring sturen? Goed om te weten: de configurator gebruikt een beveiliging van Cloudflare tegen misbruik door robots. Dat moet waarschijnlijk in de privacyverklaring worden vermeld.
18. **Certificaat.** Op jullie site staat "gecertificeerde installateurs". Welk certificaat is dat?
19. **Vertrouwen.** Hebben jullie klantbeoordelingen, garanties op het werk of projectfoto's die we mogen tonen? We zetten er niets neer zonder jullie akkoord.

### F. Website en meten

20. **Website.** Kunnen we toegang krijgen tot WordPress/Elementor, of het contact van jullie websitebouwer? We willen de configurator eerst op een verborgen testpagina plaatsen. Weten jullie welke cache- of optimalisatieplugin er draait?
21. **Domein.** Loopt het domein installatiecomfortnederland.nl via Cloudflare? Of weten jullie wie de domeininstellingen beheert?
22. **Meten.** Welke stappen willen jullie terugzien in Google Analytics of Tag Manager? Bijvoorbeeld: adres ingevuld, resultaat bekeken, formulier geopend, aanvraag verstuurd.

Alvast bedankt. Twijfel je ergens over, laat het gerust open; dan bespreken we het even telefonisch.

Met vriendelijke groet,
Danny

---

## Deel 2: alleen voor Danny, waar elk antwoord landt

| Vraag | Bestand of instelling |
|---|---|
| 1, 2 | `prototype/config/pricing.json` (`prijsPerWp`, `paneelWp`, `paneelMaat`). Daarna voorbeeldwoningen opnieuw bouwen (`scripts/bouw-voorbeelden.ts`) |
| 3 | `market.json` → `degradatiePerJaar` |
| 4 | Nog niet gebouwd. Nu alleen een schakelaar "thuisbatterij" die het zelfverbruik verandert, zonder prijs |
| 5, 6, 7 | Code: `src/live/live.ts` (`rand`, `tussen`), `src/live/geo.ts` (staand, rijafstand plat dak), `src/live/bouw.ts` (oost-west 10°) |
| 8, 9 | `src/live/bouw.ts` (azimut 85–275°, drempel 80%), `src/calc/indeling.ts` (tot verbruik, minimaal 4) |
| 10 | Teksten in `src/main.ts` (`STATUS_TEKST`). Riet herkennen we niet; daar stellen we de bezoeker een vraag over |
| 11, 12, 13 | `market.json` → `zelfconsumptie`, `verbruik.*`, `stroomprijsPerKwh`, `terugleververgoedingPerKwh`, `terugleverkostenPerKwh` |
| 14 | Pages-secret `LEAD_WEBHOOK_URL` (+ optioneel `LEAD_WEBHOOK_TOKEN`) en een ontvanger (Make, Zapier of een eigen script) |
| 15 | Moet de ontvanger van de webhook doen. De configurator mailt zelf niets |
| 16 | `config/showcase.json` → `werkgebiedProvincies`. Een straal vraagt een kleine codewijziging |
| 17 | `index.html` (toestemmingstekst, link) en `TOESTEMMING_VERSIE` in `src/main.ts` ophogen |
| 18, 19 | `index.html` (beloftes, het verborgen vertrouwensblok) |
| 20, 21 | Embed-test (Fase 2b). Bepaalt ook of een WAF-rate-limitregel op het eigen domein kan |
| 22 | Events heten nu `icn_adres_gekozen`, `icn_live_berekend`, `icn_formulier_geopend`, `icn_lead_verstuurd`, `icn_indicatie_gemaild`, `icn_lead_in_wachtrij` |

Al door ICN bevestigd (niet opnieuw vragen): de belofte "reactie binnen 24 uur" (`docs/besluiten.md`).
