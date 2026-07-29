// formats/cabrillo.js — Cabrillo (.cbr/.log) parser (Fase 2). v2 + v3 tolerant.
import { makeQso } from '../model/qso.js';
import { makeSession } from '../model/session.js';
import { fromCabrillo } from '../normalize/datetime.js';
import { freqToBand } from '../normalize/bandplan.js';
import { normCall } from '../normalize/validators.js';

export const id = 'cabrillo';
export const label = { nl: 'Cabrillo', fr: 'Cabrillo', en: 'Cabrillo' };
export const extensions = ['.cbr', '.log'];
export const capabilities = {
  canParse: true, canSerialize: true,
  multiFileOutput: false, headerIntegrated: true, preservesUnknownFields: false
};

export function detect(text) { return /^\s*START-OF-LOG:/im.test(text); }

const CAB_MODE = { CW: 'CW', PH: 'SSB', RY: 'RTTY', FM: 'FM', DG: 'FT8' };

/** Cabrillo-freq -> MHz. Getallen in kHz; sommige VHF-logs geven bandgetal (50/144/432). */
function cabFreqToMhz(tok) {
  const n = parseFloat(tok);
  if (Number.isNaN(n)) return null;
  if (n >= 1000) return n / 1000;      // kHz -> MHz (HF)
  return n;                             // 50/144/432... al in MHz
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
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const tag = line.slice(0, colon).toUpperCase();
    const val = line.slice(colon + 1).trim();

    if (tag === 'QSO' || tag === 'X-QSO') {
      try {
        const q = parseQsoLine(val, warnings, lineNo);
        if (tag === 'X-QSO') q.extras.X_QSO = true; // niet-scorend, blijft in log
        qsos.push(q);
      } catch (e) {
        warnings.push({ line: lineNo, reason: `Cabrillo QSO-lijn overgeslagen: ${e.message}` });
      }
      continue;
    }
    applyHeader(tag, val, session);
  }
  return { qsos, session, warnings };
}

function applyHeader(tag, val, s) {
  switch (tag) {
    case 'CALLSIGN': s.stationCall = normCall(val); break;
    case 'CONTEST': s.contestId = val; break;
    case 'CLAIMED-SCORE': s.claimedScore = parseInt(val.replace(/\D/g, ''), 10) || null; break;
    case 'CLUB': s.club = val; break;
    case 'NAME': s.name = val; break;
    case 'EMAIL': s.email = val; break;
    case 'GRID-LOCATOR': s.myGrid = val.toUpperCase(); break;
    case 'OPERATORS': s.operator = normCall(val.split(/[\s,]+/)[0]); break;
    case 'SOAPBOX': s.soapbox = (s.soapbox ? s.soapbox + '\n' : '') + val; break;
    case 'CATEGORY-OPERATOR': s.categories.operator = val; break;
    case 'CATEGORY-BAND': s.categories.band = val; break;
    case 'CATEGORY-MODE': s.categories.mode = val; break;
    case 'CATEGORY-POWER': s.categories.power = val; break;
    case 'CATEGORY-ASSISTED': s.categories.assisted = val; break;
    case 'CATEGORY-TRANSMITTER': s.categories.transmitter = val; break;
    case 'CATEGORY-TIME': s.categories.time = val; break;
    case 'CATEGORY-OVERLAY': s.categories.overlay = val; break;
    case 'LOCATION': s.extras.LOCATION = val; break;
    case 'START-OF-LOG': s.extras.CABRILLO_VERSION = val; break;
    default: if (tag.startsWith('ADDRESS')) s.address.push(val); else s.extras[tag] = val;
  }
}

/**
 * QSO-lijn: freq mode date time <sent...> <rcvd...> [txid].
 * De exchange-kolommen verschillen per contest; we bewaren ze generiek.
 * Conventie: eerste token na tijd = eigen call, daarna sent-exchange; dan hun call, daarna rcvd-exchange.
 */
