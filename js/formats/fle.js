// formats/fle.js — Fast Log Entry (DF3CB) parser (Fase 2, optioneel).
// Pragmatisch: dekt de gangbare activator-workflow; onbekende tokens -> commentaar (fouttolerant).
import { makeQso } from '../model/qso.js';
import { makeSession } from '../model/session.js';
import { toUtcIso } from '../normalize/datetime.js';
import { freqToBand, normBandName } from '../normalize/bandplan.js';
import { normMode, MODE_MAP } from '../normalize/modes.js';
import { normCall, isCallsign } from '../normalize/validators.js';

export const id = 'fle';
export const label = { nl: 'FLE (Fast Log Entry)', fr: 'FLE (Fast Log Entry)', en: 'FLE (Fast Log Entry)' };
export const extensions = ['.txt', '.fle'];
export const capabilities = {
  canParse: true, canSerialize: false,
  multiFileOutput: false, headerIntegrated: true, preservesUnknownFields: false
};

/** Herkent FLE aan de karakteristieke header-keywords. */
export function detect(text) {
  return /^\s*(mycall|mygrid|mywwff|mysota|mypota)\b/im.test(text);
}

const HEADER_KW = new Set(['mycall', 'operator', 'mygrid', 'mywwff', 'mysota', 'mypota', 'qslmsg', 'nickname']);
const REF_KW = { wwff: 'wwff', pota: 'pota', sota: 'sota', s2s: 'sota', p2p: 'wwff' };
const MODE_SET = new Set(Object.keys(MODE_MAP).map((m) => m.toLowerCase()).concat(['ssb', 'cw', 'fm', 'am', 'rtty', 'psk', 'ft8', 'ft4']));

const reBand = /^\d{1,4}(m|cm|mm)$/i;
const reFreq = /^\d{1,4}\.\d+$/;
const reTime = /^(\d{2}|\d{4})$/;
const reBracket = /\[([^\]]*)\]/g;

export function parse(text) {
  const warnings = [];
  const session = makeSession();
  const qsos = [];
  const st = { date: null, band: null, mode: null, freqMHz: null, lastHour: null, ownRefs: {} };

  const lines = text.split(/\r?\n/);
  let lineNo = 0;
  for (const raw of lines) {
    lineNo += 1;
    const line = raw.replace(/^\s+|\s+$/g, '');
    if (!line || line.startsWith('#')) continue; // leeg of commentaarregel

    const tokens = line.split(/\s+/);
    const first = tokens[0].toLowerCase();

    if (HEADER_KW.has(first)) { applyHeader(first, tokens.slice(1).join(' '), session, st); continue; }
    if (first === 'date') { st.date = normDate(tokens[1]); continue; }
    if (first.startsWith('day')) { st.date = incDate(st.date, countPlus(first, tokens)); continue; }

    try {
      const emitted = parseQsoOrSetting(line, tokens, st, session, warnings, lineNo);
      if (emitted) qsos.push(emitted);
    } catch (e) {
      warnings.push({ line: lineNo, reason: `FLE-regel overgeslagen: ${e.message}` });
    }
  }
  return { qsos, session, warnings };
}

function applyHeader(kw, val, session, st) {
  const v = val.trim();
  switch (kw) {
    case 'mycall': session.stationCall = normCall(v); break;
    case 'operator': session.operator = normCall(v); break;
    case 'mygrid': session.myGrid = v.toUpperCase(); break;
    case 'qslmsg': session.extras.QSLMSG = v; break;
    case 'nickname': session.extras.QTH_NICKNAME = v; break;
    case 'mywwff': st.ownRefs.wwff = v.toUpperCase(); session.extras.MY_SIG_INFO = v.toUpperCase(); break;
    case 'mysota': st.ownRefs.sota = v.toUpperCase(); session.extras.MY_SOTA_REF = v.toUpperCase(); break;
    case 'mypota': st.ownRefs.pota = v.toUpperCase(); session.extras.MY_SIG_INFO = v.toUpperCase(); break;
  }
}

