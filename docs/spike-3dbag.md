# Spike 3DBAG: wat weten de gratis bronnen over de demo-adressen?

Uitgevoerd op 14-10-2026 met `spike/3dbag_spike.py`.

**Bronnen:**
- PDOK Locatieserver: het adres.
- BAG via PDOK WFS: het pand, het bouwjaar en het aantal eenheden.
- 3DBAG API: het dak in 3D (LoD2.2).
- PVGIS 5.3: de opbrengst per kWp.
- PDOK-luchtfoto: de visuele controle.

**Geen echte Google-aanroepen.** Alles hier is gratis en vraagt geen sleutel.

Per adres staat een luchtfoto met de 3DBAG-dakvlakken erover in `docs/spike-3dbag/<adres>.jpg`. Groen betekent geschikt (plat, of een schuin vlak tussen oost-zuidoost en west-noordwest). Blauw betekent minder geschikt. De ruwe uitkomst staat in `docs/spike-3dbag/resultaten.json`.

## Uitkomst per adres

| Adres | BAG-pand en gebruik | Eenheden | In 3DBAG? | Dak volgens 3DBAG (grootste vlakken) | PVGIS kWh/kWp, beste vlak | Visueel gecontroleerd | Opmerking |
|---|---|---|---|---|---|---|---|
| Dwazziewegen 20, Roden (ICN) | 2024, industrie | 12 | **Nee** | – | – | ja | Nieuw BAG-pand (2024), nog niet in 3DBAG. Op de luchtfoto: groot plat dak, **al grotendeels vol zonnepanelen**. |
| Noordhoek 5, Roden | 1991, industrie | 1 | ja | ZW 29° 213 m², NO 29° 196 m² | 924 | ja | Past goed op de luchtfoto. Het NO-vlak lijkt al panelen te hebben. |
| Wethouder Deodatusplantsoen 27X, Roden | 1964, overig | 1 | ja | plat 18 m² | 918 | ja | **Dit is een garagebox** in een rij boxen, geen woning. Kwaliteitsvlag van 3DBAG: onvoldoende. |
| Raadhuisstraat 1, Roden (gemeentehuis) | 1983, kantoor | 1 | ja | N 36° 829 m², Z 36° 513 m², W 440 m², O 304 m² | 990 | nee | Groot pand. Het panelental is alleen een indicatie. |
| Heerestraat 92, Roden | 1980, winkel + wonen | 2 | ja | plat 1.746 m², O/W 30° | 918 | nee | Kwaliteitsvlag onvoldoende. Een winkelcentrum is geen woning-demo. |
| Leeuwerikstraat 5, Vries | 1970, wonen | 1 | ja | plat 32 m², ZO 30° 27 m², NW 30° 22 m² | 919 | ja | Rijtjes- of hoekwoning. Past redelijk; de buren hebben al panelen. |
| Zuidveldigerweg 1, Peest | 1932, wonen | 1 | ja | W 44° 165 m², O 44° 165 m² | 805 (W) | ja | Past goed, met dakramen zichtbaar. Oost-west-dak. Puntenwolk uit 2019. |
| Hoofdweg 31, Eelde | 1915, wonen | 1 | ja | ZW 43° 300 m², NO 45° 281 m², dakkapellen | 902 | ja | Half rieten dak met dakkapellen, goed herkenbaar. **3DBAG weet niet welk deel riet is.** Het panelental (159) telt riet mee en is dus te hoog. |
| Arwerd 1, Groningen | 2006, wonen | 1 | ja | plat 138 m² | 917 | nee | Plat dak met meerdere niveaus. |
| Nienoord 1, Leek (museum) | 1678, bijeenkomst | 2 | ja | plat 303 m², steile vlakken 60–69° | 920 | nee | Rijksmonument. Kwaliteitsvlag onvoldoende. |
| Raadhuisweg 7, Burgum | 1935, kantoor | 1 | ja | plat 2.597 m², Z/N/W 37° | 934 | nee | Groot pand. Kwaliteitsvlag onvoldoende. |
| Ruisvoornlaan 4, Aalsmeer | 2008, wonen | 1 | ja | ZW 47° 38 m², NO 47° 37 m² | 926 | nee | Buiten het werkgebied. |
| Prinseneiland 517, Amsterdam | 1905, wonen | **14** | ja | plat 211 m², Z/N 60° | 948 | nee | **14 woningen in één pand.** Het dak is niet van deze bewoner. Puntenwolk uit 2014. Buiten het werkgebied. |
| Amstelbeststraat 12A, Amsterdam | 2014, wonen | 2 | ja | plat 87 m² | 959 | nee | Buiten het werkgebied. |

