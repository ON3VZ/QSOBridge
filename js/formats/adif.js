// formats/adif.js — ADIF (.adi) parser (Fase 2). Fouttolerant, worker-compatibel (pure functie).
import { makeQso } from '../model/qso.js';
import { makeSession } from '../model/session.js';
import { fromAdif } from '../normalize/datetime.js';
import { freqToBand, normBandName } from '../normalize/bandplan.js';
import { normMode } from '../normalize/modes.js';
import { normCall } from '../normalize/validators.js';

export const id = 'adif';
export const label = { nl: 'ADIF', fr: 'ADIF', en: 'ADIF' };
export const extensions = ['.adi', '.adx'];
export const capabilities = {
  canParse: true, canSerialize: true,
  multiFileOutput: false, headerIntegrated: true, preservesUnknownFields: true
};

/** Herkent ADIF aan <EOR>/<EOH> tags (case-insensitief). */
export function detect(text) {
  return /<eor>/i.test(text) || /<eoh>/i.test(text);
}

// Velden die we naar het canonieke model tillen (rest -> extras):
const DIRECT = new Set([
  'CALL', 'BAND', 'MODE', 'SUBMODE', 'RST_SENT', 'RST_RCVD',
  'GRIDSQUARE', 'IOTA', 'STATE', 'CQZ', 'ITUZ', 'STX', 'SRX', 'STX_STRING', 'SRX_STRING'
]);

// Ref-velden worden door mapRefs geconsumeerd -> niet nog eens in extras (anders dubbel bij export).
const REFFIELDS = new Set([
  'MY_SIG', 'MY_SIG_INFO', 'SIG', 'SIG_INFO',
  'MY_POTA_REF', 'POTA_REF', 'MY_SOTA_REF', 'SOTA_REF', 'MY_WWFF_REF', 'WWFF_REF'
]);

/**
 * Parse ruwe ADIF-tekst.
 * @returns {{qsos: object[], session: object, warnings: object[]}}
 */
export function parse(text) {
  const warnings = [];
  const session = makeSession();
  const qsos = [];

  // Splits header (t/m <EOH>) van records.
  let body = text;
  const eohMatch = /<eoh>/i.exec(text);
  if (eohMatch) {
    const header = text.slice(0, eohMatch.index);
    body = text.slice(eohMatch.index + eohMatch[0].length);
    parseHeaderFields(header, session, warnings);
  }

  // Splits records op <EOR>.
  const records = body.split(/<eor>/i);
  let recNo = 0;
  for (const rec of records) {
    if (!/<[a-z_]+[:>]/i.test(rec)) continue; // lege staart
    recNo += 1;
    try {
      const fields = extractFields(rec);
      if (Object.keys(fields).length === 0) continue;
      qsos.push(fieldsToQso(fields, warnings, recNo));
    } catch (e) {
      warnings.push({ record: recNo, reason: `ADIF-record overgeslagen: ${e.message}` });
    }
  }
  return { qsos, session, warnings };
}

/** Haalt alle <TAG:len[:type]>value paren uit een fragment. Lengte-tolerant. */
function extractFields(fragment) {
  const out = {};
  const re = /<([a-z_0-9]+):(\d+)(?::[a-z])?>/gi;
  let m;
  while ((m = re.exec(fragment)) !== null) {
    const name = m[1].toUpperCase();
    const len = parseInt(m[2], 10);
    const start = re.lastIndex;
    let value = fragment.slice(start, start + len);
    // Tolerantie: als de opgegeven lengte niet klopt, val terug op tot de volgende '<'.
    const nextTag = fragment.indexOf('<', start);
    if (nextTag !== -1 && (start + len) > nextTag) {
      value = fragment.slice(start, nextTag);
    }
    out[name] = value.trim();
  }
  return out;
}

function parseHeaderFields(header, session, warnings) {
  const fields = extractFields(header);
  if (fields.STATION_CALLSIGN) session.stationCall = normCall(fields.STATION_CALLSIGN);
  if (fields.OPERATOR) session.operator = normCall(fields.OPERATOR);
  if (fields.MY_GRIDSQUARE) session.myGrid = fields.MY_GRIDSQUARE.toUpperCase();
  // Overige header-velden bewaren:
  for (const [k, v] of Object.entries(fields)) {
    if (!['STATION_CALLSIGN', 'OPERATOR', 'MY_GRIDSQUARE', 'PROGRAMID', 'PROGRAMVERSION', 'ADIF_VER'].includes(k)) {
      session.extras[k] = v;
    }
  }
}

