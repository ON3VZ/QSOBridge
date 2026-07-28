// formats/edi.js — EDI/REG1TEST (.edi) parser (Fase 2). REG1/2/3-tolerant (Fase 1 §11.5).
import { makeQso } from '../model/qso.js';
import { makeSession } from '../model/session.js';
import { fromEdi } from '../normalize/datetime.js';
import { fromEdiMode } from '../normalize/modes.js';
import { normCall } from '../normalize/validators.js';
import { qrbKm } from '../normalize/qrb.js';

export const id = 'edi';
export const label = { nl: 'EDI/REG1TEST', fr: 'EDI/REG1TEST', en: 'EDI/REG1TEST' };
export const extensions = ['.edi'];
export const capabilities = {
  canParse: true, canSerialize: true,
  multiFileOutput: false, headerIntegrated: true, preservesUnknownFields: false
};

export function detect(text) { return /\[REG[123]TEST;/i.test(text); }

export function parse(text) {
  const warnings = [];
  const session = makeSession();
  const qsos = [];
  const lines = text.split(/\r?\n/);

  let inQsos = false;
  let lineNo = 0;
  for (const raw of lines) {
    lineNo += 1;
    const line = raw.replace(/\r$/, '');
    if (/^\[QSORecords/i.test(line)) { inQsos = true; continue; }
    if (/^\[Remarks\]/i.test(line)) { inQsos = false; continue; }
    if (/^\[REG[123]TEST;/i.test(line)) { session.extras.EDI_ID = line.trim(); continue; }

    if (inQsos) {
      if (!line.trim()) continue;
      try {
        const q = parseQsoRecord(line, session, warnings, lineNo);
        if (q) qsos.push(q);
      } catch (e) {
        warnings.push({ line: lineNo, reason: `EDI QSO-record overgeslagen: ${e.message}` });
      }
      continue;
    }
    // Header: key=value
    const eq = line.indexOf('=');
    if (eq > 0) applyHeader(line.slice(0, eq).trim(), line.slice(eq + 1).trim(), session);
  }
  return { qsos, session, warnings };
}

function applyHeader(key, val, s) {
  switch (key) {
    case 'PCall': s.stationCall = normCall(val); break;
    case 'PWWLo': s.myGrid = val.toUpperCase(); break;
    case 'PSect': s.categories.operator = val; break;
    case 'PBand': s.categories.band = val; break;
    case 'RName': s.name = val; break;
    case 'RCall': s.operator = normCall(val); break;
    case 'TName': s.contestId = val; break;
    case 'RAdr1': case 'RAdr2': if (val) s.address.push(val); break;
    case 'STXEq': s.rig.tx = val; break;
    case 'SPowe': s.rig.power = val; break;
    case 'SRXEq': s.rig.rx = val; break;
    case 'SAnte': s.rig.antenna = val; break;
    case 'SAntH': s.rig.antH = val; break;
    case 'PExch': s.extras.PExch = val; break;
    default: if (val) s.extras[key] = val;
  }
}

/**
 * QSO-record (15 velden, ';'-gescheiden):
 * Datum;Tijd;Call;Modecode;Sent-RST;Sent-nr;Rcvd-RST;Rcvd-nr;Rcvd-exch;Rcvd-WWL;Punten;N;N;N;D
 */
function parseQsoRecord(line, session, warnings, lineNo) {
  const f = line.split(';');
  if (f.length < 10) throw new Error('te weinig velden');
  const call = (f[2] || '').trim();
  const q = makeQso({ source: 'edi' });

  q.datetime = fromEdi(f[0].trim(), f[1].trim());
  q.mode = fromEdiMode(f[3].trim());
  q.rstSent = f[4].trim() || null;
  q.serialSent = f[5].trim() ? parseInt(f[5], 10) : null;
  q.rstRcvd = f[6].trim() || null;
  q.serialRcvd = f[7].trim() ? parseInt(f[7], 10) : null;
  if (f[8] && f[8].trim()) q.exchangeRcvd.string = f[8].trim();
  q.gridSquare = f[9] ? f[9].trim().toUpperCase() || null : null;
  if (f[10] != null && f[10].trim() !== '') q.points = parseInt(f[10], 10);
  if (f[14] && f[14].trim().toUpperCase() === 'D') q.isDupe = true;

  // ERROR-records (seriële-nummer-gaten) behouden maar markeren.
  if (call.toUpperCase() === 'ERROR') {
    q.call = null;
    q.extras.EDI_ERROR = true;
    warnings.push({ line: lineNo, reason: 'EDI ERROR-record (seriële nummering behouden)' });
  } else {
    q.call = normCall(call) || null;
  }

  // QRB berekenen als beide locators bekend zijn.
  if (session.myGrid && q.gridSquare) {
    const d = qrbKm(session.myGrid, q.gridSquare);
    if (d != null) q.qrbKm = d;
  }
  return q;
}

// ---------------- Serialize (Fase 3) ----------------
import { toEdiMode } from '../normalize/modes.js';
import { toAdifDate, toAdifTime } from '../normalize/datetime.js';
import { buildSidecar } from '../engine/sidecar.js';

function ediDate(iso) { return toAdifDate(iso).slice(2); }      // YYMMDD
function ediTime(iso) { return toAdifTime(iso).slice(0, 4); }   // HHMM
function pad3(n) { return n == null ? '' : String(n).padStart(3, '0'); }

/** Serialize naar EDI/REG1TEST (log + summary in één bestand). */
export function serialize({ qsos, session, profile } = {}) {
  const s = session || {};
  const rows = (qsos || []).filter((q) => q.selected !== false);
  const out = [];
  out.push('[REG1TEST;1]');
  out.push(`TName=${s.contestId || ''}`);
  const dates = rows.filter((q) => q.datetime).map((q) => toAdifDate(q.datetime));
  if (dates.length) out.push(`TDate=${dates[0]};${dates[dates.length - 1]}`);
  out.push(`PCall=${s.stationCall || ''}`);
  out.push(`PWWLo=${s.myGrid || ''}`);
  out.push(`PExch=${s.extras && s.extras.PExch ? s.extras.PExch : ''}`);
  out.push(`PSect=${(s.categories && s.categories.operator) || ''}`);
  out.push(`PBand=${(s.categories && s.categories.band) || ''}`);
  if (s.name) out.push(`RName=${s.name}`);
  if (s.operator) out.push(`RCall=${s.operator}`);
  const rig = s.rig || {};
  if (rig.power) out.push(`SPowe=${rig.power}`);
  if (rig.antenna) out.push(`SAnte=${rig.antenna}`);
  out.push('[Remarks]');
  out.push(`[QSORecords;${rows.length}]`);
  for (const q of rows) out.push(qsoRecord(q, s));

  const side = buildSidecar(rows, capabilities, s.stationCall || 'log');
  const files = [{ name: `${(s.stationCall || 'log').replace(/\//g, '-')}.edi`, content: out.join('\r\n') + '\r\n' }];
  if (side.sidecar) files.push(side.sidecar);
  return { files, warnings: side.warning ? [side.warning] : [] };
}

function qsoRecord(q, s) {
  const date = q.datetime ? ediDate(q.datetime) : '';
  const time = q.datetime ? ediTime(q.datetime) : '';
  const mode = toEdiMode(q.mode) || '';
  const wwl = q.gridSquare || '';
  let pts = q.points;
  if (pts == null && s.myGrid && wwl) pts = qrbKm(s.myGrid, wwl);
  const isErr = q.extras && q.extras.EDI_ERROR;
  const call = isErr ? 'ERROR' : (q.call || '');
  const rcvdExch = (q.exchangeRcvd && q.exchangeRcvd.string) || '';
  const dup = q.isDupe ? 'D' : '';
  // 15 kolommen:
  return [date, time, call, mode, q.rstSent || '', pad3(q.serialSent),
    q.rstRcvd || '', pad3(q.serialRcvd), rcvdExch, wwl,
    pts != null ? pts : '', 'N', 'N', 'N', dup].join(';');
}
