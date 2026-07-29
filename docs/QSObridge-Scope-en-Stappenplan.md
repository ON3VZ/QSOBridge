# QSObridge — Master Scope & Stappenplan (v2)

**Vervangt** de losse roadmap uit de briefing en de fase-lijstjes in Fase 0/1. Dit is voortaan de **bron van waarheid voor scope en planning**. Fase 0 (formaatreferentie) en Fase 1 (architectuur) blijven als detaildocumenten geldig.

**Visie:** een **zo breed mogelijke, in-browser, 100% client-side** logconverter + editor die door **veel operators** bruikbaar is — van dagelijkse loggers tot contesters, VHF'ers en portable-activators (POTA/WWFF/SOTA) — in **NL/FR/ENG**, offline installeerbaar, privacyvriendelijk.

Legende: ★ = kern voor v1 · ○ = later/nice-to-have · ✗ = bewust buiten scope.

---

## 0. Cross-cutting eisen (gelden in élke fase)

Deze zijn geen aparte fase maar een lat waarlangs elke fase wordt gebouwd en afgetoetst:

1. **Privacy & GDPR ★** — logs bevatten persoonsgegevens (calls, namen, adressen, locators). Alles blijft **lokaal**; **geen telemetrie/analytics** die loginhoud lekken. De callsign→DXCC/zone-tabel wordt **offline meegeleverd** (geen externe lookups die calls lekken).
2. **Toegankelijkheid (a11y) ★** — volledig **toetsenbord-bedienbaar**, ARIA-labels, screenreader-vriendelijk, hoog-contrast-modus. Kleur is **nooit** het enige signaal (rode rand krijgt ook pictogram/tekst).
3. **Performance ★** — vlot bij **1000–3000+ QSO's**: gevirtualiseerd raster + **parsen/serializen in een Web Worker** zodat de UI niet blokkeert.
4. **Veiligheid ★** — willekeurige loginhoud wordt in het raster gerenderd → **XSS-hardening** (nooit `innerHTML` met ruwe veldwaarden; geen `eval`).
5. **Offline & robuust ★** — **PWA**, installeerbaar, werkt zonder net (veldwerk); **autosave + crash-herstel** via `localStorage`/IndexedDB.
6. **Documentatie ★** — elke module JSDoc + README; elk profiel zelf-documenterend (i18n-labels/notes); alles voedt de in-app handleiding (Fase 8).
7. **Meertaligheid ★** — alle teksten via i18n-catalogus (NL/FR/ENG), uitbreidbaar naar meer talen zonder codewijziging.
8. **Kwaliteit ★** — unit-tests per parser/serializer + **round-trip-tests** (parse→serialize→parse = gelijk) + een **testkorpus met echte logs** als vangnet.
9. **Community-uitbreidbaar ★** — profielen zijn losse JSON; gebruikers kunnen een **profiel importeren/delen** (zie Fase 5). Zo voegen landen/contest-communities hun eigen profielen toe zonder de app te forken.

---

## 1. Fasering (met GO-poort per fase)

> Werkwijze onveranderd: **één fase per keer**, eerst kort plan, dan bouw, telkens wachten op expliciete **GO**.

### Fase 0 — Inventaris & research ✅ *(afgerond)*
Formaat- & contestreferentie. Geleverd: `QSObridge-Fase0-Referentie.md`.

### Fase 1 — Architectuur & datamodel ✅ *(afgerond, bijgewerkt)*
Canoniek `Qso`/`Session`-model, normalisatie-laag, formaat-registry (twee-lagen input), JSON-profielschema, mapping-engine, i18n- & documentatie-architectuur. Geleverd: `QSObridge-Fase1-Architectuur.md`.

### Fase 2 — Input-parsers *(volgende)*
Alle input, fouttolerant (**skip + rapport met regelnr + reden, nooit crashen**), elk naar het canonieke model.

