# Changelog

Alle belangrijke wijzigingen aan Singeling App worden hier bijgehouden. De nieuwste versie staat bovenaan.

## [1.2.1] - 2026-10-15

### Toegevoegd
- Kevertje in de tabbalk: laat zien bij wie je terechtkunt als er iets niet goed gaat. Nick als de app zelf raar doet, Laurens als er iets niet klopt op een pagina of als je iets mist.
- Na de rondleiding (of één keer na deze update) kies je zelf licht of donker en hoe de melding "Niet geklokt op een order" eruitziet.

### Gewijzigd
- De melding "Niet geklokt op een order" heeft nu drie standen: aan (de gewone oranje balk, standaard), subtiel of uit. Wie hem had verborgen, houdt hem verborgen.
- Updates verschijnen nu als duidelijke melding in de app, met "Nu updaten" of "Later". Downloaden en herstarten gebeuren in die melding zelf.
- Belangrijke updates krijgen een opvallendere melding en worden direct op de achtergrond klaargezet. Je kunt ze een uur uitstellen als je net met iets belangrijks bezig bent.
- De app kijkt elk uur of er een update is, in plaats van één keer per dag.
- De knoppen voor een nieuw tabblad en het taboverzicht staan nu naast de pijltjes van de tabbalk.
- Het zoomniveau begint na deze update voor iedereen één keer op 100%; daarna wordt je eigen keuze weer onthouden.

### Opgelost
- In de donkere modus werden de preview van een Moneybird-offerte en de preview van een specificatie zwart, met zwarte tekst. Die blijven nu wit.

## [1.2.0] - 2026-10-15

### Toegevoegd
- Donkere modus: aan/uit met de contrastknop in de tabbalk. De pagina's en de tabbalk kleuren mee.
- De navigatiebalk links volgt nu licht/donker: lichtgrijs in de lichte modus, donkergrijs in de donkere modus (was altijd zwart).
- Taboverzicht met een voorbeeld van elk open tabblad, en tabgroepen: sla een set tabbladen op en open ze later in één keer.
- Zoomniveau zichtbaar in de tabbalk zodra je in- of uitzoomt.
- Nieuwe rondleiding door de app, plus een korte rondleiding "Nieuw in deze versie" na een update.
- Instelling "Melding 'Niet geklokt op een order' tonen" (standaard uit). "Afwezig" en het blok "Geklokt op" blijven altijd zichtbaar.
- Instelling "Bèta-versies ontvangen" onder Updates (standaard uit): krijg nieuwe functies eerder, voordat ze voor iedereen uitkomen.

### Gewijzigd
- Vernieuwde tabbalk in Singeling-stijl: rechte tabs met een oranje streepje bij de actieve tab, goudgeel voor vastgezette tabs.
- Geen Windows-titelbalk meer: de tabbalk is de titelbalk, met eigen knoppen voor minimaliseren, maximaliseren en sluiten.
- Instellingen openen nu schermvullend, met een menu aan de linkerkant.
- Vloeiende animaties bij het wisselen van tabblad, het wisselen tussen licht en donker, en bij minimaliseren, terughalen en sluiten van de app.
- Nieuw laadscherm bij het opstarten.
- In de changelog staat de nieuwste versie nu bovenaan.
- Een losgetrokken tabblad (een tab uit de tabbalk slepen) heeft nu een eigen balk met terug, vooruit, vernieuwen en vensterknoppen. Links en knoppen in dat venster openen in dat venster zelf.

### Opgelost
- "Dashboard Klokken" in de navigatie opende niet.
- Knoppen in een losgetrokken venster openden in het hoofdvenster.

## [1.1.4] - 2026-10-14

### Gewijzigd
- Een resultaat uit de zoekbalk bovenin (bv. een ander ordernummer, een klant of een artikel) opent nu in een nieuw tabblad, met de muis én met Enter. De pagina waar je was blijft gewoon staan.

