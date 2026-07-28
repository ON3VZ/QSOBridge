// formats/tabular.js — Generieke tabel-import (Fase 4): CSV/TSV/XLSX -> rijen -> kolom-mapping.
import { makeQso } from '../model/qso.js';
import { makeSession } from '../model/session.js';
import { fromAdif, fromCabrillo, fromSota } from '../normalize/datetime.js';
import { freqToBand, normBandName } from '../normalize/bandplan.js';
import { normMode } from '../normalize/modes.js';
import { normCall } from '../normalize/validators.js';
import { setPath } from '../engine/fieldpath.js';

export const id = 'tabular';
export const label = { nl: 'Tabel (CSV/XLSX)', fr: 'Tableau (CSV/XLSX)', en: 'Table (CSV/XLSX)' };
export const extensions = ['.csv', '.tsv', '.xlsx', '.xls'];
export const capabilities = { canParse: true, canSerialize: false, needsColumnMapping: true };

/** Scheidingsteken raden uit de eerste regels. */
export function guessDelimiter(text) {
  const line = text.split(/\r?\n/).find((l) => l.trim()) || '';
  const counts = { ',': (line.match(/,/g) || []).length, ';': (line.match(/;/g) || []).length, '\t': (line.match(/\t/g) || []).length };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

/** Parseert CSV/TSV naar {header, rows} met quote-ondersteuning. */
export function parseTable(text, delimiter) {
  const delim = delimiter || guessDelimiter(text);
  const rows = [];
  let field = '', row = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* skip */ }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const nonEmpty = rows.filter((r) => r.some((x) => x.trim() !== ''));
  return { header: nonEmpty[0] || [], rows: nonEmpty.slice(1), delimiter: delim };
}

// Kopregel-aliassen -> canoniek veldpad (voor de auto-gok van de mapping).
const ALIASES = {
  call: 'call', callsign: 'call', worked: 'call', dxcall: 'call',
  date: 'date', qso_date: 'date', datum: 'date',
  time: 'time', time_on: 'time', tijd: 'time', utc: 'time',
  band: 'band', freq: 'freqMHz', frequency: 'freqMHz', qrg: 'freqMHz',
  mode: 'mode',
  rst_sent: 'rstSent', rsts: 'rstSent', sent: 'rstSent', rstsent: 'rstSent',
  rst_rcvd: 'rstRcvd', rstr: 'rstRcvd', rcvd: 'rstRcvd', rstrcvd: 'rstRcvd',
  grid: 'gridSquare', gridsquare: 'gridSquare', locator: 'gridSquare', loc: 'gridSquare',
  serial: 'serialRcvd', srx: 'serialRcvd', nr: 'serialRcvd', stx: 'serialSent',
  cqz: 'cqZone', cq_zone: 'cqZone', ituz: 'ituZone', iota: 'iota',
  pota: 'refs.pota.worked', my_pota: 'refs.pota.mine', park: 'refs.pota.mine',
  sota: 'refs.sota.worked', my_sota: 'refs.sota.mine', summit: 'refs.sota.mine',
  wwff: 'refs.wwff.worked', my_wwff: 'refs.wwff.mine',
  comment: 'extras.COMMENT', notes: 'extras.COMMENT', name: 'extras.NAME'
};

/** Stelt een kolom->veld-mapping voor op basis van de kopregel. */
export function guessMapping(header) {
  return header.map((h) => {
    const key = String(h).trim().toLowerCase().replace(/[\s.-]+/g, '_');
    return ALIASES[key] || ALIASES[key.replace(/_/g, '')] || null;
  });
}

const DATE_FORMATS = { adif: fromAdif, cabrillo: fromCabrillo, sota: fromSota };

/**
 * Zet geparste rijen om naar QSO's met een kolom->veldpad-mapping.
 * @param {{header, rows}} table
 * @param {string[]} mapping  per kolom een canoniek veldpad (of null=negeren)
 * @param {{dateStyle?: 'adif'|'cabrillo'|'sota'}} opts
 */
export function rowsToQsos(table, mapping, opts = {}) {
  const warnings = [];
  const qsos = [];
  const dateFn = DATE_FORMATS[opts.dateStyle || 'adif'];
  const dateCol = mapping.indexOf('date');
  const timeCol = mapping.indexOf('time');

  table.rows.forEach((r, idx) => {
    const q = makeQso({ source: 'tabular' });
    let rawDate = null, rawTime = null;
    mapping.forEach((path, col) => {
      if (!path) return;
      let val = (r[col] ?? '').trim();
      if (val === '') return;
      if (path === 'date') { rawDate = val.replace(/-/g, ''); return; }
      if (path === 'time') { rawTime = val.replace(':', ''); return; }
      if (path === 'call') val = normCall(val);
      else if (path === 'mode') val = normMode(val);
      else if (path === 'band') val = normBandName(val);
      else if (path === 'freqMHz') val = parseFloat(String(val).replace(',', '.'));
      else if (['serialSent', 'serialRcvd', 'cqZone', 'ituZone'].includes(path)) val = parseInt(val, 10);
      setPath(q, path, val);
    });
    if (rawDate) {
      q.datetime = (opts.dateStyle === 'sota') ? fromSota(r[dateCol], r[timeCol]) : dateFn(rawDate, rawTime);
    }
    if (q.freqMHz && !q.band) q.band = freqToBand(q.freqMHz);
    if (!q.call) warnings.push({ record: idx + 1, reason: 'Tabelrij zonder call' });
    qsos.push(q);
  });
  return { qsos, session: makeSession(), warnings };
}