**Structurele formaten (Laag 1):**
- ★ ADIF `.adi` — incl. **slordigheids-tolerantie**: tags zonder lengte, lowercase, ontbrekende `<EOH>`, CRLF/LF-mix, `<APP_*>`- en `<USERDEF>`-velden, `:type`-suffix.
- ★ ADIF `.adx` (XML).
- ★ Cabrillo `.cbr`/`.log` — **v3 én v2 tolereren** bij input.
- ★ EDI/REG1TEST `.edi` — incl. ERROR/dupe-conventies, modecodes 1–9.
- ★ SOTA-CSV.
- ★ FLE-tekst `.txt`/`.fle`.

**Generieke tabellen (Laag 2) → kolom-mapping:**
- ★ CSV/TSV — **scheidingsteken-autodetectie** (`,`/`;`/tab), quoted velden met komma's, kopregel-detectie, **Europese decimale komma** (`14,074`), **datum-ambiguïteit** DD/MM vs MM/DD (met keuze).
- ★ XLSX/XLS (SheetJS) — tabblad-keuze → rijen → kolom-mapping.

**Overkoepelend in Fase 2:**
- ★ **Klembord-plakken** (ruwe ADIF/FLE/tabel plakken i.p.v. bestand) — papieren logs, QRZ/Excel-copy.
- ★ **Meerdere bestanden tegelijk** + **samenvoegen** tot één sessie.
- ★ **Encoding-detectie** (UTF-8/Latin-1/Windows-1252 + BOM).
- ★ **Callsign-normalisatie** (`/P`, `/M`, prefix/suffix) en **band↔freq-inferentie** als er maar één aanwezig is.
- ★ **Web Worker** voor grote bestanden.
- ★ **Round-trip-tests** + fixture-logs per formaat.
- ○ `.zip` met meerdere logs uitpakken · ○ **JSON**-input (o.a. onze eigen sidecar).

### Fase 3 — Output-serializers + headers
Geldige bestanden per doel, met **live preview** en **verlieswaarschuwing + optionele sidecar** (beslispunt 3).

- ★ ADIF-out (`.adi`) — met USERDEF-round-trip.
- ★ **ADIF-flavors als export-profielen**: POTA-ADIF, WWFF-ADIF, SOTA-ADIF, en **LoTW-klare ADIF** (correcte `MODE`/`BAND`-enums + `MY_*`-stationsvelden: `MY_GRIDSQUARE`, `MY_CQ_ZONE`, `MY_ITU_ZONE`, `MY_IOTA`, `MY_STATE`). TQSL-ondertekening zelf blijft ✗ buiten scope; UI vermeldt de TQSL-stap.
- ★ Cabrillo-out (v3) — header uit `Session` + profiel.
- ★ EDI-out — log+summary, QRB berekend, ERROR/dupe-conventies, `PBand`-string correct.
- ★ SOTA-CSV-out — **multi-file per summit**, freq-kolom, `DD/MM/YYYY`.
- ★ **CSV/XLSX-export** van het raster (eigen archief; mogelijk voeding voor je D3-logbookkaart).
- ★ **JSON-export** (canoniek model / backup / interop).
- ★ **Sidecar-export** (`<naam>.qsobridge-extras.json`) met niet-emitteerbare velden.
- ○ **ADX-output** (ADIF-XML) · ○ **upload-presets per doel** (bv. eQSL wil QTH-nickname) · ○ **printbare log-/dupe-sheet (PDF)**.

### Fase 4 — Volwaardige mini-editor *(kern)*
Het volledige tussenscherm uit §3 van de briefing: inline bewerken, filteren op elk veld, rij-selectie voor output, verwijderen/toevoegen, bulk-bewerken, zoek/vervang, undo/redo, sorteren, kolommen tonen/verbergen, rode-rand-validatie + spring-naar-fout, UTC-check, splitsen per park/summit/datum, health-paneel + dupe-detectie, stationsprofiel opslaan. **Toevoegingen:**
- ★ **Samenvoegen + kruis-dedup** over meerdere ingelezen bestanden (met merge-conflict-UI).
- ★ **Autosave + crash-herstel**.
- ★ **Kolom-mapping-UI** (voor CSV/XLSX-import, hergebruikt de engine).
- ★ **Configureerbare dupe-regel** (per profiel: call vs call+band+mode).
- ○ **Statistiek-/kaartpaneel** aansluitend op je D3-logbook · ○ **diff/vergelijk** twee logs.

