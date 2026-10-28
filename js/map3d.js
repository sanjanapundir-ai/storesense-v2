// map3d.js — an immersive 3D map of India (MapLibre GL + free OpenFreeMap tiles).
// Stores rise as glowing towers, applicants as coloured columns sized by score,
// catchment rings and a demand heat layer sit underneath. No API key needed.

export const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const INDIA = [[67.5, 6.0], [97.8, 36.5]];

// Re-colour the free street style to match the app's navy theme
export function themeStyle(style, dark) {
  if (!dark) return style;
  const P = { bg: '#050b1f', land: '#081230', land2: '#0a1636', water: '#0b2552', building: '#14244f', b3d: '#1c3170', road: '#1b2b58', major: '#2b4588', rail: '#1d2a55', boundary: '#4a62a8', label: '#a9bbe6', halo: '#050b1f' };
  for (const l of style.layers) {
    const id = l.id;
    l.paint ||= {};
    if (l.type === 'background') l.paint['background-color'] = P.bg;
    else if (l.type === 'raster') l.paint['raster-opacity'] = 0.12;
    else if (l.type === 'fill') {
      l.paint['fill-color'] = /water/.test(id) ? P.water : /building/.test(id) ? P.building : /park|wood|grass|forest|landcover|landuse|aeroway/.test(id) ? P.land2 : P.land;
      l.paint['fill-opacity'] = /building/.test(id) ? 0.9 : 1;
      delete l.paint['fill-outline-color']; delete l.paint['fill-pattern'];
    } else if (l.type === 'fill-extrusion') {
      l.paint['fill-extrusion-color'] = P.b3d; l.paint['fill-extrusion-opacity'] = 0.75;
    } else if (l.type === 'line') {
      l.paint['line-color'] = /water|river|stream|canal/.test(id) ? P.water : /boundary|admin/.test(id) ? P.boundary : /rail|transit/.test(id) ? P.rail : /motorway|trunk|primary/.test(id) ? P.major : P.road;
      if (/casing/.test(id)) l.paint['line-color'] = P.bg;
      delete l.paint['line-pattern'];
    } else if (l.type === 'symbol') {
      l.paint['text-color'] = P.label; l.paint['text-halo-color'] = P.halo; l.paint['text-halo-width'] = 1.2;
      if (/poi/.test(id)) l.paint['icon-opacity'] = 0.5;
    }
  }
  return style;
}

const square = (lng, lat, m) => {
  const dLat = m / 111320, dLng = m / (111320 * Math.cos(lat * Math.PI / 180));
  return [[[lng - dLng, lat - dLat], [lng + dLng, lat - dLat], [lng + dLng, lat + dLat], [lng - dLng, lat + dLat], [lng - dLng, lat - dLat]]];
};
const ring = (lng, lat, km) => {
  const pts = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    pts.push([lng + (km / (111.32 * Math.cos(lat * Math.PI / 180))) * Math.cos(a), lat + (km / 110.57) * Math.sin(a)]);
  }
  return [pts];
};
const fc = features => ({ type: 'FeatureCollection', features });

