// orders-sim.js — simulated order data for any city, in the same shape as the pre-built Bengaluru files
// (data/blr-flows.json + blr-potential.json), so the orders heatmap works everywhere in India.
// Same channel model as the console's generator (scripts/gen-potential.mjs), worked per pin instead of per customer:
// a pin's customers buy in a store more the closer the nearest store is; what they would buy with a store in their own
// pin but don't is "missed"; store orders from more than 4 km away are "redirected"; a new store wins the customers it
// is closest to (new orders + orders taken from our stores). Demand per pin comes from the engine's pin estimate.
import { pinProxy } from './engine.js';

const WALKIN = { share: 0.72, decayKm: 4 }, PICKUP = { share: 0.14, decayKm: 9 };
const NEAR_STORE_KM = 0.8, FAR_TRAVEL_KM = 4, CAPACITY = 600, PAYBACK_TARGET = 30;
// Contribution margin used by the Bengaluru data (rulebook: about 45% gross minus 10% variable costs).
const MARGIN_CONTRIB = 0.35;
const ONLINE_SHARE = 0.22; // share of a pin's potential bought online whatever the distance
// Store economics by city tier (rulebook: investment, base sales, fixed cost per month; ₹ lakh) and average bill (₹)
const TIER = { 1: { invest: 35, baseSales: 9.5, fixed: 1.9, aov: 2555 }, 2: { invest: 22, baseSales: 6.0, fixed: 1.2, aov: 2200 }, 3: { invest: 15, baseSales: 4.2, fixed: 0.84, aov: 1900 } };
// Store-level purchases a pin's households would make a month with a store right in the pin, by tier, at average
// demand. Only a starting point: every city is then calibrated (see below).
const PIN_POTENTIAL = { 1: 95, 2: 70, 3: 52 };

const share = d => WALKIN.share * Math.exp(-d / WALKIN.decayKm) + PICKUP.share * Math.exp(-d / PICKUP.decayKm);
const rad = x => (x * Math.PI) / 180;
const km = (a, b) => { const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng); const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2; return 2 * 6371 * Math.asin(Math.sqrt(h)); };
const round = (v, d = 0) => Math.round(v * 10 ** d) / 10 ** d;

/**
 * pins: [{ pin, name, lat, lng }] for the city; stores: [{ id, area, lat, lng }]; tier: 1 | 2 | 3.
 * Returns { flows, potential, catchment } shaped like the pre-built Bengaluru data.
 */
