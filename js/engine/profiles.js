// engine/profiles.js — Profiel-logica (Fase 5): detectie, import/export, contestTag.
import { getProfile, allProfiles, registerProfile } from '../../profiles/index.js';

export { getProfile, allProfiles };

/** Lost de contestTag op voor een mode (profielen kunnen per mode verschillen). */
export function contestTagFor(profile, mode) {
  if (!profile || !profile.contestTag) return null;
  if (typeof profile.contestTag === 'string') return profile.contestTag;
  const m = (mode || '').toUpperCase();
  return profile.contestTag[m] || Object.values(profile.contestTag)[0] || null;
}

/** Auto-detectie van het profiel uit een ADIF CONTEST_ID / sessie-contestId. */
export function detectProfile(session) {
  const cid = (session && (session.contestId || (session.extras && session.extras.CONTEST_ID)) || '').toUpperCase();
  if (!cid) return null;
  for (const p of allProfiles()) {
    const tags = p.contestTag ? (typeof p.contestTag === 'string' ? [p.contestTag] : Object.values(p.contestTag)) : [];
    if (tags.some((t) => t.toUpperCase() === cid)) return p;
  }
  return null;
}

/** Minimale schemacheck voor een geïmporteerd profiel. */
export function validateProfileDef(def) {
  const errors = [];
  if (!def || typeof def !== 'object') return ['Geen object'];
  if (!def.id) errors.push('id ontbreekt');
  if (!def.targetFormat) errors.push('targetFormat ontbreekt');
  if (!def.label) errors.push('label ontbreekt');
  if (!def.schemaVersion) errors.push('schemaVersion ontbreekt');
  return errors;
}

/** Importeert een profiel uit JSON-tekst (delen). Registreert bij succes. */
export function importProfile(text) {
  let def;
  try { def = JSON.parse(text); } catch (e) { return { ok: false, errors: [`Ongeldige JSON: ${e.message}`] }; }
  const errors = validateProfileDef(def);
  if (errors.length) return { ok: false, errors };
  registerProfile(def);
  return { ok: true, profile: def };
}

/** Exporteert een profiel als deelbare JSON-tekst. */
export function exportProfile(idOrDef) {
  const def = typeof idOrDef === 'string' ? getProfile(idOrDef) : idOrDef;
  return def ? JSON.stringify(def, null, 2) : null;
}
