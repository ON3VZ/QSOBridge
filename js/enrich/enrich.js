// enrich/enrich.js — Verrijking & zone-controle (v2 Fase B).
// Vult lege velden aan als suggestie-met-bron; detecteert zone↔prefix-mismatches.
import { lookupCall, bundledDataset } from './dxcc.js';
import { sourceLabel } from '../data/registry.js';

/**
 * Zoekt DXCC-gegevens voor elke QSO.
 * @returns {{lookups: Map<string,object>, sourceId: string}}
 */
export function enrichQsos(qsos, dataset = bundledDataset()) {
  const lookups = new Map();
  for (const q of qsos) {
    if (!q.call) continue;
    const r = lookupCall(q.call, dataset);
    if (r) lookups.set(q.id, r);
  }
  return { lookups, sourceId: dataset.sourceId };
}

/**
 * Vult ontbrekende velden aan (cqZone, ituZone, continent+dxcc in extras).
 * Bestaande waarden worden niet overschreven.
 * @returns {{filled:number, source:string}}
 */
export function applyFills(qsos, lookups) {
  let filled = 0; let sourceId = 'prefixes';
  for (const q of qsos) {
    const r = lookups.get(q.id);
    if (!r) continue;
    sourceId = r.source;
    if (q.cqZone == null || q.cqZone === '') { q.cqZone = r.cqz; filled++; }
    if (q.ituZone == null || q.ituZone === '') { q.ituZone = r.ituz; filled++; }
    q.extras = q.extras || {};
    if (!q.extras.DXCC) { q.extras.DXCC = r.dxcc; filled++; }
    if (!q.extras.CONT) { q.extras.CONT = r.cont; filled++; }
  }
  return { filled, source: sourceLabel(sourceId) };
}

/**
 * Detecteert QSO's waar een ingevulde zone niet strookt met de prefix.
 * @returns {{id,field,current,suggested,source}[]}
 */
export function findZoneMismatches(qsos, lookups) {
  const out = [];
  for (const q of qsos) {
    const r = lookups.get(q.id);
    if (!r) continue;
    const src = sourceLabel(r.source);
    if (q.cqZone != null && q.cqZone !== '' && Number(q.cqZone) !== r.cqz) {
      out.push({ id: q.id, field: 'cqZone', current: q.cqZone, suggested: r.cqz, source: src });
    }
    if (q.ituZone != null && q.ituZone !== '' && Number(q.ituZone) !== r.ituz) {
      out.push({ id: q.id, field: 'ituZone', current: q.ituZone, suggested: r.ituz, source: src });
    }
  }
  return out;
}
