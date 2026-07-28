// normalize/qrb.js — QRB (Fase 1 §3.4). Maidenhead -> lat/lon -> great-circle km.

/** Maidenhead-locator (4/6/8) -> {lat, lon} (middelpunt van het vak), of null. */
export function gridToLatLon(loc) {
  if (!loc) return null;
  const g = loc.trim().toUpperCase();
  if (!/^[A-R]{2}[0-9]{2}([A-X]{2}([0-9]{2})?)?$/.test(g)) return null;
  let lon = (g.charCodeAt(0) - 65) * 20 - 180;
  let lat = (g.charCodeAt(1) - 65) * 10 - 90;
  lon += parseInt(g[2], 10) * 2;
  lat += parseInt(g[3], 10) * 1;
  if (g.length >= 6) {
    lon += (g.charCodeAt(4) - 65) * (2 / 24);
    lat += (g.charCodeAt(5) - 65) * (1 / 24);
    if (g.length >= 8) {
      lon += parseInt(g[6], 10) * (2 / 24 / 10);
      lat += parseInt(g[7], 10) * (1 / 24 / 10);
      lon += (2 / 24 / 10) / 2; lat += (1 / 24 / 10) / 2;
    } else { lon += (2 / 24) / 2; lat += (1 / 24) / 2; }
  } else { lon += 1; lat += 0.5; }
  return { lat, lon };
}

/** Great-circle-afstand in km tussen twee locators (haversine). */
export function qrbKm(gridA, gridB) {
  const a = gridToLatLon(gridA), b = gridToLatLon(gridB);
  if (!a || !b) return null;
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)));
}
