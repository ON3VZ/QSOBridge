// enrich/refcheck.js — Referentie-bestaanscontrole POTA/SOTA/WWFF (v2 Fase D).
// Offline: tegen een geïmporteerde publieke lijst. Online: opt-in, en enkel de referentie vertrekt.
import { isPota, isSota, isWwff } from '../normalize/validators.js';

const MATCH = { pota: isPota, sota: isSota, wwff: isWwff };

/** Bouwt een lege index. */
export function makeRefIndex() { return { pota: new Set(), sota: new Set(), wwff: new Set(), meta: {} }; }

/**
 * Parseert een publieke lijst (CSV/tekst) en haalt de referenties eruit die bij `kind` passen.
 * Robuust t.o.v. kolomindeling: elk token dat de vorm heeft, telt.
 * @returns {{kind, refs:Set<string>, count:number}}
 */
export function parseRefList(text, kind) {
  const test = MATCH[kind];
  const refs = new Set();
  if (test) {
    for (const tok of String(text).split(/[\s,;"']+/)) {
      const t = tok.trim().toUpperCase();
      if (t && test(t)) refs.add(t);
    }
  }
  return { kind, refs, count: refs.size };
}

/** Voegt een lijst toe aan de index. */
export function addRefList(index, kind, refs, sourceName) {
  index[kind] = refs instanceof Set ? refs : new Set(refs);
  index.meta[kind] = { source: sourceName || 'geïmporteerde lijst', count: index[kind].size };
  return index;
}

/** @returns {'yes'|'no'|'unknown'} 'unknown' als er geen lijst geladen is. */
export function refExists(index, kind, ref) {
  if (!index || !index[kind] || index[kind].size === 0) return 'unknown';
  return index[kind].has(String(ref).toUpperCase()) ? 'yes' : 'no';
}

// ---- Online lookup (opt-in) ----
export function buildLookupUrl(kind, ref) {
  const r = encodeURIComponent(String(ref).toUpperCase());
  if (kind === 'pota') return `https://api.pota.app/park/${r}`;
  if (kind === 'sota') return `https://api-db2.sota.org.uk/api/summits/${r}`;
  return null;
}

/**
 * Optionele online opzoeking. Vereist expliciete consent. Stuurt enkel de referentie.
 * @param {{fetchImpl?:function, consent:boolean}} opts
 * @returns {Promise<'yes'|'no'|'unknown'|'blocked'>}
 */
export async function lookupOnline(kind, ref, opts = {}) {
  if (!opts.consent) return 'blocked';
  const url = buildLookupUrl(kind, ref);
  if (!url) return 'unknown';
  const f = opts.fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  if (!f) return 'unknown';
  try {
    const res = await f(url);
    if (!res.ok) return res.status === 404 ? 'no' : 'unknown';
    return 'yes';
  } catch { return 'unknown'; }
}
