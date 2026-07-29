// grid/view.js — DOM-laag boven QsoEditor (Fase 4). Gevirtualiseerd ledger-raster.
import { QsoEditor } from './editor.js';
import { icon } from './icons.js';
import { processMany } from '../engine/pipeline.js';
import { allProfiles, detectProfile } from '../engine/profiles.js';
import { getPath } from '../engine/fieldpath.js';
import { SERIALIZERS } from '../formats/index.js';
import { parseTable, guessMapping, rowsToQsos } from '../formats/tabular.js';
import { toAdifDate, toAdifTime } from '../normalize/datetime.js';
import { parseCty } from '../enrich/ctydat.js';
import { allDatasets, DATASETS } from '../data/registry.js';
import { groupByCode } from '../engine/checks.js';
import { parseDbf, isDbf } from '../formats/dbf.js';
import { parseRefList, makeRefIndex, addRefList } from '../enrich/refcheck.js';
import { byokProvider, nullProvider, setProvider, getProvider } from '../assist/provider.js';
import { interpretPaperLog } from '../assist/paperlog.js';
import { t, setLang, getLang, AVAILABLE } from '../i18n/index.js';
import { Store, localAdapter, debounce } from '../engine/store.js';
import { DESTINATIONS, resolveDestination } from '../engine/destinations.js';
import { discoverFields, DEFAULT_VISIBLE, profileExportFields, columnFor } from '../engine/fields.js';

// Statische mapping-doelen (voor de kolom-mapping-dialoog van tabelimport):
const MAP_TARGETS = [
  { key: 'call', label: 'Call' }, { key: 'date', label: 'Date' }, { key: 'time', label: 'UTC' },
  { key: 'band', label: 'Band' }, { key: 'freqMHz', label: 'Freq' }, { key: 'mode', label: 'Mode' },
  { key: 'rstSent', label: 'RSTs' }, { key: 'rstRcvd', label: 'RSTr' }, { key: 'serialSent', label: 'STX' },
  { key: 'serialRcvd', label: 'SRX' }, { key: 'gridSquare', label: 'Grid' }, { key: 'cqZone', label: 'CQZ' },
  { key: 'ituZone', label: 'ITUZ' }, { key: 'iota', label: 'IOTA' },
  { key: 'refs.pota.mine', label: 'MY POTA' }, { key: 'refs.pota.worked', label: 'POTA' },
  { key: 'refs.sota.mine', label: 'MY SOTA' }, { key: 'refs.sota.worked', label: 'SOTA' },
  { key: 'refs.wwff.mine', label: 'MY WWFF' }, { key: 'extras.COMMENT', label: 'Comment' }, { key: 'extras.NAME', label: 'Name' }
];
const ROW_H = 34;

// Inline logo — brugmerk (bron -> boog -> doel), past op de navy topbalk.
const LOGO_SVG = `<svg class="logo" viewBox="0 0 512 512" aria-hidden="true">
  <path d="M150 336 Q256 152 362 336" fill="none" stroke="#FFB000" stroke-width="26" stroke-linecap="round"/>
  <path d="M138 336 L374 336" stroke="#FFB000" stroke-width="18" stroke-linecap="round"/>
  <g stroke="#C77E00" stroke-width="10" opacity="0.7"><path d="M256 196 L200 336"/><path d="M256 196 L312 336"/></g>
  <circle cx="150" cy="336" r="30" fill="#FFB000"/>
  <circle cx="362" cy="336" r="30" fill="#0B1B2B" stroke="#FFB000" stroke-width="16"/>
  <circle cx="256" cy="196" r="15" fill="#0B1B2B" stroke="#FFB000" stroke-width="11"/></svg>`;

export class App {
  constructor(root) {
    this.root = root;
    this.ed = new QsoEditor([], {});
    this.focusCell = null; // {id, key}
    this.ctyDataset = null; // geïmporteerde cty.dat (null = gebundelde tabel)
    this.refIndex = null;   // geïmporteerde referentielijst(en)
    this.onlineConsent = false;
    this.outFmt = 'adif';   // gedeeld doelformaat (boven- en onderbalk)
    this.store = new Store(localAdapter());
    const savedKey = this.store.a.get('qsobridge:aikey');
    if (savedKey) setProvider(byokProvider({ apiKey: savedKey }));
    this._autosave = debounce(() => { if (this.ed.qsos.length) { this.store.saveState(this.ed); } }, 900);
    this._build();
    this._maybeRestore();
  }

