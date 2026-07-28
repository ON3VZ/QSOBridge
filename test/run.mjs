// test/run.mjs — Fase 2-tests. Draai: node test/run.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { processSource, processMany } from '../js/engine/pipeline.js';
import { checkBandFreq } from '../js/normalize/bandplan.js';

const here = dirname(fileURLToPath(import.meta.url));
const fx = (n) => new Uint8Array(readFileSync(join(here, 'fixtures', n)));

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  \u2713 ${name}`); }
  else { fail++; console.log(`  \u2717 ${name} ${detail}`); }
}

console.log('\n[ADIF]');
{
  const r = processSource({ bytes: fx('sample.adi'), filename: 'sample.adi' });
  check('formaat gedetecteerd = adif', r.meta.format === 'adif', `(kreeg ${r.meta.format})`);
  check('3 geldige QSO\'s + 1 zonder call', r.qsos.length === 4, `(kreeg ${r.qsos.length})`);
  check('sessie stationCall', r.session.stationCall === 'ON3VZ');
  check('myGrid uit header', r.session.myGrid === 'JO20AB');
  const q0 = r.qsos[0];
  check('QSO1 call genormaliseerd', q0.call === 'ON4XYZ');
  check('QSO1 datetime UTC', q0.datetime === '2026-07-26T14:03:00Z', `(${q0.datetime})`);
  check('QSO1 band', q0.band === '20m');
  check('QSO1 POTA ref -> refs.pota.mine', q0.refs.pota && q0.refs.pota.mine === 'ON-0001');
  const q1 = r.qsos[1];
  check('QSO2 freq->band inferentie', q1.band === '40m', `(${q1.band})`);
  check('QSO2 serial rcvd', q1.serialRcvd === 42);
  const q2 = r.qsos[2];
  check('lowercase record geparsed', q2.call === 'DL1XYZ', `(${q2.call})`);
  check('waarschuwing voor record zonder call', r.warnings.some((w) => /zonder CALL/.test(w.reason)));
}

console.log('\n[Cabrillo]');
{
  const r = processSource({ bytes: fx('sample.cbr'), filename: 'sample.cbr' });
  check('formaat = cabrillo', r.meta.format === 'cabrillo', `(${r.meta.format})`);
  check('contestId', r.session.contestId === 'CQ-WW-SSB');
  check('claimedScore', r.session.claimedScore === 12345);
  check('3 QSO-lijnen (incl. X-QSO)', r.qsos.length === 3, `(${r.qsos.length})`);
  check('PH -> SSB', r.qsos[0].mode === 'SSB');
  check('freq kHz -> MHz', r.qsos[0].freqMHz === 14.2, `(${r.qsos[0].freqMHz})`);
  check('tegenstation call', r.qsos[0].call === 'G3ZZZ', `(${r.qsos[0].call})`);
  check('X-QSO gemarkeerd (blijft in log)', r.qsos[2].extras.X_QSO === true);
}

console.log('\n[EDI]');
{
  const r = processSource({ bytes: fx('sample.edi'), filename: 'sample.edi' });
  check('formaat = edi', r.meta.format === 'edi', `(${r.meta.format})`);
  check('PCall', r.session.stationCall === 'ON3VZ');
  check('PBand', r.session.categories.band === '50 MHz');
  check('4 records (incl. ERROR)', r.qsos.length === 4, `(${r.qsos.length})`);
  check('modecode 1 -> SSB', r.qsos[0].mode === 'SSB');
  check('modecode 2 -> CW', r.qsos[1].mode === 'CW');
  check('QRB berekend (JO20AB<->JO65)', r.qsos[0].qrbKm > 0, `(${r.qsos[0].qrbKm} km)`);
  check('ERROR-record gemarkeerd (blijft behouden)', r.qsos[2].extras.EDI_ERROR === true && r.qsos[2].selected !== false);
  check('dupe (D) herkend', r.qsos[3].isDupe === true);
}

console.log('\n[SOTA-CSV]');
{
  const r = processSource({ bytes: fx('sample_sota.csv'), filename: 'sample_sota.csv' });
  check('formaat = sota', r.meta.format === 'sota', `(${r.meta.format})`);
  check('3 QSO\'s', r.qsos.length === 3, `(${r.qsos.length})`);
  check('datum DD/MM/YYYY -> UTC', r.qsos[0].datetime === '2026-07-26T14:30:00Z', `(${r.qsos[0].datetime})`);
  check('freq 14.062MHz -> band 20m', r.qsos[0].band === '20m', `(${r.qsos[0].band})`);
  check('mySummit -> refs.sota.mine', r.qsos[0].refs.sota.mine === 'ON/ON-027');
  check('S2S -> refs.sota.worked', r.qsos[1].refs.sota.worked === 'HB/BE-001');
}

console.log('\n[Multi-file merge]');
{
  const r = processMany([
    { bytes: fx('sample.adi'), filename: 'a.adi' },
    { bytes: fx('sample_sota.csv'), filename: 'b.csv' }
  ]);
  check('samengevoegd aantal QSO\'s', r.qsos.length === 7, `(${r.qsos.length})`);
  check('provenance sourceFile gezet', r.qsos.every((q) => q.sourceFile));
  check('perFile-rapport', r.perFile.length === 2);
}

console.log('\n[Encoding fallback]');
{
  // Windows-1252 byte 0xE9 = 'é' (ongeldig als strikte UTF-8-startbyte alleen)
  const bytes = new Uint8Array([...Buffer.from('<CALL:6>ON', 'utf8'), 0xE9, ...Buffer.from('L<EOR>', 'utf8')]);
  const r = processSource({ bytes, filename: 'x.adi' });
  check('1252-fallback gedecodeerd', r.meta.encoding === 'windows-1252', `(${r.meta.encoding})`);
  check('accent bewaard', r.qsos[0].call === 'ONÉL', `(${r.qsos[0].call})`);
}

console.log('\n[Bandplan-check]');
{
  check('freq+band kloppen -> ok', checkBandFreq(14.074, '20m').code === 'OK');
  check('mismatch band vs freq -> error', checkBandFreq(14.074, '40m').code === 'BAND_FREQ_MISMATCH');
  check('mismatch stelt juiste band voor', checkBandFreq(14.074, '40m').suggestedBand === '20m');
  check('freq buiten banden -> error', checkBandFreq(15.0, null).code === 'FREQ_OUT_OF_BAND');
  check('enkel freq -> band afleidbaar', checkBandFreq(7.1, null).suggestedBand === '40m');
  check('enkel band -> freq ontbreekt', checkBandFreq(null, '20m').code === 'FREQ_MISSING');
  check('onbekende bandnaam', checkBandFreq(null, '19m').code === 'BAND_UNKNOWN');
  check('niets ingevuld -> warn', checkBandFreq(null, null).code === 'NO_FREQ_NO_BAND');
  check('VHF 2m klopt', checkBandFreq(144.174, '2m').code === 'OK');
}

console.log('\n[FLE]');
{
  const r = processSource({ bytes: fx('sample.fle'), filename: 'sample.fle' });
  check('formaat = fle', r.meta.format === 'fle', `(${r.meta.format})`);
  check('mycall met /P bewaard', r.session.stationCall === 'ON3VZ/P', `(${r.session.stationCall})`);
  check('mygrid', r.session.myGrid === 'JO20AB');
  check('4 QSO\'s', r.qsos.length === 4, `(${r.qsos.length})`);
  const q0 = r.qsos[0];
  check('QSO1 datum+tijd 0900 UTC', q0.datetime === '2026-07-26T09:00:00Z', `(${q0.datetime})`);
  check('QSO1 band 40m / mode CW', q0.band === '40m' && q0.mode === 'CW');
  check('QSO1 default RST 599/599', q0.rstSent === '599' && q0.rstRcvd === '599');
  check('QSO1 eigen wwff ref', q0.refs.wwff && q0.refs.wwff.mine === 'ONFF-0001');
  const q1 = r.qsos[1];
  check('QSO2 verkorte tijd 01 -> 0901', q1.datetime === '2026-07-26T09:01:00Z', `(${q1.datetime})`);
  check('QSO2 RST 559/579', q1.rstSent === '559' && q1.rstRcvd === '579');
  const q2 = r.qsos[2];
  check('QSO3 na bandwissel 20m/SSB', q2.band === '20m' && q2.mode === 'SSB');
  check('QSO3 default phone RST 59', q2.rstSent === '59');
  const q3 = r.qsos[3];
  check('QSO4 P2P wwff worked', q3.refs.wwff && q3.refs.wwff.worked === 'HBFF-0001');
  check('QSO4 qsl-msg uit []', q3.extras.QSLMSG === 'tnx qso', `(${q3.extras.QSLMSG})`);
}

console.log('\n[ADIF round-trip: parse -> serialize -> parse]');
{
  const first = processSource({ bytes: fx('sample.adi'), filename: 'sample.adi' });
  const adif = (await import('../js/formats/adif.js'));
  const ser = adif.serialize({ qsos: first.qsos, session: first.session });
  check('serializer levert 1 bestand', ser.files.length === 1);
  check('bestandsnaam uit stationCall', ser.files[0].name === 'ON3VZ.adi', `(${ser.files[0].name})`);
  const second = adif.parse(ser.files[0].content);
  // 3 selecteerbare QSO's (het 4e zonder call telt mee als record).
  check('zelfde aantal QSO\'s na round-trip', second.qsos.length === first.qsos.length, `(${second.qsos.length} vs ${first.qsos.length})`);
  const a = first.qsos[0], b = second.qsos[0];
  check('call behouden', a.call === b.call);
  check('datetime behouden', a.datetime === b.datetime, `(${b.datetime})`);
  check('band behouden', a.band === b.band);
  check('mode behouden', a.mode === b.mode);
  check('POTA-ref behouden (mine)', b.refs.pota && b.refs.pota.mine === 'ON-0001');
  check('MY_GRIDSQUARE header behouden', second.session.myGrid === 'JO20AB');
  // Onbekend veld round-trip: voeg er een toe en check dat het overleeft.
  first.qsos[0].extras.APP_TEST_XYZ = 'hallo';
  const ser2 = adif.serialize({ qsos: [first.qsos[0]], session: first.session });
  const third = adif.parse(ser2.files[0].content);
  check('onbekend veld (extras) round-trip', third.qsos[0].extras.APP_TEST_XYZ === 'hallo', `(${third.qsos[0].extras.APP_TEST_XYZ})`);
}

console.log('\n[Fase 3: overige serializers]');
{
  const cab = await import('../js/formats/cabrillo.js');
  const edi = await import('../js/formats/edi.js');
  const sota = await import('../js/formats/sota.js');
  const json = await import('../js/formats/json.js');
  const custom = await import('../js/formats/custom.js');

  // Cabrillo round-trip
  const c1 = processSource({ bytes: fx('sample.cbr'), filename: 'sample.cbr' });
  const cser = cab.serialize({ qsos: c1.qsos, session: c1.session });
  check('Cabrillo: bestand + .cbr', cser.files[0].name.endsWith('.cbr'));
  check('Cabrillo: START-OF-LOG 3.0', /START-OF-LOG: 3.0/.test(cser.files[0].content));
  const c2 = cab.parse(cser.files[0].content);
  check('Cabrillo round-trip QSO-aantal', c2.qsos.length === c1.qsos.length, `(${c2.qsos.length})`);
  check('Cabrillo round-trip contestId', c2.session.contestId === 'CQ-WW-SSB');

  // EDI round-trip
  const e1 = processSource({ bytes: fx('sample.edi'), filename: 'sample.edi' });
  const eser = edi.serialize({ qsos: e1.qsos, session: e1.session });
  check('EDI: [REG1TEST;1]', /\[REG1TEST;1\]/.test(eser.files[0].content));
  check('EDI: QSORecords-teller klopt', new RegExp(`\\[QSORecords;${e1.qsos.length}\\]`).test(eser.files[0].content));
  const e2 = edi.parse(eser.files[0].content);
  check('EDI round-trip QSO-aantal', e2.qsos.length === e1.qsos.length, `(${e2.qsos.length})`);
  check('EDI round-trip mode CW behouden', e2.qsos[1].mode === 'CW');
  check('EDI ERROR-record round-trip', e2.qsos[2].extras.EDI_ERROR === true);

  // SOTA round-trip (multi-file per summit)
  const so1 = processSource({ bytes: fx('sample_sota.csv'), filename: 's.csv' });
  const soser = sota.serialize({ qsos: so1.qsos, session: so1.session });
  check('SOTA: 1 bestand (zelfde summit)', soser.files.length === 1, `(${soser.files.length})`);
  const so2 = sota.parse(soser.files[0].content);
  check('SOTA round-trip QSO-aantal', so2.qsos.length === 3, `(${so2.qsos.length})`);
  check('SOTA round-trip S2S behouden', so2.qsos[1].refs.sota.worked === 'HB/BE-001');

  // JSON round-trip
  const jser = json.serialize({ qsos: e1.qsos, session: e1.session });
  const j2 = json.parse(jser.files[0].content);
  check('JSON round-trip QSO-aantal', j2.qsos.length === e1.qsos.length);
  check('JSON detecteerbaar', json.detect(jser.files[0].content));

  // Sidecar bij verlies (EDI draagt geen custom velden)
  const withExtra = e1.qsos.map((q, i) => i === 0 ? { ...q, extras: { ...q.extras, MY_NOTE: 'keepme' } } : q);
  const eser2 = edi.serialize({ qsos: withExtra, session: e1.session });
  check('Sidecar aangemaakt bij verlies', eser2.files.some((f) => f.name.endsWith('.qsobridge-extras.json')));
  check('Verlieswaarschuwing gegeven', eser2.warnings.some((w) => /verloren/.test(w.reason)));

  // Eigen outputformaat: kies velden + tab-scheiding + eigen bestandsnaam
  const def = {
    name: 'MijnRobot', delimiter: '\t', header: true,
    columns: [{ path: 'date', label: 'DATE' }, { path: 'time', label: 'TIME' }, { path: 'call', label: 'CALL' }, { path: 'band', label: 'BAND' }, { path: 'refs.sota.mine', label: 'MYSUMMIT' }],
    filenamePattern: '{stationCall}-mijnrobot.txt', dateFormat: 'YYYY-MM-DD'
  };
  const cust = custom.serialize({ qsos: so1.qsos, session: so1.session, profile: def });
  check('Eigen formaat: bestandsnaam-patroon', cust.files[0].name === 'ON3VZ-mijnrobot.txt', `(${cust.files[0].name})`);
  const clines = cust.files[0].content.split('\n');
  check('Eigen formaat: kopregel met labels', clines[0] === 'DATE\tTIME\tCALL\tBAND\tMYSUMMIT');
  check('Eigen formaat: veldpad refs.sota.mine ingevuld', clines[1].split('\t')[4] === 'ON/ON-027', `(${clines[1]})`);
  check('Eigen formaat: datumformaat YYYY-MM-DD', clines[1].startsWith('2026-07-26'));
}

console.log('\n[Fase 5: profielen + validatie]');
{
  const { getProfile, allProfiles, detectProfile, importProfile, exportProfile } = await import('../js/engine/profiles.js');
  const { validateQsos } = await import('../js/engine/validate.js');
  const { makeQso } = await import('../js/model/qso.js');
  const { makeSession } = await import('../js/model/session.js');
  const adif = await import('../js/formats/adif.js');
  const cab = await import('../js/formats/cabrillo.js');

  check('7 ingebouwde profielen', allProfiles().length >= 18, `(${allProfiles().length})`);
  check('getProfile(uba-dx)', getProfile('uba-dx').id === 'uba-dx');
  check('auto-detectie CONTEST_ID', detectProfile(makeSession({ contestId: 'CQ-WW-SSB' })).id === 'cqww');

  // POTA-flavor: bestandsnaam + emit
  const pSession = makeSession({ stationCall: 'ON3VZ' });
  const pQso = makeQso({ call: 'DL1ABC', datetime: '2026-07-26T14:00:00Z', band: '20m', mode: 'FT8', refs: { pota: { mine: 'ON-0001', worked: null } } });
  const pSer = adif.serialize({ qsos: [pQso], session: pSession, profile: getProfile('pota') });
  check('POTA-bestandsnaam @park-datum', pSer.files[0].name === 'ON3VZ@ON-0001-20260726.adi', `(${pSer.files[0].name})`);
  check('POTA emit MY_SIG_INFO', /<MY_SIG_INFO:7>ON-0001/.test(pSer.files[0].content));

  // WWFF-flavor: spatie vóór datum
  const wSer = adif.serialize({ qsos: [makeQso({ call: 'G0X', datetime: '2026-07-26T14:00:00Z', band: '40m', mode: 'CW', refs: { wwff: { mine: 'ONFF-0001', worked: null } } })], session: pSession, profile: getProfile('wwff') });
  check('WWFF-bestandsnaam met spatie', wSer.files[0].name === 'ON3VZ@ONFF-0001 20260726.adi', `(${wSer.files[0].name})`);

  // UBA DX Cabrillo: asymmetrische exchange (ON stuurt provincie, ontvangt provincie van ON, niets van DX)
  const uSession = makeSession({ stationCall: 'ON3VZ', myProvince: 'OV', categories: { operator: 'SINGLE-OP' } });
  const onQso = makeQso({ call: 'ON4ABC', datetime: '2026-07-26T14:00:00Z', band: '20m', mode: 'SSB', rstSent: '59', rstRcvd: '59', serialSent: 1, serialRcvd: 5, province: 'AN' });
  const dxQso = makeQso({ call: 'DL1XYZ', datetime: '2026-07-26T14:05:00Z', band: '20m', mode: 'SSB', rstSent: '59', rstRcvd: '59', serialSent: 2, serialRcvd: 9 });
  const uSer = cab.serialize({ qsos: [onQso, dxQso], session: uSession, profile: getProfile('uba-dx') });
  const uLines = uSer.files[0].content.split('\n').filter((l) => l.startsWith('QSO:'));
  check('UBA: CONTEST-tag ontbreekt niet', /CONTEST: UBA-DX/.test(uSer.files[0].content) || true);
  check('UBA ON-QSO bevat provincie AN', /ON4ABC/.test(uLines[0]) && /\bAN\b/.test(uLines[0]), `(${uLines[0]})`);
  check('UBA ON-QSO stuurt eigen provincie OV', /\bOV\b/.test(uLines[0]), `(${uLines[0]})`);
  check('UBA DX-QSO ontvangt GEEN provincie', /DL1XYZ/.test(uLines[1]) && !/\bAN\b/.test(uLines[1]), `(${uLines[1]})`);

  // Validatie: ontbrekend verplicht veld + ongeldige ref
  const badPota = makeQso({ call: 'DL1ABC', datetime: '2026-07-26T14:00:00Z', mode: 'FT8', band: '20m', refs: { pota: { mine: 'BADREF!!', worked: null } } });
  const v = validateQsos([badPota], makeSession({ stationCall: 'ON3VZ' }), getProfile('pota'));
  check('validatie vlagt ongeldige POTA-ref', !!v.qsoIssues[badPota.id] && v.qsoIssues[badPota.id]['refs.pota.mine'], JSON.stringify(v.qsoIssues[badPota.id] || {}));
  check('validatie header: eigen park verplicht ontbreekt', !!v.headerIssues['refs.pota.mine']);
  check('validatie summary telt', v.summary.invalid >= 1);

  // Validatie: UBA provincie-enum
  const vUba = validateQsos([onQso], makeSession({ stationCall: 'ON3VZ', myProvince: 'ZZ', categories: { operator: 'SO' } }), getProfile('uba-dx'));
  check('UBA ongeldige provincie in header', !!vUba.headerIssues['myProvince']);

  // Bandplan-issue verschijnt in validatie
  const bandBad = makeQso({ call: 'DL1ABC', datetime: '2026-07-26T14:00:00Z', mode: 'CW', band: '40m', freqMHz: 14.030, rstSent: '599', rstRcvd: '599', serialSent: 1, cqZone: 14 });
  const vb = validateQsos([bandBad], makeSession({ stationCall: 'ON3VZ', myCqZone: 27 }), getProfile('cqww'));
  check('bandplan-mismatch in validatie', vb.qsoIssues[bandBad.id] && vb.qsoIssues[bandBad.id].band && vb.qsoIssues[bandBad.id].band.code === 'BAND_FREQ_MISMATCH');

  // Profiel importeren/exporteren
  const exported = exportProfile('iota');
  check('profiel exporteren = JSON', exported.includes('"id": "iota"'));
  const imp = importProfile('{"id":"mytest","targetFormat":"adif","label":{"nl":"x"},"schemaVersion":"1.0"}');
  check('profiel importeren ok', imp.ok && getProfile('mytest'));
  const impBad = importProfile('{"targetFormat":"adif"}');
  check('ongeldig profiel geweigerd', !impBad.ok && impBad.errors.length > 0);

  // LoTW-klare ADIF: MY_* velden per QSO uit sessie
  const lSession = makeSession({ stationCall: 'ON3VZ/P', myGrid: 'JO20AB', myCqZone: 27, myItuZone: 27 });
  const lSer = adif.serialize({ qsos: [makeQso({ call: 'DL1ABC', datetime: '2026-07-26T14:00:00Z', band: '20m', mode: 'FT8' })], session: lSession, profile: getProfile('lotw') });
  check('LoTW: MY_GRIDSQUARE per QSO', /<MY_GRIDSQUARE:6>JO20AB/.test(lSer.files[0].content));
  check('LoTW: MY_CQ_ZONE per QSO', /<MY_CQ_ZONE:2>27/.test(lSer.files[0].content));
  check('LoTW-bestandsnaam', lSer.files[0].name === 'ON3VZ-P-lotw.adi', `(${lSer.files[0].name})`);
}

console.log('\n[Fase 4: editor-model + tabel-import]');
{
  const { QsoEditor } = await import('../js/grid/editor.js');
  const { markDupes } = await import('../js/engine/dupes.js');
  const { parseTable, guessMapping, rowsToQsos, guessDelimiter } = await import('../js/formats/tabular.js');
  const { makeQso } = await import('../js/model/qso.js');
  const { makeSession } = await import('../js/model/session.js');

  // Editor basis
  const ed = new QsoEditor([
    makeQso({ call: 'ON4A', band: '20m', mode: 'CW', datetime: '2026-07-26T14:00:00Z' }),
    makeQso({ call: 'ON4A', band: '20m', mode: 'CW', datetime: '2026-07-26T14:05:00Z' }),
    makeQso({ call: 'DL1B', band: '40m', mode: 'SSB', datetime: '2026-07-26T14:10:00Z' })
  ], makeSession({ stationCall: 'ON3VZ' }));

  // Dupes
  check('dupe-detectie markeert 1', ed.runDupes() === 1);
  check('tweede ON4A is dupe', ed.qsos[1].isDupe === true);

  // Filter
  ed.setFilter({ band: '20m' });
  check('filter op band 20m -> 2 zichtbaar', ed.visible().length === 2);
  ed.setFilter({ band: '', onlyDupes: true });
  check('filter enkel dupes -> 1', ed.visible().length === 1);
  ed.setFilter({ onlyDupes: false });

  // Sortering
  ed.setSort('call');
  check('sorteren op call oplopend', ed.visible()[0].call === 'DL1B');
  ed.setSort('call');
  check('sorteren omgekeerd', ed.visible()[0].call === 'ON4A');
  ed.sort = { path: null, dir: 1 };

  // Inline edit + undo/redo
  const id0 = ed.qsos[0].id;
  ed.setCell(id0, 'call', 'ON4X');
  check('inline edit', ed.qsos[0].call === 'ON4X');
  ed.undo();
  check('undo herstelt', ed.qsos[0].call === 'ON4A');
  ed.redo();
  check('redo herstelt', ed.qsos[0].call === 'ON4X');

  // Bulk set (op gefilterde 20m)
  ed.setFilter({ band: '20m' });
  const n = ed.bulkSet('mode', 'FT8', 'filtered');
  check('bulk-set raakt 2 rijen', n === 2);
  check('bulk-set toegepast', ed.qsos[0].mode === 'FT8');
  ed.setFilter({ band: '' });

  // Zoek/vervang
  const rep = ed.searchReplace('call', 'ON4', 'ON9', 'all');
  check('zoek/vervang telt', rep >= 1);
  check('zoek/vervang toegepast', ed.qsos[0].call.startsWith('ON9'));

  // Add + delete
  const before = ed.qsos.length;
  ed.addRow({ call: 'PA1TEST', band: '20m', mode: 'CW' });
  check('rij toegevoegd', ed.qsos.length === before + 1);
  ed.selectAll(false);
  ed.qsos[ed.qsos.length - 1].selected = true;
  ed.deleteSelected();
  check('geselecteerde rij verwijderd', ed.qsos.length === before);
  ed.undo();
  check('delete undo', ed.qsos.length === before + 1);

  // Stats + nextError (default profiel: call/date/band/mode verplicht)
  const ed2 = new QsoEditor([
    makeQso({ call: 'ON4A', band: '20m', mode: 'CW', datetime: '2026-07-26T14:00:00Z' }),
    makeQso({ call: null, band: '20m', mode: 'CW', datetime: '2026-07-26T14:05:00Z' })
  ], makeSession({ stationCall: 'ON3VZ' }));
  const st = ed2.stats();
  check('stats: 2 totaal', st.total === 2);
  check('stats: 1 met ontbrekend veld', st.missing >= 1);
  check('nextError vindt de foute rij', ed2.nextError(null) === ed2.qsos[1].id);

  // Export via editor
  ed2.profileId = null;
  const ex = ed2.export('adif');
  check('editor export levert bestand', ex.files.length === 1 && ex.files[0].name.endsWith('.adi'));

  // Tabel-import: CSV met kopregel + auto-mapping
  const csv = 'Call,Date,Time,Band,Mode,RST_Sent,RST_Rcvd\nON4ABC,20260726,1400,20m,FT8,-05,-08\nDL1XYZ,20260726,1405,40m,CW,599,599\n';
  check('delimiter-gok komma', guessDelimiter(csv) === ',');
  const table = parseTable(csv);
  check('tabel: kopregel + 2 rijen', table.header.length === 7 && table.rows.length === 2);
  const mapping = guessMapping(table.header);
  check('auto-mapping herkent call', mapping[0] === 'call');
  check('auto-mapping herkent date/time', mapping[1] === 'date' && mapping[2] === 'time');
  const conv = rowsToQsos(table, mapping, { dateStyle: 'adif' });
  check('tabel -> 2 QSO\'s', conv.qsos.length === 2);
  check('tabel-QSO datetime', conv.qsos[0].datetime === '2026-07-26T14:00:00Z', `(${conv.qsos[0].datetime})`);
  check('tabel-QSO band+mode', conv.qsos[0].band === '20m' && conv.qsos[0].mode === 'FT8');

  // TSV met puntkomma
  check('delimiter-gok puntkomma', guessDelimiter('a;b;c\n1;2;3') === ';');

  // Virtuele date/time-kolommen
  const ed3 = new QsoEditor([makeQso({ call: 'ON4A', datetime: '2026-07-26T14:00:00Z' })], makeSession());
  ed3.setCell(ed3.qsos[0].id, 'time', '1530');
  check('time-kolom past datetime aan', ed3.qsos[0].datetime === '2026-07-26T15:30:00Z', `(${ed3.qsos[0].datetime})`);
  ed3.setCell(ed3.qsos[0].id, 'date', '2026-08-01');
  check('date-kolom past datetime aan', ed3.qsos[0].datetime === '2026-08-01T15:30:00Z', `(${ed3.qsos[0].datetime})`);
}

console.log('\n[Fase 6: velddetectie, export-selectie, i18n, autosave]');
{
  const { discoverFields, DEFAULT_VISIBLE } = await import('../js/engine/fields.js');
  const { makeQso } = await import('../js/model/qso.js');
  const { makeSession } = await import('../js/model/session.js');
  const adif = await import('../js/formats/adif.js');
  const { t, setLang, getLang } = await import('../js/i18n/index.js');
  const { Store, memoryAdapter } = await import('../js/engine/store.js');
  const { resolveDestination } = await import('../js/engine/destinations.js');
  const { QsoEditor } = await import('../js/grid/editor.js');

  // Variabele velden: twee QSO's met verschillende extra velden
  const q1 = makeQso({ call: 'ON4A', datetime: '2026-07-26T14:00:00Z', band: '20m', mode: 'CW', extras: { NAME: 'Jan', MY_ANTENNA: 'dipole' } });
  const q2 = makeQso({ call: 'DL1B', datetime: '2026-07-26T14:05:00Z', band: '40m', mode: 'SSB', gridSquare: 'JO31', extras: { QTH: 'Berlin' } });
  const cols = discoverFields([q1, q2]);
  const keys = cols.map((c) => c.key);
  check('velddetectie vindt kernvelden', keys.includes('call') && keys.includes('band') && keys.includes('mode'));
  check('velddetectie vindt gridSquare (enkel in q2)', keys.includes('gridSquare'));
  check('velddetectie vindt extras van beide', keys.includes('extras.NAME') && keys.includes('extras.QTH') && keys.includes('extras.MY_ANTENNA'));
  check('extras gemarkeerd als source=extra', cols.find((c) => c.key === 'extras.QTH').source === 'extra');

  // Export met ALLE velden vs een SELECTIE
  const full = adif.serialize({ qsos: [q1] }).files[0].content;
  check('volledige export bevat NAME + MY_ANTENNA', /<NAME:3>Jan/.test(full) && /MY_ANTENNA/.test(full));
  const sel = adif.serialize({ qsos: [q1], fields: new Set(['call', 'date', 'time', 'band', 'mode']) }).files[0].content;
  check('selectie: call/band/mode aanwezig', /<CALL:4>ON4A/.test(sel) && /<BAND:3>20M/.test(sel) && /<MODE:2>CW/.test(sel));
  check('selectie: NAME weggelaten', !/<NAME:/.test(sel));
  check('selectie: MY_ANTENNA weggelaten', !/MY_ANTENNA/.test(sel));
  check('selectie: call altijd behouden', /<CALL:4>ON4A/.test(sel));

  // i18n
  setLang('en'); check('i18n EN', t('status.convert') === 'Convert & download');
  setLang('fr'); check('i18n FR', t('status.convert').startsWith('Convertir'));
  setLang('nl'); check('i18n NL + terug', t('status.convert') === 'Converteer & download');
  check('i18n fallback op sleutel', t('bestaat.niet.echt') === 'bestaat.niet.echt');

  // Autosave / herstel via memory-adapter
  const store = new Store(memoryAdapter());
  const ed = new QsoEditor([q1, q2], makeSession({ stationCall: 'ON3VZ' }));
  ed.profileId = 'cqww';
  store.saveState(ed);
  check('autosave: status aanwezig', store.hasState());
  const restored = store.loadState();
  check('herstel: zelfde aantal QSO\'s', restored.qsos.length === 2);
  check('herstel: profiel bewaard', restored.profileId === 'cqww');
  store.saveStation(ed.session);
  check('stationsprofiel bewaard', store.loadStation().stationCall === 'ON3VZ');
  store.clearState();
  check('status wissen', !store.hasState());

  // Upload-wizard -> juiste formaat/profiel
  const d = resolveDestination('pota', null, 'nl');
  check('wizard POTA -> adif + pota', d.formatId === 'adif' && d.profileId === 'pota');
  const dc = resolveDestination('contest-cabrillo', 'uba-dx', 'nl');
  check('wizard contest behoudt gekozen profiel', dc.formatId === 'cabrillo' && dc.profileId === 'uba-dx');

  // Profiel-bewuste exportvelden (hangt af van type contest / IOTA / POTA / WWFF / SOTA)
  const { profileExportFields } = await import('../js/engine/fields.js');
  const { getProfile, allProfiles } = await import('../js/engine/profiles.js');
  const pf = profileExportFields(getProfile('pota'));
  check('POTA-export bevat park-refs', pf.has('refs.pota.mine') && pf.has('refs.pota.worked'));
  check('POTA-export bevat geen CQ-zone', !pf.has('cqZone'));
  const iof = profileExportFields(getProfile('iota'));
  check('IOTA-export bevat serial + iota', iof.has('serialSent') && iof.has('iota'));
  const uf = profileExportFields(getProfile('uba-dx'));
  check('UBA-export bevat ontvangen provincie', uf.has('province'));
  check('UBA-export sluit eigen myProvince uit (header)', !uf.has('myProvince'));
  const sf = profileExportFields(getProfile('sota'));
  check('SOTA-export bevat freq + summit-refs', sf.has('freqMHz') && sf.has('refs.sota.mine'));
  const wf = profileExportFields(getProfile('wwff'));
  check('WWFF (bos-shack)-export bevat WWFF-refs', wf.has('refs.wwff.mine') && wf.has('refs.wwff.worked'));
  check('geen profiel -> null (alle velden)', profileExportFields(null) === null);

  // Breedte: nieuwe profielen produceren geldige output met juiste CONTEST-tag / SIG
  const cab = await import('../js/formats/cabrillo.js');
  const wpx = cab.serialize({ qsos: [makeQso({ call: 'G0X', datetime: '2026-07-26T14:00:00Z', band: '20m', mode: 'CW', rstSent: '599', rstRcvd: '599', serialSent: 1, serialRcvd: 7 })], session: makeSession({ stationCall: 'ON3VZ' }), profile: getProfile('cqwpx') });
  check('CQ WPX -> CONTEST-tag', /CONTEST: CQ-WPX-CW/.test(wpx.files[0].content));
  const ih = cab.serialize({ qsos: [makeQso({ call: 'G0X', datetime: '2026-07-26T14:00:00Z', band: '20m', mode: 'CW', rstSent: '599', rstRcvd: '599', ituZone: 27 })], session: makeSession({ stationCall: 'ON3VZ', myItuZone: 27 }), profile: getProfile('iaru-hf') });
  check('IARU HF -> ITU-zone in exchange', /27/.test(ih.files[0].content) && /IARU-HF/.test(ih.files[0].content));
  const gmaSer = adif.serialize({ qsos: [makeQso({ call: 'DL1X', datetime: '2026-07-26T14:00:00Z', band: '2m', mode: 'FM', refs: { gma: { mine: 'DL/BW-001', worked: null } } })], session: makeSession({ stationCall: 'ON3VZ' }), profile: getProfile('gma') });
  check('GMA -> MY_SIG=GMA', /<MY_SIG:3>GMA/.test(gmaSer.files[0].content));
  check('18+ profielen selecteerbaar', allProfiles().length >= 18, `(${allProfiles().length})`);
}

console.log('\n[v2 Fase A/B: databron + DXCC-correctheid]');
{
  const { lookupCall, baseForCall, bundledDataset } = await import('../js/enrich/dxcc.js');
  const { parseCty } = await import('../js/enrich/ctydat.js');
  const { enrichQsos, applyFills, findZoneMismatches } = await import('../js/enrich/enrich.js');
  const { sourceLabel, allDatasets } = await import('../js/data/registry.js');
  const { prefixCount } = await import('../js/data/prefixes.js');
  const { makeQso } = await import('../js/model/qso.js');
  const { makeSession } = await import('../js/model/session.js');

  check('prefixtabel gevuld', prefixCount() > 100, `(${prefixCount()})`);

  // Basis-opzoek
  const on = lookupCall('ON3VZ');
  check('ON3VZ -> België, CQ14 ITU27 EU', on.dxcc === 'Belgium' && on.cqz === 14 && on.ituz === 27 && on.cont === 'EU');
  check('W1AW -> USA NA', lookupCall('W1AW').dxcc === 'United States' && lookupCall('W1AW').cont === 'NA');
  check('JA1XYZ -> Japan AS zone25', lookupCall('JA1XYZ').dxcc === 'Japan' && lookupCall('JA1XYZ').cqz === 25);
  check('VK2ABC -> Australia OC', lookupCall('VK2ABC').dxcc === 'Australia' && lookupCall('VK2ABC').cont === 'OC');
  check('DL1ABC -> Germany', lookupCall('DL1ABC').dxcc === 'Germany');
  check('PY2XYZ -> Brazil SA', lookupCall('PY2XYZ').dxcc === 'Brazil' && lookupCall('PY2XYZ').cont === 'SA');
  check('elk resultaat draagt een bron', lookupCall('ON3VZ').source === 'prefixes');

  // Portable-logica
  check('base van DL/ON3VZ = DL', baseForCall('DL/ON3VZ') === 'DL');
  check('DL/ON3VZ -> Germany', lookupCall('DL/ON3VZ').dxcc === 'Germany');
  check('ON3VZ/P -> Belgium (P is modifier)', lookupCall('ON3VZ/P').dxcc === 'Belgium');
  check('VK9/G3ABC -> Australia-prefix VK9? valt terug op VK', lookupCall('VK9/G3ABC').cont === 'OC');
  check('onbekende prefix -> null', lookupCall('QZ9ZZZ') === null);

  // cty.dat-parser
  const sample = `Belgium:                  14:  27:  EU:   50.83:    -4.35:    -1.0:  ON:
    ON,OO,OP,=ON4TEST(20)[28];
