// normalize/datetime.js — Datum/tijd (Fase 1 §3.3). Canoniek = UTC ISO-8601.

function pad(n, w = 2) { return String(n).padStart(w, '0'); }

/**
 * Bouwt een UTC ISO-string uit losse velden.
 * @param {string} ymd  YYYYMMDD
 * @param {string} hms  HHMM of HHMMSS
 * @returns {?string}
 */
export function toUtcIso(ymd, hms) {
  if (!ymd) return null;
  const y = ymd.slice(0, 4), mo = ymd.slice(4, 6), d = ymd.slice(6, 8);
  const t = (hms || '0000').padEnd(6, '0');
  const h = t.slice(0, 2), mi = t.slice(2, 4), s = t.slice(4, 6);
  return `${y}-${mo}-${d}T${h}:${mi}:${s}Z`;
}

/** ADIF: QSO_DATE=YYYYMMDD, TIME_ON=HHMM(SS). */
export function fromAdif(qsoDate, timeOn) {
  return toUtcIso(qsoDate, timeOn);
}

/** Cabrillo: YYYY-MM-DD + HHMM. */
export function fromCabrillo(date, time) {
  if (!date) return null;
  return toUtcIso(date.replace(/-/g, ''), time);
}

/** EDI: YYMMDD + HHMM. Eeuw-heuristiek: <70 => 2000s, anders 1900s. */
export function fromEdi(yymmdd, hhmm) {
  if (!yymmdd || yymmdd.length < 6) return null;
  const yy = parseInt(yymmdd.slice(0, 2), 10);
  const century = yy < 70 ? '20' : '19';
  return toUtcIso(century + yymmdd, hhmm);
}

/** SOTA-CSV: DD/MM/YYYY (of DD/MM/YY) + HHMM of HH:MM. */
export function fromSota(date, time) {
  if (!date) return null;
  const parts = date.split(/[/.-]/);
  if (parts.length < 3) return null;
  let [dd, mm, yy] = parts;
  if (yy.length === 2) yy = (parseInt(yy, 10) < 70 ? '20' : '19') + yy;
  const t = (time || '').replace(':', '');
  return toUtcIso(`${yy}${pad(mm)}${pad(dd)}`, t);
}

// ---- Serialize-kant (voor Fase 3, hier alvast) ----
export function toAdifDate(iso) { const d = new Date(iso); return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`; }
export function toAdifTime(iso) { const d = new Date(iso); return `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`; }

/**
 * Zet een lokale tijd (in gegeven IANA-zone) om naar UTC ISO (Fase 1 §11.2).
 * Gebruikt Intl om de zone-offset op dat moment te bepalen (DST-bewust).
 */
export function localToUtc(ymd, hms, timezone) {
  if (timezone === 'UTC' || !timezone) return toUtcIso(ymd, hms);
  const naiveIso = toUtcIso(ymd, hms).replace('Z', ''); // interpreteer als lokaal
  const asIfUtc = new Date(naiveIso + 'Z');
  // Offset van de zone op dat moment:
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const parts = Object.fromEntries(dtf.formatToParts(asIfUtc).map((p) => [p.type, p.value]));
  const zoned = Date.UTC(+parts.year, parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const offsetMs = zoned - asIfUtc.getTime();
  return new Date(asIfUtc.getTime() - offsetMs).toISOString().replace(/\.\d{3}Z$/, 'Z');
}