function parseQsoLine(val, warnings, lineNo) {
  const t = val.trim().split(/\s+/);
  if (t.length < 6) throw new Error('te weinig velden');
  const q = makeQso({ source: 'cabrillo' });
  q.freqMHz = cabFreqToMhz(t[0]);
  if (q.freqMHz) q.band = freqToBand(q.freqMHz);
  q.mode = CAB_MODE[(t[1] || '').toUpperCase()] || t[1];
  q.datetime = fromCabrillo(t[2], t[3]);

  // Heuristiek: [4]=eigen call, [5]=eigen RST, ... symmetrisch.
  // We splitsen de resterende tokens in twee helften rond het tweede callsign.
  const rest = t.slice(4);
  // Zoek het tweede token dat op een call lijkt (tegenstation).
  let splitIdx = -1;
  for (let i = 2; i < rest.length; i++) {
    if (/[A-Z]/i.test(rest[i]) && /[0-9]/.test(rest[i]) && rest[i].length >= 3) { splitIdx = i; break; }
  }
  let sent, rcvd, txid = null;
  if (splitIdx > 0) {
    sent = rest.slice(0, splitIdx);
    rcvd = rest.slice(splitIdx);
    // Laatste token kan tx-id (0/1) zijn bij multi.
    if (rcvd.length > 1 && /^[01]$/.test(rcvd[rcvd.length - 1])) txid = rcvd.pop();
  } else {
    sent = rest; rcvd = [];
  }
  q.call = rcvd.length ? normCall(rcvd[0]) : (sent.length ? null : null);
  // Eigen call staat in sent[0]; verplaats naar exchange indien nuttig.
  q.exchangeSent.raw = sent.join(' ');
  q.exchangeRcvd.raw = rcvd.slice(1).join(' ');
  q.rstSent = sent[1] || null;
  q.rstRcvd = rcvd[1] || null;
  // Serieel als numeriek herkenbaar:
  if (sent[2] && /^\d+$/.test(sent[2])) q.serialSent = parseInt(sent[2], 10);
  if (rcvd[2] && /^\d+$/.test(rcvd[2])) q.serialRcvd = parseInt(rcvd[2], 10);
  if (txid != null) q.extras.TXID = txid;
  if (!q.call) warnings.push({ line: lineNo, reason: 'Cabrillo QSO zonder herkenbaar tegenstation' });
  return q;
}

// ---------------- Serialize (Fase 3) ----------------
import { mhzToKhz } from '../normalize/bandplan.js';
import { toCabrilloMode } from '../normalize/modes.js';
import { toAdifDate, toAdifTime } from '../normalize/datetime.js';
import { buildSidecar } from '../engine/sidecar.js';
import { getPath } from '../engine/fieldpath.js';

