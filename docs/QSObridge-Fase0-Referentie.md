# QSObridge — Fase 0: Formaat- & Contestreferentie

**Status:** Fase 0 (Inventaris & research) — geverifieerd tegen actuele bronnen, juli 2026.
**Operator:** ON3VZ (België, UBA).
**Doel van dit document:** één referentie die Fase 1–5 laat *implementeren* zonder nog te moeten *uitzoeken*. Elk formaat, elk veld en elk profiel is hier vastgelegd, met per punt de bron en of het geverifieerd is dan wel per jaar hercontrole vraagt.

**Leeswijzer bij verificatie-labels:**
- ✅ **Geverifieerd** tegen de actuele officiële bron (juli 2026).
- 🔁 **Herverifiëren per editie** — waarde stabiel maar reglementen kunnen jaarlijks wijzigen; check vóór elk seizoen.
- ⚠️ **Correctie / let op** — wijkt af van de oorspronkelijke projectbriefing of bevat een valkuil.

---

## A. Formaat-inventaris

### A.1 ADIF — `.adi` (tag) / `.adx` (XML) ✅

Amateur Data Interchange Format. Open standaard voor uitwisseling tussen logsoftware, diensten en websites.

- **Huidige versie: 3.1.7**, uitgebracht **2026-03-22**. Beheerd door de ADIF Developers Group. De redirect `https://adif.org.uk/ADIF_Current` wijst altijd naar de recentste HTML-spec; `adiflatestrelease.txt` bevat het versienummer als 3-cijferig getal (`317`).
- **Twee syntaxen, één datamodel:** `.adi` (tag-gebaseerd, ASCII) en `.adx` (XML/UTF-8). Beide verwijzen naar dezelfde Data Types, Enumerations en Fields — belangrijk voor onze registry: één parser-model, twee serializers.
- **Upwaartse compatibiliteit is gegarandeerd:** een bestand geldig onder versie N blijft geldig onder elke latere versie M. Deprecated velden worden bij *import* aanvaard maar niet meer *geëmitteerd* bij export. Dit stuurt onze round-trip-regels.

**ADI-structuur:**
- Optionele header, afgesloten met `<EOH>`.
- Elk QSO-record is een reeks velden `<VELD:lengte>waarde`, afgesloten met `<EOR>`.
- Voorbeeld veld: `<CALL:5>ON3VZ`. Lengte = aantal bytes van de waarde. Data type kan optioneel: `<FREQ:8:N>14.074`.
- ADI-inhoud is beperkt tot printbare ASCII + CR/LF; internationale tekens vereisen ADX.

**Minimum-velden voor een QSO** (aanbeveling uit de spec, niet afgedwongen — deze keuze ligt bij ons als applicatie): wanneer het QSO plaatsvond (`QSO_DATE` + `TIME_ON`), op welke band/frequentie (`BAND` en/of `FREQ`), de mode (`MODE`), en de tegenstation-call (`CALL`). Dit wordt onze harde minimumvalidatie voor een "plat" ADIF-doel.

**Kernvelden die QSObridge zeker moet kennen** (naast bovenstaande):
`STATION_CALLSIGN`, `OPERATOR`, `OWNER_CALLSIGN`, `RST_SENT`, `RST_RCVD`, `SUBMODE`, `FREQ_RX`, `GRIDSQUARE`, `MY_GRIDSQUARE`, `MY_CQ_ZONE`, `MY_ITU_ZONE`, `MY_IOTA`, `MY_STATE`, `MY_CNTY`, `STX`, `SRX`, `STX_STRING`, `SRX_STRING`, `CONTEST_ID`, `SIG`, `SIG_INFO`, `MY_SIG`, `MY_SIG_INFO`, en de nieuwere award-specifieke velden `POTA_REF`, `MY_POTA_REF`, `SOTA_REF`, `MY_SOTA_REF`, `WWFF_REF`, `MY_WWFF_REF`.

**USERDEF — custom velden:** ADIF ondersteunt door de gebruiker gedefinieerde velden via `USERDEFn` in de header, bv. `<USERDEF1:8:E>QTHNICK,{...}`. Dit is de standaardweg voor "onbekende velden bewaren" bij round-trip én voor onze aanvinkbare extra velden. **Beslissing Fase 1:** onbekende/niet-gemapte velden bewaren we in het canonieke model als losse key-value's en emitteren we bij ADIF-export als USERDEF of als hun originele tag, zodat er niets stil verloren gaat.

