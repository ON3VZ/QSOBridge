// engine/validate.js — Profiel-gestuurde validatie (Fase 5).
// Levert de data voor rode-rand-markering, pictogram/tooltip, statusbalk en "spring-naar-fout".
import { getPath } from './fieldpath.js';
import { checkBandFreq } from '../normalize/bandplan.js';
import { isIota, isPota, isSota, isWwff, isLocator, isCallsign } from '../normalize/validators.js';

const VALIDATORS = { iota: isIota, pota: isPota, sota: isSota, wwff: isWwff, locator: isLocator, callsign: isCallsign };

/** Bepaalt het stationstype (ON/DX/ALL) voor asymmetrische exchanges. */
function typeOf(call, exchange, who, session) {
  if (!exchange || !exchange.stationType || exchange.stationType.field === 'none') return 'ALL';
  const onCode = exchange.stationType.on || 'ON';
  if (who === 'sent') {
    // Eigen type: afgeleid van myProvince of eigen call.
    if (session && session.myProvince) return onCode;
    return (session && session.stationCall && session.stationCall.toUpperCase().startsWith(onCode)) ? onCode : 'DX';
  }
  return (call && call.toUpperCase().startsWith(onCode)) ? onCode : 'DX';
}

/** Verzamelt de verplichte exchange-velden voor een QSO (sent+rcvd, per stationstype). */
function exchangeFields(profile, qso, session) {
  const ex = profile && profile.exchange;
  if (!ex) return [];
  const sentType = typeOf(qso.call, ex, 'sent', session);
  const rcvdType = typeOf(qso.call, ex, 'rcvd', session);
  const sent = (ex.sent && (ex.sent[sentType] || ex.sent.ALL)) || [];
  const rcvd = (ex.rcvd && (ex.rcvd[rcvdType] || ex.rcvd.ALL)) || [];
  // Eigen (sent) velden die uit de sessie komen, tellen niet als per-QSO-verplicht.
  const fromSession = new Set(['myProvince', 'mySection', 'myCqZone', 'myItuZone', 'myGrid']);
  return [...sent.filter((f) => !fromSession.has(f)), ...rcvd];
}

/** Past één validatieregel toe op een waarde. @returns {?{code,severity,message}} */
function applyRule(path, rule, value) {
  const present = value != null && value !== '';
  if (rule.required && !present) return { code: 'REQUIRED', severity: 'error', message: `${path} is verplicht` };
  if (!present) return null;
  if (rule.validator && VALIDATORS[rule.validator] && !VALIDATORS[rule.validator](String(value))) {
    return { code: 'FORMAT', severity: 'error', message: `${path}: ongeldige ${rule.validator}-vorm (${value})` };
  }
  if (rule.enum && !rule.enum.includes(String(value))) {
    return { code: 'ENUM', severity: 'error', message: `${path}: '${value}' niet in toegestane lijst` };
  }
  if (rule.type === 'int') {
    const n = Number(value);
    if (!Number.isInteger(n)) return { code: 'TYPE', severity: 'error', message: `${path} moet een geheel getal zijn` };
    if (rule.min != null && n < rule.min) return { code: 'MIN', severity: 'error', message: `${path} < ${rule.min}` };
    if (rule.max != null && n > rule.max) return { code: 'MAX', severity: 'error', message: `${path} > ${rule.max}` };
  }
  return null;
}

/**
 * Valideert alle QSO's + header tegen een profiel.
 * @returns {{qsoIssues:Object, headerIssues:Object, summary:{missing:number, invalid:number, qsosWithIssues:number}}}
 */
export function validateQsos(qsos, session, profile) {
  const qsoIssues = {};
  const headerIssues = {};
  let missing = 0, invalid = 0, qsosWithIssues = 0;
  const p = profile || {};
  const req = p.requiredQsoFields || [];
  const rules = p.validation || {};

  // Header (session) verplichte velden + regels.
  for (const path of (p.header && p.header.required) || []) {
    const v = getPath(session, path);
    if (v == null || v === '') { headerIssues[path] = { code: 'REQUIRED', severity: 'error', message: `${path} (header) is verplicht` }; missing++; }
  }
  for (const [path, rule] of Object.entries(rules)) {
    if (!path.startsWith('my') && !path.startsWith('categories')) continue; // sessie-velden
    const res = applyRule(path, rule, getPath(session, path));
    if (res) { headerIssues[path] = res; if (res.code === 'REQUIRED') missing++; else invalid++; }
  }

  for (const q of qsos) {
    if (q.selected === false) continue;
    const issues = {};
    // Verplichte QSO-velden.
    for (const path of req) {
      const v = getPath(q, path);
      if (v == null || v === '') { issues[path] = { code: 'REQUIRED', severity: 'error', message: `${path} is verplicht` }; missing++; }
    }
    // Verplichte exchange-velden.
    for (const path of exchangeFields(p, q, session)) {
      if (issues[path]) continue;
      const v = getPath(q, path);
      if (v == null || v === '') { issues[path] = { code: 'EXCHANGE', severity: 'error', message: `exchange-veld ${path} ontbreekt` }; missing++; }
    }
    // Validatieregels op QSO-velden.
    for (const [path, rule] of Object.entries(rules)) {
      if (path.startsWith('my') || path.startsWith('categories')) continue;
      if (issues[path]) continue;
      const res = applyRule(path, rule, getPath(q, path));
      if (res) { issues[path] = res; if (res.code === 'REQUIRED') missing++; else invalid++; }
    }
    // Bandplan-consistentie.
    const bf = checkBandFreq(q.freqMHz, q.band);
    if (bf.severity === 'error' || bf.severity === 'warn') {
      issues.band = issues.band || { code: bf.code, severity: bf.severity, message: bf.message, suggestedBand: bf.suggestedBand };
      if (bf.severity === 'error') invalid++;
    }
    if (Object.keys(issues).length) { qsoIssues[q.id] = issues; qsosWithIssues++; }
  }

  return { qsoIssues, headerIssues, summary: { missing, invalid, qsosWithIssues } };
}
