// formats/dbf.js — Minimale dBase III/IV-lezer (v2 Fase F). Levert {header, rows} voor tabular-mapping.
export const id = 'dbf';

/** Herkent een DBF aan de versie-byte. */
export function isDbf(bytes) {
  if (!bytes || bytes.length < 32) return false;
  const v = bytes[0];
  return [0x03, 0x04, 0x05, 0x30, 0x31, 0x43, 0x83, 0x8b, 0xf5].includes(v);
}

function ascii(bytes, start, len) {
  let s = '';
  for (let i = start; i < start + len; i++) { const c = bytes[i]; if (c === 0) break; s += String.fromCharCode(c); }
  return s;
}

/** @returns {{header:string[], rows:string[][]}} */
export function parseDbf(bytes) {
  if (!isDbf(bytes)) throw new Error('Geen geldig DBF-bestand');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const recCount = dv.getUint32(4, true);
  const headerLen = dv.getUint16(8, true);
  const recLen = dv.getUint16(10, true);
  // Velddescriptors: vanaf byte 32, elk 32 bytes, tot 0x0D.
  const fields = [];
  let off = 32;
  while (off < headerLen - 1 && bytes[off] !== 0x0D) {
    const name = ascii(bytes, off, 11).replace(/\0.*$/, '').trim();
    const type = String.fromCharCode(bytes[off + 11]);
    const length = bytes[off + 16];
    fields.push({ name, type, length });
    off += 32;
  }
  const header = fields.map((f) => f.name);
  const rows = [];
  let rec = headerLen;
  for (let n = 0; n < recCount; n++) {
    if (rec >= bytes.length) break;
    const deleted = bytes[rec] === 0x2A;
    let p = rec + 1;
    const row = [];
    for (const f of fields) {
      let val = ascii(bytes, p, f.length).trim();
      if (f.type === 'D' && val.length === 8) val = `${val.slice(0, 4)}-${val.slice(4, 6)}-${val.slice(6, 8)}`;
      if (f.type === 'L') val = /^[YyTt]$/.test(val) ? 'Y' : (/^[NnFf]$/.test(val) ? 'N' : '');
      row.push(val);
      p += f.length;
    }
    if (!deleted) rows.push(row);
    rec += recLen;
  }
  return { header, rows };
}
