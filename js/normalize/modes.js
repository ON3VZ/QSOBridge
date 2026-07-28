// normalize/modes.js — Mode-mapping (Fase 1 §3.2). Uitbreidbaar; onbekende modes worden doorgelaten.

/** Canonieke mode -> {cabrillo, edi(1-9), category}. */
export const MODE_MAP = {
  CW: { cabrillo: 'CW', edi: 2, cat: 'CW' },
  SSB: { cabrillo: 'PH', edi: 1, cat: 'PHONE' },
  USB: { cabrillo: 'PH', edi: 1, cat: 'PHONE' },
  LSB: { cabrillo: 'PH', edi: 1, cat: 'PHONE' },
  AM: { cabrillo: 'PH', edi: 5, cat: 'PHONE' },
  FM: { cabrillo: 'FM', edi: 6, cat: 'PHONE' },
  RTTY: { cabrillo: 'RY', edi: 7, cat: 'DIGI' },
  PSK: { cabrillo: 'DG', edi: null, cat: 'DIGI' },
  PSK31: { cabrillo: 'DG', edi: null, cat: 'DIGI' },
  FT8: { cabrillo: 'DG', edi: null, cat: 'DIGI' },
  FT4: { cabrillo: 'DG', edi: null, cat: 'DIGI' },
  MFSK: { cabrillo: 'DG', edi: null, cat: 'DIGI' },
  JT65: { cabrillo: 'DG', edi: null, cat: 'DIGI' },
  MSK144: { cabrillo: 'DG', edi: null, cat: 'DIGI' },
  SSTV: { cabrillo: null, edi: 8, cat: 'IMAGE' },
  ATV: { cabrillo: null, edi: 9, cat: 'IMAGE' }
};

/** EDI-code (1-9) -> {tx, rx} canonieke modes. */
export const EDI_CODES = {
  1: { tx: 'SSB', rx: 'SSB' },
  2: { tx: 'CW', rx: 'CW' },
  3: { tx: 'SSB', rx: 'CW' },
  4: { tx: 'CW', rx: 'SSB' },
  5: { tx: 'AM', rx: 'AM' },
  6: { tx: 'FM', rx: 'FM' },
  7: { tx: 'RTTY', rx: 'RTTY' },
  8: { tx: 'SSTV', rx: 'SSTV' },
  9: { tx: 'ATV', rx: 'ATV' }
};

export function normMode(mode) {
  return mode ? String(mode).trim().toUpperCase() : null;
}

/** Canoniek -> Cabrillo-code. Onbekend -> 'DG' (veilige digi-default) + doorlaat-vlag. */
export function toCabrilloMode(mode) {
  const m = normMode(mode);
  if (m && MODE_MAP[m]) return MODE_MAP[m].cabrillo || 'DG';
  return 'DG';
}

/** Canoniek -> EDI-code (1-9). Onbekend -> null (laat leeg). */
export function toEdiMode(mode) {
  const m = normMode(mode);
  return m && MODE_MAP[m] ? MODE_MAP[m].edi : null;
}

/** EDI-code -> canonieke (TX-)mode. */
export function fromEdiMode(code) {
  const c = EDI_CODES[Number(code)];
  return c ? c.tx : null;
}
