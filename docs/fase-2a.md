# Fase 2a: klikbaar ontwerpprototype

Status 14-10-2026: eerste versie klaar ter beoordeling door Danny. **Nog niet gedeeld, nog niet op Cloudflare.**

## Starten

```
cd prototype
npm install
npm run dev        # ontwikkelserver
npm test           # rekenmodel, zonnestand, schaduw (12 tests)
npm run build      # productiebuild in prototype/dist
npm run screens    # schermafbeeldingen (eerst `npm run build && npx vite preview --port 4173`)
```

Handige URL-parameters: `?richting=goudenuur` of `?richting=daglicht`, `?licht=1` (lichte modus zonder vlucht), `?webgl=0` (versie zonder 3D), `?intern=1` (toont de plaatshouder voor reviews).

## Wat erin zit

- De hele flow: één adresveld met suggesties uit `config/showcase.json`, de fly-in met overslaan-knop (ca. 3,8 s), het dak dat gescand wordt met panelen die een voor een verschijnen, één groot getal met bandbreedte, de zonnebaan met tijd- en datumschuif en bewegende schaduw, het live vermogen, de zonkaart (warmtekaart), de energiestroom, investering en terugverdientijd met aanpasbare aannames, en het formulier "plan je gratis schouw" of "mail de indicatie".
- Twee richtingen, te wisselen in de demobalk: **A Goudenuur** (donker en warm) en **B Daglicht** (licht).
- Panelen toevoegen en weghalen door erop te tikken. Lege plekken zie je als omlijning.
- Scenario's "vanaf 2027 zonder saldering" (standaard) en "tot eind 2026 met saldering".
- De versie zonder WebGL, de lichte modus (Save-Data, 2G of weinig geheugen) en `prefers-reduced-motion` werken: geen vlucht, panelen staan er meteen.
- GTM-events in `dataLayer`: `icn_adres_gekozen`, `icn_resultaat_getoond`, `icn_zonbaan_gebruikt`, `icn_paneel_gewijzigd`, `icn_formulier_geopend`, `icn_lead_verstuurd`, `icn_indicatie_gemaild`. Er wordt niets verstuurd.

## Eerlijkheid in beeld

- Elk adres toont **dezelfde illustratieve voorbeeldwoning**. De badge zegt "Ontwerpvoorbeeld · illustratieve woning", de demobalk staat altijd in beeld en de voettekst legt het uit.
- Prijzen, stroomprijs, vergoeding en terugleverkosten zijn placeholders (`config/market.json`, `config/pricing.json`).
- Er staan geen verzonnen reviews, sterren, merken of certificaten in. De plaatshouder voor reviews is alleen zichtbaar met `?intern=1`.
- De beloftes "reactie binnen 24 uur", "vrijblijvende schouw" en "gecertificeerde installateurs" komen van de ICN-site. Danny heeft de 24 uur bevestigd.

## Hoe het rekent (al volgens de Tier B-aanpak)

- `src/calc/shade.ts`: een eigen schaduwberekening met analytische stralen tegen bomen (bol) en buurpanden (blok), op 12 dagen per jaar in stappen van een half uur, onder een heldere hemel. Daaruit volgen een relatief instralingsraster per dakvlak en de warmtekaart.
- `src/calc/layout.ts`: de panelen worden langs het dakvlak gepakt met 30 cm randmarge. Plekken onder 88% van de beste plek vallen af.
- De opbrengst gebruikt 930 kWh/kWp × de schaduwfactor per paneel. Die 930 is een placeholder die in de live versie uit PVGIS komt.
- `src/core/roof-model.ts`: het genormaliseerde `RoofModel`. De UI leest alleen dit.

## Meetwaarden

- Eerste scherm: ca. 10 kB JS en 6 kB CSS (gzip) plus het lettertype Inter (latin, ca. 48 kB). Dat zit ruim onder het budget van 200 kB.
- De 3D-laag (Three.js en de scène) is 134 kB gzip en wordt pas geladen na het adres.
- **Niet gemeten:** de echte laadtijd op 4G en fps op een middenklasse-telefoon. De schermafbeeldingen zijn gemaakt met software-rendering (SwiftShader), dus daarmee zijn geen prestaties te meten.

## Ontwerpronden

Schermafbeeldingen staan in `docs/screens/2026-10-14-r1` t/m `r4`. Van r1 t/m r3 zijn alleen vergelijkingsbeelden bewaard, van r4 de volledige set.

1. **r1:** de resultaatkaart klapte in (flex-shrink), het adresveld viel op de telefoon onder de vouw, bomen blokkeerden het dak, en het label "LUCHTFOTO" in de vlucht was onjuist omdat er geen luchtfoto is.
2. **r2:** de panelen waren pikzwart zonder reflectie, Goudenuur was niet warm, en de terugverdientijd liep tot 62 jaar door te strenge placeholder-terugleverkosten.
3. **r3:** op de desktop scrolde de hele pagina mee bij een sprong naar het formulier, en het investeringsbedrag brak lelijk af.
4. **r4:** de staat zoals hij nu is. Daarna zijn nog twee kleine dingen aangepast die niet in de beelden staan: de scantekst en de versie zonder 3D.

## Wat ik zelf nog onaf of lelijk vind

- **Goudenuur in 3D is maar matig warm.** De interface is donker en warm, maar de 3D-scène blijft vooral daglicht. Echt gouden licht vraagt een lage zon, en dan ligt het zuiddak in de schaduw. Danny moet hierover beslissen.
- **De omgeving is stilistisch.** Huizen zijn blokken en bomen bollen. De fly-in gaat over een getekende plattegrond, niet over een PDOK-luchtfoto, omdat PDOK vanuit deze omgeving geblokkeerd is. In Fase 3 komt de echte luchtfoto, en dan verandert het beeld flink.
- **De voorbeeldwoning heeft geen dakkapel, schoorsteen of dakramen.**
- **Op de telefoon schuift het 3D-beeld weg zodra je bij "Investering" komt.** Als je terug naar boven scrolt, verschijnt het ineens weer, zonder overgang.
- **De bandbreedte van de terugverdientijd is breed (6,5–36,5 jaar).** Dat is eerlijk bij deze placeholders, maar het verkoopt niet. Daarom tonen we een middenwaarde ("ca. 14 jaar") met de bandbreedte eronder. Met echte ICN-prijzen wordt dit smaller.
- **Er is nog geen logo.** Het ICN-logo kon niet worden opgehaald, dus er staat een tekstmerk met een amber blokje. De kleuren zijn een neutraal palet.
- **Er zijn nog geen concurrenten bekeken als benchmark** (brief 4c), want hun sites waren niet bereikbaar.
- **De onderdelen zijn nog geen web component met shadow DOM.** Dat komt in Fase 2b, de embed-fase.
