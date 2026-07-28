// formats/index.js — Formaat-registry (Fase 1 §4 / Fase 3).
import * as adif from './adif.js';
import * as cabrillo from './cabrillo.js';
import * as edi from './edi.js';
import * as sota from './sota.js';
import * as fle from './fle.js';
import * as json from './json.js';
import * as custom from './custom.js';
import * as adx from './adx.js';

/** Parse-/detectie-registry. Volgorde = detectie-prioriteit (specifiek voor generiek). */
export const FORMATS = [json, edi, adif, cabrillo, sota, fle];

/** Alle serializers (incl. serialize-only 'custom' en 'adx'). */
export const SERIALIZERS = [adif, adx, cabrillo, edi, sota, json, custom];

export function getFormat(id) {
  return FORMATS.find((f) => f.id === id) || null;
}

export function getSerializer(id) {
  return SERIALIZERS.find((f) => f.id === id && f.capabilities && f.capabilities.canSerialize) || null;
}