export function simulateCity({ city, pins, stores, tier, asOf }) {
  const T = TIER[tier] || TIER[2];
  const dem = pins.map(p => pinProxy(p.pin, tier).demand);
  const avg = dem.reduce((a, b) => a + b, 0) / (dem.length || 1) || 0.5;
  // monthly store-level purchase potential of each pin's households (with a store in their own pin)
  const F = pins.map((p, i) => PIN_POTENTIAL[tier] * (dem[i] / avg));
  const nearest = p => stores.map(s => ({ s, d: km(p, s) })).sort((a, b) => a.d - b.d)[0] || null;
  const near = pins.map(p => nearest(p));
  const full = share(NEAR_STORE_KM);
  // Calibration, as the Bengaluru order data was built: today's stores average the tier's base sales (the rulebook's
  // store economics). A city with no store yet is scaled so the best possible site sells the base sales instead.
  const k = stores.length
    ? (T.baseSales * 1e5) / T.aov / (pins.reduce((a, p, i) => a + (F[i] * share(near[i].d)) / full, 0) / stores.length || 1)
    : (T.baseSales * 1e5) / T.aov / (Math.max(...pins.map(at => pins.reduce((a, q, i) => a + (F[i] * share(Math.max(NEAR_STORE_KM * 0.5, km(q, at)))) / full, 0))) || 1);
  for (let i = 0; i < F.length; i++) F[i] *= Math.min(2.5, Math.max(0.4, k));

  // today
  const storeLoad = Object.fromEntries(stores.map(s => [s.id, 0])), baseline = [], pinsToday = {}, distByStore = Object.fromEntries(stores.map(s => [s.id, []]));
  const potential = pins.map((p, i) => {
    const n = near[i], d = n ? n.d : Infinity;
    const storeOrders = n ? (F[i] * share(d)) / full : 0;
    const missed = F[i] * Math.max(0, full - (n ? share(d) : 0)) / full;
    const online = F[i] * ONLINE_SHARE + missed * 0.35;
    const redirected = n && d > FAR_TRAVEL_KM ? storeOrders : 0;
    if (n) { storeLoad[n.s.id] += storeOrders; if (storeOrders >= 0.5) baseline.push({ pin: p.pin, store: n.s.id, perMonth: round(storeOrders) }); distByStore[n.s.id].push([d, storeOrders]); }
    pinsToday[p.pin] = { online: round(online), missed: round(missed), store: round(storeOrders), redirected: round(redirected) };
    return {
      pin: p.pin, name: p.name, lat: p.lat, lng: p.lng,
      nearest_store_id: n ? n.s.id : null, nearest_store_km: n ? round(d, 2) : null,
      missed_orders_month: round(missed), missed_sales_lakh_month: round((missed * T.aov) / 1e5, 2),
      redirected_orders_month: round(redirected), redirected_to: redirected >= 1 ? [{ store: n.s.id, ordersPerMonth: round(redirected) }] : [],
      online_orders_month: round(online), store_orders_month: round(storeOrders),
    };
  });

  // a new store at each pin
  const candidates = {};
  potential.forEach((pp, j) => {
    const at = pins[j];
    let captured = 0, incremental = 0;
    const cannibal = {}, flows = [], dists = [];
    pins.forEach((q, i) => {
      const dNew = Math.max(NEAR_STORE_KM * 0.5, km(q, at)), dOld = near[i] ? near[i].d : Infinity;
      if (dNew >= dOld) return;
      const before = near[i] ? (F[i] * share(dOld)) / full : 0, after = (F[i] * share(dNew)) / full;
      if (after < 0.5) return;
      captured += after; incremental += after - before; dists.push(dNew);
      if (near[i] && before > 0) cannibal[near[i].s.id] = (cannibal[near[i].s.id] || 0) + before;
      flows.push({ pin: q.pin, fromStore: near[i] ? near[i].s.id : '—', takenPerMonth: round(before), newPerMonth: round(after - before) });
    });
    dists.sort((a, b) => a - b);
    candidates[pp.pin] = {
      catchment_radius_km: dists.length ? round(dists[Math.floor(dists.length * 0.8)], 2) : 0,
      flows: flows.filter(f => f.takenPerMonth + f.newPerMonth >= 1).sort((a, b) => b.takenPerMonth + b.newPerMonth - (a.takenPerMonth + a.newPerMonth)),
      store_load_after: Object.fromEntries(stores.map(s => [s.id, round(storeLoad[s.id] - (cannibal[s.id] || 0))])),
    };
    const sales = (captured * T.aov) / 1e5, profit = sales * MARGIN_CONTRIB - T.fixed, payback = profit > 0 ? T.invest / profit : null;
    const existing = stores.some(s => String(s.pin) === pp.pin) || (pp.nearest_store_km != null && pp.nearest_store_km < 1 && stores.some(s => km(s, at) < 1));
    Object.assign(pp, {
      potential_orders_month: round(captured), incremental_orders_month: round(incremental), cannibalised_orders_month: round(captured - incremental),
      cannibalised_from: Object.entries(cannibal).map(([store, n]) => ({ store, area: stores.find(s => s.id === store)?.area || store, ordersPerMonth: round(n), salesLakhPerMonth: round((n * T.aov) / 1e5, 2) })).filter(x => x.ordersPerMonth > 0).sort((a, b) => b.ordersPerMonth - a.ordersPerMonth),
      capacity_orders_month: CAPACITY, capacity_use_pct: round((100 * captured) / CAPACITY),
      est_sales_lakh_month: round(sales, 2), est_profit_lakh_month: round(profit, 2), payback_months: payback === null ? null : round(payback, 1),
      annual_roi_pct: round((100 * profit * 12) / T.invest, 1),
      verdict: existing ? 'Existing store here' : payback !== null && payback <= PAYBACK_TARGET ? 'Viable' : 'Below payback target',
    });
  });

  // per-store catchment: distance within which 80% of its orders live
  const catchment = stores.map(s => {
    const list = distByStore[s.id].sort((a, b) => a[0] - b[0]), tot = list.reduce((a, x) => a + x[1], 0);
    let acc = 0, p80 = 0;
    for (const [d, n] of list) { acc += n; if (acc >= tot * 0.8) { p80 = d; break; } }
    const avgKm = tot ? list.reduce((a, [d, n]) => a + d * n, 0) / tot : 0;
    return { store_id: s.id, p80_customer_km: round(Math.max(p80, 1), 2), avg_customer_km: round(avgKm, 2) };
  });

  const meta = {
    as_of: asOf, window: 'estimated per month', simulated: true, city, tier,
    capacity_orders_per_month: CAPACITY, investment_lakh: T.invest, fixed_cost_lakh_month: T.fixed, contribution_margin: MARGIN_CONTRIB,
    payback_target_months: PAYBACK_TARGET, far_travel_km: FAR_TRAVEL_KM, store_aov_inr: T.aov,
  };
  return {
    flows: {
      meta,
      stores: stores.map(s => ({ id: s.id, area: s.area, lat: s.lat, lng: s.lng, pin: s.pin, load_per_month: round(storeLoad[s.id]), capacity_per_month: CAPACITY, utilisation_pct: round((100 * storeLoad[s.id]) / CAPACITY) })),
      baseline, pins: pinsToday, candidates,
    },
    potential, catchment,
  };
}
