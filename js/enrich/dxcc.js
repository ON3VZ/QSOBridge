// enrich/dxcc.js — DXCC-opzoek (v2 Fase B). Werkt op de gebundelde tabel of een geïmporteerde cty.dat.
import { prefixEntry, PREFIXES } from '../data/prefixes.js';

/** Dataset-wrapper rond de gebundelde prefixtabel. */
export function bundledDataset() {
  return { getPrefix: prefixEntry, prefixes: PREFIXES, exceptions: null, sourceId: 'prefixes' };
}

const MODIFIERS = new Set(['P', 'M', 'MM', 'AM', 'A', 'QRP', 'QRPP', 'R', 'LH', 'BCN', 'J']);
function isModifier(p) { return MODIFIERS.has(p) || /^\d{1,2}$/.test(p); }

/** Kiest het deel van een (portable) call dat de DXCC-locatie bepaalt. */
export function baseForCall(call) {
  const parts = String(call).toUpperCase().split('/').filter(Boolean);
  if (parts.length <= 1) return parts[0] || '';
  const cand = parts.filter((p) => !isModifier(p));
  if (cand.length <= 1) return cand[0] || parts[0];
  // Bij "A/B": het kortste geldige prefix-deel bepaalt de locatie (bv. DL/ON3VZ -> DL).
  const sorted = [...cand].sort((a, b) => a.length - b.length);
  return sorted[0];
}

/**
 * Zoekt DXCC-gegevens voor een call.
 * @returns {?{dxcc,cont,cqz,ituz,matched,source}}
 */
export function lookupCall(call, dataset = bundledDataset()) {
  if (!call) return null;
  const norm = String(call).toUpperCase().trim();
  if (dataset.exceptions && dataset.exceptions.has(norm)) {
    return { ...dataset.exceptions.get(norm), matched: 'exception', source: dataset.sourceId };
  }
  const base = baseForCall(norm);
  if (!base) return null;
  const maxLen = Math.min(base.length, 6);
  for (let len = maxLen; len >= 1; len--) {
    const entry = dataset.getPrefix(base.slice(0, len));
    if (entry) return { ...entry, matched: 'prefix', source: dataset.sourceId };
  }
  return null;
}
