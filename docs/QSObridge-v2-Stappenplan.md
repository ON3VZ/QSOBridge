# QSObridge v2 — Concreet stappenplan

**Uitgangspunt:** v1 is af (Fase 0–8, getest). v2 gaat niet meer over *kunnen converteren*, maar over **correctheid en intelligentie**: kloppen de landcodes/zones, is de log intern consistent, en kan de tool fouten *aanwijzen en verbeteren* — met, cruciaal, **een expliciete bron per controle en suggestie**.

## 0. Leidende principes van v2

1. **Elke controle/suggestie heeft een benoemde bron.** Geen enkele suggestie verschijnt zonder herkomst: dataset + versie/datum + licentie, zichtbaar in een tooltip en in een "Over de data"-paneel. Dit is het directe antwoord op *"waar komt dit vandaan?"*.
2. **Suggesties worden nooit stil toegepast.** Ze tonen als suggestie (eigen stijl), met "pas toe" / "negeer" — de operator beslist. Geen automatische overschrijving van jouw log.
3. **Offline-first & privacy blijven overeind.** Kleine, vrije, gezaghebbende datasets worden **gebundeld** (offline). Grote datasets zijn **opt-in** (jij importeert de publieke lijst, lokaal gecachet) of via een **opt-in online lookup die enkel de referentie verstuurt — nooit je loggegevens**.
4. **Regel-gebaseerd blijft de kern.** AI is een optionele assist voor vrije tekst, niet voor gestructureerde data waar regels betrouwbaarder zijn.

---

## Fase A — Referentiedata-laag & "Over de data"

**Doel:** één versioneerbare data-laag met herkomst en licentie per dataset, plus een transparant databeheer.

**Stappen:**
- `data/`-registry: elke dataset als een object `{ id, bron, licentie, versie/datum, grootte, scope: offline|opt-in }`.
- **Provenance-API**: elke check/suggestie geeft een `source`-verwijzing terug die de UI toont ("bron: cty.dat VER2026xxxx — AD1C").
- **"Over de data"-paneel**: lijst van alle datasets met versie, bron-URL, licentie en "laatst bijgewerkt".
- **Opt-in update-mechanisme**: een knop "Data bijwerken" die de *publieke* bestanden ophaalt (cty.dat, band plans …). Dit is het enige moment dat er netwerk aan te pas komt; er vertrekken **nooit loggegevens**. Zonder die klik werkt alles offline op de gebundelde snapshot.
- **Cache in IndexedDB** voor de grotere sets; size-budget bewaken.

**Levert:** data-registry + "Over de data"-paneel + gebundelde kernsets.

---

## Fase B — Landcode/DXCC-correctheid (cty.dat) ★ kern

**Doel:** callsign → **DXCC-entiteit, CQ-zone, ITU-zone, continent** (en lat/lon voor QRB/beam), correct en up-to-date.

**Bron:** **cty.dat**, beheerd door **Jim Reisert AD1C** (`country-files.com`) — de de-facto standaard die N1MM, Win-Test, WriteLog e.a. gebruiken, meermaals per maand geüpdatet, ook beschikbaar als CSV/XML. Aangevuld met de **ADIF DXCC-enumeratie** (340 entiteiten) voor canonieke DXCC-ID's.

**Stappen:**
- `cty.dat`-parser: entiteitsregel (naam, CQ, ITU, continent, lat/lon, tijdzone, primaire prefix) + alias-prefixen + **full-call-uitzonderingen** (bv. `VP2E…`, KG4-2×2 = Guantánamo) + `*`-markering (WAE/CQ-only).
- **Portable/prefix-logica**: `/P`, `/MM`, `DL/ON3VZ`, `ON3VZ/DL` correct herleiden (langste/kortste deel).
- **Enrichment-engine**: vult automatisch DXCC/CQ/ITU/continent in waar leeg; markeert als **suggestie** met bron.
- **Correctie-suggesties**: staat er al een zone die *niet* strookt met de prefix → waarschuwing + voorgestelde correctie (met bron).
- **Golden-tests**: een vaste set bekende calls → verwachte DXCC/zone, zodat een cty.dat-update meetbaar blijft kloppen.

