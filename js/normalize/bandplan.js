// normalize/bandplan.js — Band <-> frequentie (Fase 1 §3.1). Bidirectioneel.

/** Ranges in MHz + representatieve frequentie per band. */
export const BANDS = [
  { band: '2190m', lo: 0.1357, hi: 0.1378, rep: 0.1357 },
  { band: '630m', lo: 0.472, hi: 0.479, rep: 0.475 },
  { band: '160m', lo: 1.8, hi: 2.0, rep: 1.83 },
  { band: '80m', lo: 3.5, hi: 4.0, rep: 3.573 },
  { band: '60m', lo: 5.06, hi: 5.45, rep: 5.357 },
  { band: '40m', lo: 7.0, hi: 7.3, rep: 7.074 },
  { band: '30m', lo: 10.1, hi: 10.15, rep: 10.136 },
  { band: '20m', lo: 14.0, hi: 14.35, rep: 14.074 },
  { band: '17m', lo: 18.068, hi: 18.168, rep: 18.1 },
  { band: '15m', lo: 21.0, hi: 21.45, rep: 21.074 },
  { band: '12m', lo: 24.89, hi: 24.99, rep: 24.915 },
  { band: '10m', lo: 28.0, hi: 29.7, rep: 28.074 },
  { band: '6m', lo: 50.0, hi: 54.0, rep: 50.313 },
  { band: '4m', lo: 70.0, hi: 70.5, rep: 70.1 },
  { band: '2m', lo: 144.0, hi: 148.0, rep: 144.174 },
  { band: '1.25m', lo: 222.0, hi: 225.0, rep: 223.5 },
  { band: '70cm', lo: 420.0, hi: 450.0, rep: 432.174 },
  { band: '33cm', lo: 902.0, hi: 928.0, rep: 903.0 },
  { band: '23cm', lo: 1240.0, hi: 1300.0, rep: 1296.174 },
  { band: '13cm', lo: 2300.0, hi: 2450.0, rep: 2320.0 },
  { band: '9cm', lo: 3300.0, hi: 3500.0, rep: 3400.0 },
  { band: '6cm', lo: 5650.0, hi: 5925.0, rep: 5760.0 },
  { band: '3cm', lo: 10000.0, hi: 10500.0, rep: 10368.0 }
];

const _byName = new Map(BANDS.map((b) => [b.band, b]));

/** MHz -> canonieke bandnaam, of null als buiten alle ranges. */
export function freqToBand(mhz) {
  if (mhz == null || Number.isNaN(mhz)) return null;
  for (const b of BANDS) if (mhz >= b.lo && mhz <= b.hi) return b.band;
  return null;
}

/** Bandnaam -> representatieve frequentie (MHz), of null. */
export function bandToRepFreq(band) {
  const b = _byName.get(normBandName(band));
  return b ? b.rep : null;
}

/** Normaliseert schrijfwijze: "20M", "20 m" -> "20m". */
export function normBandName(band) {
  if (!band) return null;
  return String(band).trim().toLowerCase().replace(/\s+/g, '');
}

/** Cabrillo wil kHz (of bandgetal). */
export function mhzToKhz(mhz) {
  return mhz == null ? null : Math.round(mhz * 1000);
}

/**
 * Bandplan-consistentiecheck voor het tussenscherm én inline-editeren (Fase 4-wiring).
 * Controleert of frequentie en band bij elkaar passen en of de freq in een amateurband valt.
 * @param {?number} freqMHz
 * @param {?string} band
 * @returns {{severity:'ok'|'info'|'warn'|'error', code:string, message:string, suggestedBand:?string}}
 */
export function checkBandFreq(freqMHz, band) {
  const b = band ? normBandName(band) : null;
  const bandKnown = b ? _byName.has(b) : false;
  const derived = (freqMHz != null) ? freqToBand(freqMHz) : null;

  // Geen van beide -> verplicht veld ontbreekt.
  if (freqMHz == null && !b) {
    return { severity: 'warn', code: 'NO_FREQ_NO_BAND', message: 'Geen frequentie én geen band', suggestedBand: null };
  }
  // Enkel band bekend: kan niet tegen freq toetsen.
  if (freqMHz == null && b) {
    return bandKnown
      ? { severity: 'info', code: 'FREQ_MISSING', message: 'Band ingevuld, frequentie ontbreekt', suggestedBand: null }
      : { severity: 'warn', code: 'BAND_UNKNOWN', message: `Onbekende bandnaam: ${band}`, suggestedBand: null };
  }
  // Freq aanwezig maar buiten alle amateurbanden.
  if (freqMHz != null && derived == null) {
    return { severity: 'error', code: 'FREQ_OUT_OF_BAND', message: `Frequentie ${freqMHz} MHz valt buiten de amateurbanden`, suggestedBand: null };
  }
  // Enkel freq bekend: band kan afgeleid worden.
  if (freqMHz != null && !b) {
    return { severity: 'info', code: 'BAND_DERIVABLE', message: `Band afleidbaar uit frequentie: ${derived}`, suggestedBand: derived };
  }
  // Beide aanwezig: moeten overeenkomen.
  if (b !== derived) {
    return { severity: 'error', code: 'BAND_FREQ_MISMATCH', message: `Band '${band}' past niet bij ${freqMHz} MHz (verwacht ${derived})`, suggestedBand: derived };
  }
  return { severity: 'ok', code: 'OK', message: 'Frequentie en band kloppen', suggestedBand: derived };
}
