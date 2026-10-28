// orders-map.js — Bengaluru order heatmap: where orders come from today, where we lose them, and what a new store
// would change. Same simulated order data and views as the Expansion Console (data/blr-*.json), drawn on a flat
// MapLibre map: pins shaded per view, routes to stores, store load rings and a side panel with the numbers.

import { STYLE_URL, themeStyle } from './map3d.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n0 = v => Math.round(v).toLocaleString('en-IN');
const lakh = v => `₹${v.toFixed(2)}L`;
const km = v => `${v.toFixed(1)} km`;

// Single-hue scales, light = low (same stops as the console)
const BLUE = ['#eff6ff', '#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#1d4ed8'];
const RED = ['#fef2f2', '#fee2e2', '#fecaca', '#fca5a5', '#f87171', '#dc2626', '#991b1b'];
const SCALE = {
  traffic: { stops: [0, 10, 25, 50, 75, 100, 140], colors: BLUE },
  feed: { stops: [0, 2, 5, 10, 20, 35, 60], colors: BLUE },
  leaks: { stops: [0, 5, 10, 20, 30, 45, 60], colors: RED },
  plan: { stops: [0, 25, 50, 100, 150, 180, 210], colors: BLUE },
};
const color = (sc, v) => { let c = sc.colors[0]; sc.stops.forEach((s, i) => { if (v >= s) c = sc.colors[i]; }); return c; };
const LINE = { today: '#1d4ed8', taken: '#b45309', won: '#15803d', redirect: '#b91c1c', old: '#94a3b8' };
const HEAVY = 75;
const AREA = { 'ST-01': 'MG Road' };
const MODES = [['traffic', "Today's traffic"], ['leaks', 'Leaks'], ['plan', 'Plan a new store']];
const INTRO = {
  traffic: 'Where store orders come from today. Click a store to isolate it, or a pin to see where its customers go.',
  leaks: 'Where we lose orders because no store is close. Click a pin to see where its customers go instead.',
  plan: 'Pick a pin to simulate a new franchise there: orders won, orders taken from our stores, payback and load on each store.',
};
const flowW = v => Math.min(8, 0.6 + Math.sqrt(Math.max(0, v)) * 0.55);

function ring(lng, lat, radiusKm, n = 72) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * 2 * Math.PI;
    pts.push([lng + (radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.cos(a), lat + (radiusKm / 110.57) * Math.sin(a)]);
  }
  return pts;
}
function offset(a, b, metres) {
  const kx = 111320 * Math.cos((a[1] * Math.PI) / 180);
  const dx = (b[0] - a[0]) * kx, dy = (b[1] - a[1]) * 111320, len = Math.hypot(dx, dy) || 1;
  const ox = (-dy / len) * metres, oy = (dx / len) * metres;
  return [[a[0] + ox / kx, a[1] + oy / 111320], [b[0] + ox / kx, b[1] + oy / 111320]];
}

let dataPromise = null;
function loadData() {
  dataPromise ||= Promise.all(['blr-flows.json', 'blr-pins.geojson', 'blr-potential.json', 'blr-catchment.json'].map(f => fetch(`data/${f}`).then(r => { if (!r.ok) throw new Error(`${f}: ${r.status}`); return r.json(); })))
    .then(([flows, shapes, potential, catchment]) => ({ flows, shapes, potential: potential.pins, catchment }))
    .catch(e => { dataPromise = null; throw e; });
  return dataPromise;
}

export class OrdersMap {
  /** stage: element for the map; side: element for the panel; opts: { dark, getResult, openApp, overlapKm } */
  constructor(stage, side, opts) {
    this.stage = stage; this.side = side; this.o = opts;
    this.mode = 'traffic'; this.selStore = null; this.selPin = null; this.ready = false; this.markers = [];
    stage.innerHTML = '<div class="om-map"></div><div class="om-legend"></div>';
    this.side.innerHTML = '<div class="card"><p class="muted">Loading Bengaluru order data…</p></div>';
    loadData().then(d => { this.d = d; this.byPin = Object.fromEntries(d.potential.map(p => [p.pin, p])); this.initMap(); })
      .catch(() => { this.side.innerHTML = '<div class="card"><p>The Bengaluru order data could not load. Check the connection and reload.</p></div>'; });
  }

