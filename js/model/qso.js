// model/qso.js — Canoniek QSO-datamodel (Fase 1 §2.1).
// Eén genormaliseerde representatie: freq in MHz, tijd als UTC ISO-8601, mode canoniek (ADIF-stijl).

let _seq = 0;
/** Lichtgewicht id-generator (geen crypto nodig voor rijsleutels). */
export function newId() {
  _seq += 1;
  return 'q' + Date.now().toString(36) + '_' + _seq.toString(36);
}

/**
 * @typedef {Object} Qso
 * @property {string} id
 * @property {?string} call        Tegenstation-callsign (genormaliseerd)
 * @property {?string} datetime    UTC ISO-8601, bv. "2026-07-26T14:03:00Z"
 * @property {?string} band        Canonieke bandnaam, bv. "20m"
 * @property {?number} freqMHz     Frequentie in MHz
 * @property {?string} mode        Canonieke ADIF-mode, bv. "FT8"
 * @property {?string} submode
 * @property {?string} rstSent
 * @property {?string} rstRcvd
 * @property {?number} serialSent
 * @property {?number} serialRcvd
 * @property {Object} exchangeSent Vrije key-values, bv. {zone:"27"}
 * @property {Object} exchangeRcvd
 * @property {?string} gridSquare
 * @property {?number} cqZone
 * @property {?number} ituZone
 * @property {?string} state
 * @property {?string} province
 * @property {?string} iota
 * @property {Object} refs         Keyed op programma: {pota:{mine,worked}, ...}
 * @property {?number} qrbKm
 * @property {?number} points
 * @property {boolean} isDupe
 * @property {boolean} selected
 * @property {?string} source      Herkomst-formaat (provenance)
 * @property {?string} sourceFile  Bestandsnaam bij multi-file merge
 * @property {Object} extras       Onbekende/niet-gemapte velden, 1:1 bewaard
 */

/** Maakt een leeg QSO met veilige defaults. @returns {Qso} */
export function makeQso(init = {}) {
  return {
    id: init.id || newId(),
    call: init.call ?? null,
    datetime: init.datetime ?? null,
    band: init.band ?? null,
    freqMHz: init.freqMHz ?? null,
    mode: init.mode ?? null,
    submode: init.submode ?? null,
    rstSent: init.rstSent ?? null,
    rstRcvd: init.rstRcvd ?? null,
    serialSent: init.serialSent ?? null,
    serialRcvd: init.serialRcvd ?? null,
    exchangeSent: init.exchangeSent ?? {},
    exchangeRcvd: init.exchangeRcvd ?? {},
    gridSquare: init.gridSquare ?? null,
    cqZone: init.cqZone ?? null,
    ituZone: init.ituZone ?? null,
    state: init.state ?? null,
    province: init.province ?? null,
    iota: init.iota ?? null,
    refs: init.refs ?? {},
    qrbKm: init.qrbKm ?? null,
    points: init.points ?? null,
    isDupe: init.isDupe ?? false,
    selected: init.selected ?? true,
    source: init.source ?? null,
    sourceFile: init.sourceFile ?? null,
    extras: init.extras ?? {}
  };
}

/** Diepe kloon voor undo/redo (structuredClone is beschikbaar in Node 22 / moderne browsers). */
export function cloneQso(q) {
  return structuredClone(q);
}
