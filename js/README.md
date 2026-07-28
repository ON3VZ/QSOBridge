# QSObridge — `js/` (Fase 2 input + Fase 3 output)

Vanilla ES-modules, geen build-stap, geen afhankelijkheden (behalve later SheetJS voor `.xlsx`). Alle parse-/serialize-functies zijn **puur** (tekst/objecten in → objecten/tekst uit) en dus **Web-Worker-compatibel**.

## Modules

| Map | Bestand | Rol |
|---|---|---|
| `model/` | `qso.js` | Canoniek `Qso` + `makeQso()`/`cloneQso()` |
| | `session.js` | `Session` (stations-/inzendingsmetadata) + `makeSession()` |
| `normalize/` | `bandplan.js` | band ↔ frequentie + `checkBandFreq()` (bandplan-consistentiecheck) |
| | `modes.js` | mode-mapping canoniek ↔ Cabrillo ↔ EDI (uitbreidbaar) |
| | `datetime.js` | datum/tijd per formaat ↔ UTC ISO; lokale→UTC (DST-bewust) |
| | `qrb.js` | Maidenhead → lat/lon → great-circle km |
| | `validators.js` | vorm-validators + call-normalisatie |
| `formats/` | `adif.js` | ADIF parse **+ serialize** (USERDEF/onbekend round-trip) |
| | `cabrillo.js` | Cabrillo parse **+ serialize** (v2/v3, X-QSO) |
| | `edi.js` | EDI/REG1TEST parse **+ serialize** (REG1/2/3, ERROR/dupe, QRB) |
| | `sota.js` | SOTA-CSV parse **+ serialize** (splitsen per summit) |
| | `fle.js` | FLE-tekst parse (stateful band/mode/datum, verkorte tijden) |
| | `json.js` | canoniek model als JSON (backup/interop, parse+serialize) |
| | `custom.js` | **eigen outputformaat** (template-serializer, JSON-gedreven) |
| | `tabular.js` | generieke tabel-import (CSV/TSV/XLSX → rijen → kolom-mapping) |
| | `index.js` | registry (`FORMATS`, `SERIALIZERS`, `getFormat`, `getSerializer`) |
| `engine/` | `decode.js` | encoding-detectie (BOM → UTF-8 → Windows-1252) |
| | `pipeline.js` | input: decode → detect → parse → merge |
| | `fieldpath.js` | veldpad-resolver (`refs.pota.mine`) + `fillTemplate()` |
| | `sidecar.js` | verlies-detectie + sidecar |
| | `profiles.js` | profielregistry, auto-detectie, import/export |
| | `validate.js` | profiel-gestuurde validatie → rode-rand-data |
| | `dupes.js` | dupe-detectie (configureerbaar) |
| | `checks.js` | **log-checking & suggestie-engine** (zone/busted/band/tijd/dupe/serial/grid), elke suggestie met bron |
| `grid/` | `editor.js` | **headless editor-model**: edit, selectie, bulk, zoek/vervang, undo/redo, filter, sort, stats, export, DXCC-verrijking |
| | `view.js` | DOM-laag: gevirtualiseerd ledger-raster, dialogen, laden/exporteren, iconen |
| | `icons.js` | inline SVG-iconen (currentColor) |
| `data/` | `registry.js` | databron-registry met herkomst/licentie/versie (provenance) |
| | `prefixes.js` | gebundelde compacte prefixtabel (offline DXCC) |
| `enrich/` | `ctydat.js` | parser voor het volledige cty.dat (AD1C) |
| | `dxcc.js` | call → DXCC/CQ-zone/ITU-zone/continent (portable + uitzonderingen) |
| | `enrich.js` | zones/continent aanvullen + zone-mismatch-detectie, met bron |

## Output (Fase 3)

`serialize({ qsos, session, profile })` → `{ files: [{name, content}], warnings }`.

- **ADIF** — round-trip-anker: onbekende velden komen 1:1 terug; refs → juiste ADIF-velden.
- **Cabrillo v3** — header uit `session` (+ profiel); X-QSO behouden. *(exacte exchange-layout wordt profiel-gestuurd in Fase 5.)*
- **EDI** — log+summary, 15-koloms records, mode→code, QRB→punten, ERROR-records behouden voor nummering.
- **SOTA-CSV** — **multi-file**: splitst per eigen summit.
- **JSON** — volledige canonieke backup (alle rijen, ook uitgevinkte).
- **Eigen formaat** (`custom.js`) — kies velden (via veldpad), scheidingsteken, kopregel, record-template, bestandsnaam-patroon, datum/tijd-formaat. Definitie = JSON (opslaan/delen).

**Markers vs selectie:** `selected` = puur outputselectie. Format-specifieke niet-scorende records leven in `extras` (`X_QSO`, `EDI_ERROR`) en worden per serializer correct her-geëmitteerd (of overgeslagen waar ze niet passen, bv. ERROR in ADIF).

**Verlies & sidecar (beslispunt 3):** exporteer je naar een formaat zonder custom-veld-ondersteuning (Cabrillo/EDI/SOTA), dan verzamelt `buildSidecar()` de niet-emitteerbare velden in een `*.qsobridge-extras.json` en geeft een verlieswaarschuwing.

## Tests

`node test/run.mjs` — **93 asserts**: vijf input-formaten, multi-file merge, encoding-fallback, bandplan-check, ADIF round-trip, en de Fase 3-serializers (Cabrillo/EDI/SOTA/JSON round-trip + eigen formaat + sidecar). Fixtures in `test/fixtures/`.

## Nog te doen

- **Generieke tabel-import** (`.csv`/`.tsv`/`.xlsx`) met kolom-mapping — samen met Fase 4 (editor). DBF sluit later op dezelfde weg aan.
- **ADIF-flavors** (POTA/WWFF/SOTA/LoTW-klaar) en de **profiel-gestuurde Cabrillo/EDI-exchange** — landen in Fase 5 (profielen), bovenop deze serializers.

## v2-modules
| Map | Bestand | Rol |
|---|---|---|
| `formats/` | `adx.js` | ADX-uitvoer (ADIF-XML) |
| | `dbf.js` | DBF-invoer (dBase III/IV) |
| `enrich/` | `refcheck.js` | referentie-bestaanscontrole (offline lijst + opt-in online) |
| `assist/` | `provider.js` | AI-seam: null/mock/BYOK-providers |
| | `paperlog.js` | vrije tekst → QSO-suggesties |
