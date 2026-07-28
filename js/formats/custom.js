// formats/custom.js — Eigen outputformaat (Fase 3, §1B.1).
// Eén generieke serializer, aangestuurd door een JSON-templatedefinitie die de gebruiker
// samenstelt/opslaat/deelt. Dekt elk CSV-achtig of eenvoudig tekstformaat.
import { getPath, fillTemplate } from '../engine/fieldpath.js';
import { toAdifDate, toAdifTime } from '../normalize/datetime.js';

export const id = 'custom';
export const label = { nl: 'Eigen formaat', fr: 'Format personnalisé', en: 'Custom format' };
export const capabilities = {
  canParse: false, canSerialize: true,
  multiFileOutput: false, headerIntegrated: true, preservesUnknownFields: false
};

/**
 * @typedef {Object} CustomFormatDef
 * @property {string} name
 * @property {{path:string,label?:string,map?:Object}[]} columns  velden + optioneel label + waardemapping
 * @property {string} [delimiter=","]     scheidingsteken (of "\t")
 * @property {boolean}[quote=false]       velden quoten indien nodig
 * @property {boolean}[header=true]       kopregel emitteren
 * @property {string} [recordTemplate]    i.p.v. delimited: vrije regel met {pad}-placeholders
 * @property {string} [fileHeader]        vaste kop (met {session.*}-placeholders)
 * @property {string} [fileFooter]
 * @property {string} [lineEnding="\n"]
 * @property {string} [filenamePattern="{stationCall}.txt"]
 * @property {string} [dateFormat="YYYYMMDD"]  YYYYMMDD | YYYY-MM-DD | DD/MM/YYYY
 * @property {string} [timeFormat="HHMM"]      HHMM | HHMMSS | HH:MM
 */

function fmtDate(iso, f) {
  if (!iso) return '';
  const d = toAdifDate(iso);
  if (f === 'YYYY-MM-DD') return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  if (f === 'DD/MM/YYYY') return `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)}`;
  return d;
}
function fmtTime(iso, f) {
  if (!iso) return '';
  const t = toAdifTime(iso);
  if (f === 'HHMMSS') return t;
  if (f === 'HH:MM') return `${t.slice(0, 2)}:${t.slice(2, 4)}`;
  return t.slice(0, 4);
}

/** Waarde voor een kolom ophalen, met datum/tijd-speciaalgevallen en optionele waardemapping. */
function cellValue(q, session, col, def) {
  let v;
  if (col.path === 'date') v = fmtDate(q.datetime, def.dateFormat || 'YYYYMMDD');
  else if (col.path === 'time') v = fmtTime(q.datetime, def.timeFormat || 'HHMM');
  else v = getPath(q, col.path);
  if (v == null) v = getPath(session, col.path); // val terug op sessie-velden
  if (v == null) v = '';
  if (col.map && Object.prototype.hasOwnProperty.call(col.map, v)) v = col.map[v];
  return String(v);
}

function quoteIfNeeded(s, delim) {
  if (s.includes(delim) || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/**
 * @param {{qsos:object[], session:object, profile:CustomFormatDef}} arg
 * profile = de eigen-formaatdefinitie.
 */
export function serialize({ qsos, session, profile } = {}) {
  const def = profile || {};
  const s = session || {};
  const rows = (qsos || []).filter((q) => q.selected !== false);
  const delim = def.delimiter || ',';
  const nl = def.lineEnding || '\n';
  const cols = def.columns || [];
  const lines = [];

  if (def.fileHeader) lines.push(fillTemplate(def.fileHeader, { session: s }));
  if (def.header !== false && !def.recordTemplate && cols.length) {
    lines.push(cols.map((c) => c.label || c.path).join(delim));
  }
  for (const q of rows) {
    if (def.recordTemplate) {
      lines.push(fillTemplate(def.recordTemplate, { ...q, session: s, date: fmtDate(q.datetime, def.dateFormat), time: fmtTime(q.datetime, def.timeFormat) }));
    } else {
      const cells = cols.map((c) => {
        const val = cellValue(q, s, c, def);
        return def.quote ? quoteIfNeeded(val, delim) : val;
      });
      lines.push(cells.join(delim));
    }
  }
  if (def.fileFooter) lines.push(fillTemplate(def.fileFooter, { session: s }));

  const name = fillTemplate(def.filenamePattern || '{stationCall}.txt', s).replace(/\//g, '-') || 'export.txt';
  return { files: [{ name, content: lines.join(nl) + nl }], warnings: [] };
}