**Levert:** `enrich/`-module (offline, cty.dat gebundeld + opt-in refresh) + auto-invulling in de editor met bron-tooltip.

> Bonus: dit lost meteen de **asymmetrische ARRL-exchanges** uit v1 op — met cty.dat weet de tool of een tegenstation W/VE of DX is, en kiest ze de juiste exchange-zijde.

---

## Fase C — Log-checking & suggestie-engine (bron per suggestie) ★ kern

**Doel:** slimme controles bovenop de formaatvalidatie, elk met herkomst.

**Concrete checks (elk met severity + bron):**
- **Zone ↔ prefix mismatch**: ingevulde CQ/ITU-zone strookt niet met cty.dat → suggereer de juiste. *(bron: cty.dat)*
- **Grid ↔ DXCC mismatch**: locator ligt niet in het land van de prefix. *(bron: cty.dat lat/lon + Maidenhead)*
- **Mode ↔ bandsegment**: mode valt buiten het IARU-bandplan-segment. *(bron: IARU R1/2/3 band plans)*
- **Tijd/UTC**: niet-chronologische of verdachte tijden; lokale-tijd-vermoeden. *(regel-gebaseerd)*
- **QRB-plausibiliteit** (VHF): afstand onrealistisch groot voor de band. *(bron: bandplan + QRB)*
- **Dupe met áfwijkende exchange**: zelfde call/band/mode maar ander rapport/serial → nakijken. *(regel-gebaseerd)*
- **Busted call**: prefix niet in cty.dat, of callsign-vorm ongeldig → mogelijk tikfout. *(bron: cty.dat + callsign-regex)*
- **Serial-gaten/duplicaten** in verzonden nummering. *(regel-gebaseerd)*

**Stappen:** `checks/`-registry (elke check = pure functie + `source`); een **suggestiepaneel** naast het raster met "pas toe / negeer / alle van dit type"; spring-naar-suggestie; teller in de statusbalk.

**Levert:** checks-registry + suggestiepaneel, volledig met bronvermelding.

---

## Fase D — Referentie-bestaanscontrole (POTA / SOTA / WWFF / IOTA)

**Doel:** niet enkel *"heeft dit de juiste vorm"* maar *"bestaat dit park/deze summit echt?"*.

**Bronnen & strategie (belangrijk voor de balans offline ↔ privacy):**
- **SOTA**: `summitslist.csv` van `sotadata.org.uk` (volledige summit-lijst, groot). → **Opt-in import**: jij haalt de publieke CSV op, lokaal gecachet; daarna volledige offline bestaanscontrole.
- **POTA**: publieke **API** (o.a. referentie- en bounding-box-endpoints), beschikbaar dankzij de vrijwilligers-devteams — *met etiquette/rate-limits*. → **Opt-in online lookup** die enkel de park-referentie bevraagt (nooit je log), met caching en nette rate-limiting.
- **WWFF**: nationale directory-CSV's → opt-in import.
- **IOTA**: referentielijst (RSGB/SMP) → gebundelde compacte index of opt-in import.

**Stappen:** ref-validators die eerst de vorm checken (offline, uit v1) en dan optioneel het bestaan; duidelijke **consent** vóór elke online actie; resultaten gecachet.

**Levert:** ref-existence-laag met expliciete opt-in en bronvermelding.

---

## Fase E — AI-assist (optioneel, opt-in) — de gereserveerde seam invullen

**Doel:** rommelige vrije tekst interpreteren waar regels tekortschieten: een ingetikt papieren log, losse notities, of een onbekend exchange-formaat → velden.

**Opties (achter de bestaande `AssistProvider`-interface):**
- **BYOK**: de gebruiker plakt zijn eigen API-sleutel (lokaal in `localStorage`); werkt, maar niet gratis.
- **Kleine serverless proxy** (Cloudflare Worker/Netlify): bewaart de sleutel; minimale "backend" naast Pages.