export class Map3D {
  constructor(el, { dark, onApp, onPin, onCity, onTarget, color }) {
    this.el = el; this.cb = { onApp, onPin, onCity, onTarget }; this.color = color; this.dark = dark;
    this.ready = false; this.queue = null; this.spin = false;
    if (!globalThis.maplibregl) { el.innerHTML = '<div class="empty" style="height:100%;display:grid;place-items:center">The map could not load. Check the internet connection and reload.</div>'; return; }
    this.popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12, className: 'ss-pop' });
    fetch(STYLE_URL, { signal: AbortSignal.timeout(15000) }).then(r => r.json()).then(style => {
      this.map = new maplibregl.Map({ container: el, style: themeStyle(style, dark), bounds: INDIA, pitch: 0, attributionControl: { compact: true }, maxPitch: 75 });
      this.map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
      this.map.addControl(new maplibregl.FullscreenControl(), 'top-right');
      this.map.on('load', () => { this.addLayers(); this.ready = true; if (this.queue) this.render(this.queue); });
    }).catch(() => { el.innerHTML = '<div class="empty" style="height:100%;display:grid;place-items:center">The map tiles could not load. Check the internet connection.</div>'; });
  }

  addLayers() {
    const m = this.map;
    for (const id of ['catch', 'heat', 'pillars', 'apps', 'free', 'stores', 'cities', 'focus']) m.addSource(id, { type: 'geojson', data: fc([]) });
    m.addLayer({ id: 'heat', type: 'heatmap', source: 'heat', maxzoom: 16, paint: {
      'heatmap-weight': ['coalesce', ['get', 'w'], 0], 'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 4, 0.6, 12, 1.4],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 4, 18, 10, 34, 14, 70],
      'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(0,0,0,0)', 0.2, '#123a9c', 0.4, '#2f6fe6', 0.6, '#4fa3ff', 0.8, '#9fd4ff', 1, '#ffffff'],
      'heatmap-opacity': 0.7 } });
    m.addLayer({ id: 'catch-fill', type: 'fill', source: 'catch', paint: { 'fill-color': this.color('--d-declined'), 'fill-opacity': 0.07 } });
    m.addLayer({ id: 'catch-line', type: 'line', source: 'catch', paint: { 'line-color': this.color('--d-declined'), 'line-width': 1.5, 'line-dasharray': [2, 2], 'line-opacity': 0.8 } });
    m.addLayer({ id: 'pillars', type: 'fill-extrusion', source: 'pillars', paint: {
      'fill-extrusion-color': ['get', 'c'], 'fill-extrusion-height': ['coalesce', ['get', 'h'], 0], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.9 } });
    m.addLayer({ id: 'apps-glow', type: 'circle', source: 'apps', paint: { 'circle-color': ['get', 'c'], 'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 6, 12, 14], 'circle-blur': 1, 'circle-opacity': 0.45 } });
    m.addLayer({ id: 'apps', type: 'circle', source: 'apps', paint: {
      'circle-color': ['get', 'c'], 'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, ['case', ['get', 'ready'], 4, 2.5], 12, ['case', ['get', 'ready'], 8, 5.5]],
      'circle-stroke-color': '#ffffff', 'circle-stroke-width': ['case', ['get', 'ready'], 1.6, 0.8], 'circle-stroke-opacity': 0.9 } });
    m.addLayer({ id: 'free', type: 'circle', source: 'free', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 4, 13, 10], 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': this.color('--accent'), 'circle-stroke-width': 2 } });
    m.addLayer({ id: 'stores', type: 'circle', source: 'stores', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 4, 12, 8], 'circle-color': '#ffffff', 'circle-stroke-color': this.color('--accent'), 'circle-stroke-width': 3 } });
    m.addLayer({ id: 'stores-label', type: 'symbol', source: 'stores', minzoom: 9, layout: { 'text-field': ['get', 'id'], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-offset': [0, 1.4] }, paint: { 'text-color': '#ffffff', 'text-halo-color': '#050b1f', 'text-halo-width': 1.4 } });
    m.addLayer({ id: 'cities', type: 'circle', source: 'cities', paint: {
      'circle-radius': ['interpolate', ['linear'], ['coalesce', ['get', 'n'], 0], 0, 8, 20, 18, 100, 34], 'circle-color': this.color('--accent'), 'circle-opacity': 0.35,
      'circle-stroke-color': this.color('--accent'), 'circle-stroke-width': 2 } });
    m.addLayer({ id: 'cities-label', type: 'symbol', source: 'cities', layout: { 'text-field': ['concat', ['get', 'name'], '\n', ['to-string', ['get', 'n']], ' applied'], 'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-offset': [0, 2.2], 'text-allow-overlap': false }, paint: { 'text-color': '#ffffff', 'text-halo-color': '#050b1f', 'text-halo-width': 1.5 } });
    m.addLayer({ id: 'focus', type: 'circle', source: 'focus', paint: { 'circle-radius': 22, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 } });

    const hover = (layer, html) => {
      m.on('mousemove', layer, e => { m.getCanvas().style.cursor = 'pointer'; const f = e.features[0]; this.popup.setLngLat(f.geometry.type === 'Point' ? f.geometry.coordinates : e.lngLat).setHTML(html(f.properties)).addTo(m); });
      m.on('mouseleave', layer, () => { m.getCanvas().style.cursor = ''; this.popup.remove(); });
    };
    hover('apps', p => `<b>${p.name}</b> · ${p.id}<br>${p.dec} · pin ${p.pin}${p.place ? ` · ${p.place}` : ''}<br><span class="muted">Click to open</span>`);
    hover('pillars', p => p.kind === 'store' ? `<b>${p.id}</b> our store · pin ${p.pin}` : `<b>${p.name}</b> · ${p.id}<br>${p.dec} · score ${p.score}`);
    hover('stores', p => `<b>${p.id}</b> our store · pin ${p.pin}${p.place ? ` · ${p.place}` : ''} · opened ${p.opened}<br><span class="muted">Click: applicants in this pin</span>`);
    hover('free', p => `Empty pin <b>${p.pin}</b>${p.place ? ` · ${p.place}` : ''} · ${p.ter}<br><span class="muted">Click: who applied here</span>`);
    hover('cities', p => `<b>${p.name}</b><br>${p.n} applied · ${p.ready} ready to call<br>${p.open} empty spots · ${p.stores} stores<br><span class="muted">Click to fly in</span>`);
    m.on('click', 'apps', e => { const p = e.features[0].properties; this.cb.onTarget?.({ pin: p.pin, city: p.city, lng: e.lngLat.lng, lat: e.lngLat.lat, label: `${p.name} · ${p.pin}${p.place ? ' ' + p.place : ''}` }); this.cb.onApp(p.id); });
    m.on('click', 'pillars', e => { const p = e.features[0].properties; if (p.kind === 'app') this.cb.onApp(p.id); else this.cb.onPin(p.pin); });
    m.on('click', 'stores', e => { const p = e.features[0].properties; this.cb.onTarget?.({ pin: p.pin, city: p.city, label: p.id }); this.cb.onPin(p.pin); });
    m.on('click', 'free', e => { const p = e.features[0].properties; this.cb.onTarget?.({ pin: p.pin, city: p.city, label: `Pin ${p.pin}${p.place ? ' · ' + p.place : ''}` }); this.cb.onPin(p.pin); });
    m.on('click', 'cities', e => this.cb.onCity(e.features[0].properties.name));
    m.on('dragstart', () => { this.spin = false; });
  }

  // view: { mode: 'india' | 'city', city, apps, stores, territories, cfg, layer, hide, focus }
  render(view) {
    if (!this.ready) { this.queue = view; return; }
    const m = this.map, { apps, stores, cfg } = view;
    const showApps = apps.filter(a => !view.hide[a.decision]);
    const set = (id, f) => m.getSource(id).setData(fc(f));
    set('heat', view.layer === 'none' ? [] : view.heat.map(h => ({ type: 'Feature', properties: { w: h.w }, geometry: { type: 'Point', coordinates: [h.lng, h.lat] } })));
    set('catch', stores.map(s => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: ring(s.lng, s.lat, cfg.overlapKm) } })));
    set('stores', stores.map(s => ({ type: 'Feature', properties: { id: s.id, pin: s.pin, place: s.place || '', opened: s.opened || '', city: s.city }, geometry: { type: 'Point', coordinates: [s.lng, s.lat] } })));
    set('apps', showApps.map(a => ({ type: 'Feature', properties: { id: a.id, name: a.name, dec: a.decLabel, pin: a.pin, place: a.place || '', city: a.city, c: a.color, ready: a.ready }, geometry: { type: 'Point', coordinates: [a.lng, a.lat] } })));
    set('free', view.free.map(p => ({ type: 'Feature', properties: { pin: p.pin, place: p.place || '', ter: p.ter, city: p.city }, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } })));
    const tall = view.mode === 'city';
    set('pillars', tall ? [
      ...stores.map(s => ({ type: 'Feature', properties: { kind: 'store', id: s.id, pin: s.pin, c: '#ffffff', h: 900 }, geometry: { type: 'Polygon', coordinates: square(s.lng, s.lat, 70) } })),
      ...showApps.filter(a => a.ready).map(a => ({ type: 'Feature', properties: { kind: 'app', id: a.id, name: a.name, dec: a.decLabel, score: a.score, c: a.color, h: 120 + a.score * 7 }, geometry: { type: 'Polygon', coordinates: square(a.lng, a.lat, 45) } })),
    ] : []);
    set('cities', view.mode === 'india' ? view.cities.map(c => ({ type: 'Feature', properties: c, geometry: { type: 'Point', coordinates: [c.lng, c.lat] } })) : []);
    set('focus', view.focus ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [view.focus.lng, view.focus.lat] } }] : []);
    for (const id of ['catch-fill', 'catch-line', 'stores-label']) m.setLayoutProperty(id, 'visibility', view.mode === 'india' ? 'none' : 'visible');
    this.camera(view);
  }

  camera(view) {
    const m = this.map, fast = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const key = `${view.mode}:${view.city}:${view.focus ? view.focus.pin : ''}`;
    if (this.lastKey === key) return;
    const first = !this.lastKey; this.lastKey = key;
    const opts = { duration: first || fast ? 0 : 2200, essential: true };
    if (view.focus) { if (opts.duration) m.flyTo({ center: [view.focus.lng, view.focus.lat], zoom: 14.5, pitch: 60, bearing: -20, ...opts }); else m.jumpTo({ center: [view.focus.lng, view.focus.lat], zoom: 14.5, pitch: 60, bearing: -20 }); return; }
    const fly = (b, pitch, bearing, pad, maxZoom) => {
      const cam = m.cameraForBounds(b, { padding: pad, maxZoom });
      if (!cam) return;
      const z = Math.min(maxZoom, cam.zoom - (pitch ? 0.3 : 0));
      if (opts.duration) m.flyTo({ center: cam.center, zoom: z, pitch, bearing, ...opts }); else m.jumpTo({ center: cam.center, zoom: z, pitch, bearing });
    };
    if (view.mode === 'india' || !view.bounds) { fly(INDIA, 0, 0, 20, 5); return; }
    fly(view.bounds, 55, -18, 60, 13);
  }

  toggleSpin() {
    this.spin = !this.spin;
    const step = () => { if (!this.spin || !this.map) return; this.map.rotateTo(this.map.getBearing() + 0.08, { duration: 0 }); requestAnimationFrame(step); };
    if (this.spin) requestAnimationFrame(step);
    return this.spin;
  }
  setPitch(p) { this.map?.easeTo({ pitch: p, duration: 800 }); }
  resize() { this.map?.resize(); }
}
