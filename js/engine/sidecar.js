// engine/sidecar.js — Verlies-detectie + sidecar (beslispunt 3).
// Bij export naar Cabrillo/EDI/SOTA (geen custom velden) verzamelen we wat verloren zou gaan.

/**
 * @param {object[]} qsos
 * @param {object} targetCaps  capabilities van het doelformaat
 * @param {string} baseName    bestandsnaam-basis voor de sidecar
 * @returns {{hasLoss:boolean, count:number, warning:?object, sidecar:?{name,content}}}
 */
export function buildSidecar(qsos, targetCaps, baseName = 'export') {
  if (targetCaps && targetCaps.preservesUnknownFields) {
    return { hasLoss: false, count: 0, warning: null, sidecar: null };
  }
  const lost = {};
  let count = 0;
  for (const q of qsos) {
    if (q.selected === false) continue;
    const bag = {};
    for (const [k, v] of Object.entries(q.extras || {})) {
      if (v === true || v == null || v === '') continue; // interne markers overslaan
      bag[k] = v;
    }
    if (Object.keys(bag).length) { lost[q.id] = bag; count += Object.keys(bag).length; }
  }
  const hasLoss = count > 0;
  return {
    hasLoss,
    count,
    warning: hasLoss
      ? { reason: `Doelformaat draagt geen custom velden: ${count} veld(en) gaan verloren. Sidecar aangeboden.`, severity: 'warn' }
      : null,
    sidecar: hasLoss
      ? { name: `${baseName}.qsobridge-extras.json`, content: JSON.stringify({ format: 'qsobridge-sidecar/v1', fields: lost }, null, 2) }
      : null
  };
}
