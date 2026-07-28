// sw.js — Service worker (Fase 6): app-shell cache voor offline gebruik.
const CACHE = 'qsobridge-v1';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './icon.svg',
  './css/qsobridge.css',
  './js/grid/view.js', './js/grid/editor.js',
  './js/grid/icons.js', './js/data/registry.js', './js/data/prefixes.js',
  './js/enrich/ctydat.js', './js/enrich/dxcc.js', './js/enrich/enrich.js', './js/enrich/refcheck.js',
  './js/assist/provider.js', './js/assist/paperlog.js',
  './js/engine/pipeline.js', './js/engine/decode.js', './js/engine/fieldpath.js',
  './js/engine/sidecar.js', './js/engine/profiles.js', './js/engine/validate.js',
  './js/engine/dupes.js', './js/engine/checks.js', './js/engine/store.js', './js/engine/destinations.js',
  './js/formats/index.js', './js/formats/adif.js', './js/formats/adx.js', './js/formats/dbf.js', './js/formats/cabrillo.js',
  './js/formats/edi.js', './js/formats/sota.js', './js/formats/fle.js',
  './js/formats/json.js', './js/formats/custom.js', './js/formats/tabular.js',
  './js/model/qso.js', './js/model/session.js',
  './js/normalize/bandplan.js', './js/normalize/modes.js', './js/normalize/datetime.js',
  './js/normalize/qrb.js', './js/normalize/validators.js',
  './js/i18n/index.js', './js/i18n/nl.json', './js/i18n/en.json', './js/i18n/fr.json',
  './profiles/index.js','./profiles/pota.json','./profiles/wwff.json','./profiles/sota.json','./profiles/gma.json','./profiles/iota-award.json','./profiles/arlhs.json','./profiles/uba-dx.json','./profiles/iota.json','./profiles/cqww.json','./profiles/cqwpx.json','./profiles/cqww-rtty.json','./profiles/iaru-hf.json','./profiles/wae.json','./profiles/ww-digi.json','./profiles/arrl-dx.json','./profiles/arrl-fd.json','./profiles/iaru-r1-vhf.json','./profiles/lotw.json'
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => hit))
  );
});
