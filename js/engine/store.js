// engine/store.js — Autosave & crash-herstel (Fase 6). Lokaal, geen backend.
// Adapter-patroon: 'memory' voor tests, 'local' (localStorage) in de browser.

const KEY_STATE = 'qsobridge:autosave';
const KEY_STATION = 'qsobridge:station';
const KEY_VIEWS = 'qsobridge:views';

export function memoryAdapter() {
  const m = new Map();
  return {
    get: (k) => (m.has(k) ? m.get(k) : null),
    set: (k, v) => { m.set(k, v); },
    remove: (k) => { m.delete(k); }
  };
}

export function localAdapter() {
  const ls = (typeof window !== 'undefined' && window.localStorage) ? window.localStorage : null;
  return {
    get: (k) => { try { return ls ? ls.getItem(k) : null; } catch { return null; } },
    set: (k, v) => { try { ls && ls.setItem(k, v); } catch { /* quota/privémodus */ } },
    remove: (k) => { try { ls && ls.removeItem(k); } catch { /* noop */ } }
  };
}

export class Store {
  constructor(adapter) { this.a = adapter; }

  /** Bewaart de werkstatus (met tijdstip) voor crash-herstel. Slaat over als te groot (quota). */
  saveState(editor) {
    const payload = {
      savedAt: new Date().toISOString(),
      profileId: editor.profileId,
      session: editor.session,
      qsos: editor.qsos
    };
    const str = JSON.stringify(payload);
    if (str.length > 4_500_000) return null; // te groot voor localStorage-quota
    this.a.set(KEY_STATE, str);
    return payload.savedAt;
  }

  // ---- Opgeslagen views (filters + kolommen + sortering) ----
  _views() { try { return JSON.parse(this.a.get(KEY_VIEWS) || '{}'); } catch { return {}; } }
  saveView(name, view) { const v = this._views(); v[name] = view; this.a.set(KEY_VIEWS, JSON.stringify(v)); }
  listViews() { return Object.keys(this._views()); }
  getView(name) { return this._views()[name] || null; }
  deleteView(name) { const v = this._views(); delete v[name]; this.a.set(KEY_VIEWS, JSON.stringify(v)); }

  /** Haalt de bewaarde status op (of null). */
  loadState() {
    const raw = this.a.get(KEY_STATE);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  hasState() { return !!this.a.get(KEY_STATE); }
  clearState() { this.a.remove(KEY_STATE); }

  /** Stationsprofiel apart bewaren zodat de operator het niet telkens herintikt. */
  saveStation(session) {
    const s = { ...session };
    delete s.contestId; delete s.categories; delete s.claimedScore; // inzending-specifiek
    this.a.set(KEY_STATION, JSON.stringify(s));
  }
  loadStation() {
    const raw = this.a.get(KEY_STATION);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }
}

/** Debounce-helper voor autosave bij snelle bewerkingen. */
export function debounce(fn, ms = 800) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
