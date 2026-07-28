# QSObridge — `profiles/` (Fase 5)

Contest- én activatieprofielen als **losse JSON-bestanden**. Een nieuwe contest/programma toevoegen = een bestand bijzetten en registreren — **geen codewijziging**. Profielen zijn zelf-documenterend (i18n `label`/`notes`) en deelbaar (`importProfile`/`exportProfile`).

## Startset

| Bestand | Type | Doelformaat | Bijzonderheid |
|---|---|---|---|
| `pota.json` | activatie | ADIF | legacy `SIG_INFO` + bestandsnaam `call@park-YYYYMMDD.adi` |
| `wwff.json` | activatie | ADIF | bestandsnaam met **spatie** vóór datum |
| `sota.json` | activatie | SOTA-CSV | splitsen per summit; frequentie i.p.v. band |
| `uba-dx.json` | contest | Cabrillo | **asymmetrische** exchange (ON: provincie; DX: niets) |
| `iota.json` | contest | Cabrillo | RST+serial+IOTA-ref (`------` indien leeg); `CATEGORY-TIME` |
| `cqww.json` | contest | Cabrillo | RST + CQ-zone |
| `iaru-r1-vhf.json` | contest | EDI | RST+serial+locator; QRB-scoring |
| `lotw.json` | flavor | ADIF | `MY_*`-stationsvelden per QSO; TQSL-stap buiten scope |

## Schema (v1)

```jsonc
{
  "$schema": "qsobridge-profile/v1",
  "id": "uba-dx",                       // uniek
  "schemaVersion": "1.0",              // voor compat bij delen
  "meta": { "author": "...", "source": "...", "updated": "YYYY-MM-DD" },
  "label": { "nl": "...", "fr": "...", "en": "..." },
  "targetFormat": "cabrillo",          // adif | cabrillo | edi | sota
  "contestTag": { "CW": "UBA-DX-CW", "SSB": "UBA-DX-SSB" }, // of één string
  "lotwReady": false,                   // ADIF: injecteer MY_* per QSO
  "modes": ["CW", "SSB"],
  "requiredQsoFields": ["call","datetime","band","mode","rstSent","rstRcvd","serialSent"],
  "header": { "required": ["stationCall","categories.operator","myProvince"], "optional": [] },
  "exchange": {                         // contesten: per stationstype (asymmetrisch mogelijk)
    "stationType": { "field": "callPrefix", "on": "ON" },  // of {"field":"none","on":"ALL"}
    "sent": { "ON": ["rstSent","serialSent","myProvince"], "DX": ["rstSent","serialSent"] },
    "rcvd": { "ON": ["rstRcvd","serialRcvd","province"],   "DX": ["rstRcvd","serialRcvd"] }
  },
  "validation": {                       // veldpad -> regel (voedt rode-rand-markering)
    "myProvince": { "enum": ["AN","BW",...], "required": true },
    "serialSent": { "type": "int", "min": 1, "required": true },
    "refs.pota.mine": { "validator": "pota", "required": true }
  },
  "emit": { "MY_SIG": "POTA", "MY_SIG_INFO": "{refs.pota.mine}" }, // ADIF-flavors
  "filenamePattern": "{stationCall}@{refs.pota.mine}-{date}.adi",  // {date}=YYYYMMDD
  "notes": { "nl": "...", "fr": "...", "en": "..." }
}
```

**Veldpaden** verwijzen naar het canonieke model, bv. `call`, `serialRcvd`, `refs.pota.mine`, `gridSquare`, of sessie-velden `stationCall`, `myProvince`, `myGrid`, `categories.time`. Speciale sleutels in `emit`/`filenamePattern`: `{date}` (YYYYMMDD van het eerste QSO), `{session.*}`.

**Validators** (bij `"validator"`): `iota`, `pota`, `sota`, `wwff`, `locator`, `callsign` (uit `normalize/validators.js`).

## Een profiel toevoegen

1. Kopieer een gelijkaardig profiel, pas `id`, `label`, `exchange`/`emit`, `validation`, `filenamePattern` en `notes` aan.
2. Registreer het: import in `profiles/index.js` **of** in-app via `importProfile(jsonTekst)` (met `schemaVersion`-check).
3. Delen kan met `exportProfile(id)` → geef de JSON aan iemand anders.

## Gebruik

```js
import { getProfile, detectProfile } from '../js/engine/profiles.js';
import { validateQsos } from '../js/engine/validate.js';

const profile = getProfile('uba-dx');           // of detectProfile(session)
const report = validateQsos(qsos, session, profile); // -> rode-rand-data
const { files } = serialize({ qsos, session, profile });
```