/** Verwerkt een regel als QSO (als er tijd + call is) of als loutere band/mode/freq-instelling. */
function parseQsoOrSetting(line, tokensIn, st, session, warnings, lineNo) {
  // QSL-message tussen [] eerst afvangen.
  let qslmsg = null;
  const cleaned = line.replace(reBracket, (m, inner) => { qslmsg = inner.trim(); return ' '; });
  const tokens = cleaned.split(/\s+/).filter(Boolean);

  let time = null, call = null;
  const rsts = [];
  const comment = [];
  const worked = {}; // prog -> ref
  let changed = false;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const low = tok.toLowerCase();

    if (reBand.test(tok)) { st.band = normBandName(tok); st.freqMHz = null; changed = true; continue; }
    if (MODE_SET.has(low)) { st.mode = normMode(tok); changed = true; continue; }
    if (reFreq.test(tok)) { st.freqMHz = parseFloat(tok); st.band = freqToBand(st.freqMHz) || st.band; changed = true; continue; }
    if (REF_KW[low]) { const prog = REF_KW[low]; const ref = tokens[i + 1]; if (ref) { worked[prog] = ref.toUpperCase(); i++; } continue; }
    if (!time && reTime.test(tok)) { time = tok; continue; }
    if (!call && isCallsign(tok)) { call = normCall(tok); continue; }
    if (/^\d{2,3}$/.test(tok)) { rsts.push(tok); continue; }
    if (/^[0-9a-z]{2,3}$/i.test(tok) && /nn/i.test(tok)) { rsts.push(tok.replace(/n/gi, '9')); continue; } // 5nn -> 599
    comment.push(tok);
  }

  if (!time && !call) {
    if (!changed) warnings.push({ line: lineNo, reason: 'FLE-regel niet begrepen (geen tijd/call/instelling)' });
    return null; // louter een band/mode/freq-instelling
  }
  if (!time) { warnings.push({ line: lineNo, reason: 'FLE-QSO zonder tijd (interpolatie niet in v1)' }); }
  if (!call) { warnings.push({ line: lineNo, reason: 'FLE-QSO zonder callsign' }); }

  const q = makeQso({ source: 'fle' });
  q.call = call;
  q.datetime = buildTime(st, time, warnings, lineNo);
  q.band = st.band;
  q.freqMHz = st.freqMHz;
  q.mode = st.mode;
  const def = defaultRst(st.mode);
  q.rstSent = rsts[0] || def;
  q.rstRcvd = rsts[1] || def;
  if (qslmsg) q.extras.QSLMSG = qslmsg;
  if (comment.length) q.extras.COMMENT = comment.join(' ');

  // Eigen refs (uit header) + gewerkte refs (P2P/S2S) -> generieke refs-structuur.
  for (const [prog, ref] of Object.entries(st.ownRefs)) {
    q.refs[prog] = q.refs[prog] || { mine: null, worked: null };
    q.refs[prog].mine = ref;
  }
  for (const [prog, ref] of Object.entries(worked)) {
    q.refs[prog] = q.refs[prog] || { mine: null, worked: null };
    q.refs[prog].worked = ref;
  }
  return q;
}

function buildTime(st, time, warnings, lineNo) {
  if (!st.date) { warnings.push({ line: lineNo, reason: 'FLE-QSO zonder date-keyword ervoor' }); return null; }
  if (!time) return null;
  let hh, mm;
  if (time.length === 4) { hh = time.slice(0, 2); mm = time.slice(2); st.lastHour = hh; }
  else { mm = time; hh = st.lastHour; if (hh == null) { warnings.push({ line: lineNo, reason: 'FLE verkorte tijd zonder eerder uur' }); return null; } }
  return toUtcIso(st.date, `${hh}${mm}`);
}

function defaultRst(mode) {
  const m = normMode(mode);
  const cat = m && MODE_MAP[m] ? MODE_MAP[m].cat : 'CW';
  return cat === 'PHONE' ? '59' : '599';
}

/** Datum normaliseren naar YYYYMMDD; tolereert -,/,. en partiële jaren. */
function normDate(tok) {
  if (!tok) return null;
  const p = tok.split(/[-/.]/);
  if (p.length < 3) return null;
  let [y, m, d] = p;
  if (y.length === 2) y = (parseInt(y, 10) < 70 ? '20' : '19') + y;
  return `${y}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}`;
}

function incDate(ymd, n) {
  if (!ymd) return ymd;
  const d = new Date(`${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + (n || 1));
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

function countPlus(first, tokens) {
  const plus = (first.match(/\+/g) || []).length;
  if (plus) return plus;
  const n = parseInt(tokens[1], 10);
  return Number.isNaN(n) ? 1 : n;
}