  initMap() {
    if (!globalThis.maplibregl) { this.stage.querySelector('.om-map').innerHTML = '<div class="empty" style="height:100%;display:grid;place-items:center">The map could not load. Check the internet connection and reload.</div>'; this.render(); return; }
    const lats = this.d.potential.map(p => p.lat), lngs = this.d.potential.map(p => p.lng);
    const bounds = [[Math.min(...lngs) - 0.03, Math.min(...lats) - 0.03], [Math.max(...lngs) + 0.03, Math.max(...lats) + 0.03]];
    fetch(STYLE_URL, { signal: AbortSignal.timeout(15000) }).then(r => r.json()).then(style => {
      const m = this.map = new maplibregl.Map({ container: this.stage.querySelector('.om-map'), style: themeStyle(style, this.o.dark), bounds, attributionControl: { compact: true } });
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      this.pop = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10, className: 'ss-pop' });
      m.on('load', () => {
        const empty = { type: 'FeatureCollection', features: [] };
        for (const id of ['om-pins', 'om-rings', 'om-lines', 'om-points']) m.addSource(id, { type: 'geojson', data: empty });
        m.addLayer({ id: 'om-pins-fill', type: 'fill', source: 'om-pins', paint: { 'fill-color': ['get', 'fill'], 'fill-opacity': ['get', 'op'] } });
        m.addLayer({ id: 'om-pins-line', type: 'line', source: 'om-pins', paint: { 'line-color': ['case', ['get', 'sel'], '#111827', '#ffffff'], 'line-width': ['case', ['get', 'sel'], 2.5, 0.6], 'line-opacity': 0.9 } });
        m.addLayer({ id: 'om-rings-fill', type: 'fill', source: 'om-rings', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['get', 'fop'] } });
        m.addLayer({ id: 'om-rings-line', type: 'line', source: 'om-rings', filter: ['!', ['get', 'dash']], paint: { 'line-color': ['get', 'color'], 'line-width': 1.6 } });
        m.addLayer({ id: 'om-rings-dash', type: 'line', source: 'om-rings', filter: ['get', 'dash'], paint: { 'line-color': ['get', 'color'], 'line-width': 1.6, 'line-dasharray': [2, 3] } });
        m.addLayer({ id: 'om-lines', type: 'line', source: 'om-lines', filter: ['!', ['get', 'dash']], layout: { 'line-cap': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'w'], 'line-opacity': ['get', 'op'] } });
        m.addLayer({ id: 'om-lines-dash', type: 'line', source: 'om-lines', filter: ['get', 'dash'], paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'w'], 'line-opacity': ['get', 'op'], 'line-dasharray': [2, 3] } });
        m.addLayer({ id: 'om-points', type: 'circle', source: 'om-points', paint: { 'circle-radius': 6, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#111827', 'circle-stroke-width': 1.5 } });
        const tip = layer => {
          m.on('mousemove', layer, e => { const f = e.features?.[0]; if (!f) return; m.getCanvas().style.cursor = 'pointer'; this.pop.setLngLat(e.lngLat).setHTML(f.properties.tip).addTo(m); });
          m.on('mouseleave', layer, () => { m.getCanvas().style.cursor = ''; this.pop.remove(); });
        };
        ['om-pins-fill', 'om-lines', 'om-lines-dash', 'om-points'].forEach(tip);
        m.on('click', 'om-pins-fill', e => { if (m.queryRenderedFeatures(e.point, { layers: ['om-points'] }).length) return; const pin = e.features?.[0]?.properties.pin; if (pin) this.selectPin(pin); });
        m.on('click', 'om-points', e => { const id = e.features?.[0]?.properties.id; if (id) this.o.openApp(id); });
        this.ready = true;
        this.render();
      });
    }).catch(() => { this.stage.querySelector('.om-map').innerHTML = '<div class="empty" style="height:100%;display:grid;place-items:center">The map tiles could not load. Check the internet connection.</div>'; this.render(); });
  }

  setMode(m) { this.mode = m; this.selStore = null; this.selPin = null; this.render(); }
  selectStore(id) { this.selStore = this.selStore === id ? null : id; this.selPin = null; this.render(); }
  selectPin(pin) { this.selPin = this.selPin === pin ? null : pin; this.selStore = null; this.render(); }
  simulate(pin) { this.mode = 'plan'; this.selStore = null; this.selPin = pin; this.render(); }
  resize() { this.map?.resize(); }

  pinName(pin) { return this.byPin[pin]?.name || ''; }
  storeName(id) { const s = this.d.flows.stores.find(x => x.id === id); return AREA[id] || s?.area || id; }

  render() {
    if (!this.d) return;
    this.renderSide();
    this.renderLegend();
    if (!this.ready) return;
    const { flows, shapes } = this.d, m = this.map, mode = this.mode, sel = this.selPin;
    const cand = mode === 'plan' && sel ? flows.candidates[sel] : null;
    const storePos = Object.fromEntries(flows.stores.map(s => [s.id, [s.lng, s.lat]]));
    const pinPos = pin => (this.byPin[pin] ? [this.byPin[pin].lng, this.byPin[pin].lat] : null);

    // pin shading
    const feats = shapes.features.map(f => {
      const pin = f.properties.pin, fp = flows.pins[pin], pp = this.byPin[pin], name = `${pin} ${this.pinName(pin)}`, emph = pin === sel;
      let fill = '#e5e7eb', op = 0.15, tip = name;
      if (mode === 'traffic') {
        if (this.selStore) {
          const v = flows.baseline.find(b => b.pin === pin && b.store === this.selStore)?.perMonth ?? 0;
          if (v > 0) { fill = color(SCALE.feed, v); op = 0.75; tip = `${name}<br>${v} orders/mo to ${this.selStore}`; } else tip = `${name}<br>no orders to ${this.selStore}`;
        } else {
          const v = fp ? fp.store + fp.online : 0;
          fill = color(SCALE.traffic, v); op = sel && !emph ? 0.3 : 0.62;
          tip = fp ? `${name}<br><b>${v}</b> orders/mo (${fp.store} in store, ${fp.online} online)` : `${name}<br>no order data`;
        }
      } else if (mode === 'leaks') {
        const v = pp?.missed_orders_month ?? 0;
        fill = color(SCALE.leaks, v); op = sel && !emph ? 0.35 : 0.74;
        tip = pp ? `${name}<br><b>${v}</b> missed orders/mo (${lakh(pp.missed_sales_lakh_month)})<br>${pp.redirected_orders_month} travel more than 4 km` : name;
      } else if (cand) {
        const fl = cand.flows.find(x => x.pin === pin), v = fl ? fl.takenPerMonth + fl.newPerMonth : 0;
        if (v > 0 || emph) { fill = color(SCALE.feed, v); op = 0.75; tip = fl ? `${name}<br>${fl.newPerMonth} new + ${fl.takenPerMonth} from ${fl.fromStore} per month` : name; } else tip = `${name}<br>not in this store's catchment`;
      } else {
        const existing = pp?.verdict === 'Existing store here', v = existing ? 0 : pp?.incremental_orders_month ?? 0;
        fill = existing ? '#d1d5db' : color(SCALE.plan, v); op = 0.72;
        tip = !pp ? name : existing ? `${name}<br>existing store` : `${name}<br>+${v} new orders/mo · payback ${pp.payback_months ?? '—'} mo`;
      }
      return { type: 'Feature', geometry: f.geometry, properties: { pin, fill, op, sel: emph, tip } };
    });
    m.getSource('om-pins').setData({ type: 'FeatureCollection', features: feats });

    // lines
    const lines = [], L = (a, b, c, w, op, tip, dash = false) => lines.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [a, b] }, properties: { color: c, w, op, tip, dash } });
    if (mode === 'traffic') {
      const rows = this.selStore ? flows.baseline.filter(b => b.store === this.selStore) : sel ? flows.baseline.filter(b => b.pin === sel) : [];
      for (const b of rows) { const a = pinPos(b.pin); if (a && storePos[b.store] && b.perMonth > 0) L(a, storePos[b.store], LINE.today, flowW(b.perMonth), 0.55, `${b.pin} ${esc(this.pinName(b.pin))} → ${b.store}: ${b.perMonth} orders/mo`); }
    } else if (mode === 'leaks') {
      for (const p of sel ? [this.byPin[sel]].filter(Boolean) : this.d.potential) for (const r of p.redirected_to) {
        if (r.ordersPerMonth < (sel ? 1 : 4) || !storePos[r.store]) continue;
        L([p.lng, p.lat], storePos[r.store], LINE.redirect, sel ? flowW(r.ordersPerMonth) + 1 : 1.2, sel ? 0.85 : 0.35, `${p.pin} ${esc(p.name)} → ${r.store}: ${r.ordersPerMonth} orders/mo travel more than 4 km`);
      }
    } else if (cand && pinPos(sel)) {
      const target = pinPos(sel);
      for (const f of [...cand.flows].sort((a, b) => b.takenPerMonth + b.newPerMonth - (a.takenPerMonth + a.newPerMonth)).slice(0, 30)) {
        const a = pinPos(f.pin);
        if (!a || f.takenPerMonth + f.newPerMonth < 2 || f.pin === sel) continue;
        if (f.takenPerMonth >= 5 && storePos[f.fromStore]) L(a, storePos[f.fromStore], LINE.old, 1.5, 0.6, `Today: ${f.pin} ${esc(this.pinName(f.pin))} → ${f.fromStore}`, true);
        const both = f.takenPerMonth > 0 && f.newPerMonth > 0;
        if (f.takenPerMonth > 0) { const [p, q] = both ? offset(a, target, 70) : [a, target]; L(p, q, LINE.taken, flowW(f.takenPerMonth), 0.85, `${f.pin} ${esc(this.pinName(f.pin))}: ${f.takenPerMonth} orders/mo move from ${f.fromStore} to the new store`); }
        if (f.newPerMonth > 0) { const [p, q] = both ? offset(a, target, -70) : [a, target]; L(p, q, LINE.won, flowW(f.newPerMonth), 0.85, `${f.pin} ${esc(this.pinName(f.pin))}: ${f.newPerMonth} new orders/mo won back`); }
      }
    }
    m.getSource('om-lines').setData({ type: 'FeatureCollection', features: lines });

    // rings: the overlap radius around every store, plus the 80% customer ring for an isolated store, and the new store
    const ok = this.o.overlapKm(), rings = [], R = (c, r, col, fop, dash) => rings.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring(c[0], c[1], r)] }, properties: { color: col, fop, dash } });
    for (const s of flows.stores) {
      if (mode === 'traffic' && this.selStore && s.id !== this.selStore) continue;
      const strong = mode === 'traffic' && this.selStore === s.id;
      R(storePos[s.id], ok, '#111827', strong ? 0.08 : 0.04, !strong);
      if (strong) { const c = this.d.catchment.find(x => x.store_id === s.id); if (c) R(storePos[s.id], c.p80_customer_km, LINE.today, 0, true); }
    }
    if (cand && pinPos(sel)) { R(pinPos(sel), ok, '#1d4ed8', 0.1, false); R(pinPos(sel), cand.catchment_radius_km, '#1d4ed8', 0, true); }
    m.getSource('om-rings').setData({ type: 'FeatureCollection', features: rings });

    // approved franchises from the current decisions
    const res = this.o.getResult();
    const pts = (res?.apps || []).filter(a => a.bucket === 'ready' && a.point && a.cityName === 'Bengaluru')
      .map(a => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [a.point.lng, a.point.lat] }, properties: { id: a.id, color: '#16a34a', tip: `${esc(a.id)} ${esc(a.name)}<br>suggested yes · pin ${esc(a.assignedPin || a.pin)}<br>Click to open` } }));
    m.getSource('om-points').setData({ type: 'FeatureCollection', features: pts });

    // store markers: load ring (heavy lifters in red), dimmed when not involved
    this.markers.forEach(x => x.remove()); this.markers = [];
    for (const s of flows.stores) {
      const after = cand ? cand.store_load_after[s.id] : undefined;
      const afterPct = after !== undefined ? Math.round((after / s.capacity_per_month) * 100) : null;
      const changed = afterPct !== null && afterPct !== s.utilisation_pct;
      const pct = changed ? afterPct : s.utilisation_pct, heavy = pct >= HEAVY;
      const dim = (mode === 'traffic' && this.selStore && this.selStore !== s.id) || (cand && !changed);
      const size = Math.round(22 + (s.load_per_month / s.capacity_per_month) * 16), ringC = heavy ? '#b91c1c' : '#1d4ed8';
      const el = document.createElement('div');
      el.className = 'om-store';
      el.style.opacity = dim ? 0.35 : 1;
      el.title = `${s.id} ${this.storeName(s.id)} · ${n0(s.load_per_month)} orders/mo · ${s.utilisation_pct}% of capacity${s.utilisation_pct >= HEAVY ? ' · heavy lifter' : ''}${changed ? ` · after new store: ${afterPct}%` : ''}`;
      el.innerHTML = `<div class="om-ring" style="width:${size}px;height:${size}px;background:conic-gradient(${ringC} ${pct}%, #e5e7eb 0);${this.selStore === s.id ? 'box-shadow:0 0 0 3px #111827' : ''}"><i style="width:${size - 8}px;height:${size - 8}px"></i></div><span class="om-cap" style="color:${heavy ? '#991b1b' : '#111827'}">${changed ? `${s.id} · ${s.utilisation_pct}→${afterPct}%` : `${s.id} · ${s.utilisation_pct}%`}</span>`;
      el.onclick = ev => { ev.stopPropagation(); if (mode !== 'traffic') this.mode = 'traffic'; this.selectStore(s.id); };
      this.markers.push(new maplibregl.Marker({ element: el, anchor: 'top' }).setLngLat([s.lng, s.lat]).setOffset([0, -size / 2]).addTo(m));
    }
    if (cand && pinPos(sel)) {
      const el = document.createElement('div'); el.className = 'om-new'; el.textContent = 'NEW'; el.title = `New store at ${sel} ${this.pinName(sel)}`;
      this.markers.push(new maplibregl.Marker({ element: el }).setLngLat(pinPos(sel)).addTo(m));
    }
  }

  renderLegend() {
    const el = this.stage.querySelector('.om-legend'), ramp = sc => `<span class="om-ramp">${sc.colors.map(c => `<i style="background:${c}"></i>`).join('')}</span>`;
    const line = (c, dash) => `<i class="om-line" style="border-top:3px ${dash ? 'dashed' : 'solid'} ${c}"></i>`;
    const rows = {
      traffic: [`<b>Orders per month per pin</b>`, `few ${ramp(this.selStore ? SCALE.feed : SCALE.traffic)} many`, `${line(LINE.today)} Route to a store`, `<i class="om-dot" style="background:conic-gradient(#1d4ed8 70%,#e5e7eb 0)"></i> Store load (red at 75%+)`],
      leaks: [`<b>Missed orders per month per pin</b>`, `few ${ramp(SCALE.leaks)} many`, `${line(LINE.redirect)} Orders travelling more than 4 km`],
      plan: this.selPin ? [`<b>Orders the new store would serve</b>`, `few ${ramp(SCALE.feed)} many`, `${line(LINE.won)} New orders won back`, `${line(LINE.taken)} Taken from our stores`, `${line(LINE.old, true)} Today's route (before)`] : [`<b>New orders a store would win</b>`, `few ${ramp(SCALE.plan)} many`, '<i class="om-dot" style="background:#d1d5db"></i> Existing store pin'],
    }[this.mode];
    el.innerHTML = [...rows, `<i class="om-dot" style="border:1.5px dashed #111827"></i> ${this.o.overlapKm()} km ring around our stores`, '<i class="om-dot" style="background:#16a34a"></i> Approved franchise'].map(r => `<div>${r}</div>`).join('');
  }

  renderSide() {
    const { flows, potential } = this.d, mode = this.mode, sel = this.selPin;
    const row = (l, v, strong) => `<div class="om-row${strong ? ' strong' : ''}"><span>${l}</span><span>${v}</span></div>`;
    const sec = (title, note, body, action = '') => `<div class="card om-card"><div class="om-h"><div><h2>${title}</h2>${note ? `<p class="small muted">${note}</p>` : ''}</div>${action}</div>${body}</div>`;
    const tabs = `<div class="seg-ctl om-modes">${MODES.map(([k, l]) => `<button data-om="${k}" class="${k === mode ? 'on' : ''}">${l}</button>`).join('')}</div><p class="small muted om-intro">${INTRO[mode]}</p>`;
    let html = tabs;
    const src = `<p class="small muted om-src">Simulated online and store orders, ${esc(flows.meta.window)}, scaled so today's stores match the Tier 1 sales assumption. Bengaluru only.</p>`;
    if (mode === 'traffic') {
      if (sel && flows.pins[sel]) {
        const fp = flows.pins[sel], to = flows.baseline.filter(b => b.pin === sel && b.perMonth > 0).sort((a, b) => b.perMonth - a.perMonth);
        html += sec(`${sel} ${esc(this.pinName(sel))}`, 'Where this pin\'s customers buy today', row('Store orders per month', n0(fp.store), true) + row('Online orders per month', n0(fp.online)) + row('Missed orders per month', n0(fp.missed)) + row('Travel more than 4 km', `${n0(fp.redirected)}/mo`) + (to.length ? `<p class="small muted om-sub">Stores they go to</p>${to.map(b => row(`${b.store} ${esc(this.storeName(b.store))}`, `${b.perMonth}/mo`)).join('')}` : '') + `<button class="btn primary om-wide" data-sim="${sel}">Simulate a new store here →</button>`, '<button class="btn sm ghost" data-clear>All pins</button>');
      } else if (this.selStore) {
        const s = flows.stores.find(x => x.id === this.selStore), c = this.d.catchment.find(x => x.store_id === s.id), top = flows.baseline.filter(b => b.store === s.id).sort((a, b) => b.perMonth - a.perMonth).slice(0, 8);
        html += sec(`${s.id} ${esc(this.storeName(s.id))}`, s.utilisation_pct >= HEAVY ? '<b style="color:#b91c1c">Heavy lifter</b>: at 75% of capacity or more' : 'Isolated on the map', row('Orders per month', n0(s.load_per_month), true) + row('Capacity used (of 600/mo)', `${s.utilisation_pct}%`) + (c ? row('80% of customers live within', km(c.p80_customer_km)) + row('Average customer distance', km(c.avg_customer_km)) : '') + `<p class="small muted om-sub">Top pins it serves</p>${top.map(b => row(`${b.pin} ${esc(this.pinName(b.pin))}`, `${b.perMonth}/mo`)).join('')}`, '<button class="btn sm ghost" data-clear>All stores</button>');
      } else {
        const stores = [...flows.stores].sort((a, b) => b.utilisation_pct - a.utilisation_pct), heavy = stores.filter(s => s.utilisation_pct >= HEAVY);
        const online = Object.values(flows.pins).reduce((x, p) => x + p.online, 0);
        html += sec('Store load today', 'Orders per month vs capacity of 600 a month (about 20 a day). Click a store to isolate it.', stores.map(s => `<button class="om-item" data-store="${s.id}"><span>${s.id} ${esc(this.storeName(s.id))}${s.utilisation_pct >= HEAVY ? ' <b class="om-heavy">Heavy lifter</b>' : ''}</span><span>${n0(s.load_per_month)}/mo · <b>${s.utilisation_pct}%</b></span></button>`).join(''));
        html += sec('What this means', '', row(`Store orders per month (${stores.length} stores)`, n0(stores.reduce((x, s) => x + s.load_per_month, 0))) + row('Online orders per month', n0(online)) + row('Stores at 75% or more', heavy.map(h => h.id).join(', ') || 'None', true) + `<p class="small">${heavy.length ? `${heavy.map(h => `${h.id} ${esc(this.storeName(h.id))}`).join(' and ')} ${heavy.length > 1 ? 'are' : 'is'} close to full. A new store nearby would take load off: use "Plan a new store".` : 'No store is close to full today.'}</p>`);
      }
    } else if (mode === 'leaks') {
      const p = sel ? this.byPin[sel] : null;
      if (p) html += sec(`${p.pin} ${esc(p.name)}`, '', row('Missed orders per month', n0(p.missed_orders_month), true) + row('Missed sales per month', lakh(p.missed_sales_lakh_month), true) + row('Orders travelling more than 4 km', `${n0(p.redirected_orders_month)}/mo`) + row('Nearest store', `${p.nearest_store_id} · ${km(p.nearest_store_km)}`) + (p.redirected_to.some(r => r.ordersPerMonth > 0) ? `<p class="small muted om-sub">Far stores these customers travel to</p>${p.redirected_to.filter(r => r.ordersPerMonth > 0).map(r => row(`${r.store} ${esc(this.storeName(r.store))}`, `${n0(r.ordersPerMonth)} orders/mo`)).join('')}` : '') + (p.verdict !== 'Existing store here' ? `<button class="btn primary om-wide" data-sim="${p.pin}">Simulate a new store here →</button>` : ''), '<button class="btn sm ghost" data-clear>All pins</button>');
      html += sec('Total leak in Bengaluru', "Customers who would buy in a store if one were in their pin, but don't today.", row('Missed orders per month', n0(potential.reduce((a, x) => a + x.missed_orders_month, 0)), true) + row('Missed sales per month', lakh(potential.reduce((a, x) => a + x.missed_sales_lakh_month, 0)), true) + row('Orders travelling more than 4 km (at risk)', `${n0(potential.reduce((a, x) => a + x.redirected_orders_month, 0))}/mo`));
      const top = [...potential].sort((a, b) => b.missed_sales_lakh_month - a.missed_sales_lakh_month || a.pin.localeCompare(b.pin)).slice(0, 10);
      html += sec('Top 10 leaking pins', 'Missed sales per month. Click a pin to see where its customers go.', top.map(x => `<button class="om-item${x.pin === sel ? ' on' : ''}" data-pin="${x.pin}"><span>${x.pin} ${esc(x.name)}</span><span>${n0(x.missed_orders_month)} orders · <b>${lakh(x.missed_sales_lakh_month)}</b></span></button>`).join(''));
    } else {
      const p = sel ? this.byPin[sel] : null, cand = sel ? flows.candidates[sel] : null;
      if (p) html += this.impact(p, cand, row, sec);
      const best = potential.filter(x => x.verdict !== 'Existing store here').sort((a, b) => b.incremental_orders_month - a.incremental_orders_month || a.pin.localeCompare(b.pin)).slice(0, 8);
      html += sec('Best places for a new store', 'Ranked by new orders won per month (not taken from our own stores). Click one to simulate it.', best.map((x, i) => `<button class="om-item${x.pin === sel ? ' on' : ''}" data-pin="${x.pin}"><span><span class="muted">${i + 1}.</span> ${x.pin} ${esc(x.name)}</span><span>+<b>${n0(x.incremental_orders_month)}</b>/mo · ${x.payback_months == null ? '—' : `${Math.round(x.payback_months)} mo payback`}</span></button>`).join(''));
    }
    this.side.innerHTML = html + src;
    this.side.querySelectorAll('[data-om]').forEach(b => (b.onclick = () => this.setMode(b.dataset.om)));
    this.side.querySelectorAll('[data-store]').forEach(b => (b.onclick = () => this.selectStore(b.dataset.store)));
    this.side.querySelectorAll('[data-pin]').forEach(b => (b.onclick = () => { this.selPin = b.dataset.pin; this.selStore = null; this.render(); this.fly(b.dataset.pin); }));
    this.side.querySelectorAll('[data-sim]').forEach(b => (b.onclick = () => this.simulate(b.dataset.sim)));
    this.side.querySelectorAll('[data-clear]').forEach(b => (b.onclick = () => { this.selPin = null; this.selStore = null; this.render(); }));
    this.side.querySelectorAll('[data-app]').forEach(b => (b.onclick = () => this.o.openApp(b.dataset.app)));
  }

  impact(p, cand, row, sec) {
    const existing = p.verdict === 'Existing store here';
    if (existing) return sec(`${p.pin} ${esc(p.name)}`, '', '<p>A store already operates in this pin. The brand never opens two stores in one pin, so this pin cannot take a franchise.</p>', '<button class="btn sm ghost" data-clear>Clear</button>');
    const good = p.verdict === 'Viable', meta = this.d.flows.meta;
    let body = `<p class="om-verdict" style="color:${good ? '#15803d' : '#b45309'}">${good ? `Viable: pays back within the ${meta.payback_target_months}-month target.` : `${esc(p.verdict)}: payback is longer than the ${meta.payback_target_months}-month target.`}</p>`;
    body += row('Orders per month the store would serve', n0(p.potential_orders_month), true)
      + `<div class="om-indent">${row(`<i class="om-line" style="border-top:3px solid ${LINE.won}"></i> New orders won back`, n0(p.incremental_orders_month))}${row(`<i class="om-line" style="border-top:3px solid ${LINE.taken}"></i> Taken from our stores`, n0(p.cannibalised_orders_month))}${p.cannibalised_from.filter(c => c.ordersPerMonth > 0).map(c => row(`&nbsp;&nbsp;from ${c.store} ${esc(this.storeName(c.store))}`, n0(c.ordersPerMonth))).join('')}</div>`
      + row('Capacity use (of 600/mo)', `${p.capacity_use_pct}%`) + row('Est. sales per month', lakh(p.est_sales_lakh_month)) + row('Est. profit per month', lakh(p.est_profit_lakh_month))
      + row('Payback', p.payback_months == null ? 'Never at this volume' : `${p.payback_months.toFixed(1)} months`, true) + row('Annual return on investment', `${Math.round(p.annual_roi_pct)}%`) + (cand ? row('Catchment radius', km(cand.catchment_radius_km)) : '');
    let html = sec(`Impact of a store at ${p.pin} ${esc(p.name)}`, 'What changes in the first full year if a franchise opens here', body, '<button class="btn sm ghost" data-clear>Clear</button>');
    if (cand) {
      const shifts = this.d.flows.stores.map(s => ({ s, before: s.load_per_month, after: cand.store_load_after[s.id] ?? s.load_per_month })).filter(x => x.before !== x.after);
      const u = (v, cap) => Math.round((v / cap) * 100);
      html += sec('Load on existing stores: before → after', '', shifts.length ? shifts.map(x => row(`${x.s.id} ${esc(this.storeName(x.s.id))}`, `${u(x.before, x.s.capacity_per_month)}% → <b>${u(x.after, x.s.capacity_per_month)}%</b>`)).join('') + shifts.filter(x => u(x.before, x.s.capacity_per_month) >= HEAVY).map(x => `<p class="small">Relieves heavy lifter ${x.s.id}: ${n0(x.before - x.after)} orders/mo move.</p>`).join('') : '<p class="small">No existing store loses orders: every order here is new.</p>');
    }
    const res = this.o.getResult(), apps = (res?.apps || []).filter(a => String(a.assignedPin || a.pin) === p.pin || (a.territory?.pins || []).includes(p.pin)).slice(0, 8);
    html += sec('Applicants for this pin and its territory', '', apps.length ? apps.map(a => `<button class="om-item" data-app="${esc(a.id)}"><span>${esc(a.id)} ${esc(a.name)}</span><span>${esc(a.decision)}</span></button>`).join('') : '<p class="small">No applicant has asked for this pin or its territory yet. It is an open gap.</p>');
    return html;
  }

  fly(pin) { const p = this.byPin[pin]; if (p && this.map) this.map.easeTo({ center: [p.lng, p.lat], zoom: Math.max(this.map.getZoom(), 11.5), duration: 600 }); }
}
