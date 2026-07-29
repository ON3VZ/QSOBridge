// grid/editor.js — Headless editor-model (Fase 4). De UI is een dunne renderlaag hierboven.
import { cloneQso, makeQso } from '../model/qso.js';
import { getPath, setPath } from '../engine/fieldpath.js';
import { validateQsos } from '../engine/validate.js';
import { markDupes } from '../engine/dupes.js';
import { getProfile } from '../engine/profiles.js';
import { getSerializer } from '../formats/index.js';
import { enrichQsos, applyFills, findZoneMismatches } from '../enrich/enrich.js';
import { runChecks, applySuggestion as applySug } from '../engine/checks.js';

const DEFAULT_PROFILE = {
  id: '_default', targetFormat: 'adif',
  requiredQsoFields: ['call', 'datetime', 'band', 'mode'],
  header: { required: [] }, validation: {}
};

export class QsoEditor {
  constructor(qsos = [], session = null) {
    this.qsos = qsos;
    this.session = session || {};
    this.profileId = null;
    this.filters = { band: '', mode: '', call: '', onlyMissing: false, onlyDupes: false };
    this.sort = { path: null, dir: 1 };
    this.hiddenCols = new Set();
    this.dupeOpts = { fields: ['call', 'band', 'mode'] };
    this.exportFields = null; // null = alle velden; anders een Set van veldsleutels
    this._history = [];
    this._future = [];
    this._report = null;
  }

  profile() { return this.profileId ? (getProfile(this.profileId) || DEFAULT_PROFILE) : DEFAULT_PROFILE; }

  // ---- historiek ----
  _snapshot() {
    this._history.push({ qsos: this.qsos.map(cloneQso), session: structuredClone(this.session) });
    if (this._history.length > 100) this._history.shift();
    this._future = [];
    this._report = null;
  }
  undo() {
    if (!this._history.length) return false;
    this._future.push({ qsos: this.qsos.map(cloneQso), session: structuredClone(this.session) });
    const prev = this._history.pop();
    this.qsos = prev.qsos; this.session = prev.session; this._report = null;
    return true;
  }
  redo() {
    if (!this._future.length) return false;
    this._history.push({ qsos: this.qsos.map(cloneQso), session: structuredClone(this.session) });
    const next = this._future.pop();
    this.qsos = next.qsos; this.session = next.session; this._report = null;
    return true;
  }
  canUndo() { return this._history.length > 0; }
  canRedo() { return this._future.length > 0; }

  // ---- filters & sortering ----
  setFilter(partial) { Object.assign(this.filters, partial); }
  setSort(path) {
    if (this.sort.path === path) this.sort.dir *= -1;
    else { this.sort.path = path; this.sort.dir = 1; }
  }

  /** Huidige weergave (filters + sortering + verborgen kolommen) vastleggen. */
  captureView() {
    return { filters: { ...this.filters }, sort: { ...this.sort }, hiddenCols: [...this.hiddenCols] };
  }
  /** Een opgeslagen weergave toepassen. */
  applyView(v) {
    if (!v) return;
    if (v.filters) this.filters = { ...this.filters, ...v.filters };
    if (v.sort) this.sort = { ...v.sort };
    if (v.hiddenCols) this.hiddenCols = new Set(v.hiddenCols);
  }
  visible() {
    const f = this.filters;
    let list = this.qsos.filter((q) => {
      if (f.band && q.band !== f.band) return false;
      if (f.mode && q.mode !== f.mode) return false;
      if (f.call && !(q.call || '').toUpperCase().includes(f.call.toUpperCase())) return false;
      if (f.onlyDupes && !q.isDupe) return false;
      if (f.onlyMissing) { const r = this.report(); if (!r.qsoIssues[q.id]) return false; }
      return true;
    });
    if (this.sort.path) {
      const p = this.sort.path, d = this.sort.dir;
      list = list.slice().sort((a, b) => {
        const va = getPath(a, p), vb = getPath(b, p);
        if (va == null) return 1; if (vb == null) return -1;
        return (va > vb ? 1 : va < vb ? -1 : 0) * d;
      });
    }
    return list;
  }

