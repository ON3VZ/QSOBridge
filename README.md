# QSObridge — QSO Log Converter & Editor

Een **100% client-side** web-tool (voor on3vz.github.io / Jekyll) die een logbestand in eender welk courant formaat inleest, het in een editeerbaar raster toont, valideert tegen een contest-/activatieprofiel, en met één knop een geldig uitvoerbestand genereert. **Alle verwerking gebeurt in de browser — bestanden verlaten het toestel niet.**

## Openen / deployen

Statische bestanden, geen build-stap. Open `index.html` rechtstreeks in een moderne browser, of plaats de map in de Jekyll-site (bv. onder `/qsobridge/`) — GitHub Pages serveert ze as-is. ES-modules vereisen serveren via http(s) (niet `file://`) voor de imports.

```
index.html            de tool
css/qsobridge.css     huisstijl (navy/amber radiopaneel)
js/                   modules (model, normalize, formats, engine, grid) — zie js/README.md
profiles/             contest-/activatieprofielen (JSON) — zie profiles/README.md
test/                 headless tests
```

## Wat werkt (Fase 2–6)

- **Inlezen:** ADIF (.adi/.adx), Cabrillo (.cbr/.log), EDI/REG1TEST, SOTA-CSV, FLE, en generieke tabellen (CSV/TSV/XLSX) met kolom-mapping. Drag-drop, bestandskiezer, klembord-plakken, meerdere bestanden samenvoegen. Encoding-detectie; fouttolerant (skip + waarschuwing). **Elke ADIF mag een ander aantal velden bevatten — alles wordt bewaard.**
- **Editeren:** gevirtualiseerd raster met **dynamische kolommen** (ontdekt uit de data — van alles wat het logprogramma exporteert tot je eigen keuze), inline bewerken, rij-selectie, filteren, sorteren, kolommen tonen/verbergen, bulk-bewerken, zoek/vervang, undo/redo, rij toevoegen/verwijderen, dupe-detectie, spring-naar-fout.
- **Valideren:** profiel-gestuurde rode-rand-markering + bandplan-consistentie, met tooltips en gezondheidspaneel.
- **Uitvoeren:** ADIF (+ POTA/WWFF/SOTA/LoTW-flavors), Cabrillo v3, EDI, SOTA-CSV (splitst per summit), JSON, en een **eigen outputformaat**. **Exportveld-selectie** (van alle velden tot een subset). Live voorbeeld, verlieswaarschuwing + sidecar, download via Blob. **Upload-wizard** (LoTW/eQSL/QRZ/Club Log/POTA/WWFF/SOTA/contest → juiste flavor).
- **Comfort:** meertalig (NL/FR/ENG) met een **geïntegreerde handleiding** (Help-knop, put uit dezelfde i18n-catalogus), **autosave + crash-herstel** (localStorage), stationsprofiel bewaren, **PWA/offline-installeerbaar** (service worker), toetsenbordsneltoetsen, en een eigen **brug-logo** (navy/amber).
- **Profielen (18 ingebouwd, direct selecteerbaar):** activatie — POTA, WWFF ("bos-shack"), SOTA, GMA, IOTA-award, vuurtorens (ARLHS); contesten — UBA DX, RSGB IOTA, CQ WW, CQ WPX, CQ WW RTTY, IARU HF, WAE, WW Digi, ARRL DX, ARRL Field Day, IARU R1 VHF; plus LoTW-flavor. Losse JSON, importeerbaar/deelbaar; auto-detectie uit `CONTEST_ID`. Wie iets exotisch nodig heeft, stelt een **eigen outputformaat** samen — maar het gros zit ingebouwd.

## Aanbevolen deploy: aparte repository

Publiceer QSObridge als **eigen GitHub-repo** met GitHub Pages → serveert op `on3vz.github.io/qsobridge/`, en link ernaar vanaf je homepage (naast de D3-logbookmap). Het meegeleverde `.nojekyll` zorgt dat Pages de bestanden **statisch** serveert (geen Jekyll-bewerking van de JS/JSON). MIT-licentie meegeleverd zodat andere verenigingen kunnen hergebruiken/bijdragen.

Alternatief (integratie in de site-repo): plaats de map onder `/qsobridge/` en sluit ze uit van Jekyll-verwerking; omslachtiger door Jekyll's bestandsafhandeling.

## Tests

```
node test/run.mjs        # 164 asserts: parsers, serializers, profielen, validatie, editor, velddetectie, export-selectie, i18n, autosave
node test/smoke-dom.mjs  # 14 asserts: headless UI (jsdom) — rendert, valideert, editeert, dynamische kolommen, taalwissel, autosave, export
```

## Privacy & offline

Geen backend, geen telemetrie, geen externe lookups. Enkel `.xlsx` gebruikt optioneel SheetJS (indien aanwezig als `window.XLSX`); al het overige is afhankelijkheidsvrij. Onderaan de app: *Gemaakt door [ON3VZ](https://on3vz.github.io) · alles blijft lokaal · gebruik op eigen risico.*

## Status

**v1 compleet** — Fase 0 t/m 8 afgewerkt. **v2 in ontwikkeling:** Fase A+B (databron-laag + landcode/DXCC-correctheid), **C** (log-checking & suggestie-engine), **D** (referentie-bestaanscontrole POTA/SOTA/WWFF), **E** (AI-assist) en **F** (meer formaten) afgewerkt.

- **Verrijk (DXCC)**: vult CQ-/ITU-zone, continent en DXCC in op basis van de call, met bron (cty.dat/AD1C); mismatches gedetecteerd. **Over de data**-paneel toont herkomst/licentie/versie en laat de volledige **cty.dat** importeren.
- **Controleer**: negen slimme controles (zone, onbekende prefix, callsign-vorm, band↔freq, locator, chronologie, datum, dupe-met-andere-exchange, dubbel serienummer) + **referentie-bestaanscontrole** (tegen een geïmporteerde POTA/SOTA/WWFF-lijst). Elk in een **suggestiepaneel** met bron, toepasbaar/negeerbaar per item of groep. Optionele **online opzoeking** (opt-in; enkel de referentie vertrekt).
- **AI-assist** (opt-in, BYOK): plak een ruwe of papieren log → gestructureerde QSO-suggesties (bewerkbaar, gemarkeerd als AI). Sleutel blijft lokaal.
- **Formaten**: **ADX-uitvoer** (ADIF-XML) en **DBF-invoer** (dBase III/IV) toegevoegd.
- **UX & toegankelijkheid (Fase H)**: **opgeslagen views** (filters + kolommen + sortering bewaren/toepassen), ARIA-rollen op het raster (`role=grid`, `aria-sort`, `aria-invalid`), aria-live status/meldingen, `/`-sneltoets voor de call-filter, responsive statusbalk, en een autosave-groottegrens tegen quota-fouten.

Kern getest met **247 logic-asserts + 36 headless DOM-smoketests**. **Fase G** (awards/statistiek) is bewust *niet* gebouwd: award-tracking hoort thuis bij LoTW/Club Log/QRZ en de bestaande D3-logbookmap, niet in de converter. De tool is daarmee **klaar om te gebruiken en te publiceren**.