**Enum-nuances (belangrijk voor de normalisatie-laag):**
- `CONTEST_ID` wordt *niet* gevalideerd tegen de enumeratie — het is een String (enum is louter adviserend). Contest-sponsors definiëren hun eigen waarden.
- `MODE`/`SUBMODE`: `SUBMODE` wordt evenmin streng gevalideerd. De MODE-enum groeit voortdurend (recent o.a. nieuwe submodes onder MFSK/FSK/DYNAMIC en nieuwe modes zoals OFDM). **Onze mode-mapping mag dus niet exhaustief-hardcoded zijn** — voorzie een uitbreidbare tabel + doorlaat van onbekende modes.
- `STATE`/`MY_STATE`, `CNTY`/`MY_CNTY`: niet streng gevalideerd (externe autoriteiten beheren die lijsten).

**Gebruik:** dagelijkse logs, sync met LoTW/QRZ/Club Log/eQSL, awards (IOTA, POTA, WWFF). Vrijwel elk logprogramma en WSJT-X exporteert ADIF → **dit is onze primaire input** (zie §8 van de briefing).
**Spec:** `https://adif.org.uk/` · `https://www.adif.org/317/ADIF_317.htm`

---

### A.2 Cabrillo — `.cbr` / `.log` ✅

Universele contest-standaard, beheerd door **WWROF** (oorspronkelijk N5KO).

- **Huidige versie: 3.0.** ⚠️ **V2 is deprecated** — enkel te ondersteunen voor legacy; alle sponsors dringen aan op v3. Veel contesten (o.a. CQ WW) aanvaarden nog wél v2 bij inzending, maar wij **emitteren standaard v3**.
- Platte tekst. Eerste regel `START-OF-LOG: 3.0`, laatste regel `END-OF-LOG:`. Headerregels als `<TAG>: waarde` in willekeurige volgorde. Waarde-inhoud moet exact aan de spec voldoen.

