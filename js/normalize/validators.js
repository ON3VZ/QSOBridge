// normalize/validators.js — Gedeelde vorm-validators (Fase 1 §3.6/§11.3).
// Elke validator geeft true/false; gebruikt door profielen, QRB en de rode-rand-markering.

export const RE = {
  maidenhead: /^[A-R]{2}[0-9]{2}([A-X]{2}([0-9]{2})?)?$/i,
  iota: /^[A-Z]{2}-\d{3}$/i,          // bv. EU-005
  pota: /^[A-Z0-9]{1,3}-\d{4,5}$/i,   // bv. ON-0001 / US-12345
  sota: /^[A-Z0-9]{1,3}\/[A-Z]{2}-\d{3}$/i, // bv. ON/ON-027
  wwff: /^[A-Z0-9]{1,4}FF-\d{4}$/i,   // bv. ONFF-0001
  arlhs: /^[A-Z]{3}-\d{3}$/i,         // bv. BEL-001
  callsign: /^[A-Z0-9]{1,3}[0-9][A-Z0-9]*(\/[A-Z0-9]+)*$/i
};

export function isLocator(v) { return !!v && RE.maidenhead.test(v.trim()); }
export function isIota(v) { return !!v && RE.iota.test(v.trim()); }
export function isPota(v) { return !!v && RE.pota.test(v.trim()); }
export function isSota(v) { return !!v && RE.sota.test(v.trim()); }
export function isWwff(v) { return !!v && RE.wwff.test(v.trim()); }
export function isCallsign(v) { return !!v && RE.callsign.test(v.trim()); }

/** Normaliseert een callsign: uppercase, trim, spaties weg. */
export function normCall(call) {
  return call ? call.trim().toUpperCase().replace(/\s+/g, '') : null;
}

/** Ruwe portable-/prefix-delen scheiden: "ON3VZ/P" -> {base:"ON3VZ", suffix:"P"}. */
export function splitCall(call) {
  const c = normCall(call);
  if (!c) return { base: null, prefix: null, suffix: null };
  const parts = c.split('/');
  if (parts.length === 1) return { base: parts[0], prefix: null, suffix: null };
  // Kortste deel is doorgaans prefix/suffix-indicator.
  const [a, b] = parts;
  if (a.length <= b.length && /^[0-9A-Z]{1,3}$/.test(a)) return { base: b, prefix: a, suffix: parts[2] || null };
  return { base: a, prefix: null, suffix: b };
}