### Fase 5 — Contest- én activatieprofielen (JSON)
Startset **volledig** (niets afgekapt): IARU R1 VHF (incl. QRB), UBA DX, UBA Spring, IOTA, CQ WW, CQ WPX, CQ WW RTTY, ARRL DX/SS/FD/RTTY, IARU HF, WAE + **POTA, WWFF, SOTA**. Elk profiel = verplichte velden + veld-mapping + bestandsnaam-patroon + validatie + i18n-notes. **Toevoegingen:**
- ★ **Auto-profiel-detectie** uit ADIF `CONTEST_ID` → stelt het juiste profiel voor.
- ★ **Contest-hulp**: seriële nummers **her-nummeren** (met behoud van ERROR/dupe-gaten voor EDI) + **geschatte claimed-score** per profiel.
- ★ **Profiel importeren/delen** (community-uitbreidbaar) + **schema-versionering** per profiel.
- ★ **Verrijking**: **callsign → DXCC / CQ-zone / ITU-zone / continent** via **offline prefixtabel** → vult automatisch de zones voor CQ WW/IARU. **Auto-QRB, auto band/mode, RST-defaults, tijd-interpolatie** (FLE-stijl).
- ○ **Band-plan/sub-band-validatie** (mode in juist segment) als contest-compliance-check.

### Fase 6 — Upload-wizard & bestemmingen *(nieuw, uit de gap-analyse)*
- ★ **Upload-wizard**: kies bestemming (LoTW / eQSL / QRZ / Club Log / POTA / WWFF / SOTA / contest-robot) → tool levert de **juiste flavor + bestandsnaam + enums** in één klik, met per bestemming korte instructie (incl. de TQSL-stap voor LoTW).

### Fase 7 — Layout, huisstijl & integratie
QSObridge-huisstijl (navy/amber, eigen brug-embleem), inbouwen in on3vz.github.io naast de D3-logbookmap, download-flow, **drag-and-drop**, ○ dark mode, toetsenbord-sneltoetsen, **browser-/platform-supportmatrix** (evergreen desktop + mobiel Safari/Chrome voor portable), en **testen met echte logs** (eigen ADIF + EDI + Cabrillo + POTA- en SOTA-log).

