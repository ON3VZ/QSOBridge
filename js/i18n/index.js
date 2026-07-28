// i18n/index.js — Vertaling (Fase 6, voedt ook de handleiding in Fase 8).
import nl from './nl.json' with { type: 'json' };
import en from './en.json' with { type: 'json' };
import fr from './fr.json' with { type: 'json' };
import { getPath } from '../engine/fieldpath.js';

const CATALOGS = { nl, en, fr };
export const AVAILABLE = [
  { code: 'nl', label: 'Nederlands' },
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'English' }
];

let current = 'nl';
export function setLang(code) { if (CATALOGS[code]) current = code; }
export function getLang() { return current; }

/** t('side.health') -> vertaalde string; valt terug op EN, dan op de sleutel zelf. */
export function t(key) {
  const v = getPath(CATALOGS[current], key);
  if (v != null) return v;
  const en2 = getPath(CATALOGS.en, key);
  return en2 != null ? en2 : key;
}
