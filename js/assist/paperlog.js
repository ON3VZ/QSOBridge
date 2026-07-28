// assist/paperlog.js — Vrije tekst / papieren log -> QSO-suggesties (v2 Fase E).
import { makeQso } from '../model/qso.js';
import { getProvider } from './provider.js';

export function buildPrompt(text) {
  return `Je bent een assistent die ruwe amateurradio-logs structureert.
Zet onderstaande tekst om naar een JSON-array. Geef UITSLUITEND geldige JSON, geen uitleg.
Elk item: {"call","date":"YYYY-MM-DD","time":"HHMM","band","mode","rst_sent","rst_rcvd"}.
Laat velden weg die niet in de tekst staan.

TEKST:
${text}`;
}

function toIso(date, time) {
  if (!date) return null;
  const d = String(date).replace(/\//g, '-');
  const hhmm = String(time || '0000').replace(':', '').padStart(4, '0').slice(0, 4);
  return `${d}T${hhmm.slice(0, 2)}:${hhmm.slice(2, 4)}:00Z`;
}

/** Parseert het modelantwoord naar QSO-suggesties (elk gemarkeerd als AI). */
export function parseResponse(txt) {
  const clean = String(txt).replace(/```json/gi, '').replace(/```/g, '').trim();
  let arr;
  try { arr = JSON.parse(clean); }
  catch { const m = clean.match(/\[[\s\S]*\]/); arr = m ? JSON.parse(m[0]) : []; }
  if (!Array.isArray(arr)) arr = [];
  return arr.map((o) => makeQso({
    call: String(o.call || '').toUpperCase(),
    datetime: toIso(o.date, o.time),
    band: o.band ? String(o.band).toLowerCase() : null,
    mode: o.mode ? String(o.mode).toUpperCase() : null,
    rstSent: o.rst_sent != null ? String(o.rst_sent) : null,
    rstRcvd: o.rst_rcvd != null ? String(o.rst_rcvd) : null,
    source: 'ai',
    extras: { AI_SUGGESTED: '1' }
  }));
}

/** Volledige flow: tekst -> provider -> QSO-suggesties. */
export async function interpretPaperLog(text, provider = getProvider()) {
  if (!provider.available()) throw new Error('AI-provider niet beschikbaar');
  const out = await provider.complete(buildPrompt(text));
  return parseResponse(out);
}
