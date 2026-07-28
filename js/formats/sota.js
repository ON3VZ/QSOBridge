// formats/sota.js — SOTA-CSV V2 parser (Fase 2).
// V2, MyCall, MySummit, Datum, Tijd, Frequentie, Mode, TheirCall, TheirSummit(S2S), Comments
import { makeQso } from '../model/qso.js';
import { makeSession } from '../model/session.js';
import { fromSota } from '../normalize/datetime.js';
import { freqToBand } from '../normalize/bandplan.js';
import { normMode } from '../normalize/modes.js';
import { normCall } from '../normalize/validators.js';

export const id = 'sota';
export const label = { nl: 'SOTA-CSV', fr: 'SOTA-CSV', en: 'SOTA-CSV' };
export const extensions = ['.csv'];
export const capabilities = {
  canParse: true, canSerialize: true,
  multiFileOutput: true, headerIntegrated: false, preservesUnknownFields: false
};

/** Herkent SOTA aan V2-prefix op (bijna) elke regel. */
export function detect(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return false;
  const v2 = lines.filter((l) => /^v2\s*,/i.test(l.trim())).length;
  return v2 / lines.length > 0.5;
}

function sotaFreqToMhz(tok) {
  if (!tok) return null;
  const n = parseFloat(String(tok).replace(/mhz/i, '').replace(',', '.'));
  return Number.isNaN(n) ? null : n;
}

export function parse(text) {
  const warnings = [];
  const session = makeSession();
  const qsos = [];
  const lines = text.split(/\r?\n/);
  let lineNo = 0;

  for (const raw of lines) {
    lineNo += 1;
    const line = raw.trim();
    if (!line || !/^v2\s*,/i.test(line)) {
      if (line && !/^version/i.test(line)) warnings.push({ line: lineNo, reason: 'Geen geldige V2-regel, overgeslagen' });
      continue;
    }
    const c = line.split(',').map((x) => x.trim());
    try {
      const q = makeQso({ source: 'sota' });
      const myCall = normCall(c[1]);
      const mySummit = c[2] || null;
      q.datetime = fromSota(c[3], c[4]);
      q.freqMHz = sotaFreqToMhz(c[5]);
      if (q.freqMHz) q.band = freqToBand(q.freqMHz);
      q.mode = normMode(c[6]);
      q.call = normCall(c[7]);
      const theirSummit = c[8] || null;
      const notes = c.slice(9).join(',').trim();

      if (mySummit) q.refs.sota = { mine: mySummit, worked: theirSummit || null };
      else if (theirSummit) q.refs.sota = { mine: null, worked: theirSummit };
      if (notes) q.extras.COMMENT = notes;

      // MyCall vult de sessie (eerste keer).
      if (myCall && !session.stationCall) session.stationCall = myCall;
      if (mySummit && !session.extras.MY_SOTA_REF) session.extras.MY_SOTA_REF = mySummit;

      if (!q.call) warnings.push({ line: lineNo, reason: 'SOTA-regel zonder tegenstation' });
      qsos.push(q);
    } catch (e) {
      warnings.push({ line: lineNo, reason: `SOTA-regel overgeslagen: ${e.message}` });
    }
  }
  return { qsos, session, warnings };
}

// ---------------- Serialize (Fase 3) ----------------
import { toAdifDate, toAdifTime } from '../normalize/datetime.js';

function sotaDate(iso) { const d = toAdifDate(iso); return `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)}`; }
function sotaTime(iso) { return toAdifTime(iso).slice(0, 4); }

/**
 * Serialize naar SOTA-CSV V2. Splitst per eigen summit in aparte bestanden
 * (SOTA vereist één bestand per activatie).
 */
export function serialize({ qsos, session } = {}) {
  const s = session || {};
  const rows = (qsos || []).filter((q) => q.selected !== false);
  const myCall = s.stationCall || (s.operator || 'MYCALL');

  // Groepeer per eigen summit (refs.sota.mine of session MY_SOTA_REF).
  const groups = new Map();
  for (const q of rows) {
    const summit = (q.refs && q.refs.sota && q.refs.sota.mine) || s.extras.MY_SOTA_REF || 'UNKNOWN';
    if (!groups.has(summit)) groups.set(summit, []);
    groups.get(summit).push(q);
  }
  const files = [];
  const warnings = [];
  for (const [summit, qs] of groups) {
    const lines = qs.map((q) => row(q, myCall, summit));
    const safe = summit.replace(/[/\\]/g, '_');
    files.push({ name: `${myCall.replace(/\//g, '-')}_${safe}.csv`, content: lines.join('\n') + '\n' });
  }
  if (groups.has('UNKNOWN')) warnings.push({ reason: 'SOTA-export: QSO\'s zonder eigen summit-ref (MY_SOTA_REF ontbreekt).', severity: 'warn' });
  return { files, warnings };
}

function row(q, myCall, mySummit) {
  const freq = q.freqMHz != null ? `${q.freqMHz}MHz` : '';
  const their = (q.refs && q.refs.sota && q.refs.sota.worked) || '';
  const notes = (q.extras && q.extras.COMMENT) || '';
  return ['V2', myCall, mySummit, q.datetime ? sotaDate(q.datetime) : '', q.datetime ? sotaTime(q.datetime) : '',
    freq, q.mode || '', q.call || '', their, notes].join(',');
}
