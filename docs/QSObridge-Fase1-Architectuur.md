# QSObridge — Fase 1: Architectuur & Datamodel

**Status:** Fase 1 (ontwerp) — bouwt voort op de Fase 0-referentie. Nog geen code; dit document legt de contracten vast die Fase 2–7 implementeren.
**Cross-cutting eis (vanaf nu):** *alles gedocumenteerd.* Elke module krijgt inline-documentatie (JSDoc) + een korte module-README; elk profiel is zelf-documenterend (i18n-labels in het profielbestand); alle gebruikersteksten leven in de vertaalcatalogus (NL/FR/ENG) die ook de **in-app handleiding** (Fase 7) voedt.

---

## 1. Ontwerpprincipes

1. **100% client-side.** Geen backend. Parsing/validatie/conversie in de browser; bestanden blijven in-memory en verlaten het toestel niet.
2. **Canoniek datamodel als spil.** Elk inputformaat → één genormaliseerd intern model → elk outputformaat. Zo is het **"any → any"** i.p.v. N×N losse converters.
3. **Data, geen code, voor profielen.** Contesten/activaties zijn JSON-bestanden. Een nieuwe contest toevoegen = een bestand bijzetten, geen code wijzigen.
4. **Regel-gebaseerd, geen AI (v1).** De mapping-/suggestie-engine is deterministisch. Eén nette *AI-assist*-uitbreidpunt (interface) blijft leeg in v1.
5. **Niets gaat stil verloren.** Onbekende velden worden bewaard (`extras`) en waar mogelijk teruggeschreven; verlies wordt altijd zichtbaar gewaarschuwd.
6. **Toegankelijk & meertalig.** Kleur is nooit het enige signaal; alle teksten via i18n (NL/FR/ENG).
7. **Licht.** Vanilla JS-modules (ES modules). Geen zware frameworks. Alleen kleine, gerichte libs waar nodig (bv. een virtualisatie-helper voor het raster).

---

## 2. Canoniek datamodel

Twee objecten: **`Qso`** (per contact) en **`Session`** (stations-/inzendingsmetadata, geldt voor de hele log). Interne eenheden zijn altijd canoniek: **frequentie in MHz**, **tijd als UTC ISO-8601**, **mode canoniek** (ADIF-stijl). Serializers rekenen om naar het doelformaat.

### 2.1 `Qso`

```jsonc
{
  "id": "uuid",                 // interne sleutel (raster, undo/redo, selectie)
  "call": "ON4XYZ",             // tegenstation
  "datetime": "2026-07-26T14:03:00Z", // ALTIJD UTC, ISO-8601
  "band": "20m",                // canonieke bandnaam (afgeleid of expliciet)
  "freqMHz": 14.074,            // canoniek in MHz (mag null zijn als enkel band bekend)
  "mode": "FT8",               // canonieke ADIF-mode
  "submode": null,
  "rstSent": "599",
  "rstRcvd": "599",

  // Exchange — gestructureerd bewaard, niet als één string:
  "serialSent": 1,              // integer (serializer zero-padt waar nodig)
  "serialRcvd": 23,
  "exchangeSent": {},           // vrije key-values, bv. {"zone":"27","section":"OV"}
  "exchangeRcvd": {},

  // Locatie / award-referenties (canoniek, los van formaat):
  "gridSquare": "JO20",         // tegenstation-locator
  "cqZone": 27, "ituZone": 37,
  "state": null, "province": null,
  "iota": null,                 // "EU-005"
  "refs": {                     // award-/activiteits-referenties, canoniek & UITBREIDBAAR
    // Keyed op programma-id. Elk programma = { mine, worked }.
    // Nieuw programma (GMA, ARLHS/ILLW, special event…) = extra sleutel, GEEN modelwijziging.
    // "pota":  { "mine": "ON-0001", "worked": "ON-0008" },
    // "sota":  { "mine": "ON/ON-027", "worked": null },
    // "wwff":  { "mine": "ONFF-0001", "worked": null },
    // "gma":   { "mine": null, "worked": null },
    // "arlhs": { "mine": null, "worked": null }
  },

  // Afgeleide waarden:
  "qrbKm": null,                // berekend uit myGrid ↔ gridSquare (VHF/EDI)
  "points": null,
  "isDupe": false,

  // Beheer:
  "selected": true,            // gaat dit QSO mee in de output?
  "source": "adif",           // herkomst-formaat (round-trip / provenance)
  "extras": {}                 // ONBEKENDE/niet-gemapte velden — 1:1 bewaard
}
```