function cabDate(iso) { const d = toAdifDate(iso); return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`; }
function cabTime(iso) { return toAdifTime(iso).slice(0, 4); }

/**
 * Serialize naar Cabrillo v3. Exchange-layout is in v1 een sensibele default
 * (RST + serial/zone); het profiel-gestuurde exacte formaat komt in Fase 5.
 */
export function serialize({ qsos, session, profile } = {}) {
  const s = session || {};
  const rows = (qsos || []).filter((q) => q.selected !== false);
  const out = [];
  out.push('START-OF-LOG: 3.0');
  out.push(`CREATED-BY: QSObridge`);
  const firstMode = (rows.find((q) => q.mode) || {}).mode;
  const ctag = resolveContestTag(profile, firstMode);
  if (ctag || s.contestId) out.push(`CONTEST: ${ctag || s.contestId}`);
  if (s.stationCall) out.push(`CALLSIGN: ${s.stationCall}`);
  const cat = s.categories || {};
  const catMap = {
    'CATEGORY-OPERATOR': cat.operator, 'CATEGORY-BAND': cat.band, 'CATEGORY-MODE': cat.mode,
    'CATEGORY-POWER': cat.power, 'CATEGORY-ASSISTED': cat.assisted, 'CATEGORY-TRANSMITTER': cat.transmitter,
    'CATEGORY-TIME': cat.time, 'CATEGORY-OVERLAY': cat.overlay
  };
  for (const [k, v] of Object.entries(catMap)) if (v) out.push(`${k}: ${v}`);
  if (s.claimedScore != null) out.push(`CLAIMED-SCORE: ${s.claimedScore}`);
  if (s.club) out.push(`CLUB: ${s.club}`);
  if (s.name) out.push(`NAME: ${s.name}`);
  if (Array.isArray(s.address)) for (const l of s.address) if (l) out.push(`ADDRESS: ${l}`);
  if (s.email) out.push(`EMAIL: ${s.email}`);
  if (s.iotaIslandName) out.push(`IOTA-ISLAND-NAME: ${s.iotaIslandName}`);
  if (s.myGrid) out.push(`GRID-LOCATOR: ${s.myGrid}`);
  if (s.operator) out.push(`OPERATORS: ${s.operator}`);
  if (s.soapbox) for (const l of String(s.soapbox).split('\n')) out.push(`SOAPBOX: ${l}`);

  for (const q of rows) out.push(qsoLine(q, s, profile));
  out.push('END-OF-LOG:');
  const side = buildSidecar(rows, capabilities, fileBase(s));
  const files = [{ name: `${fileBase(s)}.cbr`, content: out.join('\n') + '\n' }];
  if (side.sidecar) files.push(side.sidecar);
  return { files, warnings: side.warning ? [side.warning] : [] };
}

function qsoLine(q, s, profile) {
  const BANDKHZ = { '160m': 1800, '80m': 3500, '60m': 5351, '40m': 7000, '30m': 10100, '20m': 14000, '17m': 18068, '15m': 21000, '12m': 24890, '10m': 28000, '6m': 50000, '2m': 144000, '70cm': 432000 };
  let freq = q.freqMHz != null ? mhzToKhz(q.freqMHz) : '';
  if (freq === '' && q.band && BANDKHZ[String(q.band).toLowerCase()]) freq = BANDKHZ[String(q.band).toLowerCase()];
  const mode = toCabrilloMode(q.mode);
  const date = q.datetime ? cabDate(q.datetime) : '';
  const time = q.datetime ? cabTime(q.datetime) : '';
  const myCall = s.stationCall || '';
  let sent, rcvd;
  if (profile && profile.exchange) {
    sent = buildExchange(profile.exchange, 'sent', q, s).join(' ');
    rcvd = buildExchange(profile.exchange, 'rcvd', q, s).join(' ');
  } else {
    sent = [q.rstSent || '', q.serialSent != null ? q.serialSent : (q.exchangeSent.zone || q.exchangeSent.raw || '')].filter((x) => x !== '').join(' ');
    rcvd = [q.rstRcvd || '', q.serialRcvd != null ? q.serialRcvd : (q.exchangeRcvd.zone || q.exchangeRcvd.raw || '')].filter((x) => x !== '').join(' ');
  }
  const tag = (q.extras && q.extras.X_QSO) ? 'X-QSO' : 'QSO';
  return `${tag}: ${freq} ${mode} ${date} ${time} ${myCall} ${sent} ${q.call || ''} ${rcvd}`.replace(/\s+/g, ' ').trimEnd();
}

/** Bouwt de exchange-tokens uit de profieldefinitie (per stationstype). */
function buildExchange(exchange, who, q, s) {
  const onCode = (exchange.stationType && exchange.stationType.on) || 'ALL';
  const none = !exchange.stationType || exchange.stationType.field === 'none';
  let type;
  if (none) type = 'ALL';
  else if (who === 'sent') type = (s.myProvince || (s.stationCall || '').toUpperCase().startsWith(onCode)) ? onCode : 'DX';
  else type = (q.call || '').toUpperCase().startsWith(onCode) ? onCode : 'DX';
  const fields = (exchange[who] && (exchange[who][type] || exchange[who].ALL)) || [];
  return fields.map((path) => {
    let v = getPath(q, path);
    if (v == null) v = getPath(s, path);
    const isIotaField = path === 'iota' || path === 'myIota';
    if (isIotaField && (v == null || v === '' || String(v).toLowerCase() === 'none')) v = '------'; // IOTA-conventie
    return v == null ? '' : String(v);
  }).filter((x) => x !== '');
}

function fileBase(s) { return ((s.stationCall || 'log')).replace(/\//g, '-'); }

/** contestTag kan een string zijn of een {mode: tag}-object (per-mode-varianten). */
function resolveContestTag(profile, mode) {
  if (!profile || !profile.contestTag) return null;
  if (typeof profile.contestTag === 'string') return profile.contestTag;
  const m = (mode || '').toUpperCase();
  return profile.contestTag[m] || Object.values(profile.contestTag)[0] || null;
}