**Belangrijkste headertags:**
`CALLSIGN:`, `CONTEST:` (A-Z/0-9/hyphen, max 32), `CATEGORY-OPERATOR:` (SINGLE-OP/MULTI-OP/CHECKLOG…), `CATEGORY-ASSISTED:` (ASSISTED/NON-ASSISTED), `CATEGORY-BAND:`, `CATEGORY-MODE:` (CW/SSB/RTTY/FM/MIXED/DIGI…), `CATEGORY-POWER:` (HIGH/LOW/QRP), `CATEGORY-STATION:`, `CATEGORY-TRANSMITTER:`, `CATEGORY-OVERLAY:`, `CATEGORY-TIME:` (**enkel IOTA**: 12-HOURS/24-HOURS), `CLAIMED-SCORE:` (integer, geen komma's/decimalen), `CLUB:`, `CREATED-BY:`, `EMAIL:`, `GRID-LOCATOR:`, `LOCATION:`, `NAME:`, `ADDRESS:` (+ `ADDRESS-CITY/-STATE-PROVINCE/-POSTALCODE/-COUNTRY`), `OPERATORS:`, `SOAPBOX:`, `OFFTIME:`, `CERTIFICATE:`.

**QSO-regel:**
```
QSO: freq mode date time <sent-exchange> <rcvd-exchange> [tx-id]
```
- `freq` in **kHz** (of ban, bv. `50`, `144`); `mode` als 2-lettercode (`CW`, `PH`, `RY`, `DG`, `FM`); `date` = `YYYY-MM-DD`; `time` = `HHMM` UTC.
- **De exchange-kolommen verschillen per contest** — dat is de kern van de contest-logica (zie §B).
- Velden gescheiden door één of meer spaties; kolommen hoeven niet uitgelijnd te zijn (log-checkers splitsen op whitespace).
- `X-QSO:` markeert een niet-meetellend QSO. `tx-id` (0/1) enkel bij MULTI-*.

**Cabrillo mode-codes** (voor de normalisatie-mapping): `CW`, `PH` (phone/SSB/AM/FM), `RY` (RTTY), `DG` (overige digital, o.a. FT8/FT4 afhankelijk van contest), `FM`.
**Spec:** `https://wwrof.org/cabrillo/` · header: `https://wwrof.org/cabrillo/cabrillo-v3-header/`

---

### A.3 EDI / REG1TEST — `.edi` ✅ (direct relevant — VHF)

Verplichte **IARU Region 1** standaard voor VHF/UHF/microgolf-contesten (>30 MHz) in Europa. **Integreert log + summary in één bestand.** Voorgesteld door de IARU R1 VHF-commissie; REF, DARC e.a. aanvaarden dit voor al hun contesten boven 30 MHz. Huidige beschreven versie: 1.x (`[REG1TEST;1]`).

**Structuur:**
1. `[REG1TEST;1]` — file identifier;versie. Markeert begin en formaat.
2. **Header** — `sleutel=waarde`, één per regel. Volledige lijst:

| Groep | Sleutels |
|---|---|
| Contest | `TName` (naam), `TDate` (begin;einddatum, `YYYYMMDD`) |
| Station-in-contest (P) | `PCall`, `PWWLo` (WWL-locator, max 6), `PExch` (eigen exchange, bv. lidnummer), `PAdr1`, `PAdr2`, `PSect` (sectie/categorie), `PBand` (bv. `144 MHz`), `PClub` |
| Verantwoordelijke operator (R) | `RName`, `RCall`, `RAdr1`, `RAdr2`, `RPoCo`, `RCity`, `RCoun`, `RPhon`, `RHBBS` |
| Multi-operator | `MOpe1`, `MOpe2` |
| Stationsuitrusting (S) | `STXEq`, `SPowe` (W), `SRXEq`, `SAnte`, `SAntH` (hoogte AGL;ASL in m) |
| Berekende claims (C) | `CQSOs` (aantal;bandmultiplier), `CQSOP` (QSO-punten), `CWWLs`, `CWWLB`, `CExcs`, `CExcB`, `CDXCs`, `CDXCB`, `CToSc` (totaalscore), `CODXC` (beste DX: call;WWL;afstand) |
| Remarks | `[Remarks]` gevolgd door vrije-tekstregels (verplicht aanwezig, ook indien leeg) |
| QSO's | `[QSORecords;N]` — N = aantal records dat volgt |

3. **QSO-records** — één per regel, velden gescheiden met `;`, elke regel eindigt met CR/LF. **15 kolommen:**
```
Datum;Tijd;Call;Modecode;Verzonden-RST;Verzonden-nr;Ontvangen-RST;Ontvangen-nr;
Ontvangen-exchange;Ontvangen-WWL;QSO-punten;Nieuw-Exchange(N);Nieuw-WWL(N);Nieuw-DXCC(N);Duplicate(D)
```
- Datum = `YYMMDD`, tijd = `HHMM` UTC.
- **Modecodes 1–9** (⚠️ dit is een eigen tabel, géén ADIF/Cabrillo-mode — mapping nodig):

| Code | TX | RX |  | Code | TX | RX |
|---|---|---|---|---|---|---|
| 1 | SSB | SSB |  | 6 | FM | FM |
| 2 | CW | CW |  | 7 | RTTY | RTTY |
| 3 | SSB | CW |  | 8 | SSTV | SSTV |
| 4 | CW | SSB |  | 9 | ATV | ATV |
| 5 | AM | AM |  | 0 | *niet toegestaan* | |

- Seriële nummers (verzonden/ontvangen) zijn **3 cijfers met voorloopnullen** (`001`).
- **QRB (afstand in km) → punten:** 1 punt per km QRB is de gangbare VHF-scoring; QRB wordt uit de twee WWL-locators berekend. **De QRB-berekening (grid → grid → km) hoort in onze normalisatie/engine.**
- **Conventies waar onze parser/serializer rekening mee houdt:**
  - Ongeldige/onvolledige QSO's blijven staan om de seriële nummering doorlopend te houden: callsign-veld = `ERROR`, punten = 0, overige velden leeg.
  - Dupes: laatste kolom = `D`.
  - `PBand` bevat exact bv. `50 MHz` / `144 MHz` / `432 MHz` (let op: sommige robots zijn kieskeurig op de exacte string — bekende bron van afkeuringen).
- **Bestandsnaam:** `CALL.edi`.

**Spec:** IARU R1 VHF Managers Handbook (V9.x) · veldbeschrijving + voorbeeld: `https://uksmg.org/contest/edi-file-format.php` · online generator-referentie: `http://www.ok2kjt.net/edi/info.php`

---

### A.4 SOTA — CSV V2 (eigen formaat) + ADIF-flavor ✅

**Summits on the Air.** Eigen CSV V2-formaat; de moderne SOTA-database aanvaardt **óók ADIF**.

**CSV V2 — kolommen (komma-gescheiden, één QSO per regel):**
```
V2, MyCall, MySummit, Datum, Tijd, Frequentie, Mode, TheirCall, TheirSummit(S2S), Comments
```
- ⚠️ **De 6e kolom is FREQUENTIE, niet bandnaam:** bv. `14.044MHz`, `7.0MHz`, `144MHz`. Onze serializer moet band→frequentie kunnen afleiden (of de originele freq bewaren).
- **Datum: `DD/MM/YYYY` met slashes** (⚠️ niet `-`; `-` wordt door sotadata geweigerd). `DD/MM/YY` historisch ook aanvaard, maar wij emitteren `DD/MM/YYYY`.
- Tijd = `HHMM` of `HH:MM`, **UTC**, 24-uurs.
- Mode = `CW`/`SSB`/`FM`/… ; voor S2S laat men soms `S2S` blijken uit de ingevulde `TheirSummit`.
- **Geen komma's in velden** (CSV-scheiding) — behalve dat men ze beter overal vermijdt, ook in Comments.
- **QSO's in datum/tijd-volgorde** (anders weigering).
- Eén bestand kan meerdere activaties bevatten; **een activatie eindigt zodra de summit-referentie verandert.** Activatie-, chaser- en S2S-records mogen gemengd; bij import als "activator" worden chaser/S2S-records genegeerd.

⚠️ **SOTA-regel:** **apart bestand per activatie/summit** is de nette werkwijze (en historisch de vereiste). Onze "splitsen per summit" (Fase 4) sluit hierop aan.

**ADIF-flavor (SOTA-database aanvaardt dit ook):** `MY_SOTA_REF` (jouw summit) + `SOTA_REF` (S2S-summit van tegenstation). Formaat referentie: `Associatie/Naam-nnn`, bv. `G/CE-001`, `ON/ON-027`.

**Belgische bouwsteen:** **ON6ZQ** heeft een web ADIF↔SOTA-converter (`on6zq.be/w/index.php/SOTA/ADIF2SOTA` en `SOTA2ADIF`) — nuttig om tegen te testen / mee te interopereren, niet heruit te vinden.
**Spec:** `http://www.sotadata.org.uk/ActivatorCSVInfo.htm` (via sotadata.org.uk upload-pagina)

---

### A.5 FLE — Fast Log Entry (DF3CB) — `.txt` ✅ (kandidaat-inputparser, optioneel)

Eigen **tekst-invoerformaat**: activators typen razendsnel shorthand en exporteren dan ADIF/Cabrillo/SOTA-CSV. **Overweeg als extra input-parser** zodat iemand zijn ruwe FLE-log rechtstreeks in QSObridge plakt.

**Header-keywords** (niet hoofdlettergevoelig): `mycall` (verplicht, station-call), `operator`, `mygrid` (→ `MY_GRIDSQUARE`), `mywwff` (`AAFF-CCCC`, bv. `ONFF-0001` → `MY_SIG=WWFF`, `MY_SIG_INFO`), `mysota` (`AA/NN-CCC`, bv. `G/CE-001`), `mypota` (`X-NNNNN`, 4–5 cijfers → `MY_SIG=POTA`, `MY_SIG_INFO`), `qslmsg`, plus per-QSO shorthand met `date`/`day` (increment), band, mode en tijd.
**Per-QSO refs:** `wwff`/`pota`/`sota` (tegenstation → `SIG`/`SIG_INFO`).

**Belgische bouwsteen:** **ON4KJM — FLEcli** (Go, multiplatform: Windows/Mac/Linux/ARM). CLI: `FLEcli adif|csv [--pota|--sota|--wwff] input [output]`, met `--interpolate` voor ontbrekende tijden. Genereert ADIF (POTA/SOTA/WWFF-flavor) en SOTA-CSV. Goede referentie-implementatie voor onze FLE-parser en voor de flavor-logica.
**Spec:** `https://df3cb.com/fle/documentation/` · FLEcli: `https://github.com/on4kjm/FLEcli`

---

### A.6 Legacy & software-specifiek — buiten v1 ⚠️

| Formaat | Status | Aanbeveling |
|---|---|---|
| **STF** (`.stf`) | Ouder Europees tekstformaat, historisch door sommige Scandinavische verenigingen geëist. Grotendeels verouderd. | **Buiten v1.** Documenteren; enkel toevoegen als een concrete inzending het nog vraagt. |
| **DBF** (dBase/FoxPro `.dbf`) | Verouderd databaseformaat, vroege IOTA-software. | **Buiten v1.** Zou een JS-DBF- of WASM-reader vergen. Later overwegen. |
| **DAT / BIN** (N6TR `.DAT`, CT) | Ruwe binaire DOS-logger-data. | **Buiten v1 → "eerst extern converteren"** met het originele programma of LogConv, dan als ADIF/Cabrillo inlezen. |
| **Summary Sheet** (`.sum`/`.txt`) | Voorpagina met eindscore + stationsgegevens. | Meestal al **geïntegreerd** in de Cabrillo-/EDI-header; geen aparte parser nodig. |

---

## B. Contest-profielen — exchange-referentie (basis voor de JSON)

Bij Cabrillo is de **header** grotendeels gelijk; het onderscheid zit in de **QSO-exchange**. Onderstaande tabel is de basis voor de losse JSON-profielbestanden (Fase 5). 🔁 = exchange bevestigd uit spec/reglement maar **per editie hercontroleren**.

| Contest | `CONTEST:`-tag | Mode | Exchange (verzonden→ontvangen) | Bijzonderheid | Verif. |
|---|---|---|---|---|---|
| CQ WW DX | `CQ-WW-CW` / `CQ-WW-SSB` | CW/SSB | RST + **CQ-zone** (bv. `599 05`) | tx-id-kolom bij MULTI; aanvaardt v2+v3 | ✅🔁 |
| CQ WPX | `CQ-WPX-CW`/`-SSB`/`-RTTY` | CW/SSB/RTTY | RST + **serieel** | prefix = multiplier | ✅🔁 |
| CQ WW RTTY | `CQ-WW-RTTY` | RTTY | RST + CQ-zone + **QTH** (US-staat/VE-prov of `DX`) | 3 velden | 🔁 |
| ARRL DX | `ARRL-DX-CW`/`-SSB` | CW/SSB | W/VE: RST + **staat/prov** · DX: RST + **vermogen** | asymmetrisch | 🔁 |
| ARRL Sweepstakes | `ARRL-SS-CW`/`-SSB` | CW/SSB | **serieel + precedence + call + check(jaar) + ARRL/RAC-sectie** | complexste exchange | 🔁 |
| ARRL Field Day | `ARRL-FD` | alle | **klasse + sectie** (bv. `3A EMA`) | | 🔁 |
| ARRL RTTY Roundup | `ARRL-RTTY` | RTTY/digi | RST + staat/prov (W/VE) of serieel (DX) | | 🔁 |
| IARU HF | `IARU-HF` | CW/SSB | RST + **ITU-zone** · HQ-stations: RST + **society** | | 🔁 |
| RSGB IOTA | `IOTA` (RSGB-doc: `RSGB-IOTA`) | CW/SSB | RST + serieel + **IOTA-ref** (`aa-nnn`, of `------`) | `CATEGORY-TIME: 12-HOURS/24-HOURS`; `CATEGORY-DXPEDITION`; multi = tx-id | ✅🔁 |
| Worked All Europe | `WAEDC-CW`/`-SSB`/`-RTTY` | CW/SSB/RTTY | RST + serieel (**+ QTC-verkeer**) | QTC's zijn apart blok | 🔁 |
| IARU R1 VHF | *(EDI, geen Cabrillo)* | CW/SSB (+FM/dig) | RST + serieel + **WWL-locator** | `.edi` REG1TEST; QRB-scoring | ✅🔁 |
| **UBA DX** | `UBA-DX-CW`/`-SSB` 🔁 | CW/SSB | ⚠️ **ON: RST + serieel + provincie (2 ltr)** · DX: RST + serieel | zie correctie hieronder | ✅🔁 |
| **UBA Spring (DST)** | *(via on4dst-portal)* | CW/SSB/VHF | ON: RST + serieel + **UBA-sectie (3 ltr, of XXX)** · DX: RST + serieel | inzending via portal | ✅🔁 |
| POTA | *(ADIF)* | alle | activator `MY_SIG_INFO`=park · jager `SIG_INFO` | zie §C | ✅ |
| WWFF | *(ADIF)* | alle | `MY_SIG=WWFF` + `MY_SIG_INFO` · P2P `SIG`/`SIG_INFO` | zie §C | ✅ |
| SOTA | *(CSV V2 / ADIF)* | alle | summit-ref + S2S-ref | zie §A.4/§C | ✅ |

### ⚠️ Correctie t.o.v. de briefing — UBA DX vs UBA Spring

De projectbriefing wisselde deze twee om. Geverifieerd tegen de UBA-reglementen:

- **UBA DX Contest** — ON-stations zenden **RST + serieel + Belgische provincie (2 letters)**. Geldige codes: `AN, BW, HT, LB, LG, NM, LU, OV, WV, VB` + `BR` (Brussel). De provincie is een **verplicht** deel van de exchange en van het log; ontbreekt ze, dan toont de Cabrillo `??` en wordt het log niet verwerkt. DX-stations: RST + serieel.
  - Extra UBA-quirk: ON-deelnemers vullen een **tijdscategorie** in (A=6u, B=12u, C=24u); bij sommige loggers wordt `CATEGORY-OPERATOR:` handmatig `CATEGORY:` met een UBA-eigen code (AH, CLP, CH, DXE…). **Profiel moet deze header-eigenaardigheid ondersteunen.**
- **UBA Spring Contest (DST)** — ON-stations zenden **RST + serieel + UBA-sectie (3 letters)**, of `XXX` voor niet-UBA-leden. Bv. `ON4DST → 59(9)001 DST`. Inzending via `https://Springcontest.on4dst.be`.

🔁 **De exacte `CONTEST:`-string voor UBA DX in Cabrillo verifiëren** vóór Fase 5 (waarschijnlijk `UBA-DX-CW`/`UBA-DX-SSB`, maar bevestigen tegen de UBA-Cabrilloinstructies).

**Bron UBA:** `uba.be/en/hf/contest-rules/uba-dx-contest` · Spring: `old.uba.be/en/hf/contest-rules/spring-contest` · praktische Cabrillo-edit: ON5ZO-blog.
**Bron IOTA:** `rsgbcc.org/hf/information/cabrillo.shtml`
**Bron internationale exchanges:** respectieve sponsor-reglementen (CQ/ARRL/DARC) — 🔁 per editie.

---

## C. Activatieprofielen (POTA / WWFF / SOTA)

Belangrijk: **POTA en WWFF zijn géén apart formaat maar ADIF met eigen verplichte velden + verplichte bestandsnaam.** Behandel ze als **profielen**, net als contest-profielen. **SOTA** heeft wél een eigen CSV (zie §A.4).

| Aspect | POTA ✅ | WWFF ✅ | SOTA ✅ |
|---|---|---|---|
| Formaat | ADIF only | ADIF | CSV V2 **of** ADIF |
| Verplichte QSO-velden | `CALL`, `QSO_DATE`, `TIME_ON`, `MODE`, `BAND` | idem ADIF-basis | CSV: zie §A.4 |
| Eigen referentie (activator) | `MY_SIG_INFO` = park ⚠️ (zie noot) | `MY_SIG=WWFF` + `MY_SIG_INFO=<ref>` | `MY_SOTA_REF` |
| Tegenstation-ref (P2P/S2S) | `SIG=POTA` + `SIG_INFO=<park>` | `SIG=WWFF` + `SIG_INFO=<ref>` | `SOTA_REF` |
| BE-referentieformaat | `ON-nnnn` 🔁 (verifiëren: `ON-` vs ISO `BE-`) | `ONFF-yyyy` | `ON/ON-nnn` e.d. |
| Club/multi | `STATION_CALLSIGN` + `OPERATOR` verplicht | idem | — |
| Bestandsnaam | `call@ref-YYYYMMDD.adi` (bv. `ON3VZ@ON-0001-20260726.adi`) | `call@ref YYYYMMDD.adi` (⚠️ **spatie** vóór datum, bv. `ON3VZ@ONFF-0001 20260726.adi`) | vrije naam; conventie `YYYYMMDD` |
| Inzending gaat naar | pota.app (self-upload) | nationale logmanager → Logsearch | sotadata.org.uk (self-upload) |

**Kritische nuances (uit de praktijk geverifieerd):**

1. ⚠️ **POTA — legacy vs nieuwe velden.** De ADIF-standaard heeft intussen dedicated velden `MY_POTA_REF` (activator) en `POTA_REF` (jager). **Maar pota.app verwacht bij upload nog steeds de legacy `MY_SIG_INFO` / `SIG_INFO`** (met `MY_SIG=POTA`). **Beslissing:** ons POTA-profiel emitteert **beide** of primair de legacy `SIG`-velden, en biedt de gebruiker een toggle. Dit is precies het soort mapping (bewaar in `MY_POTA_REF`, emit naar `MY_SIG_INFO`) waar onze mapping-engine voor bedoeld is.
2. ⚠️ **POTA bestandsnaam is verplicht** en de robot valt op de bestandsnaam terug als `MY_SIG_INFO` ontbreekt. Twee conventies circuleren: `CALL@REF-YYYYMMDD.adi` (gedocumenteerd) en de dash-variant `CALL-REF-YYYYMMDD.adi`. Wij genereren de **`@`-variant** (officieel) en tonen ze in de UI.
3. **POTA `MY_STATE`.** Als een park administratieve grenzen kruist, gebruikt de uploader `MY_STATE`; ontbreekt/ongeldig → prompt. Nuttig veld om als suggestie aan te bieden.
4. **WWFF-drempel:** 44 QSO's voor een kwalificerende activatie (info voor het health-paneel, niet blokkerend). Referentieformaat `XFF-YYYY`/`XXFF-YYYY`.
5. **SOTA:** apart bestand per summit; band-kolom = frequentie; datum met slashes.

**BE-referentie ⚠️ te verifiëren in Fase 5:** de briefing stelt Belgische parken = `ON-`. POTA stapte in 2024 over op ISO-landcodes voor sommige entiteiten; controleer of België in pota.app `ON-` dan wel `BE-` gebruikt vóór we het als validatie-regex vastzetten.

---

## D. Concurrentie-analyse — en het gat dat QSObridge vult

Alle onderstaande tools zijn geverifieerd als **nog actief in 2026**. De §4-tabel uit de briefing klopt; hieronder aangevuld/bevestigd.

| Tool | Type | Wat het doet | Beperking |
|---|---|---|---|
| `cqww.com/adif/`, `cqwpx.com/adif/`, `ww-digi.com/adif/`, FT-Challenge-converter | Online, browser-side (LZ2FQ / WA7BNM, WWROF-gesponsord) | ADIF → Cabrillo | **Eén contest per tool**, éénrichting, geen editeerbaar raster |
| **twineconvert.com/adif-to-cabrillo** | Online, JS/**WASM**, geen upload | ADIF → Cabrillo, volledig client-side (privacy) | Eénrichting, **geen contest-profielen**, geen missing-field UI, geen editor; ad-ondersteund |
| `adif2cabrillo.kq4mhe.com` | Online | ADIF → Cabrillo, werkt met HAMRS-export | Geen editor, geen profielen |
| **ADIF2CABR** (SP7DQR) | Windows desktop | ADIF → Cabrillo | Enkel **één-deel-exchange** (serieel/zone); `SRX` moet in ADIF staan; geen EDI; geen grid |
| **LogConv** | Desktop (GUI+CLI) | Multi-formaat: ADIF, Cabrillo, CT9/10, EQF, TR Log | Desktop; geen web/editor; wel nuttige referentie voor legacy DAT/BIN |
| **ADIF Master** | Windows | ADIF-editor (filters, tags, Cabrillo/TR/CT → ADIF) | Geen conversie-naar-Cabrillo-met-contestlogica; Windows-only |
| N1MM+, WriteLog, Win-Test, DXLog | Contest-loggers | Exporteren zelf Cabrillo/EDI | Geen converters, niet web-based |
| **FLEcli** (ON4KJM) | CLI, multiplatform | FLE-tekst → ADIF (POTA/SOTA/WWFF) + SOTA-CSV | Geen GUI/editor; input is enkel FLE |
| **ON6ZQ** ADIF↔SOTA | Online | ADIF ↔ SOTA-CSV | SOTA-specifiek |

**Het gat (motivatie voor QSObridge):** de bestaande online tools zijn (a) aan **één contest** gekoppeld, (b) meestal **enkel ADIF→Cabrillo, één richting**, (c) ondersteunen **géén EDI/REG1TEST**, (d) hebben **géén editeerbaar review-raster met rode-rand-markering**, en (e) laten **geen custom velden** toe. Een **universele, meervoudige, in-browser editor+converter met contest-/activatieprofielen** — die van ADIF/Cabrillo/EDI/SOTA/FLE naar ADIF/Cabrillo/EDI/SOTA gaat via één canoniek model, mét mini-editor — **bestaat niet in die vorm.** twineconvert bewijst dat de volledig-client-side WASM-aanpak werkt; wij voegen de editor, de profielen, EDI en de mapping-engine toe.

---

## E. Open beslispunten voor Fase 1

Deze punten zijn *research-klaar* maar vragen jouw knoop vóór of tijdens Fase 1:

1. **§8 van de briefing is afgekapt.** De prioriteits-/startset-beslissingen ("Startset qua doelen…") ontbreken. Nodig vóór Fase 1: welke **doelformaten** zitten in de v1-startset (voorstel: ADIF-out, Cabrillo-out, EDI-out, SOTA-CSV-out) en welke **profielen** eerst (voorstel: IARU R1 VHF, UBA DX, IOTA + POTA/WWFF/SOTA — jouw dagelijkse praktijk).
2. **UBA DX `CONTEST:`-tag** exact bevestigen (Fase 5).
3. **BE POTA-prefix** `ON-` vs `BE-` bevestigen (Fase 5).
4. **Round-trip-beleid voor onbekende velden:** bewaren als USERDEF bij ADIF-export akkoord? Voor niet-ADIF-doelen (Cabrillo/EDI/SOTA) gaan onbekende velden verloren bij export — enkel waarschuwen (verlieswaarschuwing) of ook in een sidecar bewaren?
5. **Mode-mapping als uitbreidbare tabel** (niet exhaustief hardcoded), met doorlaat van onbekende ADIF-modes. Akkoord als ontwerpprincipe?
6. **QRB-berekening** (grid→grid→km) opnemen in de normalisatie-laag voor EDI-scoring — akkoord dat dit v1-scope is (jij bent VHF-operator)?
7. **FLE-inputparser**: v1 of Fase 2-optioneel? (Aanbeveling: optioneel in Fase 2, want FLEcli/df3cb geven een duidelijke referentie.)

---

## Bronnen (geverifieerd juli 2026)

- ADIF 3.1.7: adif.org.uk · www.adif.org/317/ADIF_317.htm
- Cabrillo v3: wwrof.org/cabrillo/ · wwrof.org/cabrillo/cabrillo-v3-header/
- EDI/REG1TEST: uksmg.org/contest/edi-file-format.php · IARU R1 VHF Handbook V9.x · ok2kjt.net/edi/info.php
- POTA: docs.pota.app/docs/activator_reference/ADIF_for_POTA_reference.html · docs.pota.app/docs/activator_reference/logging_made_easy.html
- WWFF: wwff.co/rules-faq/confirming-and-sending-log/ · wwff.us/faq/
- SOTA CSV: sotadata.org.uk/ActivatorCSVInfo.htm · ON6ZQ: on6zq.be
- FLE: df3cb.com/fle/documentation/ · FLEcli (ON4KJM): github.com/on4kjm/FLEcli
- UBA: uba.be/en/hf/contest-rules/uba-dx-contest · Spring: on4dst-portal
- IOTA: rsgbcc.org/hf/information/cabrillo.shtml
- Concurrentie: twineconvert.com · adif2cabrillo.kq4mhe.com · sp7dqr.pl · dxzone.com Log Converters

---

*Einde Fase 0-referentie. Wacht op GO voor Fase 1 (Architectuur & datamodel).*
