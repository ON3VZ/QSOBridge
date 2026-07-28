// data/prefixes.js — Compacte, gebundelde prefixtabel (v2 Fase A/B).
// Kernset voor offline DXCC-verrijking. Volledige dekking via cty.dat-import.
// Elk item: [DXCC-naam, continent, CQ-zone, ITU-zone, [prefixes...]]

const RAW = [
  ['Belgium', 'EU', 14, 27, ['ON', 'OO', 'OP', 'OQ', 'OR', 'OS', 'OT']],
  ['Germany', 'EU', 14, 28, ['DA', 'DB', 'DC', 'DD', 'DF', 'DG', 'DH', 'DJ', 'DK', 'DL', 'DM', 'DO', 'DP', 'DQ', 'DR']],
  ['France', 'EU', 14, 27, ['F', 'TM', 'TP', 'TQ', 'TV', 'TW', 'TX']],
  ['England', 'EU', 14, 27, ['G', 'M', '2E', 'MW', 'GW']],
  ['Scotland', 'EU', 14, 27, ['GM', 'MM', '2M']],
  ['Netherlands', 'EU', 14, 27, ['PA', 'PB', 'PC', 'PD', 'PE', 'PF', 'PG', 'PH', 'PI']],
  ['Luxembourg', 'EU', 14, 27, ['LX']],
  ['Spain', 'EU', 14, 37, ['EA', 'EB', 'EC', 'ED', 'EE', 'EF', 'EG', 'EH']],
  ['Italy', 'EU', 15, 28, ['I', 'IK', 'IZ', 'IW', 'IU', 'IN', 'IO', 'IQ']],
  ['Austria', 'EU', 15, 28, ['OE']],
  ['Switzerland', 'EU', 14, 28, ['HB', 'HB9', 'HB0']],
  ['Poland', 'EU', 15, 28, ['SP', 'SN', 'SO', 'SQ', 'SR', '3Z', 'HF']],
  ['Portugal', 'EU', 14, 37, ['CT', 'CQ', 'CR', 'CS']],
  ['Sweden', 'EU', 14, 18, ['SM', 'SA', 'SB', 'SC', 'SD', 'SE', 'SF', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', '7S', '8S']],
  ['Norway', 'EU', 14, 18, ['LA', 'LB', 'LC', 'LD', 'LE', 'LF', 'LG', 'LH', 'LI', 'LJ', 'LK', 'LL', 'LM', 'LN']],
  ['Finland', 'EU', 15, 18, ['OH', 'OF', 'OG', 'OI', 'OJ']],
  ['Denmark', 'EU', 14, 18, ['OZ', 'OU', 'OV', 'OW', 'OX', '5P', '5Q']],
  ['Ireland', 'EU', 14, 27, ['EI', 'EJ']],
  ['Czech Republic', 'EU', 15, 28, ['OK', 'OL']],
  ['Slovak Republic', 'EU', 15, 28, ['OM']],
  ['Hungary', 'EU', 15, 28, ['HA', 'HG']],
  ['Greece', 'EU', 20, 28, ['SV', 'SW', 'SX', 'SY', 'SZ', 'J4']],
  ['European Russia', 'EU', 16, 29, ['UA', 'UB', 'UC', 'UD', 'UE', 'UF', 'UG', 'RA', 'RN', 'RK', 'RU', 'RV', 'RW', 'RX', 'RZ', 'R']],
  ['Ukraine', 'EU', 16, 29, ['UR', 'US', 'UT', 'UU', 'UV', 'UW', 'UX', 'UY', 'UZ', 'EM', 'EN', 'EO']],
  ['Serbia', 'EU', 15, 28, ['YT', 'YU']],
  ['Romania', 'EU', 20, 28, ['YO', 'YP', 'YQ', 'YR']],
  ['Bulgaria', 'EU', 20, 28, ['LZ']],
  ['Croatia', 'EU', 15, 28, ['9A']],
  ['Slovenia', 'EU', 15, 28, ['S5']],
  ['Iceland', 'EU', 40, 17, ['TF']],
  ['United States', 'NA', 5, 8, ['K', 'W', 'N', 'AA', 'AB', 'AC', 'AD', 'AE', 'AF', 'AG', 'AI', 'AJ', 'AK', 'WA', 'WB', 'KA', 'KB', 'KC', 'KD', 'KE', 'KF', 'KG', 'KI', 'KJ', 'KK']],
  ['Canada', 'NA', 5, 9, ['VE', 'VA', 'VO', 'VY', 'CF', 'CG', 'CH', 'CI', 'CJ', 'CK']],
  ['Mexico', 'NA', 6, 10, ['XE', 'XF', '4A', '6D', '6E']],
  ['Cuba', 'NA', 8, 11, ['CM', 'CO', 'CL', 'T4']],
  ['Japan', 'AS', 25, 45, ['JA', 'JB', 'JC', 'JD', 'JE', 'JF', 'JG', 'JH', 'JI', 'JJ', 'JK', 'JL', 'JM', 'JN', 'JO', 'JP', 'JQ', 'JR', 'JS', '7J', '7K', '7L', '7M', '7N', '8J', '8N']],
  ['China', 'AS', 24, 44, ['BY', 'BA', 'BD', 'BG', 'BH', 'BI', 'BT', 'BL', '3H', 'XS']],
  ['Asiatic Russia', 'AS', 17, 20, ['UA9', 'UA0', 'RA9', 'RA0', 'R9', 'R0']],
  ['India', 'AS', 22, 41, ['VU', 'AT', 'AU', 'AV', 'AW', '8T', '8U', '8V', '8W', '8X', '8Y']],
  ['Israel', 'AS', 20, 39, ['4X', '4Z']],
  ['Indonesia', 'OC', 28, 51, ['YB', 'YC', 'YD', 'YE', 'YF', 'YG', 'YH', '7A', '8A']],
  ['Australia', 'OC', 30, 59, ['VK', 'AX']],
  ['New Zealand', 'OC', 32, 60, ['ZL', 'ZM', 'ZK']],
  ['Brazil', 'SA', 11, 15, ['PY', 'PP', 'PQ', 'PR', 'PS', 'PT', 'PU', 'PV', 'PW', 'ZV', 'ZW', 'ZX', 'ZY', 'ZZ']],
  ['Argentina', 'SA', 13, 16, ['LU', 'LO', 'LP', 'LQ', 'LR', 'LS', 'LT', 'LV', 'LW', 'AY', 'AZ', 'L2']],
  ['Chile', 'SA', 12, 14, ['CE', 'CA', 'CB', 'CC', 'CD', '3G', 'XQ', 'XR']],
  ['South Africa', 'AF', 38, 57, ['ZS', 'ZR', 'ZT', 'ZU', 'H5']],
  ['Egypt', 'AF', 34, 38, ['SU', 'SS']],
  ['Morocco', 'AF', 33, 37, ['CN', '5C', '5D', '5E', '5F', '5G']]
];

// Bouw een prefix-index: langste prefix wint bij opzoeken.
const INDEX = new Map();
for (const [name, cont, cqz, ituz, prefixes] of RAW) {
  for (const p of prefixes) INDEX.set(p.toUpperCase(), { dxcc: name, cont, cqz, ituz });
}

/** Alle prefixen gesorteerd van lang naar kort (voor langste-match). */
export const PREFIXES = [...INDEX.keys()].sort((a, b) => b.length - a.length);
export function prefixEntry(p) { return INDEX.get(p) || null; }
export function prefixCount() { return INDEX.size; }