  // ---------- opbouw DOM ----------
  _build() {
    this.root.innerHTML = `
      <div class="top">
        <div class="brand">${LOGO_SVG}
          <span class="name">QSO<b>bridge</b></span>
          <span class="callchip" id="brandCall"></span></div>
        <span class="spacer"></span>
        <button id="help" class="ghost" title="${t('help.title')}">${icon('help')} ${t('help.button')}</button>
        <button id="ai" class="ghost" title="${t('ai.title')}">${icon('ai')} ${t('ai.button')}</button>
        <label for="lang">${t('top.lang')}</label>
        <select id="lang">${AVAILABLE.map((l) => `<option value="${l.code}"${l.code === getLang() ? ' selected' : ''}>${l.label}</option>`).join('')}</select>
        <label for="profile">${t('top.profile')}</label>
        <select id="profile"><option value="">${t('top.none')}</option></select>
        <button id="loadBtn" class="primary">${icon('load')} ${t('top.load')}</button>
        <input id="fileInput" type="file" multiple hidden
          accept=".adi,.adx,.cbr,.log,.edi,.csv,.tsv,.xlsx,.txt,.fle,.json,.dbf">
      </div>
      <div class="toolbar">
        <div class="group">
          <button id="undo" title="Ctrl+Z">${icon('undo')} ${t('tb.undo')}</button>
          <button id="redo" title="Ctrl+Y">${icon('redo')} ${t('tb.redo')}</button>
        </div>
        <div class="group">
          <input id="fCall" type="search" placeholder="${t('tb.call')}">
          <select id="fBand"><option value="">${t('tb.band')}</option></select>
          <select id="fMode"><option value="">${t('tb.mode')}</option></select>
          <select id="fContest" title="contest" hidden><option value="">contest</option></select>
          <input type="date" id="fFrom" title="${t('tb.from') || 'van'}" style="width:130px">
          <input type="date" id="fTo" title="${t('tb.to') || 'tot'}" style="width:130px">
          <label><input type="checkbox" id="fMissing"> ${t('tb.missing')}</label>
          <label><input type="checkbox" id="fDupes"> ${t('side.dupes').toLowerCase()}</label>
        </div>
        <div class="group">
          <button id="selAll">${icon('checkAll')} ${t('tb.all')}</button>
          <button id="selNone">${icon('square')} ${t('tb.none')}</button>
          <button id="selFilt">${icon('filter')} ${t('tb.filtered')}</button>
          <button id="del">${icon('trash')} ${t('tb.delete')}</button>
          <button id="add">${icon('plus')} ${t('tb.addRow')}</button>
        </div>
        <div class="group">
          <button id="bulk">${icon('layers')} ${t('tb.bulk')}</button>
          <button id="repl">${icon('swap')} ${t('tb.replace')}</button>
          <button id="dupes">${icon('copy')} ${t('tb.dupes')}</button>
          <button id="jump">${icon('target')} ${t('tb.next')}</button>
          <button id="enrich">${icon('globe')} ${t('tb.enrich')}</button>
          <button id="check">${icon('shield')} ${t('tb.check')}</button>
        </div>
        <div class="group"><button id="cols">${icon('columns')} ${t('tb.cols')}</button><button id="colops">${icon('split')} ${t('tb.colops')}</button></div>
        <div class="group">
          <select id="viewSel" aria-label="${t('views.saved')}"><option value="">${t('views.saved')}</option></select>
          <button id="viewSave" title="${t('views.save')}">${icon('plus')}</button>
          <button id="viewDel" title="${t('views.delete')}">${icon('trash')}</button>
        </div>
      </div>
      <div class="exportbar">
        <label style="color:var(--muted)">${t('status.export') || 'Exporteren'}</label>
        <button id="hdrBtn">${icon('form')} ${t('hdr.button')}</button>
        <span class="spacer"></span>
        ${this._exportControls()}
      </div>
      <div class="stage">
        <div class="grid-wrap" id="gridWrap">
          <div class="drop" id="drop">⇩</div>
          <div id="gridHost"></div>
        </div>
        <aside class="side">
          <h3>${t('side.health')}</h3>
          <div class="row"><span>${t('side.qsos')}</span><b id="hTotal">0</b></div>
          <div class="row"><span>${t('side.selected')}</span><b id="hSel">0</b></div>
          <div class="row"><span>${t('side.missing')}</span><b id="hMiss">0</b></div>
          <div class="row"><span>${t('side.invalid')}</span><b id="hInv">0</b></div>
          <div class="row"><span>${t('side.dupes')}</span><b id="hDup">0</b></div>
          <h3 style="margin-top:18px">${t('side.files')}</h3>
          <div id="hFiles" style="color:var(--muted);font-size:12px">${t('side.nothing')}</div>
        </aside>
      </div>
      <div class="status" role="status" aria-live="polite">
        <div class="readout"><span class="k">${t('status.visible')}</span><span class="v" id="sVis">0</span></div>
        <div class="readout"><span class="k">${t('status.sel')}</span><span class="v" id="sSel">0</span></div>
        <div class="readout"><span class="k">${t('status.err')}</span><span class="v err" id="sErr">0</span></div>
        <div class="readout"><span class="k">${t('status.dupe')}</span><span class="v warn" id="sDup">0</span></div>
        <span class="spacer"></span>
        ${this._exportControls()}
      </div>
      <dialog id="dlg"></dialog>
      <footer class="foot">
        <span>${t('footer.created')} <a href="https://on3vz.github.io" target="_blank" rel="noopener">ON3VZ</a></span>
        <span class="dot">·</span>
        <span>${t('footer.local')}</span>
        <span class="dot">·</span>
        <button id="dataBtn" class="ghost" style="padding:2px 8px;font-size:11px">${icon('database', 12)} ${t('data.button')}</button>
        <span class="dot">·</span>
        <span class="risk">${t('footer.disclaimer')}</span>
      </footer>`;
    this._fillSelects();
    this._wire();
    if (typeof document !== 'undefined' && document.documentElement) document.documentElement.lang = getLang();
    this.render();
  }

  /** Gedeeld export-fragment (staat zowel boven als onder). Class-based i.p.v. id's. */
  _exportControls() {
    return `<label style="color:var(--muted)">${t('status.target')}</label>
        <select class="js-outfmt" aria-label="${t('status.target')}"></select>
        <button class="js-expfields">${icon('sliders')} ${t('status.fields')}</button>
        <button class="js-wizard">${icon('zap')} ${t('status.wizard')}</button>
        <button class="js-preview">${icon('eye')} ${t('status.preview')}</button>
        <button class="js-convert primary">${icon('download')} ${t('status.convert')}</button>`;
  }

  _fillSelects() {
    const prof = this.root.querySelector('#profile');
    for (const p of allProfiles()) prof.append(new Option(p.label.nl || p.id, p.id));
    for (const out of this.root.querySelectorAll('.js-outfmt')) {
      for (const s of SERIALIZERS) if (s.capabilities.canSerialize && s.id !== 'custom') out.append(new Option((s.label && s.label.nl) || s.id, s.id));
      out.value = this.outFmt;
    }
  }

  _syncOutFmt() { for (const s of this.root.querySelectorAll('.js-outfmt')) s.value = this.outFmt; }

