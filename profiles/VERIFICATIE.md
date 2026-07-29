# Profiel-verificatie tegen de reglementen

Elk profiel bepaalt automatisch het doelformaat, de exchange en de verplichte header-velden.
Hieronder de status van de verificatie tegen de officiële reglementen (juli 2026).

| Profiel | Doel | CONTEST-tag | Exchange (verzonden / ontvangen) | Status |
|---|---|---|---|---|
| RSGB IOTA-contest | Cabrillo | `RSGB-IOTA` | RST + volgnr + IOTA-ref (`------` indien geen eiland) | ✅ geverifieerd (rsgbcc.org) |
| UBA DX | Cabrillo | `UBA-DX-CW/SSB` | ON: RST + volgnr + **UBA-sectie** (3 ltr / XXX); DX: RST + volgnr | ✅ geverifieerd (uba.be) |
| IARU HF | Cabrillo | `IARU-HF` | RST + **ITU-zone** | ✅ (HQ-stations sturen society — nog niet gemodelleerd) |
| CQ WW | Cabrillo | `CQ-WW-CW/SSB` | RST + **CQ-zone** | ✅ |
| CQ WPX | Cabrillo | `CQ-WPX-CW/SSB/RTTY` | RST + volgnr (prefix = mult) | ✅ |
| CQ WW RTTY | Cabrillo | `CQ-WW-RTTY` | RST + CQ-zone + staat/prov (of DX) | ✅ |
| ARRL DX | Cabrillo | `ARRL-DX-CW/SSB` | **asymmetrisch** — DX: RST + vermogen; W/VE: RST + staat/prov | ✅ (DX-perspectief; W/VE wisselt om) |
| ARRL Field Day | Cabrillo | `ARRL-FD` | klasse + sectie | ✅ |
| WAE DC | Cabrillo | `WAEDC-CW/SSB/RTTY` | RST + volgnr (QTC's buiten scope) | ✅ |
| WW Digi | Cabrillo | `WW-DIGI` | RST + 4-teken locator | ✅ |
| IARU R1 VHF | EDI | — | RST + volgnr + WWL-locator | ✅ |
| POTA / WWFF | ADIF | — | park/ref-velden (`MY_SIG_INFO`, `MY_SIG`) | ✅ |
| SOTA | SOTA-CSV/ADIF | — | summit-ref + S2S | ✅ |
| IOTA-award / GMA / ARLHS | ADIF | — | ref-velden | ✅ |

## Belangrijkste correcties (deze ronde)
- **RSGB IOTA**: CONTEST-tag is `RSGB-IOTA` (niet "IOTA"); verzonden IOTA-ref = eigen eiland of `------`; `CATEGORY-TIME` verplicht (12/24-HOURS); `IOTA-ISLAND-NAME` voor eilandstations; freq-terugval naar bandmidden.
- **UBA DX**: exchange gebruikt de **UBA-sectie (3 letters)**, niet de provincie (per de actuele uba.be-regels + Cabrillo-voorbeeld). Belgische prefixen (O + N–T, dus ook OP/OT/OR…) tellen als ON.
- **ARRL DX**: asymmetrisch gemaakt — DX-station verzendt RST + vermogen (`extras.TX_PWR`) en ontvangt RST + staat/provincie.

## Nog te modelleren (bekende beperkingen)
- IARU HF: HQ-/IARU-official-stations sturen een society-afkorting i.p.v. de ITU-zone.
- WAE DC: QTC-verkeer (apart blok) zit niet in scope.
- ARRL SS: complexe exchange (serial + precedence + check + sectie) vereenvoudigd.
- IOTA/UBA multi-op vanaf eiland: numerieke zender-ID achteraan de QSO-lijn.
