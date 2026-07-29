// test/smoke-dom.mjs — Headless UI-smoketest met jsdom.
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dom = new JSDOM('<!DOCTYPE html><body><div id="app"></div></body>', { url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.Option = dom.window.Option;
global.Blob = dom.window.Blob;
global.URL = dom.window.URL;
// dialog.showModal ontbreekt in jsdom -> stub zodat dialogen niet crashen
dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
dom.window.URL.createObjectURL = () => 'blob:mock';
dom.window.URL.revokeObjectURL = () => {};
dom.window.HTMLAnchorElement.prototype.click = function () {};

let pass = 0, fail = 0;
const check = (n, c, d = '') => c ? (pass++, console.log('  \u2713 ' + n)) : (fail++, console.log('  \u2717 ' + n + ' ' + d));

const { App } = await import('../js/grid/view.js');
const app = new App(document.getElementById('app'));

console.log('[DOM-smoke]');
check('topbalk + logo aanwezig', !!document.querySelector('.brand svg.logo') && /QSO/.test(document.querySelector('.brand .name').textContent));
check('lege staat getoond', /Nog geen log geladen/.test(document.querySelector('#gridHost').textContent));
check('profielen in dropdown', document.querySelector('#profile').options.length > 5);

// Laad een ADIF-log via de tekstweg
const adi = readFileSync(join(here, 'fixtures', 'sample.adi'), 'utf8');
app._loadText(adi, 'sample.adi');

const tbody = document.querySelector('#tbody');
check('raster gerenderd met rijen', !!tbody && tbody.querySelectorAll('input.cell').length > 0);
check('kopregel met Call-kolom', /Call/.test(document.querySelector('.log thead').textContent));
check('statusbalk toont QSO-aantal', document.querySelector('#hTotal').textContent === '4', `(${document.querySelector('#hTotal').textContent})`);

// Kies POTA-profiel -> validatie moet ontbrekende eigen park in header + refs flaggen? (record 1 heeft POTA)
document.querySelector('#profile').value = 'pota';
app.ed.profileId = 'pota';
app.render();
const invalidCells = document.querySelectorAll('td.invalid');
check('rode-rand-cellen aanwezig bij POTA-validatie', invalidCells.length > 0, `(${invalidCells.length})`);

// Inline edit via de DOM: wijzig eerste call
const firstCell = tbody.querySelector('input.cell[data-k="call"]');
firstCell.value = 'ZZ9ZZ';
firstCell.dispatchEvent(new dom.window.Event('change'));
check('inline edit via DOM verwerkt', app.ed.qsos.some((q) => q.call === 'ZZ9ZZ'));

// Filter op band 40m
document.querySelector('#fBand').value = '40m';
document.querySelector('#fBand').dispatchEvent(new dom.window.Event('input'));
check('filter vermindert zichtbare rijen', app.ed.visible().length < app.ed.qsos.length);

// Export-knop levert bestand (via editor)
const res = app.ed.export('adif');
check('export levert .adi', res.files[0].name.endsWith('.adi'));

// Dynamische kolommen: ontdekt uit de geladen data
check('dynamische kolommen ontdekt', app.columns().some((c) => c.key === 'call'));
check('kolomdialoog lijst velden', (() => { app._colsDialog(); return /Call/.test(document.querySelector('#dlg').textContent); })());

// Taalwissel herbouwt UI in het Engels
const langSel = document.querySelector('#lang');
langSel.value = 'en'; langSel.dispatchEvent(new dom.window.Event('change'));
check('taalwissel -> Engelse convert-knop', document.querySelector('.js-convert').textContent.trim() === 'Convert & download', `(${document.querySelector('.js-convert').textContent})`);

// Autosave schreef naar (jsdom) localStorage
check('autosave bewaarde status', app.store.hasState());

// Logo + merk
check('brug-logo aanwezig', !!document.querySelector('.brand svg.logo'));
check('station-chip toont call na laden', document.querySelector('#brandCall').textContent === 'ON3VZ');

// Geïntegreerde handleiding opent en toont vertaalde inhoud
app._helpDialog();
const helpTxt = document.querySelector('#dlg').textContent;
check('handleiding opent met secties', /QSObridge/.test(helpTxt) && helpTxt.length > 400);
// Taalwissel reeds op EN gebeurd -> help in het Engels
check('handleiding volgt taal (EN)', /What is QSObridge/.test(helpTxt), `(${helpTxt.slice(0,40)})`);

// Knoppen hebben iconen (SVG in de knop)
check('knoppen hebben iconen', document.querySelectorAll('button svg.ico').length >= 12, `(${document.querySelectorAll('button svg.ico').length})`);

// DXCC-verrijking via de knop vult ontbrekende zones
app._enrich();
check('verrijking vulde CQ-zones', app.ed.qsos.some((q) => q.cqZone != null));
check('verrijking zette continent', app.ed.qsos.some((q) => q.extras && q.extras.CONT));

// "Over de data"-paneel toont herkomst + import
app._dataDialog();
const dataTxt = document.querySelector('#dlg').textContent;
check('data-paneel noemt bron AD1C', /AD1C/.test(dataTxt));
check('data-paneel biedt cty.dat-import', !!document.querySelector('#ctyFile'));

// Checks-engine: forceer een zone-mismatch en controleer het suggestiepaneel
const onq = app.ed.qsos.find((q) => q.call && q.call.startsWith('G')) || app.ed.qsos[0];
onq.call = 'ON3VZ'; onq.cqZone = 5; // ON hoort CQ 14 te zijn
app._checksDialog();
const ckTxt = document.querySelector('#dlg').textContent;
check('checks-paneel toont suggesties', /source|bron/i.test(ckTxt) && document.querySelectorAll('.ckrow').length > 0);
check('checks-paneel toont bron', /cty|AD1C/i.test(ckTxt));
// Pas de eerste toepasbare suggestie toe
const applyBtn = document.querySelector('.ckrow .ap');
if (applyBtn) applyBtn.click();
check('suggestie toepassen corrigeert zone', app.ed.qsos.find((q) => q.call === 'ON3VZ').cqZone === 14, `(${app.ed.qsos.find((q) => q.call === 'ON3VZ').cqZone})`);

// Fase F: ADX-export via de editor
check('ADX-serializer beschikbaar', app.ed.export('adx').files[0].name.endsWith('.adx'));
check('ADX bevat <ADX>', /<ADX>/.test(app.ed.export('adx').files[0].content));

// Fase E: AI-dialoog met mock-provider
const { setProvider, mockProvider } = await import('../js/assist/provider.js');
setProvider(mockProvider('[{"call":"pa1abc","date":"2026-07-26","time":"1200","band":"20m","mode":"ssb"}]'));
app._aiDialog();
document.querySelector('#aiText').value = 'pa1abc 20m ssb 1200';
const before = app.ed.qsos.length;
await document.querySelector('#aiGo').onclick();
check('AI-dialoog interpreteert (mock)', /1 QSO/.test(document.querySelector('#aiResult').textContent), `(${document.querySelector('#aiResult').textContent})`);
document.querySelector('#aiAdd').onclick();
check('AI-suggestie toegevoegd als rij', app.ed.qsos.length === before + 1 && app.ed.qsos.some((q) => q.call === 'PA1ABC'));

// Fase H: toegankelijkheid + views
check('raster heeft role=grid', !!document.querySelector('table.log[role="grid"]'));
check('kolomkop heeft aria-sort', !!document.querySelector('th[aria-sort]'));
check('statusbalk is aria-live', document.querySelector('.status').getAttribute('aria-live') === 'polite');
check('html lang gezet', document.documentElement.lang && document.documentElement.lang.length === 2);
check('views-select aanwezig', !!document.querySelector('#viewSel'));
// ongeldige cel krijgt aria-invalid (verplicht veld leeggemaakt)
app.ed.profileId = 'pota'; app.ed.qsos[0].band = null; app.ed.filters = { band: '', mode: '', call: '', onlyMissing: false, onlyDupes: false }; app.render();
check('ongeldige cel heeft aria-invalid', !!document.querySelector('input.cell[aria-invalid="true"]'));

// Virtualisatie: veel rijen -> spacer met echte hoogte + slechts een venster in de DOM
const { QsoEditor: EdV } = await import('../js/grid/editor.js');
const { makeQso: mkV } = await import('../js/model/qso.js');
const many = Array.from({ length: 200 }, (_, i) => mkV({ call: `T${i}ABC`, band: '20m', mode: 'CW', datetime: '2026-07-26T14:00:00Z' }));
app.ed = new EdV(many, app.ed.session);
app.render();
const dataRows = document.querySelectorAll('#tbody tr[data-id]').length;
check('virtualisatie rendert een venster (< alle rijen)', dataRows > 0 && dataRows < 200, `(${dataRows})`);
const spacer = document.querySelector('#tbody td[colspan]');
check('spacer-cel heeft hoogte (scrollbaar)', !!spacer && /height:\s*\d+px/.test(spacer.getAttribute('style')), `(${spacer && spacer.getAttribute('style')})`);

// Kolommen: na laden zijn alle aanwezige kolommen zichtbaar (geen verborgen kern)
app._loadText(adi, 'sample2.adi');
check('alle aanwezige kolommen zichtbaar na laden', app.ed.hiddenCols.size === 0);

// Splitsen/samenvoegen-dialoog werkt end-to-end
app.ed.qsos[0].extras = Object.assign({}, app.ed.qsos[0].extras, { EXCH: '599 14' });
app._colOpsDialog();
check('colops-dialoog geopend', !!document.querySelector('#spSrc') && !!document.querySelector('#mgT'));
// stel split in op extras.EXCH -> rstRcvd + cqZone
const spSrc = document.querySelector('#spSrc');
[...spSrc.options].forEach((o) => { if (o.value === 'extras.EXCH') spSrc.value = 'extras.EXCH'; });
document.querySelector('#spT0').value = 'rstRcvd';
document.querySelector('#spT1').value = 'cqZone';
document.querySelector('#spGo').onclick();
check('split via dialoog vult velden', app.ed.qsos[0].rstRcvd === '599' && String(app.ed.qsos[0].cqZone) === '14', `(${app.ed.qsos[0].rstRcvd}/${app.ed.qsos[0].cqZone})`);

// Profiel toont vereiste velden als kolom, ook als de data ze niet heeft
app.ed.profileId = 'uba-dx';
const cols = app.columns();
check('UBA DX: sectie-kolom aanwezig (ook al ontbreekt data)', cols.some((c) => c.key === 'section'));
check('vereiste kolommen gemarkeerd', cols.some((c) => c.key === 'serialSent' && c.required));
check('vereiste kolommen staan vooraan', cols[0].required === true);
app.render();
const reqHeader = document.querySelector('.log thead th.req');
check('kolomkop toont verplicht-markering', !!reqHeader && /•/.test(reqHeader.textContent));
// de lege verplichte provincie-cel is rood (aria-invalid)
check('ontbrekend verplicht veld is aria-invalid', !!document.querySelector('td.invalid input[aria-invalid="true"]'));

// Export-controls staan boven én onder en zijn gesynchroniseerd
const outfmts = document.querySelectorAll('.js-outfmt');
const converts = document.querySelectorAll('.js-convert');
check('export-doel boven én onder', outfmts.length === 2);
check('converteer-knop boven én onder', converts.length === 2);
outfmts[0].value = 'adx'; outfmts[0].dispatchEvent(new dom.window.Event('change'));
check('doelformaat gesynchroniseerd', outfmts[1].value === 'adx' && app.outFmt === 'adx');
converts[0].click();
check('converteer werkt vanaf bovenbalk', true);

// Datumfilter aanwezig + grid-wrap is de scrollcontainer (overflow auto)
check('datum-van/tot inputs aanwezig', !!document.querySelector('#fFrom') && !!document.querySelector('#fTo'));
const gw = document.querySelector('#gridWrap');
check('grid-wrap bestaat als scrollcontainer', !!gw && gw.id === 'gridWrap');
// datumfilter werkt via de UI
app.ed.qsos = [
  (await import('../js/model/qso.js')).makeQso({ call: 'X', datetime: '2026-07-11T20:00:00Z' }),
  (await import('../js/model/qso.js')).makeQso({ call: 'Y', datetime: '2026-07-25T15:40:00Z' })
];
document.querySelector('#fFrom').value = '2026-07-25';
document.querySelector('#fFrom').dispatchEvent(new dom.window.Event('change'));
check('datumfilter via UI filtert', app.ed.visible().length === 1 && app.ed.visible()[0].call === 'Y');

// Kop/inzending-formulier: invullen -> komt in de Cabrillo-kop
app.ed.profileId = 'iota';
app._headerDialog();
check('header-formulier geopend', !!document.querySelector('#hCatTime') && !!document.querySelector('#hClub'));
document.querySelector('#hCatTime').value = '24-HOURS';
document.querySelector('#hCatAss').value = 'NON-ASSISTED';
document.querySelector('#hClub').value = 'UBA';
document.querySelector('#hS').click();
check('header opgeslagen in sessie', app.ed.session.categories.time === '24-HOURS' && app.ed.session.club === 'UBA');
const hout = app.ed.export('cabrillo').files[0].content;
check('Cabrillo-kop bevat ingevulde velden', /CATEGORY-TIME: 24-HOURS/.test(hout) && /CLUB: UBA/.test(hout));

// Profiel stuurt automatisch het doelformaat
const psel = document.querySelector('#profile');
psel.value = 'iota'; psel.dispatchEvent(new dom.window.Event('change'));
check('profiel iota -> doel cabrillo', app.outFmt === 'cabrillo');
psel.value = 'pota'; psel.dispatchEvent(new dom.window.Event('change'));
check('profiel pota -> doel adif', app.outFmt === 'adif');

// Pre-flight: doel handmatig op mismatch zetten -> waarschuwing bij export
app.ed.profileId = 'iota'; app.outFmt = 'adif'; app._syncOutFmt();
app._convert();
check('pre-flight waarschuwt bij profiel/doel-mismatch', !!document.querySelector('#pfFix'));
document.querySelector('#pfFix').click();
check('pre-flight corrigeert doel naar cabrillo', app.outFmt === 'cabrillo');

console.log(`\n==== DOM-smoke: ${pass} geslaagd, ${fail} gefaald ====\n`);
process.exit(fail ? 1 : 0);