### 2.2 `Session` (stations- & inzendingsmetadata)

```jsonc
{
  "stationCall": "ON3VZ",
  "operator": "ON3VZ",
  "ownerCall": null,

  // Eigen locatie/zones — voeden LoTW MY_*-velden én EDI-header én profielen:
  "myGrid": "JO20AB",
  "myCqZone": 27, "myItuZone": 27,
  "myIota": null, "myState": null,
  "myProvince": "OV",           // UBA DX (2-ltr)
  "mySection": null,            // UBA Spring (3-ltr)
  "timezone": "UTC",            // operator-tz voor lokale→UTC-omzetting (IANA, bv. "Europe/Brussels")

  // Contest-/inzendingsheader (Cabrillo/EDI):
  "contestId": null,            // profiel-afhankelijk
  "categories": {               // Cabrillo CATEGORY-* / EDI PSect
    "operator": null, "band": null, "mode": null,
    "power": null, "assisted": null, "transmitter": null,
    "time": null, "overlay": null
  },
  "claimedScore": null,
  "club": null, "soapbox": null,

  // Adres/contact (Cabrillo/EDI-R-velden):
  "name": null, "address": [], "email": null,

  // Stationsuitrusting (EDI S-velden):
  "rig": { "tx": null, "power": null, "rx": null, "antenna": null, "antH": null },

  "extras": {}                 // onbekende header-velden bewaren
}
```

