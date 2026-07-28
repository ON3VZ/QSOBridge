// engine/dupes.js — Dupe-detectie (Fase 4). Configureerbaar per profiel/voorkeur.
import { toAdifDate } from '../normalize/datetime.js';

/**
 * @param {object[]} qsos
 * @param {{fields?: string[], perDay?: boolean}} opts
 *   fields: welke velden samen een dupe bepalen (default call+band+mode)
 *   perDay: dupe enkel binnen dezelfde dag (sommige contesten)
 * @returns {number} aantal gemarkeerde dupes
 */
export function markDupes(qsos, opts = {}) {
  const fields = opts.fields || ['call', 'band', 'mode'];
  const seen = new Set();
  let count = 0;
  for (const q of qsos) {
    q.isDupe = false;
    if (q.selected === false) continue;
    const parts = fields.map((f) => (q[f] == null ? '' : String(q[f]).toUpperCase()));
    if (opts.perDay && q.datetime) parts.push(toAdifDate(q.datetime));
    const key = parts.join('|');
    if (seen.has(key)) { q.isDupe = true; count++; }
    else seen.add(key);
  }
  return count;
}