**Guardrails:** enkel voor vrije tekst; output altijd als **suggestie** gemarkeerd; nooit als bron van waarheid voor gestructureerde velden; expliciete opt-in; de gebruiker ziet wat er verstuurd wordt.

**Levert:** één inplugbare AssistProvider + UI, zonder de deterministische kern te raken.

---

## Fase F — Meer formaten & profiel-verfijning

- **ADX-output** (ADIF-XML) — zelfde model, snelle toevoeging.
- **DBF-import** via de generieke tabel-weg (binaire tabel → kolom-mapping).
- **Asymmetrische ARRL DX/SS** correct maken met cty.dat (Fase B) i.p.v. de v1-vereenvoudiging.
- **Meer nationale contesten** als profielen (data, geen code).
- **STF** enkel indien een concrete inzending het nog vraagt.

---

## Fase G — Awards & statistiek (integratie met de D3-logbookmap)

- **Worked/Confirmed-tracking** en **award-voortgang**: DXCC, WAS, WAC, IOTA, VUCC — op basis van de cty.dat-verrijking.
- **Kaarten & grafieken**, gekoppeld aan je bestaande D3-logbook op de homepage (gedeelde datavorm via de JSON-export).

---

## Fase H — UX, toegankelijkheid & schaal

- **Kolom-presets per profiel** en **opgeslagen views** (filters + kolommen + sortering bewaren).
- **WCAG-audit** (screenreader, toetsenbord-only, contrast) — voortbouwend op de a11y-basis van v1.
- **IndexedDB-opslag** voor zeer grote logs (10k+ QSO's) en zwaardere Web-Worker-verwerking.
- **Mobiele verfijning** (portable in het veld).

---

## Bronnen- & licentieoverzicht (samenvattend)

| Dataset | Bron | Gebruik | Offline/Online | Opmerking |
|---|---|---|---|---|
| **cty.dat** (DXCC/CQ/ITU/continent) | AD1C — `country-files.com` | landcode-correctheid, zones, QRB | **bundelen** + opt-in refresh | de-facto standaard; frequent geüpdatet; ook CSV/XML |
| **ADIF DXCC-enum** | `adif.org` | canonieke DXCC-ID's | bundelen | 340 entiteiten |
| **IARU band plans** | IARU R1/R2/R3 | mode↔segment-check | bundelen | klein, stabiel |
| **SOTA summitslist.csv** | `sotadata.org.uk` | summit-bestaanscontrole | **opt-in import**, lokaal gecachet | groot |
| **POTA API** | pota.app (volunteer devs) | park-bestaanscontrole | **opt-in online**, enkel ref | rate-limits respecteren |
| **WWFF directory** | nationale programma's | ref-bestaanscontrole | opt-in import | per land |
| **IOTA-lijst** | RSGB / SMP | IOTA-ref-check | bundelen/opt-in | |

**Rode draad:** in álle gevallen verlaat er **geen loginhoud** je toestel. Gebundelde data is offline; online lookups sturen enkel een losse referentie of prefix, expliciet na jouw toestemming, en tonen hun bron.

---

## Open beslissingen (jouw knopen vóór v2-Fase A)

1. **Databudget:** welke sets bundelen we standaard mee (voorstel: cty.dat + ADIF-enum + band plans + IOTA), en welke laten we opt-in (SOTA/POTA/WWFF)?
2. **Online lookups toestaan?** Zo ja, enkel na expliciete opt-in per sessie, of een blijvende voorkeur? (Voorstel: opt-in, onthouden in voorkeuren.)
3. **AI-assist:** BYOK, serverless proxy, of (nog) niet? (Voorstel: seam klaarzetten, BYOK eerst.)
4. **Update-cadans cty.dat:** enkel handmatig ("Data bijwerken"), of een discrete melding als de gebundelde snapshot ouder is dan X maanden?
5. **Volgorde:** ik raad aan te starten met **Fase A + B** (data-laag + cty.dat-correctheid) — dat levert meteen de meeste waarde en ontgrendelt ook de betere ARRL-exchanges en de awards-tracking.

> Werkwijze zoals v1: één fase per keer, eerst een kort plan, dan de bouw, telkens wachten op je expliciete **GO**.