> **Stationsprofiel opslaan** (Fase 4): `Session` (zonder de QSO's) is precies wat we in `localStorage` bewaren zodat ON3VZ niet telkens alles herintikt.

---

## 3. Normalisatie-laag (`normalize/`)

Eén centrale plek voor alle omzettingen. Parsers/serializers roepen deze aan; ze bevatten zelf **geen** conversielogica.

### 3.1 Band ↔ frequentie (`bandplan.js`)

Bidirectioneel. `freqToBand(MHz)` zoekt in ranges; `bandToRepFreq(band)` geeft een representatieve frequentie (voor formaten die freq eisen maar we enkel band hebben).

| Band | Onder (MHz) | Boven (MHz) | Rep. |
|---|---|---|---|
| 160m | 1.8 | 2.0 | 1.83 |
| 80m | 3.5 | 4.0 | 3.573 |
| 40m | 7.0 | 7.3 | 7.074 |
| 30m | 10.1 | 10.15 | 10.136 |
| 20m | 14.0 | 14.35 | 14.074 |
| 17m | 18.068 | 18.168 | 18.100 |
| 15m | 21.0 | 21.45 | 21.074 |
| 12m | 24.89 | 24.99 | 24.915 |
| 10m | 28.0 | 29.7 | 28.074 |
| 6m | 50 | 54 | 50.313 |
| 2m | 144 | 148 | 144.174 |
| 70cm | 430 | 440 | 432.174 |
| … | … | … | … |

- **Cabrillo** wil freq in **kHz** (of bandgetal `50`/`144`) → `MHz*1000`.
- **SOTA-CSV** wil freq als `14.074MHz`-string.
- **EDI** wil de band als header-string `50 MHz`/`144 MHz`.

### 3.2 Mode-mapping (`modes.js`) — uitbreidbaar, met doorlaat

Eén tabel canoniek↔alle formaten. Onbekende ADIF-modes **niet blokkeren** maar doorlaten (best-effort mapping op categorie).

| Canoniek (ADIF) | Cabrillo | EDI (1–9) | Categorie |
|---|---|---|---|
| CW | CW | 2 | CW |
| SSB (USB/LSB) | PH | 1 | Phone |
| AM | PH | 5 | Phone |
| FM | FM | 6 | Phone |
| RTTY | RY | 7 | Digi |
| FT8/FT4/PSK/MFSK/… | DG | — | Digi |
| SSTV | — | 8 | Beeld |
| ATV | — | 9 | Beeld |

> EDI kent gemengde TX/RX-codes (3=SSB/CW, 4=CW/SSB). De engine kiest de symmetrische code tenzij expliciet gemengd.

### 3.3 Datum/tijd (`datetime.js`)

Canoniek = **UTC ISO-8601**. Per formaat parse/format:

| Formaat | Datum | Tijd |
|---|---|---|
| ADIF | `QSO_DATE` = `YYYYMMDD` | `TIME_ON` = `HHMMSS`/`HHMM` |
| Cabrillo | `YYYY-MM-DD` | `HHMM` |
| EDI | `YYMMDD` | `HHMM` |
| SOTA-CSV | `DD/MM/YYYY` (slashes!) | `HHMM` of `HH:MM` |

- **Lokale→UTC-omzetting (actief, niet enkel detectie):** met `Session.timezone` (IANA-zone) zet de laag lokaal gelogde tijden **daadwerkelijk om naar UTC**, DST-bewust (via `Intl`/`Temporal`-achtige logica). De gebruiker kan per import aangeven "deze tijden zijn lokaal in zone X".
- **UTC-consistentiecheck** (Fase 4-hook): detecteer vermoedelijke lokale tijd (bv. een venster dat niet bij band/propagatie past, of een expliciet `TIME_OFF`/tz-veld), stel omzetting voor en waarschuw. LoTW weigert bij klok-mismatch.

### 3.6 Referentie-/locatorvalidatie (`validators.js`)

Herbruikbare vorm-validators, aangeroepen door profielen én door QRB/enrichment:
- **Maidenhead-locator** (4/6/8 karakters) — ook nodig voor QRB.
- **IOTA-ref** `AA-nnn`. **POTA** `XX-nnnnn`. **SOTA** `AA/NN-nnn`. **WWFF** `XXFF-nnnn`. **GMA/ARLHS** volgens hun patroon.
- **Callsign** (met `/P`, `/M`, prefix/suffix).
Elke validator geeft geldig/ongeldig + reden → voedt de rode-rand-markering en het skip-rapport.

### 3.4 QRB (`qrb.js`)

`gridToLatLon(locator)` → great-circle-afstand in km tussen `myGrid` en `gridSquare`. Voedt EDI-scoring (`QSO-Points` en `CODXC`). Ondersteunt 4/6-karakter locators.

### 3.5 Formatteer-helpers

Seriële nummers zero-padden (EDI: 3 cijfers), RST-defaults (`599`/`59`), IOTA-ref `aa-nnn` of `------`.

---

## 4. Formaat-registry (`formats/`)

Elk formaat is een module met een uniform contract. De UI en de engine kennen alleen dit contract, niet de interne details.

```js
/** @typedef {Object} FormatModule */
export default {
  id: "adif",
  label: { nl: "ADIF", fr: "ADIF", en: "ADIF" },
  extensions: [".adi", ".adx"],
  capabilities: {
    canParse: true,
    canSerialize: true,
    multiFileOutput: false,     // SOTA/POTA kunnen splitsen
    headerIntegrated: true,     // Cabrillo/EDI dragen summary in header
    preservesUnknownFields: true // ADIF (USERDEF) wel; Cabrillo/EDI niet
  },
  detect(text) { /* → boolean/confidence */ },
  parse(text) { /* → { qsos: Qso[], session: Session, warnings: [] } */ },
  serialize({ qsos, session, profile }) { /* → { files: [{name, content}], warnings: [] } */ }
};
```

### 4.1 Twee-lagen input-model (beslissing: brede input)

De tool leest **eender welk courant type** in. Cruciaal inzicht: `.csv`, `.txt`, `.xlsx`, `.log` zijn **containers**, geen logformaten. Eén `.log` is meestal Cabrillo; een `.txt` kan FLE, ADIF of Cabrillo zijn; een `.csv`/`.xlsx` is een willekeurige tabel. Daarom **detecteren we op inhoud, niet op extensie**, en splitsen we de input in twee lagen — zo vermijden we een wildgroei aan bespoke parsers.

**Laag 1 — Structurele logformaten** (parsen rechtstreeks naar het model):

| Formaat | Herkend aan | parse (in) | serialize (out) | Opmerking |
|---|---|---|---|---|
| ADIF `.adi` | `<EOH>`/`<EOR>`-tags | ✅ | ✅ | primaire input; USERDEF-round-trip |
| ADIF `.adx` | `<ADX>`/XML-root | ✅ | ⛔ v1 (ADI-out volstaat) | zelfde datamodel |
| Cabrillo `.cbr`/`.log` | `START-OF-LOG:` | ✅ | ✅ | header uit `Session` + `profile` |
| EDI/REG1TEST `.edi` | `[REG1TEST` | ✅ | ✅ | log+summary; QRB |
| SOTA-CSV | `^V2,`-prefix | ✅ | ✅ | multi-file per summit |
| FLE-tekst `.txt`/`.fle` | FLE-keywords (`mycall`…) | ✅ | ⛔ | input-only |

**Laag 2 — Generieke tabellen** (parsen naar rijen → **kolom-mapping-stap** → model):

| Container | Parser (client-side) | Flow |
|---|---|---|
| CSV / TSV `.csv`/`.tsv` | eigen CSV-parser (scheidingsteken-detectie) | rijen + kopregel → kolom-mapping |
| Excel `.xlsx`/`.xls` | SheetJS (`xlsx`, WASM/JS, volledig in-browser) | eerste/gekozen tabblad → rijen → kolom-mapping |

De **kolom-mapping-stap** hergebruikt de mapping-engine (§6): de tool raadt op basis van de kopregel welke kolom bij welk canoniek veld hoort (via de alias-tabel), toont dat als **suggestie**, en de gebruiker corrigeert waar nodig. Zo wordt "lees eender welk formaat in" (kernfunctie #1) waargemaakt zonder N bespoke parsers: elke onbekende tabel wordt hanteerbaar via één mapping-UI.

> **Detectie-volgorde:** `detect()` van elke Laag-1-module draait eerst op de bestandsinhoud (extensie is enkel een hint/tiebreaker). Herkent geen enkele module het → val terug op de generieke tabel-importer (bij `.csv`/`.xlsx`/`.tsv`) of toon een keuzedialoog. De gebruiker kan de gok altijd overrulen.

> **Afhankelijkheid:** enkel `.xlsx` vergt een externe lib (SheetJS/`xlsx`) — nog steeds 100% client-side, geen upload. Alle overige parsers zijn eigen, afhankelijkheidsvrije JS-modules.

---

## 5. Profiel-schema (JSON) — `profiles/`

Contest- én activatieprofielen delen één schema. Dit is de motor achter "velden vast maar uitbreidbaar", de rode-rand-validatie en de bestandsnaam-generatie.

```jsonc
{
  "$schema": "qsobridge-profile/v1",
  "id": "uba-dx",
  "label": { "nl": "UBA DX", "fr": "UBA DX", "en": "UBA DX" },
  "targetFormat": "cabrillo",
  "contestTag": "UBA-DX-CW",          // per mode-variant apart profiel of variabele
  "modes": ["CW", "SSB"],

  "header": {                          // verplichte + optionele headervelden
    "required": ["stationCall", "categories.operator", "myProvince"],
    "optional": ["club", "soapbox", "name", "address"]
  },

  "exchange": {                        // asymmetrisch mogelijk (per stationstype)
    "sent": {
      "ON":  ["rstSent", "serialSent", "myProvince"],
      "DX":  ["rstSent", "serialSent"]
    },
    "rcvd": {
      "ON":  ["rstRcvd", "serialRcvd", "exchangeRcvd.province"],
      "DX":  ["rstRcvd", "serialRcvd"]
    },
    "stationType": { "field": "callIsON", "values": ["ON", "DX"] }
  },

  "requiredQsoFields": ["call", "datetime", "band", "mode", "rstSent", "rstRcvd", "serialSent"],
  "optionalQsoFields": ["freqMHz", "txId"],

  "fieldMappings": [                   // aliassen + concat/split → mapping-engine
    { "canonical": "serialRcvd", "aliases": ["SRX", "serial", "nr", "rcvd_serial"] },
    { "canonical": "exchangeRcvd.province", "aliases": ["SRX_STRING", "prov", "state"] }
  ],

  "validation": {
    "myProvince": { "enum": ["AN","BW","HT","LB","LG","NM","LU","OV","WV","VB","BR"] },
    "serialSent": { "type": "int", "min": 1 }
  },

  "filenamePattern": "{stationCall}.CBR",
  "notes": {
    "nl": "ON-stations: RST + volgnummer + provincie (2 ltr). DX: RST + volgnummer.",
    "fr": "Stations ON : RST + numéro + province (2 lettres). DX : RST + numéro.",
    "en": "ON stations: RST + serial + province (2-letter). DX: RST + serial."
  }
}
```

**Activatievoorbeeld (POTA) — let op de legacy-mapping uit Fase 0:**

```jsonc
{
  "id": "pota", "label": { "nl": "POTA", "fr": "POTA", "en": "POTA" },
  "targetFormat": "adif",
  "requiredQsoFields": ["call", "datetime", "mode", "band"],
  "header": { "required": ["stationCall", "myPotaRef"], "optional": ["operator"] },
  "fieldMappings": [
    { "canonical": "myPotaRef", "aliases": ["MY_POTA_REF", "MY_SIG_INFO", "park"] },
    { "canonical": "refs.potaRcvd", "aliases": ["POTA_REF", "SIG_INFO"] }
  ],
  "emit": {                            // pota.app verwacht nog LEGACY-velden:
    "MY_SIG": "POTA", "MY_SIG_INFO": "{myPotaRef}",
    "SIG": "POTA", "SIG_INFO": "{refs.potaRcvd}"
  },
  "validation": { "myPotaRef": { "pattern": "^[A-Z0-9]{1,3}-\\d{4,5}$" } },
  "filenamePattern": "{stationCall}@{myPotaRef}-{YYYYMMDD}.adi",
  "notes": {
    "nl": "ADIF. pota.app leest nog de legacy SIG/SIG_INFO-velden i.p.v. MY_POTA_REF.",
    "fr": "ADIF. pota.app lit encore les champs legacy SIG/SIG_INFO.",
    "en": "ADIF. pota.app still reads legacy SIG/SIG_INFO instead of MY_POTA_REF."
  }
}
```

> Startset profielen (Fase 5, sluit aan bij §8-briefing): **IARU R1 VHF, UBA DX, IOTA** + **POTA, WWFF, SOTA**.

---

## 6. Mapping- & suggestie-engine (`engine/`)

Gegeven het doelprofiel weet de engine welke velden nodig zijn en **doorzoekt automatisch de input**.

**Stappen:**
1. **Aliasresolutie** — voor elk verplicht profielveld: zoek in de al-geparste `Qso`/`Session` + in `extras` naar het canonieke veld of één van de `aliases`.
2. **Concat/split** — regels om samen te voegen (serieel + zone → één exchange) of te ontleden (samengesteld `SRX_STRING` → serieel + sectie). Transformregels staan in het profiel of in een gedeelde transformbibliotheek.
3. **Classificatie per veld:**
   - **Gevonden & geldig** → ingevuld, neutraal.
   - **Afgeleid/geraden** → ingevuld, **gemarkeerd als suggestie** (eigen visuele stijl + tooltip, ≠ definitief).
   - **Ontbrekend/ongeldig & verplicht** → **rode rand** + pictogram + tooltip (kleur nooit alleen).
4. **Statusaggregatie** → aantallen voor de statusbalk (ontbrekend, dupes, geselecteerd).

**AI-assist uitbreidpunt (stub, leeg in v1):**

```js
/** @interface AssistProvider — Fase-later inplugbaar (BYOK of serverless proxy) */
export const assist = {
  enabled: false,
  async suggestFields(rawText, targetProfile) { return []; } // v1: no-op
};
```

Zo kan optie (a) BYOK of (b) een serverless proxy later worden ingeplugd zonder de deterministische kern te herbouwen.

---

## 7. i18n-architectuur (`i18n/`) — voedt óók de handleiding

Alle gebruikersteksten (veldlabels, validatiemeldingen, knoppen, help/handleiding) leven in vertaalcatalogi `nl.json` / `fr.json` / `en.json`, aangesproken via een sleutel: `t("validation.province.required")`. Profielen dragen hun eigen labels/notes al in de drie talen.

Dit is bewust zo ontworpen omdat de **geïntegreerde gebruikershandleiding (Fase 7)** uit dezelfde catalogus put: elk help-onderwerp is een i18n-sleutel, zodat handleiding en interface nooit uit elkaar lopen en alle drie de talen automatisch gedekt zijn.

---

## 8. Documentatie-architectuur (cross-cutting eis)

| Laag | Hoe gedocumenteerd |
|---|---|
| Code | JSDoc op elke publieke functie/typedef; `@example` waar nuttig |
| Module | Korte `README.md` per map (`formats/`, `normalize/`, `engine/`…) met doel + contract |
| Profielen | Zelf-documenterend: `label` + `notes` (NL/FR/ENG) in elk profielbestand |
| Datamodel | Dit document = de bron van waarheid voor `Qso`/`Session` |
| Gebruiker | i18n-catalogus → in-app help/handleiding (Fase 7) |
| Formaten/profielen | Fase 0-referentie blijft de externe spec-referentie |

---

## 9. Voorgestelde repo-structuur (binnen de Jekyll-site)

```
/qsobridge/
  index.html                 # de tool (nieuwe Jekyll-pagina, naast de D3-logbookmap)
  css/                       # QSObridge-huisstijl (navy/amber) — Fase 6
  js/
    main.js                  # bootstrap / UI-orkestratie
    model/        (Qso, Session typedefs + fabrieks-/kloonfuncties voor undo)
    normalize/    (bandplan, modes, datetime, qrb, format-helpers)
    formats/      (adif, cabrillo, edi, sota, fle + tabular[csv/tsv/xlsx] — elk 1 module + README)
    engine/       (mapping, kolom-mapping, suggesties, validatie, dupe-detectie, sidecar, assist-stub)
    grid/         (raster: inline-edit, filter, sort, virtualisatie — Fase 4)
    i18n/         (nl.json, fr.json, en.json + t())
  profiles/       (uba-dx.json, iota.json, iaru-r1-vhf.json, pota.json, wwff.json, sota.json)
  docs/           (module-README's + ontwikkelaarsdocs — Fase 7)
```

---

## 10. Vastgelegde beslissingen (door ON3VZ)

1. **Brede input (beslispunt 1+2):** naast `.adi` ook `.adx`, FLE-tekst, en de generieke containers `.csv`/`.tsv`/`.xlsx`/`.txt`/`.log` en andere courante types — via het **twee-lagen-model** van §4.1 (structurele formaten + generieke tabellen met kolom-mapping). Detectie op inhoud, niet op extensie.
2. **Onbekende velden bij export naar Cabrillo/EDI/SOTA (beslispunt 3): BEIDE.** Toon altijd een **verlieswaarschuwing** *en* bied een **optionele sidecar** aan (een begeleidend bestand — bv. `<naam>.qsobridge-extras.json` of een aanvullende ADIF — met de niet-emitteerbare velden), zodat niets stil verloren gaat en de round-trip herstelbaar blijft.
3. **Fouttolerantie parsers (beslispunt 4): skip + rapport, nooit crashen.** Elke parser retourneert `warnings[]` met **regelnummer + reden**; een slechte regel wordt overgeslagen maar de rest van de import loopt door. Het skip-rapport is zichtbaar in de UI (statusbalk/health-paneel).

> Deze drie beslissingen zijn verwerkt in §4 (registry/capabilities), §6 (mapping-engine voedt óók de kolom-mapping) en de serializer-eisen voor Fase 3 (sidecar + verlieswaarschuwing).

---

## 11. Uitbreidingen van Fase 1 n.a.v. de verbrede scope

Deze verfijningen zijn nodig omdat de scope verbreedde (extra programma's, regio's, tz, strenge validatie, profieldelen, open licentie). Ze *verfijnen* de secties hierboven — het kernontwerp blijft overeind.

**11.1 Generieke activiteits-referenties (§2.1).** `refs` is nu een **keyed structuur** (`{ programma: { mine, worked } }`). Gevolg: **GMA, vuurtorens (ILLW/ARLHS), IOTA-award, special events** = een profiel + een ref-validator, **zonder modelwijziging**. De POTA/SOTA/WWFF-profielen mappen naar deze structuur en emitteren de juiste (legacy) ADIF-velden.

**11.2 Tijdzone-omzetting (§2.2 + §3.3).** `Session.timezone` + actieve, DST-bewuste **lokale→UTC**-omzetting in de datetime-laag.

**11.3 Gedeelde validators (§3.6).** Eén `validators.js` voor Maidenhead/IOTA/POTA/SOTA/WWFF/GMA/ARLHS/callsign, hergebruikt door profielen, QRB en enrichment. Maakt "strenge referentievalidatie" overal consistent.

**11.4 Enrichment-module + offline data (`enrich/`, `data/`).** `callsignToDxcc(call)` via een **meegeleverde offline prefixtabel** (DXCC/CQ-zone/ITU-zone/continent). Vult `cqZone`/`ituZone`/DXCC/continent in het canonieke model — **geen externe lookup** (privacy). Data als versioneerbaar asset onder `data/`.

**11.5 Formaat-registry & input-pipeline (§4).**
- **Input-pipeline expliciet:** `File/Blob/klembord → decode(encoding-detectie) → detect(inhoud) → parse()`. Encoding-detectie zit vóór de parser (parsers werken op tekst).
- **Worker-compatibel contract:** `parse()`/`serialize()` zijn **pure functies** (serialiseerbare in/out, geen DOM) zodat ze in een **Web Worker** kunnen draaien.
- **EDI regio-tolerant:** `detect()` aanvaardt `REG1TEST`/`REG2TEST`/`REG3TEST`; band-/sectie-enums komen **uit het profiel**, niet hardcoded → **ARRL VHF (grid-Cabrillo)** en **EDI REG2/REG3** zijn profiel-/configkwesties, geen nieuwe parsers.

**11.6 Profielschema-toevoegingen (§5).** Elk profiel krijgt:
```jsonc
"schemaVersion": "1.0",        // voor migratie/compat bij delen
"meta": { "author": "ON3VZ", "source": "UBA", "updated": "2026-07-27" }
```
Plus een **import/export-pad** ("Deel dit profiel"): een profiel is volledig zelfbeschrijvende JSON (labels/notes/validators-verwijzingen) → een operator kan het exporteren en iemand anders importeert het en heeft de contest meteen.

**11.7 Persistentie & PWA (§ cross-cutting).** Autosave van `Session` + `Qso[]` + **undo-historiek** in IndexedDB; PWA/service-worker voor offline gebruik en crash-herstel.

**11.8 Licentie (repo).** Tool onder **MIT** (`LICENSE`-bestand) zodat andere verenigingen mogen hergebruiken/bijdragen. Geen architectuurimpact; wel een expliciete repo-afspraak. De **offline datatabellen** (prefix/DXCC) krijgen hun eigen bronvermelding/licentie.

---

*Einde Fase 1 (bijgewerkt, incl. §11). Wacht op GO voor Fase 2 (Input-parsers).*
