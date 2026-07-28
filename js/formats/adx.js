// formats/adx.js — ADX-uitvoer (ADIF-XML) (v2 Fase F).
import { toAdifDate, toAdifTime } from '../normalize/datetime.js';
import { getPath, fillTemplate } from '../engine/fieldpath.js';

export const id = 'adx';
export const label = { nl: 'ADX (ADIF-XML)', fr: 'ADX (ADIF-XML)', en: 'ADX (ADIF-XML)' };
export const extensions = ['.adx'];
export const capabilities = { canParse: false, canSerialize: true };

function xesc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function el(tag, val) { return (val == null || val === '') ? '' : `      <${tag}>${xesc(val)}</${tag}>\n`; }

/** Zelfde veldenset als ADIF, maar als XML-elementen. */
function recordPairs(q, profile, session, allow) {
  let r = '';
  r += el('CALL', q.call);
  if (q.datetime && allow('date')) r += el('QSO_DATE', toAdifDate(q.datetime));
  if (q.datetime && allow('time')) r += el('TIME_ON', toAdifTime(q.datetime));
  if (allow('band') && q.band) r += el('BAND', q.band.toUpperCase());
  if (allow('freqMHz') && q.freqMHz != null) r += el('FREQ', q.freqMHz);
  if (allow('mode')) r += el('MODE', q.mode);
  if (allow('submode')) r += el('SUBMODE', q.submode);
  if (allow('rstSent')) r += el('RST_SENT', q.rstSent);
  if (allow('rstRcvd')) r += el('RST_RCVD', q.rstRcvd);
  if (allow('gridSquare')) r += el('GRIDSQUARE', q.gridSquare);
  if (allow('cqZone') && q.cqZone != null) r += el('CQZ', q.cqZone);
  if (allow('ituZone') && q.ituZone != null) r += el('ITUZ', q.ituZone);
  if (allow('iota') && q.iota) r += el('IOTA', q.iota);
  if (allow('state') && q.state) r += el('STATE', q.state);
  if (allow('serialSent') && q.serialSent != null) r += el('STX', q.serialSent);
  if (allow('serialRcvd') && q.serialRcvd != null) r += el('SRX', q.serialRcvd);
  // Refs (legacy SIG)
  const refs = q.refs || {};
  for (const [prog, v] of Object.entries(refs)) {
    if (v && v.mine && allow(`refs.${prog}.mine`)) { r += el('MY_SIG', prog.toUpperCase()); r += el('MY_SIG_INFO', v.mine); }
    if (v && v.worked && allow(`refs.${prog}.worked`)) { r += el('SIG', prog.toUpperCase()); r += el('SIG_INFO', v.worked); }
  }
  // Profiel-emit
  if (profile && profile.emit) {
    const ctx = { ...q, session };
    for (const [tag, tpl] of Object.entries(profile.emit)) {
      const val = /\{.*\}/.test(tpl) ? fillTemplate(tpl, ctx) : tpl;
      if (val) r += el(tag, val);
    }
  }
  // Onbekende velden
  for (const [k, val] of Object.entries(q.extras || {})) {
    if (val === true) continue;
    if (!allow('extras.' + k)) continue;
    r += el(k, val);
  }
  return r;
}

export function serialize({ qsos, session, profile, fields } = {}) {
  const s = session || {};
  const allow = fields ? (k) => k === 'call' || fields.has(k) : () => true;
  const rows = (qsos || []).filter((q) => q.selected !== false && !(q.extras && q.extras.EDI_ERROR));
  let out = '<?xml version="1.0" encoding="UTF-8"?>\n<ADX>\n  <HEADER>\n';
  out += '    <ADIF_VER>3.1.7</ADIF_VER>\n    <PROGRAMID>QSObridge</PROGRAMID>\n';
  if (s.stationCall) out += `    <STATION_CALLSIGN>${xesc(s.stationCall)}</STATION_CALLSIGN>\n`;
  out += '  </HEADER>\n  <RECORDS>\n';
  for (const q of rows) out += `    <RECORD>\n${recordPairs(q, profile, s, allow)}    </RECORD>\n`;
  out += '  </RECORDS>\n</ADX>\n';
  const call = (s.stationCall || 'log').replace(/\//g, '-');
  return { files: [{ name: `${call}.adx`, content: out }], warnings: [] };
}
