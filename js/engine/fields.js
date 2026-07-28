// engine/fields.js — Dynamische velddetectie (Fase 6).
// Elke ADIF/log kan een ander aantal velden bevatten. Deze module ontdekt wat aanwezig is,
// zodat het raster én de exportselectie zich aan de data aanpassen.

// Voorkeurslabels + volgorde voor bekende canonieke velden.
const CORE = [
  ['call', 'Call', true], ['date', 'Date', true], ['time', 'UTC', true],
  ['band', 'Band', true], ['freqMHz', 'Freq', true], ['mode', 'Mode', true],
  ['submode', 'Submode', true], ['rstSent', 'RSTs', true], ['rstRcvd', 'RSTr', true],
  ['serialSent', 'STX', true], ['serialRcvd', 'SRX', true], ['gridSquare', 'Grid', true],
  ['cqZone', 'CQZ', true], ['ituZone', 'ITUZ', true], ['iota', 'IOTA', true],
  ['state', 'State', true], ['province', 'Prov', true],
  ['refs.pota.mine', 'MY POTA', true], ['refs.pota.worked', 'POTA', true],
  ['refs.sota.mine', 'MY SOTA', true], ['refs.sota.worked', 'SOTA', true],
  ['refs.wwff.mine', 'MY WWFF', true], ['refs.wwff.worked', 'WWFF', true]
];
const CORE_KEYS = new Set(CORE.map((c) => c[0]));

/** Standaard zichtbare kern (de rest van de ontdekte velden is standaard verborgen). */
export const DEFAULT_VISIBLE = ['call', 'date', 'time', 'band', 'mode', 'rstSent', 'rstRcvd', 'serialRcvd', 'gridSquare'];

/**
 * Relevante exportvelden voor een profiel (Fase 6). Bepaalt welke velden standaard
 * mee-exporteren: hangt af van het type contest / IOTA / POTA / WWFF / SOTA ...
 * @returns {?Set<string>} null = alle velden; anders de relevante set.
 */
export function profileExportFields(profile) {
  if (!profile) return null;
  if (Array.isArray(profile.exportFields)) return new Set(profile.exportFields); // expliciet in profiel
  const set = new Set(['call', 'date', 'time', 'band', 'mode']);
  for (const f of profile.requiredQsoFields || []) set.add(f);
  const ex = profile.exchange;
  if (ex) for (const who of ['sent', 'rcvd']) {
    for (const arr of Object.values(ex[who] || {})) for (const f of arr) {
      if (!f.startsWith('my')) set.add(f); // 'my*' zit in de header, niet als QSO-kolom
    }
  }
  const emitStr = JSON.stringify(profile.emit || {});
  if (/POTA/.test(emitStr) || profile.id === 'pota') { set.add('refs.pota.mine'); set.add('refs.pota.worked'); }
  if (/WWFF/.test(emitStr) || profile.id === 'wwff') { set.add('refs.wwff.mine'); set.add('refs.wwff.worked'); }
  if (profile.targetFormat === 'sota' || profile.id === 'sota') { set.add('refs.sota.mine'); set.add('refs.sota.worked'); set.add('freqMHz'); }
  for (const k of Object.keys(profile.validation || {})) if (!k.startsWith('my') && !k.startsWith('categories')) set.add(k);
  return set;
}

function hasVal(v) { return v != null && v !== '' && v !== false; }

/**
 * Ontdekt alle kolommen die in de dataset voorkomen.
 * @returns {{key,label,mono,source}[]} core-velden (in vaste volgorde) + refs + extras (alfabetisch)
 */
export function discoverFields(qsos) {
  const present = new Set();
  const extras = new Set();
  for (const q of qsos) {
    if (hasVal(q.call)) present.add('call');
    if (hasVal(q.datetime)) { present.add('date'); present.add('time'); }
    for (const k of ['band', 'freqMHz', 'mode', 'submode', 'rstSent', 'rstRcvd', 'serialSent', 'serialRcvd', 'gridSquare', 'cqZone', 'ituZone', 'iota', 'state', 'province']) {
      if (hasVal(q[k])) present.add(k);
    }
    for (const prog of Object.keys(q.refs || {})) {
      if (q.refs[prog] && hasVal(q.refs[prog].mine)) present.add(`refs.${prog}.mine`);
      if (q.refs[prog] && hasVal(q.refs[prog].worked)) present.add(`refs.${prog}.worked`);
    }
    for (const [k, v] of Object.entries(q.extras || {})) {
      if (v !== true && hasVal(v)) extras.add(k);
    }
  }
  const cols = [];
  for (const [key, label, mono] of CORE) if (present.has(key)) cols.push({ key, label, mono, source: 'core' });
  // Onbekende refs die niet in CORE staan:
  for (const key of [...present].filter((k) => k.startsWith('refs.') && !CORE_KEYS.has(k)).sort()) {
    cols.push({ key, label: key.replace('refs.', '').replace('.', ' '), mono: true, source: 'core' });
  }
  // Extras (alles wat het logprogramma exporteert) alfabetisch:
  for (const key of [...extras].sort()) {
    cols.push({ key: `extras.${key}`, label: key, mono: true, source: 'extra' });
  }
  return cols;
}