function fieldsToQso(f, warnings, recNo) {
  const q = makeQso({ source: 'adif' });
  q.call = f.CALL ? normCall(f.CALL) : null;
  q.datetime = fromAdif(f.QSO_DATE, f.TIME_ON);
  q.mode = normMode(f.MODE);
  q.submode = f.SUBMODE ? normMode(f.SUBMODE) : null;
  q.rstSent = f.RST_SENT || null;
  q.rstRcvd = f.RST_RCVD || null;
  q.gridSquare = f.GRIDSQUARE ? f.GRIDSQUARE.toUpperCase() : null;
  q.iota = f.IOTA || null;
  q.state = f.STATE || null;
  if (f.CQZ) q.cqZone = parseInt(f.CQZ, 10);
  if (f.ITUZ) q.ituZone = parseInt(f.ITUZ, 10);
  if (f.STX) q.serialSent = parseInt(f.STX, 10);
  if (f.SRX) q.serialRcvd = parseInt(f.SRX, 10);
  if (f.STX_STRING) q.exchangeSent.string = f.STX_STRING;
  if (f.SRX_STRING) q.exchangeRcvd.string = f.SRX_STRING;

  // Frequentie / band met wederzijdse inferentie.
  if (f.FREQ) { const mhz = parseFloat(f.FREQ); if (!Number.isNaN(mhz)) q.freqMHz = mhz; }
  if (f.BAND) q.band = normBandName(f.BAND);
  if (q.freqMHz && !q.band) q.band = freqToBand(q.freqMHz);

  // Award-/activiteitsreferenties -> generieke refs.
  mapRefs(f, q);

  // Alles wat we niet expliciet mappen: bewaren in extras (round-trip).
  for (const [k, v] of Object.entries(f)) {
    if (DIRECT.has(k)) continue;
    if (REFFIELDS.has(k)) continue;
    if (['QSO_DATE', 'TIME_ON', 'FREQ'].includes(k)) continue;
    q.extras[k] = v;
  }
  if (!q.call) warnings.push({ record: recNo, reason: 'ADIF-record zonder CALL' });
  return q;
}

/** POTA/SOTA/WWFF + generieke SIG naar refs-structuur. */
function mapRefs(f, q) {
  const mySig = (f.MY_SIG || '').toUpperCase();
  const sig = (f.SIG || '').toUpperCase();
  const put = (prog, mine, worked) => {
    if (mine == null && worked == null) return;
    q.refs[prog] = q.refs[prog] || { mine: null, worked: null };
    if (mine != null) q.refs[prog].mine = mine;
    if (worked != null) q.refs[prog].worked = worked;
  };
  if (f.MY_POTA_REF || mySig === 'POTA') put('pota', f.MY_POTA_REF || f.MY_SIG_INFO || null, null);
  if (f.POTA_REF || sig === 'POTA') put('pota', null, f.POTA_REF || f.SIG_INFO || null);
  if (f.MY_SOTA_REF) put('sota', f.MY_SOTA_REF, null);
  if (f.SOTA_REF) put('sota', null, f.SOTA_REF);
  if (f.MY_WWFF_REF || mySig === 'WWFF') put('wwff', f.MY_WWFF_REF || f.MY_SIG_INFO || null, null);
  if (f.WWFF_REF || sig === 'WWFF') put('wwff', null, f.WWFF_REF || f.SIG_INFO || null);
}

// ---------------- Serialize (Fase 3) ----------------
import { toAdifDate, toAdifTime } from '../normalize/datetime.js';
import { getPath, fillTemplate } from '../engine/fieldpath.js';

const _enc = new TextEncoder();
/** Eén ADIF-veld <TAG:bytelen>waarde. Slaat lege waarden over. */
function f(tag, value) {
  if (value == null || value === '') return '';
  const s = String(value);
  return `<${tag}:${_enc.encode(s).length}>${s}`;
}

/**
 * Serialize naar ADIF (.adi). Round-trip: extras worden 1:1 teruggeschreven.
 * @param {{qsos:object[], session:object, profile?:object}} arg
 * @returns {{files:{name:string,content:string}[], warnings:object[]}}
 */
export function serialize({ qsos, session, profile, fields } = {}) {
  const warnings = [];
  const s = session || {};
  const allow = fields ? (k) => k === 'call' || fields.has(k) : () => true;
  const out = [];
  // Header
  out.push('QSObridge ADIF export');
  out.push(f('ADIF_VER', '3.1.7') + f('PROGRAMID', 'QSObridge'));
  const hdr = [];
  if (s.stationCall) hdr.push(f('STATION_CALLSIGN', s.stationCall));
  if (s.operator) hdr.push(f('OPERATOR', s.operator));
  if (s.myGrid) hdr.push(f('MY_GRIDSQUARE', s.myGrid));
  if (hdr.length) out.push(hdr.join(''));
  out.push('<EOH>');

  const rows = (qsos || []).filter((q) => q.selected !== false && !(q.extras && q.extras.EDI_ERROR));
  for (const q of rows) {
    out.push(qsoToAdi(q, warnings, profile, s, allow));
  }
  return { files: [{ name: fileName(s, profile, rows), content: out.join('\n') + '\n' }], warnings };
}

