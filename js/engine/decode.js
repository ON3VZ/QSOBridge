// engine/decode.js — Encoding-detectie (Fase 2). Bytes -> tekst, vóór de parser.
// Strategie: BOM -> UTF-8 (met validatie) -> Windows-1252 fallback.

/**
 * @param {Uint8Array} bytes
 * @returns {{text: string, encoding: string}}
 */
export function decodeBytes(bytes) {
  // BOM-detectie
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'utf-8-bom' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
    return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'utf-16le' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
    return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'utf-16be' };
  }
  // Probeer strikte UTF-8; faalt hij, val terug op Windows-1252.
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { text, encoding: 'utf-8' };
  } catch {
    return { text: new TextDecoder('windows-1252').decode(bytes), encoding: 'windows-1252' };
  }
}

/** Helper voor tekst die al string is (bv. klembord-plakken). */
export function fromString(text) {
  return { text, encoding: 'string' };
}
