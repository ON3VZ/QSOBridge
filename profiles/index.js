// profiles/index.js — Profielregistry (Fase 5/6). Zoveel mogelijk formaten/contesten ingebouwd.
import pota from './pota.json' with { type: 'json' };
import wwff from './wwff.json' with { type: 'json' };
import sota from './sota.json' with { type: 'json' };
import gma from './gma.json' with { type: 'json' };
import iotaAward from './iota-award.json' with { type: 'json' };
import arlhs from './arlhs.json' with { type: 'json' };
import ubaDx from './uba-dx.json' with { type: 'json' };
import iota from './iota.json' with { type: 'json' };
import cqww from './cqww.json' with { type: 'json' };
import cqwpx from './cqwpx.json' with { type: 'json' };
import cqwwRtty from './cqww-rtty.json' with { type: 'json' };
import iaruHf from './iaru-hf.json' with { type: 'json' };
import wae from './wae.json' with { type: 'json' };
import wwDigi from './ww-digi.json' with { type: 'json' };
import arrlDx from './arrl-dx.json' with { type: 'json' };
import arrlFd from './arrl-fd.json' with { type: 'json' };
import iaruR1Vhf from './iaru-r1-vhf.json' with { type: 'json' };
import lotw from './lotw.json' with { type: 'json' };

// Gegroepeerd zodat de UI ze per categorie kan tonen.
const BUILTIN = [
  // Activatie / awards
  pota, wwff, sota, gma, iotaAward, arlhs,
  // Contesten
  ubaDx, iota, cqww, cqwpx, cqwwRtty, iaruHf, wae, wwDigi, arrlDx, arrlFd, iaruR1Vhf,
  // Flavor
  lotw
];
const REGISTRY = new Map(BUILTIN.map((p) => [p.id, p]));

export function allProfiles() { return [...REGISTRY.values()]; }
export function getProfile(id) { return REGISTRY.get(id) || null; }
export function registerProfile(def) { REGISTRY.set(def.id, def); return def; }
