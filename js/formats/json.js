// formats/json.js — Canoniek model als JSON (Fase 3). Backup / interop / round-trip.
export const id = 'json';
export const label = { nl: 'JSON (canoniek)', fr: 'JSON (canonique)', en: 'JSON (canonical)' };
export const extensions = ['.json'];
export const capabilities = {
  canParse: true, canSerialize: true,
  multiFileOutput: false, headerIntegrated: true, preservesUnknownFields: true
};

export function detect(text) {
  const t = text.trimStart();
  return t.startsWith('{') && /"format"\s*:\s*"qsobridge/.test(text);
}

export function parse(text) {
  const warnings = [];
  let data;
  try { data = JSON.parse(text); } catch (e) { return { qsos: [], session: null, warnings: [{ reason: `Ongeldige JSON: ${e.message}` }] }; }
  return { qsos: data.qsos || [], session: data.session || null, warnings };
}

export function serialize({ qsos, session } = {}) {
  const content = JSON.stringify({ format: 'qsobridge/v1', session: session || null, qsos: qsos || [] }, null, 2);
  const call = ((session && session.stationCall) || 'log').replace(/\//g, '-');
  return { files: [{ name: `${call}.json`, content }], warnings: [] };
}
