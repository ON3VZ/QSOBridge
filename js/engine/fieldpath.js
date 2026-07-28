// engine/fieldpath.js — Veldpad-resolver (Fase 3). Basis voor serializers én het eigen outputformaat.

/** Haalt een geneste waarde via pad "a.b.c". Retourneert undefined als het pad breekt. */
export function getPath(obj, path) {
  if (!path) return undefined;
  let cur = obj;
  for (const key of String(path).split('.')) {
    if (cur == null) return undefined;
    cur = cur[key];
  }
  return cur;
}

/** Zet een geneste waarde via pad "a.b.c", tussenliggende objecten aanmakend. */
export function setPath(obj, path, value) {
  const keys = String(path).split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] == null || typeof cur[keys[i]] !== 'object') cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
  return obj;
}

/** Vervangt {pad}-placeholders in een template-string met waarden uit de context. */
export function fillTemplate(tpl, ctx) {
  return String(tpl).replace(/\{([^}]+)\}/g, (_, p) => {
    const v = getPath(ctx, p.trim());
    return v == null ? '' : String(v);
  });
}
