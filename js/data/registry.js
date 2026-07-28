// data/registry.js — Databron-registry (v2 Fase A). Elke dataset draagt zijn herkomst.
// Dit is het fundament onder "elke controle/suggestie heeft een bron".

export const DATASETS = {
  prefixes: {
    id: 'prefixes',
    name: 'QSObridge prefixtabel',
    source: 'Afgeleid van cty.dat (AD1C) + ADIF DXCC-enum',
    sourceUrl: 'https://www.country-files.com/',
    license: 'Vrij gebruik voor amateurdoeleinden',
    version: '2026-07 (gebundelde snapshot)',
    scope: 'offline',
    note: 'Compacte kernset voor offline verrijking. Voor volledige nauwkeurigheid (bv. exacte US-zones) importeer je de volledige cty.dat.'
  },
  ctydat: {
    id: 'ctydat',
    name: 'cty.dat (volledig)',
    source: 'Jim Reisert AD1C',
    sourceUrl: 'https://www.country-files.com/',
    license: 'Vrij gebruik voor amateurdoeleinden',
    version: null, // gevuld na import
    scope: 'opt-in-import',
    note: 'De-facto standaard voor DXCC/CQ/ITU/continent. Frequent geüpdatet. Importeer het bestand voor volledige dekking incl. full-call-uitzonderingen.'
  }
};

/** @returns {string} korte bronvermelding voor tooltips ("bron: ..."). */
export function sourceLabel(id) {
  const d = DATASETS[id];
  if (!d) return '';
  return `${d.name}${d.version ? ` (${d.version})` : ''} — ${d.source}`;
}

export function allDatasets() { return Object.values(DATASETS); }
