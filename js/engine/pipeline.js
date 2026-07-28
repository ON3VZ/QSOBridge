// engine/pipeline.js — Input-pipeline (Fase 1 §11.5): bytes -> decode -> detect -> parse.
// Pure functies (worker-compatibel). Ondersteunt klembord, multi-file en samenvoegen.
import { FORMATS, getFormat } from '../formats/index.js';
import { decodeBytes, fromString } from './decode.js';

/**
 * Detecteer het formaat op inhoud (extensie is enkel tiebreaker).
 * @returns {{format: object|null, candidates: string[]}}
 */
export function detectFormat(text, filename = '') {
  const hits = FORMATS.filter((f) => { try { return f.detect(text); } catch { return false; } });
  if (hits.length === 1) return { format: hits[0], candidates: [hits[0].id] };
  if (hits.length > 1) {
    // Tiebreaker op extensie.
    const ext = (filename.match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase();
    const byExt = hits.find((f) => f.extensions.includes(ext));
    return { format: byExt || hits[0], candidates: hits.map((f) => f.id) };
  }
  return { format: null, candidates: [] };
}

/**
 * Verwerk één bron (bytes of string) tot {qsos, session, warnings, meta}.
 * @param {{bytes?: Uint8Array, text?: string, filename?: string, formatId?: string}} src
 */
export function processSource(src) {
  const { text, encoding } = src.bytes ? decodeBytes(src.bytes) : fromString(src.text || '');
  const filename = src.filename || '';
  let format = src.formatId ? getFormat(src.formatId) : null;
  let candidates = format ? [format.id] : [];
  if (!format) ({ format, candidates } = detectFormat(text, filename));

  if (!format) {
    return {
      qsos: [], session: null,
      warnings: [{ reason: 'Formaat niet herkend', filename }],
      meta: { filename, encoding, format: null, candidates }
    };
  }
  const res = format.parse(text);
  // Provenance: bestandsnaam per QSO.
  for (const q of res.qsos) q.sourceFile = filename || format.id;
  return {
    qsos: res.qsos, session: res.session,
    warnings: (res.warnings || []).map((w) => ({ ...w, filename })),
    meta: { filename, encoding, format: format.id, candidates }
  };
}

/**
 * Meerdere bronnen inlezen en samenvoegen tot één sessie (Fase 2: multi-file).
 * @param {Array} sources
 * @returns {{qsos: object[], session: object, warnings: object[], perFile: object[]}}
 */
export function processMany(sources) {
  const all = [];
  const warnings = [];
  const perFile = [];
  let session = null;
  for (const src of sources) {
    const r = processSource(src);
    perFile.push(r.meta);
    warnings.push(...r.warnings);
    all.push(...r.qsos);
    // Eerste geldige sessie wint; latere vullen enkel lege velden aan.
    if (r.session) session = session ? mergeSession(session, r.session) : r.session;
  }
  return { qsos: all, session, warnings, perFile };
}

function mergeSession(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (v == null || v === '' ) continue;
    if (out[k] == null || out[k] === '') out[k] = v;
    else if (k === 'extras') out.extras = { ...b.extras, ...a.extras };
  }
  return out;
}
