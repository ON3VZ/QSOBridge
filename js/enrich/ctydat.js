// enrich/ctydat.js — Parser voor het volledige cty.dat (AD1C) (v2 Fase B).
// Zo kan de gebruiker de volledige, actuele lijst importeren voor maximale dekking.

/**
 * Parseert cty.dat-tekst naar een dataset.
 * @returns {{getPrefix:function, prefixes:string[], exceptions:Map, meta:{version:?string,count:number}, sourceId:string}}
 */
export function parseCty(text) {
  const prefixIndex = new Map();
  const exceptions = new Map();
  let version = null;
  const HEADER = /^\s*(.+?):\s*(\d+):\s*(\d+):\s*([A-Za-z]{2}):\s*(-?[\d.]+):\s*(-?[\d.]+):\s*(-?[\d.]+):\s*([^:]+):/;

  for (const rec of text.split(';')) {
    if (!rec.trim()) continue;
    const m = rec.match(HEADER);
    if (!m) continue;
    const base = { dxcc: m[1].trim(), cqz: parseInt(m[2], 10), ituz: parseInt(m[3], 10), cont: m[4].toUpperCase() };
    const aliasText = rec.slice(m[0].length);
    for (let tok of aliasText.split(',')) {
      tok = tok.trim();
      if (!tok) continue;
      // Overrides: (cqz) en [ituz]; markers =fullcall, en *WAE-only.
      let cqz = base.cqz, ituz = base.ituz;
      const cqM = tok.match(/\((\d+)\)/); if (cqM) cqz = parseInt(cqM[1], 10);
      const itM = tok.match(/\[(\d+)\]/); if (itM) ituz = parseInt(itM[1], 10);
      const isExc = tok.startsWith('=');
      const key = tok.replace(/^=/, '').replace(/[({\[<].*$/, '').replace(/[*~]/g, '').trim().toUpperCase();
      if (!key) continue;
      if (/^VER\d{6,}/.test(key)) { version = key; continue; }
      const entry = { dxcc: base.dxcc, cont: base.cont, cqz, ituz };
      if (isExc) exceptions.set(key, entry);
      else prefixIndex.set(key, entry);
    }
  }
  const prefixes = [...prefixIndex.keys()].sort((a, b) => b.length - a.length);
  return {
    getPrefix: (p) => prefixIndex.get(p) || null,
    prefixes, exceptions,
    meta: { version, count: prefixIndex.size },
    sourceId: 'ctydat'
  };
}