### Opgelost
- Terug gaan in een order kon het scherm in een eindeloze lus laten springen tussen twee tabbladen (zo'n 4x per seconde). De terug- en vooruitknop in de tabbalk slaan nu wissels van subtabblad binnen dezelfde pagina over, en schiet een pagina toch in zo'n lus, dan wordt die één keer automatisch herladen.

## [1.1.3] - 2026-10-14

### Gewijzigd
- "Factuur maken" en "Pakbon maken" vanuit een order openen de nieuwe factuur/pakbon nu in een eigen tabblad; de order blijft staan in het tabblad waar je was.
- Laadscherm: kleine tekstaanpassing.

### Opgelost
- Op een subtabblad van een order (bv. Kwaliteit) op "Verkooporders" klikken liet het scherm heen en weer springen tussen de subtabbladen i.p.v. terug te gaan naar de lijst. Terugknoppen en broodkruimels slaan subtabbladen en filters nu over.

### Beveiliging
- Links die een pagina "extern" wil openen gaan alleen nog naar de browser of mail-app als het een gewone web-, mail- of bellink is; andere soorten links (die bv. een programma op de pc kunnen starten) worden genegeerd.
- Een speciaal gemaakte link kon via de tabnaam code uitvoeren in de app; de tabnaam wordt nu altijd als gewone tekst getoond.
- Alleen de eigen app krijgt nog toegang tot o.a. camera, microfoon en locatie; externe pagina's (zoals inlogschermen) niet meer.

## [1.1.2] - 2026-10-09

### Gewijzigd
- Elke klik die naar een andere pagina leidt opent nu uniform een nieuw tabblad, ook als het geen gewone link is: een offerte in de lijst bij Quotations, een issuekaart, de klantnaam of een orderregel bij Verkooporders, en de rijen bij o.a. Klanten, Inkooporders, Pakbonnen, Stuklijsten, QF-offertes, Artikelen, facturen en offerteaanvragen. De lijst blijft in het oorspronkelijke tabblad staan.
- Uitzonderingen blijven in hetzelfde tabblad: terugnavigatie (terugknoppen en broodkruimels), uitloggen, klikken binnen formulieren en pop-ups (bv. "Opslaan" of "Aanmaken"), en alles wat op dezelfde pagina blijft (subtabbladen, filters, weergave wisselen).

### Opgelost
- De tabnaam werd niet bijgewerkt als een tabblad via een volledige paginalading (bv. een redirect of herladen) op een andere pagina terechtkwam.
- Spaties en andere speciale tekens stonden gecodeerd in de tabnaam (bv. "20264101800%20Rev.%200"); nu leesbaar ("20264101800 Rev. 0").

## [1.1.1] - 2026-10-05

### Opgelost
- Inloggen met een Microsoft-account gaf de foutmelding "AADSTS900561: The endpoint only accepts POST requests". De inlogstappen werden naar de standaardbrowser gestuurd, waarbij het formulier verloren ging. De volledige inlogflow (Microsoft/Supabase) loopt nu binnen de app zelf, zodat je ook echt in de app ingelogd raakt.

## [1.1.0] - 2026-10-01

### Toegevoegd
- Een tab ver genoeg onder de tabbalk uit slepen maakt er een eigen los Windows-venster van, dat je daarna net als elk ander venster naar een tweede scherm kunt verplaatsen. Ook toegevoegd aan de rondleiding.
- Instelling "Ctrl+B blokkeren" (Instellingen → Algemeen): voorkomt dat de pagina's eigen Ctrl+B-sneltoets de zijbalk in-/uitklapt. Staat de focus in een tekstveld, dan werkt Ctrl+B daar gewoon nog voor vetgedrukt.
- Duidelijk zichtbare melding (balk onder de tabbalk) zodra er een update gevonden is, naast het bolletje bij het instellingen-icoon. De knop in Instellingen wordt oranje en toont "Update beschikbaar" i.p.v. "Nu zoeken naar updates", en de gevonden versie staat er meteen bij zodra je de instellingen opent.

### Opgelost
- Terugknoppen/breadcrumbs (zoals "Verkooporders" bovenaan een order) die niet "Terug"/"Vorige" heten werden niet herkend en openden onterecht een nieuw tabblad i.p.v. terug te gaan naar de lijst.
- De eigenlijke oorzaak van meerdere terugknop-problemen: zo'n knop navigeert vaak via de native `history.back()`, niet via een link. Omdat elke link bij ons een gloednieuwe tab met een lege paginageschiedenis opent, deed `history.back()` daar altijd al niets. Dit wordt nu herkend en omgeleid naar onze eigen terugnavigatie (eerst in-pagina geschiedenis, anders terug naar de brontab).

## [1.0.1] - 2026-09-30

### Toegevoegd
- De keuze om de rondleiding te tonen (checkbox op het welkomstscherm) wordt onthouden tussen sessies.

### Gewijzigd
- Welkomstscherm: geen "Ga je akkoord?"-vraag en "Nee, afsluiten"-knop meer, alleen nog een "Start"-knop. De bugmelding ("Meld dit bij Nick") staat nu als klein voetnootje onderaan i.p.v. een prominente regel. Checkbox-tekst vereenvoudigd naar "Laat de functies van deze app zien".
- De "Controleren op updates..."-melding bij het opstarten is verwijderd; de controle blijft gewoon op de achtergrond lopen (een gevonden update toont nog steeds zijn eigen dialoog).

## [1.0.0] - 2026-09-11

### Toegevoegd
- Instelling "Alle links altijd in een nieuw tabblad openen" (in Instellingen): geldt voor alle tabs, niet alleen vastgezette; externe links blijven gewoon naar de standaardbrowser gaan.
- De app controleert nu ook elke dag automatisch op updates (naast de controle bij opstarten), voor apparaten die lang blijven aanstaan.
- Knop "Nu zoeken naar updates" in Instellingen, met het resultaat direct zichtbaar.
- Bolletje bij het instellingen-icoon zodra er een update gevonden is; herstart de app om te updaten.

### Gewijzigd
- De opstartmelding gaat niet langer over een "bètafase" (de app is v1.0), maar vraagt om bugs bij Nick te melden. Het akkoord-knopje hoeft niet meer 3 seconden af te tellen voordat je erop kan klikken.

### Opgelost
- Terugknoppen (in de tabbalk én in de pagina zelf) gingen soms naar de laatst bekeken tab i.p.v. naar de tab waar de huidige tab daadwerkelijk uit geopend was, wat tot een oneindige heen-en-weer-loop tussen twee tabs kon leiden.
- De terugknop in de tabbalk leek uitgeschakeld zodra een tab geen eigen paginageschiedenis had, ook als teruggaan naar de brontab wél mogelijk was.
- Een "Terug"/"Vorige"-link die als `<a href>` in plaats van als knop gebouwd was, werd niet als terugknop herkend en opende onterecht een nieuw tabblad.
- Interne URL-updates van een pagina (bv. een standaard geselecteerd subtabblad bij een order) openden ten onrechte een extra tabblad; alleen een echte paginaverandering doet dat nog.
- Eén klik kon in sommige gevallen twee tabbladen openen door dubbel geregistreerde paginahandlers na een tussenliggende laadstap (bv. een login-redirect).
- Een link naar een externe koppeling (bv. Moneybird) die via een pop-up-venster opende, bleef als leeg, onsluitbaar tabblad hangen en kon de hele app laten crashen bij het sluiten. De externe link gaat nu meteen naar de standaardbrowser en het lege tabblad sluit vanzelf.
- Een knop die toevallig ergens binnen een klikbare link/kaart zat (bv. het potloodje om "Extern nummer" te bewerken bij een stuklijst) kon de klik kwijtraken aan die omliggende link, waardoor het bewerkveld leeg opende in plaats van de huidige waarde te tonen.
- Het versienummer op het opstartscherm stond hardcoded en liep daardoor achter op de echte versie (titelbalk); toont nu altijd de werkelijke versie.

## [0.4.3] - 2026-09-08

### Opgelost
- Knoppen met "vorige" of "terug" ergens in een langere tekst (bv. een periodefilter "Vorige maand" bij verkoopfacturen) werden onterecht als navigatie-terugknop herkend, waardoor de klik werd genegeerd en de app terugsprong naar het vorige tabblad. Dit wordt nu alleen nog herkend als het hele knoplabel een terugknop is.

## [0.4.2] - 2026-09-08

### Toegevoegd
- Kopiëren, knippen en plakken via het rechtermuisknop-menu, zowel op pagina's als in invoervelden van de app zelf (bijv. een tabgroep hernoemen).

### Opgelost
- Het kaderlijntje rond vastgezette tabs ontbrak aan de rechterkant.

## [0.4.1] - 2026-09-07

### Toegevoegd
- Vastgezette tabs blijven nu zichtbaar aan de linkerkant van de tabbalk, ook als je door de rest scrolt (zoals gepinde tabs in een browser).
- Vastgezette tabs krijgen een lichte gouden tint, zodat meteen duidelijk is dat ze bij elkaar horen.

### Gewijzigd
- Bij het vastzetten springt een tab meteen naast de andere vastgezette tabs; bij losmaken verplaatst hij naar het begin van de losse tabs.
- Bij meerdere vastgezette tabs zijn alleen de buitenste hoeken van de groep afgerond, de tabs ertussenin zijn recht.

### Opgelost
- Bij het scrollen was door de tussenruimte naast een vastgezette tab een langsscrollende tab te zien.

## [0.4.0] - 2026-09-07

### Toegevoegd
- Instellingenmenu (moersleutel-icoon, rechtsboven in de tabbalk) met een passende achtergrond i.p.v. een kaal zwart scherm.
- Zoomen: Ctrl + scrollen op een pagina, Ctrl +/-/0 als sneltoetsen, en knoppen in het instellingenmenu.
- Starttabs: rechtsklik op een tab en kies "Openen bij opstarten"; beheerbaar (verwijderen, los vergrendelen) in het instellingenmenu.
- Tabgroepen: rechtsklik op een tab om toe te voegen aan een (nieuwe) tabgroep; in het instellingenmenu te hernoemen, aan te passen en in één keer te openen.
- Changelog-viewer in het instellingenmenu, plus een "Wat is er nieuw?"-melding met alleen de laatste wijziging bij de eerste opstart na een update.
- Knop "Rondleiding opnieuw volgen" in het instellingenmenu.
- Single-instance-lock: de app kan nu nog maar één keer tegelijk draaien, wat corrupte cache-/instellingenbestanden bij dubbel opstarten voorkomt.
- Externe links (buiten het snglng-domein) openen voortaan automatisch in de standaardbrowser van Windows i.p.v. in de app.

### Gewijzigd
- F5 en Ctrl+R verversen nu altijd de actieve tab (zoals de vernieuwen-knop), niet meer het browser-standaardgedrag.
- Rondleiding uitgebreid met de nieuwe ververs-, tabgroep- en instellingenfuncties.
- Splashscreen volledig vernieuwd met nieuwe vormgeving en laadanimatie.

### Opgelost
- Instellingenpaneel bleef onzichtbaar doordat de tabinhoud (een aparte native laag) er altijd overheen tekende.
- Bij meerdere starttabs bleef een niet-actieve tab op volledige grootte staan i.p.v. verborgen, waardoor tabs door elkaar konden renderen.

## [0.3.8] - 2026-09-03

### Opgelost
- Knoppen die via `window.open()` eerst een leeg venster openen en pas later navigeren (zoals PDF-previews die asynchroon worden opgebouwd) resulteerden in een blanco tabblad. De pop-up wordt nu als volwaardige tab overgenomen zodat de referentie in de pagina geldig blijft en de navigatie alsnog aankomt.

## [0.3.7] - 2026-09-03

### Toegevoegd
- Onboarding-rondleiding na de bèta-melding (navigeren, link delen, tabs vastzetten).
- Knop om de link van de huidige pagina te kopiëren, voor delen binnen het bedrijf.
- Tabbalk schuift automatisch mee naar de laatst geopende tab.
- Tabbladen kunnen versleept worden om de volgorde aan te passen.

### Opgelost
- Niet-vastgezette tabs navigeren nu gewoon door in zichzelf i.p.v. altijd een nieuw tabblad te openen (verhielp een tabstorm bij eerste gebruik door interne redirects).
- Venstertitel toont weer het versienummer (werd overschreven door de paginatitel).
- Een tabblad sluiten gaat nu terug naar het laatst gebruikte tabblad i.p.v. het tabblad ernaast.

### Gewijzigd
- Splashscreen: iets lichtere achtergrond.

## [0.3.5] - 2026-09-03

### Verwijderd
- Versietekst naast de navigatieknoppen in de tabbalk.

### Test
- Testrelease om de gecorrigeerde bestandsnaamgeneratie (latest.yml) te verifiëren.

## [0.3.4] - 2026-09-03

### Test
- Testrelease om de OTA-updateflow te verifiëren (dialoog gaf eerder geen vervolg na melding).

## [0.3.3] - 2026-09-03

### Toegevoegd
- Zichtbare updatevoortgang tijdens het downloaden.
- Versienummer in de bovenste tabbalk.

### Gewijzigd
- OTA-updatecontrole via GitHub Releases.

### Opgelost
- Updatefouten worden zichtbaar gemeld.

### Bekend
- De updater werkt alleen met de geïnstalleerde NSIS-versie.

## [0.3.2] - 2026-09-03

### Toegevoegd
- GitHub OTA-updater met bevestiging vóór downloaden.
- Updatecontrole na het splashscreen.
- Versienummer in de tabbalk.

### Gewijzigd
- Windows-build gebruikt een NSIS-installer.

### Opgelost
- Navigatie en tabgedrag verbeterd.