  _wire() {
    const $ = (s) => this.root.querySelector(s);
    $('#loadBtn').onclick = () => $('#fileInput').click();
    $('#fileInput').onchange = (e) => this._loadFiles([...e.target.files]);
    $('#lang').onchange = (e) => { setLang(e.target.value); if (typeof document !== 'undefined') document.documentElement.lang = e.target.value; this._build(); this.render(); };
    $('#viewSave').onclick = () => this._saveView();
    $('#viewDel').onclick = () => this._deleteView();
    $('#viewSel').onchange = (e) => { const v = this.store.getView(e.target.value); if (v) { this.ed.applyView(v); this.render(); } };
    this._fillViews();
    this.root.querySelectorAll('.js-wizard').forEach((b) => b.onclick = () => this._wizardDialog());
    $('#help').onclick = () => this._helpDialog();
    $('#ai').onclick = () => this._aiDialog();
    this.root.querySelectorAll('.js-expfields').forEach((b) => b.onclick = () => this._exportFieldsDialog());
    const hb = this.root.querySelector('#hdrBtn'); if (hb) hb.onclick = () => this._headerDialog();
    this.root.querySelectorAll('.js-outfmt').forEach((s) => s.onchange = (e) => { this.outFmt = e.target.value; this._syncOutFmt(); });
    $('#profile').onchange = (e) => {
      this.ed.profileId = e.target.value || null;
      if (this.ed.profileId) {
        const need = profileExportFields(this.ed.profile());
        if (need) for (const k of need) this.ed.hiddenCols.delete(k); // vereiste kolommen tonen
        this.ed.exportFields = null; // export volgt voortaan het profiel
        this.render();
        this._profileSummary();
      } else this.render();
    };
    $('#undo').onclick = () => { this.ed.undo(); this.render(); };
    $('#redo').onclick = () => { this.ed.redo(); this.render(); };
    $('#selAll').onclick = () => { this.ed.selectAll(true); this.render(); };
    $('#selNone').onclick = () => { this.ed.selectAll(false); this.render(); };
    $('#selFilt').onclick = () => { this.ed.selectFiltered(true); this.render(); };
    $('#del').onclick = () => { this.ed.deleteSelected(); this.render(); };
    $('#add').onclick = () => { this.ed.addRow({}); this.render(); };
    $('#dupes').onclick = () => { const n = this.ed.runDupes(); this.render(); this._toast(`${n} dupe(s) gemarkeerd`); };
    $('#jump').onclick = () => this._jump();
    $('#enrich').onclick = () => this._enrich();
    $('#check').onclick = () => this._checksDialog();
    $('#dataBtn').onclick = () => this._dataDialog();
    $('#bulk').onclick = () => this._bulkDialog();
    $('#repl').onclick = () => this._replaceDialog();
    $('#cols').onclick = () => this._colsDialog();
    $('#colops').onclick = () => this._colOpsDialog();
    this.root.querySelectorAll('.js-preview').forEach((b) => b.onclick = () => this._previewDialog());
    this.root.querySelectorAll('.js-convert').forEach((b) => b.onclick = () => this._convert());
    for (const [id, key] of [['#fCall', 'call'], ['#fBand', 'band'], ['#fMode', 'mode'], ['#fContest', 'contest']]) {
      $(id).oninput = (e) => { this.ed.setFilter({ [key]: e.target.value }); this.render(); };
    }
    $('#fMissing').onchange = (e) => { this.ed.setFilter({ onlyMissing: e.target.checked }); this.render(); };
    $('#fFrom').onchange = (e) => { this.ed.setFilter({ dateFrom: e.target.value }); this.render(); };
    $('#fTo').onchange = (e) => { this.ed.setFilter({ dateTo: e.target.value }); this.render(); };
    $('#fDupes').onchange = (e) => { this.ed.setFilter({ onlyDupes: e.target.checked }); this.render(); };

    const wrap = $('#gridWrap');
    wrap.addEventListener('scroll', () => this._renderRows());
    // Drag & drop
    const drop = $('#drop');
    ['dragenter', 'dragover'].forEach((ev) => wrap.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('on'); }));
    ['dragleave', 'drop'].forEach((ev) => wrap.addEventListener(ev, (e) => { e.preventDefault(); if (ev === 'dragleave' && e.target !== drop) return; drop.classList.remove('on'); }));
    wrap.addEventListener('drop', (e) => { const fs = [...(e.dataTransfer.files || [])]; if (fs.length) this._loadFiles(fs); });
    // Klembord-plakken
    document.addEventListener('paste', (e) => {
      const t = e.clipboardData.getData('text'); if (t && t.length > 20) { this._loadText(t, 'plakken'); }
    });
    // Toetsenbord
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'z') { this.ed.undo(); this.render(); }
      else if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { this.ed.redo(); this.render(); }
      else if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName)) {
        e.preventDefault(); const el = this.root.querySelector('#fCall'); if (el) el.focus();
      }
    });
  }

  // ---------- laden ----------
  async _loadFiles(files) {
    const sources = [];
    for (const f of files) {
      const name = f.name.toLowerCase();
      const bytes = new Uint8Array(await f.arrayBuffer());
      if (/\.(xlsx|xls)$/.test(name)) { this._loadXlsx(bytes, f.name); return; }
      if (/\.dbf$/.test(name) || isDbf(bytes)) { this._loadDbf(bytes, f.name); return; }
      sources.push({ bytes, filename: f.name });
    }
    const res = processMany(sources);
    // Onherkende tabellen -> kolom-mapping
    const unknown = res.perFile.filter((m) => m.format === null);
    if (unknown.length && res.qsos.length === 0) {
      const txt = new TextDecoder().decode(sources[0].bytes);
      return this._mapTable(txt, sources[0].filename);
    }
    this._apply(res);
  }
  _loadText(text, name) {
    const res = processMany([{ text, filename: name }]);
    if (!res.qsos.length) return this._mapTable(text, name);
    this._apply(res);
  }
  _loadXlsx(bytes, name) {
    if (typeof window !== 'undefined' && window.XLSX) {
      const wb = window.XLSX.read(bytes, { type: 'array' });
      const csv = window.XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]);
      return this._mapTable(csv, name);
    }
    this._toast('Voeg SheetJS toe om .xlsx te lezen (of exporteer als CSV).');
  }
  _loadDbf(bytes, name) {
    try {
      const { header, rows } = parseDbf(bytes);
      const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      this._mapTable(csv, name);
    } catch (e) { this._toast(`DBF-fout: ${e.message}`); }
  }
  _apply(res) {
    this.ed = new QsoEditor(res.qsos, res.session || {});
    this.ed.hiddenCols = new Set(); // toon standaard alle aanwezige kolommen
    // Auto-profiel
    const p = detectProfile(this.ed.session);
    if (p) { this.ed.profileId = p.id; this.root.querySelector('#profile').value = p.id; }
    if (this.ed.session.stationCall) this.root.querySelector('#brandCall').textContent = this.ed.session.stationCall;
    this.root.querySelector('#hFiles').innerHTML = res.perFile.map((m) => `${m.filename || '—'} <span style="color:var(--amber)">${m.format || '?'}</span>`).join('<br>');
    if (res.warnings.length) this._toast(`${res.warnings.length} waarschuwing(en) bij inlezen`);
    if (this.ed.session) this.store.saveStation(this.ed.session);
    this.store.saveState(this.ed);
    this._refreshFilters();
    this.render();
  }

  // ---------- render ----------
  /** Dynamische kolommen uit de geladen data (variabel per bestand). */
  columns() {
    const cols = discoverFields(this.ed.qsos);
    const base = cols.length ? cols : MAP_TARGETS.slice(0, 9).map((c) => ({ ...c, mono: true }));
    for (const c of base) if (c.key === 'date' || c.key === 'time') c.issue = 'datetime';
    const prof = this.ed.profileId ? this.ed.profile() : null;
    if (!prof) return base;
    // Vereiste velden van het profiel: toon ze als kolom, ook als de data ze nog niet heeft.
    const need = profileExportFields(prof) || new Set();
    const haveKeys = new Set(base.map((c) => c.key));
    const missing = [...need].filter((k) => !haveKeys.has(k)).map((k) => columnFor(k));
    const all = [...base, ...missing];
    for (const c of all) if (need.has(c.key)) c.required = true;
    // Nodige velden vooraan, de rest erna.
    return [...all.filter((c) => c.required), ...all.filter((c) => !c.required)];
  }

  render() {
    const bc = this.root.querySelector('#brandCall');
    if (bc) bc.textContent = (this.ed.session && this.ed.session.stationCall) || '';
    const host = this.root.querySelector('#gridHost');
    if (!this.ed.qsos.length) {
      host.innerHTML = `<div class="empty"><div class="big">Nog geen log geladen</div>
        Sleep een bestand hierheen, plak een log, of klik <code>Laden…</code>.<br>
        ADIF · Cabrillo · EDI · SOTA-CSV · FLE · CSV/XLSX</div>`;
      this._stats(); return;
    }
    const cols = this.columns().filter((c) => !this.ed.hiddenCols.has(c.key));
    host.innerHTML = `<table class="log" role="grid"><thead><tr role="row">
      <th class="rownum" scope="col">#</th><th class="sel" scope="col"><input type="checkbox" id="thSel" aria-label="selecteer alle gefilterde"></th>
      ${cols.map((c) => `<th data-k="${c.key}"${c.required ? ' class="req"' : ''} role="columnheader" scope="col" aria-sort="${this.ed.sort.path === c.key ? (this.ed.sort.dir > 0 ? 'ascending' : 'descending') : 'none'}">${c.label}${c.required ? ' <span class="reqdot" title="verplicht">•</span>' : ''} <span class="arrow">${this.ed.sort.path === c.key ? (this.ed.sort.dir > 0 ? '▲' : '▼') : ''}</span></th>`).join('')}
    </tr></thead><tbody id="tbody"></tbody></table>`;
    host.querySelector('#thSel').onclick = (e) => { this.ed.selectFiltered(e.target.checked); this.render(); };
    host.querySelectorAll('th[data-k]').forEach((th) => th.onclick = () => { this.ed.setSort(th.dataset.k); this.render(); });
    this._cols = cols;
    this._renderRows();
    this._refreshFilters(true);
    this._stats();
  }

  _renderRows() {
    const tbody = this.root.querySelector('#tbody');
    if (!tbody) return;
    const rows = this.ed.visible();
    const report = this.ed.report();
    const wrap = this.root.querySelector('#gridWrap');
    const scrollTop = wrap.scrollTop;
    const viewH = wrap.clientHeight || 600;
    const total = rows.length;
    const first = Math.max(0, Math.floor(scrollTop / ROW_H) - 6);
    const count = Math.ceil(viewH / ROW_H) + 12;
    const last = Math.min(total, first + count);
    const cols = this._cols;
    const ncol = cols.length + 2; // rownum + selectie

    let html = '';
    if (first > 0) html += `<tr aria-hidden="true"><td colspan="${ncol}" style="height:${first * ROW_H}px;padding:0;border:0"></td></tr>`;
    for (let i = first; i < last; i++) {
      const q = rows[i];
      const issues = report.qsoIssues[q.id] || {};
      const cls = [q.isDupe ? 'dupe' : '', q.selected ? '' : 'unsel'].join(' ');
      html += `<tr class="${cls}" data-id="${q.id}">
        <td class="rownum">${i + 1}</td>
        <td class="sel"><input type="checkbox" data-sel ${q.selected ? 'checked' : ''}></td>
        ${cols.map((c) => this._cell(q, c, issues)).join('')}</tr>`;
    }
    if (last < total) html += `<tr aria-hidden="true"><td colspan="${ncol}" style="height:${(total - last) * ROW_H}px;padding:0;border:0"></td></tr>`;
    tbody.innerHTML = html;

    tbody.querySelectorAll('input[data-sel]').forEach((cb) => cb.onchange = (e) => {
      const id = e.target.closest('tr').dataset.id; this.ed.toggleSelect(id); this._stats(); e.target.closest('tr').classList.toggle('unsel', !e.target.checked);
    });
    tbody.querySelectorAll('input.cell').forEach((inp) => {
      inp.onfocus = (e) => { this.focusCell = { id: e.target.closest('tr').dataset.id, key: e.target.dataset.k }; };
      inp.onchange = (e) => {
        const id = e.target.closest('tr').dataset.id;
        this.ed.setCell(id, e.target.dataset.k, e.target.value.trim());
        this._renderRows(); this._stats();
      };
      inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } };
    });
  }

  _cell(q, c, issues) {
    let val;
    if (c.key === 'date') val = q.datetime ? isoDate(q.datetime) : '';
    else if (c.key === 'time') val = q.datetime ? isoTime(q.datetime) : '';
    else { const v = getPath(q, c.key); val = v == null ? '' : v; }
    const bad = issues[c.issue || c.key];
    const title = bad ? ` title="${escapeAttr(bad.message)}"` : '';
    return `<td class="${c.mono ? 'mono' : ''} ${bad ? 'invalid' : ''}" role="gridcell"${title}>
      <input class="cell" data-k="${c.key}" value="${escapeAttr(String(val))}" aria-label="${escapeAttr(c.label)}"${bad ? ' aria-invalid="true"' : ''}></td>`;
  }

  _refreshFilters(keep) {
    const bands = [...new Set(this.ed.qsos.map((q) => q.band).filter(Boolean))].sort();
    const modes = [...new Set(this.ed.qsos.map((q) => q.mode).filter(Boolean))].sort();
    const fill = (sel, vals, cur) => { const el = this.root.querySelector(sel); const v = el.value; el.innerHTML = `<option value="">${sel === '#fBand' ? 'band' : 'mode'}</option>` + vals.map((x) => `<option${x === v ? ' selected' : ''}>${x}</option>`).join(''); };
    fill('#fBand', bands); fill('#fMode', modes);
    const contests = [...new Set(this.ed.qsos.map((q) => q.extras && q.extras.CONTEST_ID).filter(Boolean))].sort();
    const cs = this.root.querySelector('#fContest');
    if (cs) {
      if (contests.length) {
        const cv = cs.value;
        cs.hidden = false;
        cs.innerHTML = `<option value="">contest…</option>` + contests.map((x) => `<option${x === cv ? ' selected' : ''}>${x}</option>`).join('');
      } else { cs.hidden = true; }
    }
  }

  _stats() {
    const s = this.ed.stats();
    const set = (id, v) => { const el = this.root.querySelector(id); if (el) el.textContent = v; };
    set('#hTotal', s.total); set('#hSel', s.selected); set('#hMiss', s.missing);
    set('#hInv', s.invalid); set('#hDup', s.dupes);
    set('#sVis', s.visible); set('#sSel', s.selected); set('#sErr', s.missing + s.invalid); set('#sDup', s.dupes);
    const u = this.root.querySelector('#undo'), r = this.root.querySelector('#redo');
    if (u) u.disabled = !this.ed.canUndo(); if (r) r.disabled = !this.ed.canRedo();
    if (this._autosave) this._autosave();
  }

  _checksDialog() {
    if (!this.ed.qsos.length) return;
    const sugs = this.ed.checkLog(this.ctyDataset || undefined, this.refIndex || undefined);
    if (!sugs.length) { this._toast(t('checks.none')); return; }
    const groups = groupByCode(sugs);
    let body = '';
    for (const [code, list] of groups) {
      const hasApply = list.some((s) => s.suggested != null);
      body += `<div style="margin:10px 0 2px;display:flex;justify-content:space-between;align-items:center">
        <b style="color:var(--amber)">${escapeAttr(code)} <span style="color:var(--muted)">(${list.length})</span></b>
        ${hasApply ? `<button class="applyAll" data-code="${escapeAttr(code)}">${t('checks.applyAll')}</button>` : ''}</div>`;
      for (const s of list) {
        const idx = sugs.indexOf(s);
        body += `<div class="ckrow" data-idx="${idx}" data-code="${escapeAttr(code)}" style="display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px dotted var(--line)">
          <div style="font-size:12px;min-width:0">
            <div style="color:var(--ink)">${escapeAttr(s.message)}</div>
            <div style="color:var(--muted)">${t('checks.source')}: ${escapeAttr(s.source)}${s.suggested != null ? ` · → <span style="color:var(--amber)">${escapeAttr(String(s.suggested))}</span>` : ''}</div>
          </div>
          <div style="white-space:nowrap">${s.suggested != null ? `<button class="ap">${t('checks.apply')}</button> ` : ''}<button class="ig">${t('checks.ignore')}</button></div>
        </div>`;
      }
    }
    const dlg = this._dlg(`${t('checks.title')} (${sugs.length})`, body, `<button class="primary" id="kc">${t('dlg.close')}</button>`);
    dlg.querySelector('#kc').onclick = () => dlg.close();
    dlg.querySelectorAll('.ap').forEach((btn) => btn.onclick = (e) => {
      const row = e.target.closest('.ckrow'); const s = sugs[+row.dataset.idx];
      if (this.ed.applySuggestion(s)) { this.render(); row.remove(); }
    });
    dlg.querySelectorAll('.ig').forEach((btn) => btn.onclick = (e) => e.target.closest('.ckrow').remove());
    dlg.querySelectorAll('.applyAll').forEach((btn) => btn.onclick = (e) => {
      const code = e.target.dataset.code;
      const list = sugs.filter((s) => s.code === code && s.suggested != null);
      this.ed.applySuggestions(list); this.render();
      dlg.querySelectorAll(`.ckrow[data-code="${code}"]`).forEach((r) => r.remove());
      e.target.remove();
    });
  }

  _enrich() {
    if (!this.ed.qsos.length) return;
    const res = this.ed.enrichFill(this.ctyDataset || undefined);
    this.render();
    let msg = `${res.filled} ${t('toast.enriched')} — ${res.source}`;
    if (res.mismatches.length) msg += ` · ${res.mismatches.length} ${t('toast.mismatch')}`;
    this._toast(msg);
  }

  _dataDialog() {
    const rows = allDatasets().map((d) => `
      <div style="padding:8px 0;border-bottom:1px solid var(--line)">
        <div><b style="color:var(--amber)">${escapeAttr(d.name)}</b> <span style="color:var(--muted);font-size:12px">— ${escapeAttr(d.scope)}${d.version ? ', ' + escapeAttr(d.version) : ''}</span></div>
        <div style="font-size:12px;color:var(--ink)">${escapeAttr(d.source)} · <span style="color:var(--muted)">${escapeAttr(d.license)}</span></div>
        ${d.sourceUrl ? `<a href="${d.sourceUrl}" target="_blank" rel="noopener" style="font-size:12px">${escapeAttr(d.sourceUrl)}</a>` : ''}
        ${d.note ? `<div style="font-size:12px;color:var(--muted);margin-top:2px">${escapeAttr(d.note)}</div>` : ''}
      </div>`).join('');
    const body = `${rows}
      <div style="margin-top:12px">
        <button id="ctyBtn">${icon('database')} ${t('data.import')}</button>
        <input id="ctyFile" type="file" accept=".dat,.txt" hidden>
        <span id="ctyStatus" style="margin-left:8px;color:var(--muted);font-size:12px"></span>
      </div>
      <div style="margin-top:12px;border-top:1px solid var(--line);padding-top:12px">
        <label style="color:var(--muted);font-size:12px">${t('data.refkind')}</label>
        <select id="refKind"><option value="pota">POTA</option><option value="sota">SOTA</option><option value="wwff">WWFF</option></select>
        <button id="refBtn">${icon('database')} ${t('data.reflist')}</button>
        <input id="refFile" type="file" accept=".csv,.txt" hidden>
        <span id="refStatus" style="margin-left:8px;color:var(--muted);font-size:12px"></span>
      </div>
      <div style="margin-top:10px">
        <label><input type="checkbox" id="onlineChk" ${this.onlineConsent ? 'checked' : ''}> ${t('data.online')}</label>
      </div>`;
    const dlg = this._dlg(t('data.title'), body, `<button class="primary" id="dc">${t('dlg.close')}</button>`);
    dlg.querySelector('#dc').onclick = () => dlg.close();
    dlg.querySelector('#ctyBtn').onclick = () => dlg.querySelector('#ctyFile').click();
    dlg.querySelector('#ctyFile').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const text = await f.text();
      this.ctyDataset = parseCty(text);
      DATASETS.ctydat.version = this.ctyDataset.meta.version || `${this.ctyDataset.meta.count} prefixes`;
      dlg.querySelector('#ctyStatus').textContent = `${t('data.imported')}: ${DATASETS.ctydat.version}`;
    };
    dlg.querySelector('#refBtn').onclick = () => dlg.querySelector('#refFile').click();
    dlg.querySelector('#refFile').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const kind = dlg.querySelector('#refKind').value;
      const { refs, count } = parseRefList(await f.text(), kind);
      this.refIndex = addRefList(this.refIndex || makeRefIndex(), kind, refs, f.name);
      dlg.querySelector('#refStatus').textContent = `${kind.toUpperCase()}: ${count} ${t('data.refloaded')}`;
    };
    dlg.querySelector('#onlineChk').onchange = (e) => { this.onlineConsent = e.target.checked; };
  }

  _aiDialog() {
    const key = this.store.a.get('qsobridge:aikey') || '';
    const body = `<p style="color:var(--muted);font-size:12px">${t('ai.note')}</p>
      <div class="map-row"><label>${t('ai.key')}</label><input id="aiKey" type="text" value="${escapeAttr(key)}" placeholder="sk-..."></div>
      <textarea id="aiText" style="width:100%;height:140px;background:var(--navy-900);color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:8px;font-family:var(--mono)" placeholder="${t('ai.paste')}"></textarea>
      <div id="aiResult" style="margin-top:8px;color:var(--muted);font-size:12px"></div>`;
    const dlg = this._dlg(t('ai.title'), body,
      `<button id="ac">${t('dlg.cancel')}</button><button id="aiGo">${t('ai.interpret')}</button><button class="primary" id="aiAdd" disabled>${t('ai.add')}</button>`);
    let suggested = [];
    dlg.querySelector('#ac').onclick = () => dlg.close();
    dlg.querySelector('#aiGo').onclick = async () => {
      const k = dlg.querySelector('#aiKey').value.trim();
      if (k) { this.store.a.set('qsobridge:aikey', k); setProvider(byokProvider({ apiKey: k })); }
      const prov = getProvider();
      if (!prov.available()) { dlg.querySelector('#aiResult').textContent = t('ai.none'); return; }
      const text = dlg.querySelector('#aiText').value.trim();
      if (!text) return;
      dlg.querySelector('#aiResult').textContent = '…';
      try {
        suggested = await interpretPaperLog(text, prov);
        dlg.querySelector('#aiResult').textContent = `${suggested.length} QSO('s)`;
        dlg.querySelector('#aiAdd').disabled = suggested.length === 0;
      } catch (err) { dlg.querySelector('#aiResult').textContent = `Fout: ${err.message}`; }
    };
    dlg.querySelector('#aiAdd').onclick = () => {
      if (!suggested.length) return;
      this.ed._snapshot();
      for (const q of suggested) this.ed.qsos.push(q);
      dlg.close();
      this._refreshFilters(); this.render();
      this._toast(`${suggested.length} QSO('s) toegevoegd`);
    };
  }

  _fillViews() {
    const sel = this.root.querySelector('#viewSel');
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = `<option value="">${t('views.saved')}</option>` + this.store.listViews().map((n) => `<option${n === cur ? ' selected' : ''}>${escapeAttr(n)}</option>`).join('');
  }
  _saveView() {
    const name = (typeof prompt !== 'undefined') ? prompt(t('views.name')) : null;
    if (!name) return;
    this.store.saveView(name, this.ed.captureView());
    this._fillViews();
    this.root.querySelector('#viewSel').value = name;
    this._toast(`${t('views.save')}: ${name}`);
  }
  _deleteView() {
    const sel = this.root.querySelector('#viewSel');
    if (!sel.value) return;
    this.store.deleteView(sel.value);
    this._fillViews();
  }

  _profileSummary() {
    const prof = this.ed.profile();
    if (!prof || prof.id === '_default') return;
    const rep = this.ed.report();
    const missing = new Set();
    for (const iss of Object.values(rep.qsoIssues)) for (const [f, v] of Object.entries(iss)) if (v.code === 'REQUIRED' || v.code === 'EXCHANGE') missing.add(f);
    for (const [f, v] of Object.entries(rep.headerIssues)) if (v.code === 'REQUIRED') missing.add(f);
    const name = (prof.label && (prof.label[getLang()] || prof.label.nl)) || prof.id;
    if (missing.size) this._toast(`${name} — nog nodig: ${[...missing].join(', ')}`);
    else this._toast(`${name} — alle verplichte velden aanwezig ✓`);
  }

  _jump() {
    const id = this.ed.nextError(this.focusCell && this.focusCell.id);
    if (!id) { this._toast('Geen fouten meer'); return; }
    const rows = this.ed.visible(); const idx = rows.findIndex((q) => q.id === id);
    this.root.querySelector('#gridWrap').scrollTop = Math.max(0, idx * ROW_H - 80);
    this._renderRows();
    this.focusCell = { id, key: null };
    setTimeout(() => { const tr = this.root.querySelector(`tr[data-id="${id}"]`); if (tr) tr.querySelector('input.cell').focus(); }, 30);
  }

  // ---------- dialogen ----------
  _dlg(title, bodyHtml, footHtml) {
    const dlg = this.root.querySelector('#dlg');
    dlg.innerHTML = `<div class="dlg-head">${title}</div><div class="dlg-body">${bodyHtml}</div><div class="dlg-foot">${footHtml}</div>`;
    dlg.showModal();
    return dlg;
  }
  _fieldOptions() { return this.columns().map((c) => `<option value="${c.key}">${c.label}</option>`).join(''); }

  _bulkDialog() {
    const dlg = this._dlg('Bulk-bewerken',
      `<p>Zet één veld voor de <b>gefilterde</b> rijen (${this.ed.visible().length}).</p>
       <div class="map-row"><select id="bf">${this._fieldOptions()}</select>
       <input id="bv" type="text" placeholder="nieuwe waarde"></div>`,
      `<button id="bc">Annuleer</button><button class="primary" id="bo">Toepassen</button>`);
    dlg.querySelector('#bc').onclick = () => dlg.close();
    dlg.querySelector('#bo').onclick = () => {
      const n = this.ed.bulkSet(dlg.querySelector('#bf').value, dlg.querySelector('#bv').value, 'filtered');
      dlg.close(); this.render(); this._toast(`${n} rij(en) bijgewerkt`);
    };
  }
  _replaceDialog() {
    const dlg = this._dlg('Zoek & vervang',
      `<div class="map-row"><label>Veld</label><select id="rf">${this._fieldOptions()}</select></div>
       <div class="map-row"><input id="rs" placeholder="zoek"><input id="rr" placeholder="vervang door"></div>`,
      `<button id="rc">Annuleer</button><button class="primary" id="ro">Vervang (gefilterd)</button>`);
    dlg.querySelector('#rc').onclick = () => dlg.close();
    dlg.querySelector('#ro').onclick = () => {
      const n = this.ed.searchReplace(dlg.querySelector('#rf').value, dlg.querySelector('#rs').value, dlg.querySelector('#rr').value, 'filtered');
      dlg.close(); this.render(); this._toast(`${n} vervanging(en)`);
    };
  }
  _headerDialog() {
    const s = this.ed.session;
    const cat = s.categories || {};
    const prof = this.ed.profileId ? this.ed.profile() : null;
    const req = new Set((prof && prof.header && prof.header.required) || []);
    const need = (k) => req.has(k) ? ' <span class="reqdot" title="verplicht">•</span>' : '';
    const sel = (id, val, opts) => `<select id="${id}"><option value="">—</option>${opts.map((o) => `<option${o === val ? ' selected' : ''}>${o}</option>`).join('')}</select>`;
    const txt = (id, val, w = 160) => `<input id="${id}" value="${escapeAttr(val == null ? '' : val)}" style="width:${w}px">`;
    const H = (s2) => `<h3 style="color:var(--amber);font-size:12px;text-transform:uppercase;letter-spacing:.6px;margin:12px 0 6px">${s2}</h3>`;
    const row = (lab, ctrl) => `<div class="map-row"><label>${lab}</label>${ctrl}</div>`;
    const body = `
      ${H(t('hdr.station'))}
      ${row(t('hdr.call') + need('stationCall'), txt('hCall', s.stationCall))}
      ${row(t('hdr.operators'), txt('hOps', s.operator))}
      ${row(t('hdr.grid') + need('myGrid'), txt('hGrid', s.myGrid, 110))}
      ${H(t('hdr.category'))}
      ${row(t('hdr.catop') + need('categories.operator'), sel('hCatOp', cat.operator, ['SINGLE-OP', 'MULTI-OP', 'CHECKLOG']))}
      ${row(t('hdr.catassisted') + need('categories.assisted'), sel('hCatAss', cat.assisted, ['ASSISTED', 'NON-ASSISTED']))}
      ${row(t('hdr.catpower') + need('categories.power'), sel('hCatPow', cat.power, ['HIGH', 'LOW', 'QRP']))}
      ${row(t('hdr.catband') + need('categories.band'), sel('hCatBand', cat.band, ['ALL', '160M', '80M', '40M', '20M', '15M', '10M', '6M', '2M', '70CM']))}
      ${row(t('hdr.catmode') + need('categories.mode'), sel('hCatMode', cat.mode, ['SSB', 'CW', 'RTTY', 'DIGI', 'FM', 'MIXED']))}
      ${row(t('hdr.cattx') + need('categories.transmitter'), sel('hCatTx', cat.transmitter, ['ONE', 'TWO', 'LIMITED', 'UNLIMITED', 'SWL']))}
      ${row(t('hdr.cattime') + need('categories.time'), sel('hCatTime', cat.time, ['6-HOURS', '12-HOURS', '24-HOURS']))}
      ${row(t('hdr.catoverlay'), txt('hCatOv', cat.overlay, 130))}
      ${H(t('hdr.entry'))}
      ${row(t('hdr.score'), txt('hScore', s.claimedScore, 120))}
      ${row(t('hdr.club'), txt('hClub', s.club))}
      ${row(t('hdr.name'), txt('hName', s.name))}
      ${row(t('hdr.email'), txt('hEmail', s.email))}
      ${row(t('hdr.address'), `<textarea id="hAddr" style="width:220px;height:48px">${escapeAttr((s.address || []).join('\n'))}</textarea>`)}
      ${row(t('hdr.soapbox'), `<textarea id="hSoap" style="width:220px;height:60px">${escapeAttr(s.soapbox || '')}</textarea>`)}`;
    const dlg = this._dlg(t('hdr.title'), body, `<button id="hC">${t('dlg.cancel')}</button><button class="primary" id="hS">${t('hdr.save')}</button>`);
    dlg.querySelector('#hC').onclick = () => dlg.close();
    dlg.querySelector('#hS').onclick = () => {
      const g = (id) => dlg.querySelector('#' + id).value.trim();
      s.stationCall = g('hCall') || null;
      s.operator = g('hOps') || null;
      s.myGrid = g('hGrid').toUpperCase() || null;
      s.categories = {
        operator: g('hCatOp') || null, assisted: g('hCatAss') || null, power: g('hCatPow') || null,
        band: g('hCatBand') || null, mode: g('hCatMode') || null, transmitter: g('hCatTx') || null,
        time: g('hCatTime') || null, overlay: g('hCatOv') || null
      };
      s.claimedScore = g('hScore') ? Number(g('hScore').replace(/[^\d-]/g, '')) : null;
      s.club = g('hClub') || null;
      s.name = g('hName') || null;
      s.email = g('hEmail') || null;
      s.address = g('hAddr') ? g('hAddr').split('\n').map((x) => x.trim()).filter(Boolean) : [];
      s.soapbox = g('hSoap') || null;
      this.store.saveStation(s);
      dlg.close(); this.render();
      this._toast(t('hdr.save') + ' ✓');
    };
  }

  _colOpsDialog() {
    const cols = this.columns();
    const srcOpts = cols.map((c) => `<option value="${c.key}">${escapeAttr(c.label)}</option>`).join('');
    const mgOpts = `<option value="">—</option>` + srcOpts;
    const tgtList = [...new Set([...MAP_TARGETS.map((c) => c.key), ...cols.map((c) => c.key)])];
    const datalist = `<datalist id="tgtFields">${tgtList.map((k) => `<option value="${k}"></option>`).join('')}</datalist>`;
    const H = (s) => `<h3 style="color:var(--amber);font-size:13px;margin:12px 0 6px">${s}</h3>`;
    const body = `${datalist}
      <p style="color:var(--muted);font-size:12px">${t('colops.hint')}</p>
      ${H(t('colops.splitTitle'))}
      <div class="map-row"><label>${t('colops.source')}</label><select id="spSrc">${srcOpts}</select></div>
      <div class="map-row"><label>${t('colops.sep')}</label><span><input id="spSep" value=" " style="width:70px"> &nbsp;<label style="font-size:12px"><input type="checkbox" id="spRegexOn"> ${t('colops.regex')}</label></span></div>
      <div class="map-row" id="spRegexRow" style="display:none"><label>Regex</label><input id="spRegex" placeholder="^(\\d{3})\\s+(\\d+)$"></div>
      <div class="map-row"><label>${t('colops.targets')}</label><span><input list="tgtFields" id="spT0" placeholder="veld 1" style="width:105px"> <input list="tgtFields" id="spT1" placeholder="veld 2" style="width:105px"> <input list="tgtFields" id="spT2" placeholder="veld 3" style="width:105px"></span></div>
      <button class="primary" id="spGo">${icon('split')} ${t('colops.split')}</button>
      <hr style="border:0;border-top:1px solid var(--line);margin:14px 0">
      ${H(t('colops.mergeTitle'))}
      <div class="map-row"><label>${t('colops.sources')}</label><span><select id="mgS0">${mgOpts}</select> <select id="mgS1">${mgOpts}</select> <select id="mgS2">${mgOpts}</select></span></div>
      <div class="map-row"><label>${t('colops.sep')}</label><input id="mgSep" value=" " style="width:70px"></div>
      <div class="map-row"><label>${t('colops.target')}</label><input list="tgtFields" id="mgT" placeholder="doelveld"></div>
      <button class="primary" id="mgGo">${icon('split')} ${t('colops.merge')}</button>`;
    const dlg = this._dlg(t('colops.title'), body, `<button id="coC">${t('dlg.close')}</button>`);
    dlg.querySelector('#coC').onclick = () => dlg.close();
    dlg.querySelector('#spRegexOn').onchange = (e) => { dlg.querySelector('#spRegexRow').style.display = e.target.checked ? '' : 'none'; };
    dlg.querySelector('#spGo').onclick = () => {
      const targets = ['spT0', 'spT1', 'spT2'].map((id) => dlg.querySelector('#' + id).value.trim() || null);
      if (!targets.some(Boolean)) return;
      const regexOn = dlg.querySelector('#spRegexOn').checked;
      const n = this.ed.splitColumn(dlg.querySelector('#spSrc').value, {
        separator: dlg.querySelector('#spSep').value,
        regex: regexOn ? dlg.querySelector('#spRegex').value : null,
        targets
      });
      this.render(); this._toast(`${n} ${t('colops.split').toLowerCase()}`);
    };
    dlg.querySelector('#mgGo').onclick = () => {
      const sources = ['mgS0', 'mgS1', 'mgS2'].map((id) => dlg.querySelector('#' + id).value).filter(Boolean);
      const target = dlg.querySelector('#mgT').value.trim();
      if (!target || !sources.length) return;
      const n = this.ed.mergeColumns(sources, { separator: dlg.querySelector('#mgSep').value, target });
      this.render(); this._toast(`${n} ${t('colops.merge').toLowerCase()}`);
    };
  }

  _colsDialog() {
    const dlg = this._dlg(t('tb.cols'),
      this.columns().map((c) => `<label style="display:block;padding:4px 0"><input type="checkbox" data-c="${c.key}" ${this.ed.hiddenCols.has(c.key) ? '' : 'checked'}> ${c.label}${c.source === 'extra' ? ' <span style="color:var(--muted)">(extra)</span>' : ''}</label>`).join(''),
      `<button class="primary" id="cc">${t('dlg.done')}</button>`);
    dlg.querySelectorAll('input[data-c]').forEach((cb) => cb.onchange = (e) => {
      if (e.target.checked) this.ed.hiddenCols.delete(e.target.dataset.c); else this.ed.hiddenCols.add(e.target.dataset.c);
    });
    dlg.querySelector('#cc').onclick = () => { dlg.close(); this.render(); };
  }
  _mapTable(text, name) {
    const table = parseTable(text);
    const guess = guessMapping(table.header);
    const opts = ['', ...MAP_TARGETS.map((c) => c.key), 'refs.wwff.worked', 'submode', 'state', 'province'];
    const body = `<p>Wijs de kolommen van <b>${escapeAttr(name)}</b> toe (scheidingsteken: <code>${table.delimiter === '\t' ? 'tab' : table.delimiter}</code>).</p>` +
      table.header.map((h, i) => `<div class="map-row"><span class="src">${escapeAttr(h)}</span>
        <select data-col="${i}">${opts.map((o) => `<option value="${o}"${o === guess[i] ? ' selected' : ''}>${o || '— negeer —'}</option>`).join('')}</select></div>`).join('');
    const dlg = this._dlg('Kolommen toewijzen', body,
      `<label style="margin-right:auto">Datumstijl <select id="ds"><option value="adif">YYYYMMDD</option><option value="cabrillo">YYYY-MM-DD</option><option value="sota">DD/MM/YYYY</option></select></label>
       <button id="mc">Annuleer</button><button class="primary" id="mo">Importeer</button>`);
    dlg.querySelector('#mc').onclick = () => dlg.close();
    dlg.querySelector('#mo').onclick = () => {
      const mapping = table.header.map((_, i) => dlg.querySelector(`select[data-col="${i}"]`).value || null);
      const res = rowsToQsos(table, mapping, { dateStyle: dlg.querySelector('#ds').value });
      dlg.close();
      this._apply({ qsos: res.qsos, session: res.session, warnings: res.warnings, perFile: [{ filename: name, format: 'tabel' }] });
    };
  }
  _previewDialog() {
    const out = this.outFmt;
    const res = this.ed.export(out);
    const f = res.files[0];
    const warn = res.warnings.length ? `<div class="warnbar">${res.warnings.map((w) => escapeAttr(w.reason)).join('<br>')}</div>` : '';
    const body = `${warn}<p>${res.files.length} bestand(en). Voorbeeld van <b>${escapeAttr(f ? f.name : '—')}</b>:</p>
      <pre class="preview">${f ? escapeHtml(f.content.slice(0, 4000)) : ''}</pre>`;
    const dlg = this._dlg('Voorbeeld', body, `<button class="primary" id="pc">Sluiten</button>`);
    dlg.querySelector('#pc').onclick = () => dlg.close();
  }
  _convert() {
    const out = this.outFmt;
    const res = this.ed.export(out);
    if (!res.files.length) { this._toast('Niets te exporteren'); return; }
    for (const f of res.files) downloadFile(f.name, f.content);
    this._toast(`${res.files.length} bestand(en) gedownload` + (res.warnings.length ? ` — ${res.warnings.length} waarschuwing(en)` : ''));
  }

  // ---------- herstel & wizard ----------
  _maybeRestore() {
    const st = this.store.loadState();
    if (!st || !st.qsos || !st.qsos.length) return;
    const when = st.savedAt ? new Date(st.savedAt).toLocaleString() : '';
    const dlg = this._dlg(t('restore.found'),
      `<p>${t('restore.found')} ${when ? `(${escapeAttr(when)}, ${st.qsos.length} QSO's)` : ''}</p>`,
      `<button id="rd">${t('restore.discard')}</button><button class="primary" id="rr">${t('restore.restore')}</button>`);
    dlg.querySelector('#rd').onclick = () => { this.store.clearState(); dlg.close(); };
    dlg.querySelector('#rr').onclick = () => {
      this.ed = new QsoEditor(st.qsos, st.session || {});
      this.ed.profileId = st.profileId || null;
      this.ed.hiddenCols = new Set(); // toon standaard alle aanwezige kolommen
      if (st.profileId) this.root.querySelector('#profile').value = st.profileId;
      if (this.ed.session.stationCall) this.root.querySelector('#brandCall').textContent = this.ed.session.stationCall;
      dlg.close(); this._refreshFilters(); this.render();
    };
  }

  _helpDialog() {
    const secs = t('help.sections') || [];
    const body = (Array.isArray(secs) ? secs : []).map((s) =>
      `<section style="margin-bottom:16px">
        <h3 style="color:var(--amber);margin:0 0 4px;font-size:14px">${escapeHtml(s.title)}</h3>
        <div style="color:var(--ink);font-size:13px;line-height:1.5">${escapeHtml(s.body)}</div>
      </section>`).join('');
    const dlg = this._dlg(t('help.title'), body, `<button class="primary" id="hc">${t('dlg.close')}</button>`);
    dlg.querySelector('#hc').onclick = () => dlg.close();
  }

  _exportFieldsDialog() {
    const cols = this.columns();
    // Standaard volgt het profiel (contest/IOTA/POTA/WWFF/SOTA); anders alles.
    const profSet = this.ed.profileId ? profileExportFields(this.ed.profile()) : null;
    const cur = this.ed.exportFields || profSet; // null = alles
    const prof = this.ed.profileId ? ` — ${this.ed.profile().label.nl || this.ed.profileId}` : '';
    const body = `<p>${t('fields.pick')}${prof}</p>
      <label style="display:block;padding:4px 0;border-bottom:1px solid var(--line)"><input type="checkbox" id="efAll" ${cur ? '' : 'checked'}> <b>${t('fields.all')}</b></label>
      <div id="efList">` +
      cols.map((c) => `<label style="display:block;padding:3px 0"><input type="checkbox" data-f="${c.key}" ${(!cur || cur.has(c.key)) ? 'checked' : ''}> ${c.label}${c.source === 'extra' ? ' <span style="color:var(--muted)">(extra)</span>' : ''}</label>`).join('') +
      `</div>`;
    const dlg = this._dlg(t('status.fields'), body, `<button id="ec">${t('dlg.cancel')}</button><button class="primary" id="eo">${t('dlg.done')}</button>`);
    dlg.querySelector('#efAll').onchange = (e) => { dlg.querySelectorAll('#efList input').forEach((cb) => cb.checked = e.target.checked); };
    dlg.querySelector('#ec').onclick = () => dlg.close();
    dlg.querySelector('#eo').onclick = () => {
      const boxes = [...dlg.querySelectorAll('#efList input')];
      const all = boxes.every((b) => b.checked);
      this.ed.exportFields = all ? null : new Set(boxes.filter((b) => b.checked).map((b) => b.dataset.f));
      dlg.close();
      this._toast(all ? t('fields.all') : `${this.ed.exportFields.size} ${t('status.fields').replace('…', '')}`);
    };
  }

  _wizardDialog() {
    const lang = getLang();
    const body = `<p>${t('wizard.pick')}</p>` + DESTINATIONS.map((d) =>
      `<label style="display:block;padding:6px 0;border-bottom:1px dotted var(--line)">
        <input type="radio" name="dest" value="${d.id}"> <b style="color:var(--amber)">${d.label[lang] || d.label.en}</b>
        <div style="color:var(--muted);font-size:12px;margin-left:22px">${(d.note && (d.note[lang] || d.note.en)) || ''}</div></label>`).join('');
    const dlg = this._dlg(t('wizard.title'), body,
      `<button id="wc">${t('dlg.cancel')}</button><button class="primary" id="wo">${t('wizard.go')}</button>`);
    dlg.querySelector('#wc').onclick = () => dlg.close();
    dlg.querySelector('#wo').onclick = () => {
      const sel = dlg.querySelector('input[name=dest]:checked');
      if (!sel) { dlg.close(); return; }
      const r = resolveDestination(sel.value, this.ed.profileId, lang);
      this.outFmt = r.formatId; this._syncOutFmt();
      if (r.profileId) { this.ed.profileId = r.profileId; this.root.querySelector('#profile').value = r.profileId; }
      // Exportvelden volgen de bestemming (POTA/WWFF/SOTA/contest ...).
      this.ed.exportFields = r.profileId ? profileExportFields(this.ed.profile()) : null;
      dlg.close(); this.render();
      this._previewDialog();
    };
  }

  _toast(msg) {
    let t = this.root.querySelector('#toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite'); t.style.cssText = 'position:fixed;bottom:64px;left:50%;transform:translateX(-50%);background:var(--navy-600);color:var(--ink);border:1px solid var(--amber-dim);padding:10px 16px;border-radius:6px;z-index:50'; this.root.append(t); }
    t.textContent = msg; t.style.display = 'block';
    clearTimeout(this._tt); this._tt = setTimeout(() => { t.style.display = 'none'; }, 2600);
  }
}

// ---------- helpers ----------
function isoDate(iso) { const d = toAdifDate(iso); return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`; }
function isoTime(iso) { const t = toAdifTime(iso); return `${t.slice(0, 2)}:${t.slice(2, 4)}`; }
function escapeAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
function escapeHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function downloadFile(name, content) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