### Fase 8 — Documentatie & geïntegreerde handleiding *(laatste stap)*
Ontwikkelaarsdocs (module-README's, datamodel, profiel-hoe-schrijf-ik-er-een) + **in-app help/handleiding NL/FR/ENG** die uit de i18n-catalogus put, met veld-tooltips en per-profiel-uitleg.

---

## 1B. Dekkingsgarantie: contesten, outdoor-programma's & formaten

**Principe:** dekking is *data-gedreven*. "Alle contesten / alle outdoor-programma's" betekent niet dat we ze één voor één hardcoderen, maar dat elk als **JSON-profiel** toe te voegen is zonder codewijziging (Fase 5, met import/delen). De startset dekt de meest gebruikte; het profielsysteem dekt de rest.

**Contesten (Cabrillo/EDI, via profielen) — concrete doellijst:** CQ WW (CW/SSB), CQ WPX (CW/SSB/RTTY), CQ WW RTTY, CQ WW VHF, WAE (CW/SSB/RTTY), WW Digi, ARRL DX (CW/SSB), ARRL Sweepstakes (CW/SSB), ARRL Field Day, ARRL RTTY Roundup, ARRL VHF, ARRL 10m, ARRL 160m, IARU HF, IARU R1 VHF (EDI, REG1/2/3), RSGB IOTA, RSGB (AFS, 80m CC, Commonwealth, NFD…), Russian DX (RDXC), All Asian, Oceania, JIDX, Worked All Germany, Scandinavian (SAC), Marconi VHF, **UBA DX, UBA Spring**, PACC, en nationale contesten algemeen. → **Elke andere contest = een profiel bijzetten.**

**Outdoor-/activatieprogramma's ("outdoor shacks", ADIF + refs):** POTA, WWFF, SOTA, GMA, IOTA(-award), vuurtorens (ILLW / ARLHS), kastelen (WCA/COTA), molens (MOTA), bunkers (BOTA), silo's (SiOTA), stranden, rivieren/meren, HEMA, en de "*OTA"-familie algemeen. Allemaal ADIF met `(MY_)SIG`/`SIG_INFO` of een dedicated ref → gedekt door de **generieke `refs`-structuur** (Fase 1 §11.1) + een profiel. SOTA heeft daarnaast zijn eigen CSV. → **Elk nieuw *OTA-programma = een profiel + ref-validator.**

**Veelvoorkomende formaten:**
- **Input** ✅ (Fase 2, gebouwd): ADIF (.adi/.adx), Cabrillo (.cbr/.log), EDI/REG1TEST (.edi), SOTA-CSV, FLE (.txt/.fle); **nog:** generieke tabel (.csv/.tsv/.xlsx; DBF later) samen met Fase 4.
- **Output** (Fase 3): ADIF (+ flavors POTA/WWFF/SOTA/**LoTW-klaar**), Cabrillo, EDI, SOTA-CSV, CSV/XLSX, JSON, ADX(○), **+ eigen outputformaat** (zie hieronder).

### 1B.1 Eigen outputformaat samenstellen (nieuw)

Naast de vaste doelformaten kan de gebruiker een **eigen outputformaat definiëren** — ideaal voor een niche-robot of clubspecifiek bestand dat we niet vooraf kennen.

- Een eigen formaat = een **JSON-templatedefinitie** (net als profielen: opslaan, importeren, delen).
- Instelbaar: welke **canonieke velden** (via veldpad, bv. `refs.pota.mine`), **volgorde**, **scheidingsteken** (komma/tab/puntkomma/vaste breedte/eigen), **quoting**, **kopregel** (aan/uit, eigen labels, i18n), **record-template** met placeholders, optioneel **bestandshoofd/-voet**, **regeleinde**, **bestandsnaam-patroon** en **encoding**.
- Uitgevoerd door één generieke **template-serializer** (`formats/custom.js`) die de definitie leest. Dekt elk CSV-achtig of eenvoudig tekstformaat.
- **Grens:** geen willekeurige binaire formaten (blijven ✗).
- **Waarde:** een club/community kan een outputtemplate publiceren zonder codewijziging.
- **Landing:** template-engine + definitieformaat in **Fase 3**; de visuele *bouw-UI* om zo'n template samen te stellen in **Fase 4/5**.

---

## 2. Bewust buiten scope (✗)

- **TQSL-ondertekening** (`.tq8`) — een client-side webtool mag/kan je privésleutel niet veilig hanteren; we leveren wél LoTW-klare ADIF.
- **Rechtstreeks ophalen/uploaden bij QRZ/LoTW/Club Log** — CORS + privacy + auth; wij leveren het bestand, jij uploadt.
- **DAT / BIN** (N6TR/CT) ✗ — programma-specifieke, ongedocumenteerde binaire structuren; extern converteren (LogConv). Bespoke parsers voor bijna-dode formaten = veel werk, weinig baat.
- **STF** ✗ — verouderd, verwaarloosbaar gebruik.
- **DBF** ○ *(later, gratis)* — een `.dbf` is een binaire tabel; zodra de generieke tabel-import met kolom-mapping bestaat (Fase 4), kan DBF via net dezelfde weg (rijen → kolom-mapping). Niet in v1, maar architecturaal al voorzien.
- **OCR van foto-log** ○ *(later, via AI-assist)* — client-side OCR (Tesseract.js) is een zware download en op handgeschreven logs onbetrouwbaar; de winst zit in AI-nabewerking. De `AssistProvider`-seam is gereserveerd. Voor v1 dekken **klembord-plakken** + **handmatige rij-invoer** de papieren-log-workflow.
- **Realtime rig-control / live loggen** ✗ — dit is een converter/editor, geen contest-logger.

> **Bandplan-consistentiecheck** (freq ↔ band): ✅ **toegevoegd** in de normalisatie-laag (`checkBandFreq`, Fase 2), wordt in **Fase 4** in het raster én bij inline-editeren aangeroepen. De verdere **sub-band/mode-validatie** (mode in het juiste bandsegment) blijft ○.

---

## 3. Tweede-ronde gap-analyse — nog gesignaleerd

Na het inwerken van alles hierboven vond ik nog deze punten. Ik heb de meeste al ingewerkt (aangeduid met de fase); de **open vragen** onderaan vragen je knoop.

**Al ingewerkt in bovenstaand plan:**
- Privacy/GDPR, a11y, performance (Web Workers), XSS-hardening, PWA/offline, autosave → **Cross-cutting §0**.
- Encoding-detectie, klembord, multi-file/samenvoegen, CSV-intelligentie (decimale komma, datum-ambiguïteit), callsign-normalisatie → **Fase 2**.
- LoTW-klare ADIF + flavors, CSV/XLSX/JSON-export, sidecar → **Fase 3**.
- Kruis-dedup + merge-conflict-UI, configureerbare dupe-regel → **Fase 4**.
- Callsign→zone-verrijking (offline), auto-profiel-detectie, contest-hulp, profiel-import, schema-versionering → **Fase 5**.
- Upload-wizard → **Fase 6**.
- Drag-drop, supportmatrix, dark mode, sneltoetsen → **Fase 7**.

**Nieuw gesignaleerd — nu OPGENOMEN in scope (akkoord ON3VZ):**
1. ✅ **Andere award-/activatieprogramma's als profielen** — GMA, vuurtorens (ILLW/ARLHS), IOTA-**award**, special-event stations → **Fase 5** (profielen). Mogelijk gemaakt door de **generieke `refs`-structuur** in Fase 1 §11.1 — een programma toevoegen = profiel + ref-validator, geen codewijziging.
2. ✅ **Bredere contestregio's** — ARRL VHF (grid-Cabrillo), EDI REG2/REG3 naast REG1 → **Fase 5** + **Fase 1 §11.5** (EDI regio-tolerant, enums uit profiel; geen nieuwe parsers).
3. ✅ **Tijdzone/DST-instelling** → **Fase 1 §11.2** (`Session.timezone` + actieve lokale→UTC-omzetting) + UI-instelling in **Fase 2/4**.
4. ✅ **Strenge locator-/referentievalidatie** → **Fase 1 §11.3** (gedeelde `validators.js`: Maidenhead/IOTA/POTA/SOTA/WWFF/GMA/ARLHS/callsign), toegepast in **Fase 4/5**.
5. ✅ **"Deel dit profiel"-export** → **Fase 5** + **Fase 1 §11.6** (profiel = zelfbeschrijvende JSON met `schemaVersion`/`meta`, import/export-pad).
6. ✅ **Open licentie (MIT)** → **cross-cutting §0 / repo** + **Fase 1 §11.8** (`LICENSE`-bestand; datatabellen met eigen bronvermelding).

> Deze zes zijn verwerkt in de fasedocumenten. Fase 1 kreeg hiervoor een uitbreidingssectie **§11**; de rest landt in de betrokken fasen hierboven.

---

*Scope compleet en vastgelegd. Wacht op GO voor Fase 2 (Input-parsers).*
