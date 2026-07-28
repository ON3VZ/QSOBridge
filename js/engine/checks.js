// engine/checks.js — Log-checking & suggestie-engine (v2 Fase C).
// Elke check is een pure functie die suggesties oplevert; elke suggestie draagt een BRON.
import { lookupCall, bundledDataset, baseForCall } from '../enrich/dxcc.js';
import { checkBandFreq } from '../normalize/bandplan.js';
import { isCallsign, isLocator } from '../normalize/validators.js';
import { toAdifDate } from '../normalize/datetime.js';
import { sourceLabel } from '../data/registry.js';
import { refExists } from '../enrich/refcheck.js';

function sug(q, field, code, severity, message, source, suggested) {
  return { qsoId: q.id, field, code, severity, message, source, suggested: suggested === undefined ? null : suggested };
}

const CTY = () => 'cty.dat (AD1C)';

export const CHECKS = [
  {
    id: 'zone', label: { nl: 'Zone ↔ prefix', en: 'Zone ↔ prefix', fr: 'Zone ↔ préfixe' },
    run(qsos, ctx) {
      const ds = ctx.dataset || bundledDataset();
      const out = [];
      for (const q of qsos) {
        if (!q.call) continue;
        const r = lookupCall(q.call, ds); if (!r) continue;
        const src = sourceLabel(r.source);
        if (q.cqZone != null && q.cqZone !== '' && Number(q.cqZone) !== r.cqz)
          out.push(sug(q, 'cqZone', 'ZONE_CQ', 'error', `CQ-zone ${q.cqZone} ≠ ${r.cqz} (${r.dxcc})`, src, r.cqz));
        if (q.ituZone != null && q.ituZone !== '' && Number(q.ituZone) !== r.ituz)
          out.push(sug(q, 'ituZone', 'ZONE_ITU', 'error', `ITU-zone ${q.ituZone} ≠ ${r.ituz} (${r.dxcc})`, src, r.ituz));
      }
      return out;
    }
  },
  {
    id: 'busted', label: { nl: 'Onbekende prefix', en: 'Unknown prefix', fr: 'Préfixe inconnu' },
    run(qsos, ctx) {
      const ds = ctx.dataset || bundledDataset();
      const out = [];
      for (const q of qsos) {
        if (!q.call) continue;
        if (!lookupCall(q.call, ds)) out.push(sug(q, 'call', 'BUSTED', 'warn', `Prefix niet gevonden — mogelijk tikfout in ${q.call}`, CTY()));
      }
      return out;
    }
  },
  {
    id: 'callfmt', label: { nl: 'Callsign-vorm', en: 'Callsign format', fr: 'Format indicatif' },
    run(qsos) {
      const out = [];
      for (const q of qsos) {
        if (!q.call) continue;
        const base = baseForCall(q.call);
        if (base && !isCallsign(base)) out.push(sug(q, 'call', 'CALLFMT', 'warn', `Ongeldige callsign-vorm: ${q.call}`, 'callsign-regels'));
      }
      return out;
    }
  },
  {
    id: 'bandfreq', label: { nl: 'Band ↔ frequentie', en: 'Band ↔ frequency', fr: 'Bande ↔ fréquence' },
    run(qsos) {
      const out = [];
      for (const q of qsos) {
        const bf = checkBandFreq(q.freqMHz, q.band);
        if (bf.severity === 'error' || bf.severity === 'warn')
          out.push(sug(q, 'band', 'BANDFREQ', bf.severity, bf.message, 'bandplan (bandranden)', bf.suggestedBand));
      }
      return out;
    }
  },
  {
    id: 'grid', label: { nl: 'Locator-vorm', en: 'Locator format', fr: 'Format locator' },
    run(qsos) {
      const out = [];
      for (const q of qsos) {
        if (q.gridSquare && !isLocator(q.gridSquare))
          out.push(sug(q, 'gridSquare', 'GRIDFMT', 'error', `Ongeldige Maidenhead-locator: ${q.gridSquare}`, 'Maidenhead-regels'));
      }
      return out;
    }
  },
  {
    id: 'time', label: { nl: 'Chronologie', en: 'Chronology', fr: 'Chronologie' },
    run(qsos) {
      const out = [];
      let prev = null;
      for (const q of qsos) {
        if (!q.datetime) continue;
        if (prev && q.datetime < prev) out.push(sug(q, 'time', 'TIME_ORDER', 'warn', `QSO staat niet in chronologische volgorde`, 'chronologie-regel'));
        prev = q.datetime;
      }
      return out;
    }
  },
  {
    id: 'date', label: { nl: 'Datumbereik', en: 'Date range', fr: 'Plage de dates' },
    run(qsos) {
      const out = [];
      const now = Date.now();
      for (const q of qsos) {
        if (!q.datetime) continue;
        const t = Date.parse(q.datetime);
        if (isNaN(t)) continue;
        if (t < Date.parse('1980-01-01') || t > now + 86400000)
          out.push(sug(q, 'date', 'DATE_RANGE', 'warn', `Verdachte datum: ${toAdifDate(q.datetime)}`, 'datumbereik-regel'));
      }
      return out;
    }
  },
  {
    id: 'dupediff', label: { nl: 'Dupe met andere exchange', en: 'Dupe, differing exchange', fr: 'Doublon, échange différent' },
    run(qsos) {
      const out = [];
      const groups = new Map();
      for (const q of qsos) {
        if (!q.call) continue;
        const k = `${q.call}|${q.band}|${q.mode}`.toUpperCase();
        (groups.get(k) || groups.set(k, []).get(k)).push(q);
      }
      for (const arr of groups.values()) {
        if (arr.length < 2) continue;
        const first = arr[0];
        for (const q of arr.slice(1)) {
          if ((q.rstRcvd || '') !== (first.rstRcvd || '') || (q.serialRcvd ?? '') !== (first.serialRcvd ?? ''))
            out.push(sug(q, 'call', 'DUPE_DIFF', 'warn', `Dubbel ${q.call} op ${q.band}/${q.mode} met afwijkende exchange`, 'dupe-regel'));
        }
      }
      return out;
    }
  },
  {
    id: 'serial', label: { nl: 'Dubbel serienummer', en: 'Duplicate serial', fr: 'Numéro dupliqué' },
    run(qsos) {
      const out = [];
      const seen = new Map();
      for (const q of qsos) {
        if (q.serialSent == null || q.serialSent === '') continue;
        const n = Number(q.serialSent);
        if (seen.has(n)) out.push(sug(q, 'serialSent', 'SERIAL_DUP', 'warn', `Verzonden serienummer ${n} komt meermaals voor`, 'serienummer-regel'));
        else seen.set(n, q.id);
      }
      return out;
    }
  },
  {
    id: 'refexist', label: { nl: 'Referentie bestaat', en: 'Reference exists', fr: 'Référence existe' },
    run(qsos, ctx) {
      const idx = ctx.refIndex;
      if (!idx) return [];
      const out = [];
      for (const q of qsos) {
        for (const kind of ['pota', 'sota', 'wwff']) {
          for (const side of ['mine', 'worked']) {
            const ref = q.refs && q.refs[kind] && q.refs[kind][side];
            if (!ref) continue;
            if (refExists(idx, kind, ref) === 'no') {
              const src = (idx.meta && idx.meta[kind] && idx.meta[kind].source) || 'geïmporteerde lijst';
              out.push(sug(q, `refs.${kind}.${side}`, 'REF_NOTFOUND', 'warn', `${kind.toUpperCase()}-ref niet in lijst: ${ref}`, src));
            }
          }
        }
      }
      return out;
    }
  }
];

/** Draait alle (of geselecteerde) checks. @returns {Suggestion[]} */
export function runChecks(qsos, ctx = {}, ids = null) {
  const active = ids ? CHECKS.filter((c) => ids.includes(c.id)) : CHECKS;
  const out = [];
  for (const c of active) { try { out.push(...c.run(qsos, ctx)); } catch { /* check faalt zacht */ } }
  return out;
}

/** Past één suggestie toe (zet het voorgestelde veld). @returns {boolean} */
export function applySuggestion(qsos, s) {
  if (s.suggested == null) return false;
  const q = qsos.find((x) => x.id === s.qsoId);
  if (!q) return false;
  if (s.field === 'band') q.band = s.suggested;
  else if (s.field === 'cqZone') q.cqZone = s.suggested;
  else if (s.field === 'ituZone') q.ituZone = s.suggested;
  else q[s.field] = s.suggested;
  return true;
}

/** Groepeert suggesties per check-code voor de UI. */
export function groupByCode(suggestions) {
  const g = new Map();
  for (const s of suggestions) (g.get(s.code) || g.set(s.code, []).get(s.code)).push(s);
  return g;
}
