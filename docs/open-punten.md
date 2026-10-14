# Open punten

- **Voorbeeldadressen buiten het werkgebied staan in de demo** (Aalsmeer en Amsterdam), op besluit van Danny. Het risico: ICN of een bezoeker ziet een resultaat voor een plek waar ICN niet installeert. Opgelost: de interface toont een melding "buiten werkgebied ICN" (besluit Danny).
- **Welk Roden-adres is het ICN-pand:** Dwazziewegen 20 of Noordhoek 5?
- **Dakgegevens zijn niet gecontroleerd.** PDOK, 3DBAG en de ICN-site waren vanuit de ontwikkelomgeving niet bereikbaar (de proxy gaf 403). De daktypes van alle adressen moeten in Fase 1 nog worden vastgesteld.
- **Ontbrekende varianten in de adreslijst:** er zit geen adres in Overijssel tussen en geen nieuwbouw van na 2020. Danny levert deze twee adressen nog aan.
- **Monument (Nienoord 1, Leek):** op een rijksmonument zijn zonnepanelen meestal vergunningplichtig of niet toegestaan. De demo moet dat netjes tonen.
- **(Opgelost 14-10-2026) Netwerktoegang van de ontwikkelomgeving:** `installatiecomfortnederland.nl`, `api.pdok.nl`, `service.pdok.nl`, `api.3dbag.nl`, `re.jrc.ec.europa.eu` en later `solar.googleapis.com` worden geblokkeerd. Zonder deze toegang kunnen Fase 1 en de huisstijl-extractie niet echt getest worden.
- **Beheerderstoegang tot de ICN-WordPress-site** voor de embed-test in Fase 2b ontbreekt nog.
- **(Opgelost) Huisstijl:** kleuren, lettertype en logo komen uit de live site (zie docs/huisstijl.md).
- **Het prototype staat nog niet op Cloudflare Pages.** Deze omgeving heeft geen Cloudflare-token en geen netwerk naar Cloudflare. Danny kan het zelf deployen met `wrangler pages deploy prototype/dist`, of ik doe het in een omgeving waar dat wel kan. Zet er daarna een toegangscode voor.
- **Prestaties niet gemeten** op een echte telefoon (4G, fps). De schermafbeeldingen zijn met software-rendering gemaakt.
- **Goudenuur in 3D** is minder warm dan de interface. Danny moet beoordelen of dat genoeg is.
- **Adrescontrole in PDOK/BAG (14-10-2026):**
  - **Julianaplein 13, Roden bestaat niet** en is verwijderd. Dat adres kwam van een onbetrouwbare overzichtssite.
  - Dwazziewegen 20 (het ICN-pand) heeft ook 20A t/m 20D, dus het is een verzamelpand met meerdere eenheden.
  - Zuidveldigerweg 1 heeft ook een 1A.
  - Wethouder Deodatusplantsoen 27X heet in de BAG "27X-27".
  - De andere 13 adressen bestaan zoals opgegeven.