"Eenheden" is het aantal verblijfsobjecten in het BAG-pand. Julianaplein 13 in Roden bestaat niet in de BAG en is uit de lijst gehaald.

## Wat dit betekent

1. **3DBAG werkt voor 13 van de 14 adressen.**
   - Waar ik de luchtfoto heb bekeken (6 adressen), passen de dakvlakken goed bij het echte dak.
   - Helling en windrichting zijn plausibel. Zo komen de 29°- en 44°-daken overeen met de schaduwen op de foto.
   - PVGIS geeft 800–990 kWh per kWp. Dat is normaal voor Noord-Nederland. Mijn placeholder van 930 in het prototype zat goed.
2. **Nieuwbouw ontbreekt in 3DBAG, en dat raakt juist het ICN-pand.** Er is dus een nette terugval nodig: "we hebben je dak nog niet in 3D; we maken je indicatie na een korte check". Of we vallen terug op de BAG-footprint met een aangenomen dakvorm. Hier kan Google Solar (Tier A) iets toevoegen, als Google dit pand wel kent.
3. **Bestaande zonnepanelen zie je niet in 3DBAG.** Op 3 van de 6 bekeken luchtfoto's liggen al panelen: bij ICN, Noordhoek 5 en de buren in Vries. De configurator moet vragen "liggen er al panelen?". Google kan dat misschien detecteren, maar dat is nog niet getest.
4. **Riet ziet 3DBAG niet.** Bij Hoofdweg 31 telt de schatting het rieten deel mee. Er is een vraag aan de bezoeker nodig ("is (een deel van) je dak van riet?"), of een handmatige correctie bij voorbeeldwoningen.
5. **Appartementen en bijgebouwen zijn automatisch te herkennen.**
   - Het aantal eenheden in de BAG (14 bij Prinseneiland) markeert appartementen.
   - Het gebruiksdoel ("overige gebruiksfunctie" bij 27X) markeert een garagebox.
   - Zo kan de configurator een nette eigen route tonen: "appartement: overleg met je VvE" of "dit lijkt een bijgebouw".
6. **Geschikte showcase-woningen in het werkgebied** zijn op dit moment Leeuwerikstraat 5 (Vries), Zuidveldigerweg 1 (Peest), Hoofdweg 31 (Eelde, met handmatige rietcorrectie) en Arwerd 1 (Groningen, nog visueel te controleren). Voor alle vier geldt: alleen met toestemming van de bewoners, wat Danny heeft bevestigd.

## Beperkingen van deze test

- **Panelentelling:** de telling is grof (70% van een schuin vlak, 55% van een plat dak). Zonder echte paneelindeling en schaduw is ze alleen bedoeld om te vergelijken.
- **Luchtfoto:** de PDOK-luchtfoto is geen echte orthofoto. Daken staan daardoor iets verschoven ten opzichte van de footprint (de dakranden liggen ca. 0,5–1,5 m verschoven).
- **Visuele controle:** 8 van de 14 luchtfoto's heb ik niet zelf bekeken. De beelden staan klaar in `docs/spike-3dbag/`.
- **Rekentijd:** de 10 ms CPU-limiet van Cloudflare is niet getest. Het ontleden van een 3DBAG-pand kostte hier in Python ruim onder een seconde, maar dat zegt weinig over een Worker.