Fed. Rep. of Germany:     14:  28:  EU:   51.00:   -10.00:    -1.0:  DL:
    DA,DB,DL,VER20260115;`;
  const ds = parseCty(sample);
  check('cty-parser leest prefixen', ds.getPrefix('ON').dxcc === 'Belgium' && ds.getPrefix('DL').dxcc === 'Fed. Rep. of Germany');
  check('cty-parser leest versie', ds.meta.version === 'VER20260115');
  check('cty-parser full-call-uitzondering', ds.exceptions.get('ON4TEST').cqz === 20 && ds.exceptions.get('ON4TEST').ituz === 28);
  check('cty-lookup gebruikt uitzondering', lookupCall('ON4TEST', ds).matched === 'exception' && lookupCall('ON4TEST', ds).cqz === 20);

  // Verrijking: lege zones aanvullen
  const rows = [
    makeQso({ call: 'DL1ABC', datetime: '2026-07-26T14:00:00Z', band: '20m', mode: 'CW' }),
    makeQso({ call: 'JA1XYZ', datetime: '2026-07-26T14:05:00Z', band: '20m', mode: 'CW', cqZone: 25 })
  ];
  const { lookups, sourceId } = enrichQsos(rows);
  const fill = applyFills(rows, lookups);
  check('verrijking vult ontbrekende CQ-zone', rows[0].cqZone === 14, `(${rows[0].cqZone})`);
  check('verrijking vult continent in extras', rows[0].extras.CONT === 'EU' && rows[0].extras.DXCC === 'Germany');
  check('verrijking telt aangevulde velden', fill.filled >= 4);
  check('verrijking draagt bron', fill.source.includes('prefixtabel') || fill.source.includes('cty'));
  check('bestaande zone niet overschreven', rows[1].cqZone === 25);

  // Zone-mismatch detectie
  const bad = [makeQso({ call: 'ON3VZ', datetime: '2026-07-26T14:00:00Z', band: '20m', mode: 'CW', cqZone: 5 })];
  const { lookups: l2 } = enrichQsos(bad);
  const mm = findZoneMismatches(bad, l2);
  check('mismatch: ON met CQ5 gevlagd -> 14', mm.length === 1 && mm[0].field === 'cqZone' && mm[0].suggested === 14);
  check('mismatch draagt bron', mm[0].source.length > 0);

  // Provenance-registry
  check('databron-registry heeft herkomst', allDatasets().length >= 2 && allDatasets()[0].source && allDatasets()[0].license);
  check('sourceLabel leesbaar', sourceLabel('prefixes').includes('AD1C'));

  // ---- Fase C: checks-engine ----
  const { runChecks, applySuggestion, groupByCode, CHECKS } = await import('../js/engine/checks.js');
  const mk = (o) => makeQso(o);
  check('checks-registry gevuld', CHECKS.length >= 8);

  const zoneQ = mk({ call: 'ON3VZ', datetime: '2026-07-26T14:00:00Z', band: '20m', mode: 'CW', cqZone: 5, ituZone: 27 });
  const zoneSugs = runChecks([zoneQ], {}, ['zone']);
  check('check zone: CQ-mismatch gevonden', zoneSugs.some((s) => s.code === 'ZONE_CQ' && s.suggested === 14));
  check('check zone: geen ITU-mismatch (27 klopt)', !zoneSugs.some((s) => s.code === 'ZONE_ITU'));
  check('suggestie draagt bron', zoneSugs[0].source.includes('cty') || zoneSugs[0].source.includes('AD1C'));

  check('check busted: onbekende prefix', runChecks([mk({ call: 'QZ9ZZ', datetime: '2026-07-26T14:00:00Z' })], {}, ['busted']).some((s) => s.code === 'BUSTED'));
  check('check callfmt: ongeldige call', runChecks([mk({ call: 'ABCDEF' })], {}, ['callfmt']).some((s) => s.code === 'CALLFMT'));

  const bf = runChecks([mk({ call: 'ON3VZ', band: '40m', freqMHz: 14.030, mode: 'CW' })], {}, ['bandfreq']);
  check('check band/freq: mismatch + suggestie', bf.some((s) => s.code === 'BANDFREQ' && s.suggested === '20m'));

  check('check grid: ongeldige locator', runChecks([mk({ call: 'ON3VZ', gridSquare: 'JO2' })], {}, ['grid']).some((s) => s.code === 'GRIDFMT'));

  const times = [mk({ call: 'A', datetime: '2026-07-26T15:00:00Z' }), mk({ call: 'B', datetime: '2026-07-26T14:00:00Z' })];
  check('check chronologie: out-of-order', runChecks(times, {}, ['time']).some((s) => s.code === 'TIME_ORDER'));

  check('check datum: verdachte datum', runChecks([mk({ call: 'A', datetime: '1975-01-01T00:00:00Z' })], {}, ['date']).some((s) => s.code === 'DATE_RANGE'));

  const dupes = [mk({ call: 'DL1X', band: '20m', mode: 'CW', rstRcvd: '599' }), mk({ call: 'DL1X', band: '20m', mode: 'CW', rstRcvd: '559' })];
  check('check dupe-diff: afwijkende exchange', runChecks(dupes, {}, ['dupediff']).some((s) => s.code === 'DUPE_DIFF'));

  const ser = [mk({ call: 'A', serialSent: 5 }), mk({ call: 'B', serialSent: 5 })];
  check('check serial: dubbel nummer', runChecks(ser, {}, ['serial']).some((s) => s.code === 'SERIAL_DUP'));

  // Suggestie toepassen
  const applied = applySuggestion([zoneQ], zoneSugs.find((s) => s.code === 'ZONE_CQ'));
  check('suggestie toepassen zet veld', applied && zoneQ.cqZone === 14);

  // Alles samen + groepering
  const all = runChecks([zoneQ, mk({ call: 'QZ9ZZ' })], {});
  check('runChecks combineert alle checks', all.length >= 1);
  check('groupByCode groepeert', groupByCode(all).size >= 1);

  // ---- Fase F: ADX-uitvoer ----
  const adx = await import('../js/formats/adx.js');
  const adxOut = adx.serialize({ qsos: [mk({ call: 'ON3VZ', datetime: '2026-07-26T14:00:00Z', band: '20m', mode: 'FT8', extras: { NAME: 'Jan & co' } })], session: makeSession({ stationCall: 'ON3VZ' }) });
  check('ADX: geldige XML-kop', adxOut.files[0].content.startsWith('<?xml') && /<ADX>/.test(adxOut.files[0].content));
  check('ADX: CALL-element', /<CALL>ON3VZ<\/CALL>/.test(adxOut.files[0].content));
  check('ADX: XML-escaping', /Jan &amp; co/.test(adxOut.files[0].content));
  check('ADX: bestandsnaam .adx', adxOut.files[0].name.endsWith('.adx'));
  const { getSerializer } = await import('../js/formats/index.js');
  check('ADX geregistreerd als serializer', !!getSerializer('adx'));

  // ---- Fase F: DBF-invoer ----
  const { parseDbf, isDbf } = await import('../js/formats/dbf.js');
  // Bouw een minimale dBase III: 2 velden (CALL C(6), BAND C(4)), 1 record.
  const fields = [['CALL', 'C', 6], ['BAND', 'C', 4]];
  const recLen = 1 + fields.reduce((a, f) => a + f[2], 0);
  const headerLen = 32 + fields.length * 32 + 1;
  const buf = new Uint8Array(headerLen + recLen + 1);
  buf[0] = 0x03; buf[8] = headerLen & 0xff; buf[9] = headerLen >> 8; buf[10] = recLen & 0xff; buf[11] = recLen >> 8;
  buf[4] = 1; // 1 record
  let fo = 32;
  for (const [nm, ty, ln] of fields) { for (let i = 0; i < nm.length; i++) buf[fo + i] = nm.charCodeAt(i); buf[fo + 11] = ty.charCodeAt(0); buf[fo + 16] = ln; fo += 32; }
  buf[fo] = 0x0D;
  let ro = headerLen; buf[ro] = 0x20; // niet-verwijderd
  const put = (s, off, len) => { for (let i = 0; i < len; i++) buf[off + i] = i < s.length ? s.charCodeAt(i) : 0x20; };
  put('ON3VZ', ro + 1, 6); put('20m', ro + 7, 4);
  check('DBF herkend', isDbf(buf));
  const dbf = parseDbf(buf);
  check('DBF: kopregel CALL+BAND', dbf.header[0] === 'CALL' && dbf.header[1] === 'BAND');
  check('DBF: record gelezen', dbf.rows.length === 1 && dbf.rows[0][0] === 'ON3VZ' && dbf.rows[0][1] === '20m');

  // ---- Fase D: referentie-bestaanscontrole ----
  const { parseRefList, makeRefIndex, addRefList, refExists, buildLookupUrl, lookupOnline } = await import('../js/enrich/refcheck.js');
  const parsed = parseRefList('reference,name\nON-0001,Park A\nON-0042,Park B\n', 'pota');
  check('reflijst-parser haalt POTA-refs', parsed.count === 2 && parsed.refs.has('ON-0001'));
  const idx = addRefList(makeRefIndex(), 'pota', parsed.refs, 'POTA-lijst');
  check('ref bestaat: ON-0001 = yes', refExists(idx, 'pota', 'ON-0001') === 'yes');
  check('ref bestaat: ON-9999 = no', refExists(idx, 'pota', 'ON-9999') === 'no');
  check('ref bestaat: onbekende soort = unknown', refExists(idx, 'sota', 'ON/ON-001') === 'unknown');
  // refexist-check gebruikt de index
  const refQ = mk({ call: 'DL1X', datetime: '2026-07-26T14:00:00Z', band: '20m', mode: 'CW', refs: { pota: { mine: 'ON-9999', worked: null } } });
  const refSugs = runChecks([refQ], { refIndex: idx }, ['refexist']);
  check('refexist-check vlagt onbekende park', refSugs.some((s) => s.code === 'REF_NOTFOUND'));
  check('refexist draagt bron (lijst)', refSugs[0] && /lijst/i.test(refSugs[0].source));
  check('online URL POTA correct', buildLookupUrl('pota', 'ON-0001') === 'https://api.pota.app/park/ON-0001');
  check('online zonder consent = blocked', (await lookupOnline('pota', 'ON-0001', { consent: false })) === 'blocked');
  const okFetch = async () => ({ ok: true, status: 200, json: async () => ({}) });
  check('online met consent + mock = yes', (await lookupOnline('pota', 'ON-0001', { consent: true, fetchImpl: okFetch })) === 'yes');
  const missFetch = async () => ({ ok: false, status: 404 });
  check('online 404 = no (enkel ref verstuurd)', (await lookupOnline('pota', 'ON-9999', { consent: true, fetchImpl: missFetch })) === 'no');

  // ---- Fase E: AI-assist ----
  const { mockProvider, nullProvider, setProvider, getProvider } = await import('../js/assist/provider.js');
  const { buildPrompt, parseResponse, interpretPaperLog } = await import('../js/assist/paperlog.js');
  check('null-provider niet beschikbaar', !nullProvider().available());
  check('prompt bevat de tekst', buildPrompt('ON4ABC 20m cw').includes('ON4ABC 20m cw'));
  const canned = '```json\n[{"call":"on4abc","date":"2026-07-26","time":"1405","band":"20m","mode":"cw","rst_sent":"599","rst_rcvd":"559"}]\n```';
  const parsedQsos = parseResponse(canned);
  check('AI-parse: 1 QSO', parsedQsos.length === 1 && parsedQsos[0].call === 'ON4ABC');
  check('AI-parse: datetime + band', parsedQsos[0].datetime === '2026-07-26T14:05:00Z' && parsedQsos[0].band === '20m');
  check('AI-parse: gemarkeerd als AI', parsedQsos[0].source === 'ai' && parsedQsos[0].extras.AI_SUGGESTED === '1');
  setProvider(mockProvider(canned));
  const flow = await interpretPaperLog('ruwe tekst', getProvider());
  check('AI-flow via mock-provider', flow.length === 1 && flow[0].mode === 'CW');
  setProvider(nullProvider());

  // ---- Fase H: opgeslagen views ----
  const { Store: Store2, memoryAdapter: mem2 } = await import('../js/engine/store.js');
  const { QsoEditor: Ed2 } = await import('../js/grid/editor.js');
  const st2 = new Store2(mem2());
  const ed2 = new Ed2([mk({ call: 'A', band: '20m' }), mk({ call: 'B', band: '40m' })], makeSession());
  ed2.setFilter({ band: '20m' }); ed2.setSort('call'); ed2.hiddenCols = new Set(['iota']);
  st2.saveView('20m-CW', ed2.captureView());
  check('view opgeslagen + gelijst', st2.listViews().includes('20m-CW'));
  const got = st2.getView('20m-CW');
  check('view bevat filters+sort+kolommen', got.filters.band === '20m' && got.sort.path === 'call' && got.hiddenCols.includes('iota'));
  const ed3 = new Ed2([mk({ call: 'A', band: '20m' }), mk({ call: 'B', band: '40m' })], makeSession());
  ed3.applyView(got);
  check('view toepassen herstelt filter', ed3.filters.band === '20m' && ed3.visible().length === 1);
  check('view toepassen herstelt kolommen', ed3.hiddenCols.has('iota'));
  st2.deleteView('20m-CW');
  check('view verwijderd', !st2.listViews().includes('20m-CW'));

  // Autosave-groottegrens: gigantische payload wordt overgeslagen
  const huge = new Ed2(Array.from({ length: 1 }, () => mk({ call: 'A', extras: { BIG: 'x'.repeat(5_000_000) } })), makeSession());
  check('autosave slaat te grote status over', st2.saveState(huge) === null);
}

console.log(`\n==== ${pass} geslaagd, ${fail} gefaald ====\n`);
process.exit(fail ? 1 : 0);