function qsoToAdi(q, warnings, profile, session, allow = () => true) {
  let r = '';
  r += f('CALL', q.call);
  if (q.datetime && (allow('date') || allow('time'))) { if (allow('date')) r += f('QSO_DATE', toAdifDate(q.datetime)); if (allow('time')) r += f('TIME_ON', toAdifTime(q.datetime)); }
  if (q.band && allow('band')) r += f('BAND', q.band.toUpperCase());
  if (q.freqMHz != null && allow('freqMHz')) r += f('FREQ', q.freqMHz);
  if (allow('mode')) r += f('MODE', q.mode);
  if (allow('submode')) r += f('SUBMODE', q.submode);
  if (allow('rstSent')) r += f('RST_SENT', q.rstSent);
  if (allow('rstRcvd')) r += f('RST_RCVD', q.rstRcvd);
  if (allow('gridSquare')) r += f('GRIDSQUARE', q.gridSquare);
  if (q.cqZone != null && allow('cqZone')) r += f('CQZ', q.cqZone);
  if (q.ituZone != null && allow('ituZone')) r += f('ITUZ', q.ituZone);
  if (q.iota && allow('iota')) r += f('IOTA', q.iota);
  if (q.state && allow('state')) r += f('STATE', q.state);
  if (q.serialSent != null && allow('serialSent')) r += f('STX', q.serialSent);
  if (q.serialRcvd != null && allow('serialRcvd')) r += f('SRX', q.serialRcvd);
  // Refs terug naar ADIF (legacy SIG-velden, want pota.app/WWFF verwachten die).
  r += refsToAdi(q.refs, allow);
  // Profiel-flavor: extra velden via emit-templates (bv. POTA/WWFF/LoTW).
  if (profile && profile.emit) {
    const ctx = { ...q, session };
    for (const [tag, tpl] of Object.entries(profile.emit)) {
      const val = /\{.*\}/.test(tpl) ? fillTemplate(tpl, ctx) : tpl;
      if (val) r += f(tag, val);
    }
  }
  // LoTW-klare stationsvelden per QSO uit de sessie (ideaal voor /P en rover).
  if (profile && profile.lotwReady && session) {
    if (session.myGrid) r += f('MY_GRIDSQUARE', session.myGrid);
    if (session.myCqZone != null) r += f('MY_CQ_ZONE', session.myCqZone);
    if (session.myItuZone != null) r += f('MY_ITU_ZONE', session.myItuZone);
    if (session.myIota) r += f('MY_IOTA', session.myIota);
    if (session.myState) r += f('MY_STATE', session.myState);
  }
  // Onbekende velden 1:1 terug (round-trip), elk apart selecteerbaar.
  for (const [k, v] of Object.entries(q.extras || {})) {
    if (v === true) continue; // interne markers (bv. EDI_ERROR)
    if (!allow('extras.' + k)) continue;
    r += f(k, v);
  }
  if (!q.call) warnings.push({ reason: 'ADIF-export: QSO zonder CALL geëmitteerd' });
  return r + '<EOR>';
}

function refsToAdi(refs = {}, allow = () => true) {
  let r = '';
  if (refs.pota) {
    if (refs.pota.mine && allow('refs.pota.mine')) r += f('MY_SIG', 'POTA') + f('MY_SIG_INFO', refs.pota.mine) + f('MY_POTA_REF', refs.pota.mine);
    if (refs.pota.worked && allow('refs.pota.worked')) r += f('SIG', 'POTA') + f('SIG_INFO', refs.pota.worked) + f('POTA_REF', refs.pota.worked);
  }
  if (refs.wwff) {
    if (refs.wwff.mine && allow('refs.wwff.mine')) r += f('MY_SIG', 'WWFF') + f('MY_SIG_INFO', refs.wwff.mine) + f('MY_WWFF_REF', refs.wwff.mine);
    if (refs.wwff.worked && allow('refs.wwff.worked')) r += f('SIG', 'WWFF') + f('SIG_INFO', refs.wwff.worked) + f('WWFF_REF', refs.wwff.worked);
  }
  if (refs.sota) {
    if (refs.sota.mine && allow('refs.sota.mine')) r += f('MY_SOTA_REF', refs.sota.mine);
    if (refs.sota.worked && allow('refs.sota.worked')) r += f('SOTA_REF', refs.sota.worked);
  }
  return r;
}

function fileName(s, profile, rows) {
  if (profile && profile.filenamePattern) {
    const first = (rows && rows[0]) || {};
    const date = first.datetime ? toAdifDate(first.datetime) : '';
    const ctx = { ...s, ...first, session: s, date };
    const name = fillTemplate(profile.filenamePattern, ctx).replace(/[\\/]/g, '-');
    if (name && !name.includes('{')) return name;
  }
  const call = (s.stationCall || 'log').replace(/\//g, '-');
  return `${call}.adi`;
}