  // ---- bewerkingen ----
  setCell(id, path, value) {
    const q = this.qsos.find((x) => x.id === id);
    if (!q) return;
    this._snapshot();
    if (path === 'date' || path === 'time') { this._setDateTime(q, path, value); return; }
    setPath(q, path, value === '' ? null : value);
  }
  _setDateTime(q, part, value) {
    // Bestaande datum/tijd behouden waar mogelijk.
    const iso = q.datetime || '1970-01-01T00:00:00Z';
    let [d, t] = iso.replace('Z', '').split('T');
    if (part === 'date') { d = (value || '').replace(/\//g, '-'); }
    else { const hhmm = (value || '').replace(':', '').padEnd(4, '0'); t = `${hhmm.slice(0, 2)}:${hhmm.slice(2, 4)}:00`; }
    q.datetime = d ? `${d}T${t}Z` : null;
  }
  toggleSelect(id) { const q = this.qsos.find((x) => x.id === id); if (q) q.selected = !q.selected; }
  selectAll(v = true) { for (const q of this.qsos) q.selected = v; }
  selectFiltered(v = true) { const set = new Set(this.visible().map((q) => q.id)); for (const q of this.qsos) if (set.has(q.id)) q.selected = v; }
  deleteSelected() {
    this._snapshot();
    this.qsos = this.qsos.filter((q) => !q.selected);
  }
  addRow(init = {}) { this._snapshot(); const q = makeQso({ ...init, source: 'manual' }); this.qsos.push(q); return q; }

  /** Zet één veld voor een selectie rijen. scope: 'selected' | 'filtered' | 'all'. */
  bulkSet(path, value, scope = 'filtered') {
    this._snapshot();
    const target = this._scopeRows(scope);
    for (const q of target) setPath(q, path, value === '' ? null : value);
    return target.length;
  }
  /** Zoek/vervang binnen één veldpad. @returns aantal vervangingen */
  searchReplace(path, find, replace, scope = 'filtered') {
    this._snapshot();
    let n = 0;
    for (const q of this._scopeRows(scope)) {
      const cur = getPath(q, path);
      if (cur == null) continue;
      const next = String(cur).split(find).join(replace);
      if (next !== String(cur)) { setPath(q, path, next); n++; }
    }
    return n;
  }
  _scopeRows(scope) {
    if (scope === 'all') return this.qsos;
    if (scope === 'selected') return this.qsos.filter((q) => q.selected);
    const set = new Set(this.visible().map((q) => q.id));
    return this.qsos.filter((q) => set.has(q.id));
  }

  /**
   * Splitst één kolom in meerdere velden (parse). bv. "599 14" -> rstRcvd + cqZone.
   * @param {string} sourceKey  veldpad van de bronkolom
   * @param {{separator?:string, regex?:string, targets:string[], scope?:string}} opts
   *   targets: doelveldpaden per stuk (leeg = overslaan). regex met capture-groepen heeft voorrang.
   * @returns {number} aantal gewijzigde rijen
   */
  splitColumn(sourceKey, opts) {
    this._snapshot();
    const targets = opts.targets || [];
    const re = opts.regex ? new RegExp(opts.regex) : null;
    let n = 0;
    for (const q of this._scopeRows(opts.scope || 'all')) {
      const raw = getPath(q, sourceKey);
      if (raw == null || raw === '') continue;
      let parts;
      if (re) { const m = String(raw).match(re); parts = m ? m.slice(1) : []; }
      else parts = String(raw).split(opts.separator === '' ? '' : (opts.separator || ' ')).filter((x) => x !== '');
      let changed = false;
      targets.forEach((tgt, i) => {
        if (tgt && parts[i] != null) { setPath(q, tgt, String(parts[i]).trim()); changed = true; }
      });
      if (changed) n++;
    }
    return n;
  }

  /**
   * Voegt meerdere kolommen samen tot één veld (concatenate). bv. serial + zone -> exchange.
   * @param {string[]} sourceKeys  bronveldpaden
   * @param {{separator?:string, target:string, scope?:string}} opts
   * @returns {number} aantal gewijzigde rijen
   */
  mergeColumns(sourceKeys, opts) {
    this._snapshot();
    const sep = opts.separator == null ? ' ' : opts.separator;
    let n = 0;
    for (const q of this._scopeRows(opts.scope || 'all')) {
      const vals = sourceKeys.map((k) => getPath(q, k)).filter((v) => v != null && v !== '');
      if (!vals.length) continue;
      setPath(q, opts.target, vals.join(sep));
      n++;
    }
    return n;
  }

  // ---- validatie, dupes, stats ----
  report() { if (!this._report) this._report = validateQsos(this.qsos, this.session, this.profile()); return this._report; }
  runDupes() { return markDupes(this.qsos, this.dupeOpts); }
  stats() {
    const r = this.report();
    return {
      total: this.qsos.length,
      selected: this.qsos.filter((q) => q.selected).length,
      missing: r.summary.missing,
      invalid: r.summary.invalid,
      dupes: this.qsos.filter((q) => q.isDupe).length,
      visible: this.visible().length
    };
  }
  /** id van het volgende QSO (na fromId, in zichtbare volgorde) met een issue. */
  nextError(fromId) {
    const r = this.report();
    const vis = this.visible();
    const start = fromId ? vis.findIndex((q) => q.id === fromId) + 1 : 0;
    for (let i = 0; i < vis.length; i++) {
      const q = vis[(start + i) % vis.length];
      if (r.qsoIssues[q.id]) return q.id;
    }
    return null;
  }

  // ---- export ----
  export(formatId, profileOverride) {
    const ser = getSerializer(formatId);
    if (!ser) return { files: [], warnings: [{ reason: `Geen serializer voor ${formatId}` }] };
    const profile = profileOverride || (this.profileId ? this.profile() : undefined);
    return ser.serialize({ qsos: this.qsos, session: this.session, profile, fields: this.exportFields });
  }

  /** DXCC-verrijking: vult ontbrekende zones/continent/DXCC in (met undo). */
  enrichFill(dataset) {
    this._snapshot();
    const { lookups } = enrichQsos(this.qsos, dataset);
    const res = applyFills(this.qsos, lookups);
    const mismatches = findZoneMismatches(this.qsos, lookups);
    return { ...res, mismatches };
  }

  /** Draait de log-checks; levert suggesties (met bron). */
  checkLog(dataset, refIndex) { return runChecks(this.qsos, { dataset, session: this.session, refIndex }); }

  /** Past één suggestie toe (met undo). */
  applySuggestion(s) { this._snapshot(); return applySug(this.qsos, s); }

  /** Past een lijst suggesties in één keer toe (één undo-stap). */
  applySuggestions(list) {
    this._snapshot();
    let n = 0;
    for (const s of list) if (applySug(this.qsos, s)) n++;
    return n;
  }
}
