// model/session.js — Stations- & inzendingsmetadata (Fase 1 §2.2).

/**
 * @typedef {Object} Session
 * @property {?string} stationCall
 * @property {?string} operator
 * @property {?string} ownerCall
 * @property {?string} myGrid
 * @property {?number} myCqZone
 * @property {?number} myItuZone
 * @property {?string} myIota
 * @property {?string} myState
 * @property {?string} myProvince   UBA DX (2-ltr)
 * @property {?string} mySection    UBA Spring (3-ltr)
 * @property {string}  timezone     IANA-zone voor lokale->UTC (Fase 1 §11.2)
 * @property {?string} contestId
 * @property {Object}  categories
 * @property {?number} claimedScore
 * @property {?string} club
 * @property {?string} soapbox
 * @property {?string} name
 * @property {string[]} address
 * @property {?string} email
 * @property {Object}  rig
 * @property {Object}  extras
 */

/** @returns {Session} */
export function makeSession(init = {}) {
  return {
    stationCall: init.stationCall ?? null,
    operator: init.operator ?? null,
    ownerCall: init.ownerCall ?? null,
    myGrid: init.myGrid ?? null,
    myCqZone: init.myCqZone ?? null,
    myItuZone: init.myItuZone ?? null,
    myIota: init.myIota ?? null,
    myState: init.myState ?? null,
    myProvince: init.myProvince ?? null,
    mySection: init.mySection ?? null,
    timezone: init.timezone ?? 'UTC',
    contestId: init.contestId ?? null,
    categories: init.categories ?? {
      operator: null, band: null, mode: null, power: null,
      assisted: null, transmitter: null, time: null, overlay: null
    },
    claimedScore: init.claimedScore ?? null,
    club: init.club ?? null,
    soapbox: init.soapbox ?? null,
    name: init.name ?? null,
    address: init.address ?? [],
    email: init.email ?? null,
    rig: init.rig ?? { tx: null, power: null, rx: null, antenna: null, antH: null },
    extras: init.extras ?? {}
  };
}
