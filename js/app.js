// app.js — the expansion team's operating screen. All decisions come from engine.js.
import { parseWorkbook } from './parse.js';
import { filesToSheets, ACCEPTED_FORMATS } from './ingest.js';
import { run, DEFAULTS, ECON, MARGIN, WEIGHTS, PART_LABEL, MILESTONES, lakh, fmtDate, poolAt, pinProxy, CATEGORIES, siteInsight, TRAFFIC, trafficSummary, milestones as planMilestones } from './engine.js';
import { sampleSheets } from './sample.js';
import { ask, esc, explain, nextSteps, nurtureAdvice, DECISION_LABEL, insights, suggestionsFor } from './ask.js';
import { pinPoint, refinePins, cityInfo, cityForPin, stateForPin, pinPlace, fetchPlaces } from './geo.js';
import { Map3D } from './map3d.js';
import { Flow } from './flow.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const r1 = n => Math.round(n * 10) / 10;
const DEC = ['approved', 'conditional', 'hold', 'waitlist', 'declined'];
const DEC_LEG = { approved: 'Approve', conditional: 'With conditions', hold: 'Hold', waitlist: 'Waitlist', declined: 'Decline' };
const DEC_SHORT = { approved: 'Suggest: approve', conditional: 'Suggest: approve with conditions', hold: 'Suggest: hold', waitlist: 'Suggest: waitlist', declined: 'Suggest: decline' };
const FINAL = { approved: 'Approved', conditional: 'Approved with conditions', hold: 'On hold', waitlist: 'Waitlisted', declined: 'Declined' };
const BUCKET = { ready: 'Suggested yes', nurture: 'Keep warm', unqualified: 'Suggested no' };
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
let colorCache = {};
const colr = v => (colorCache[v] ||= css(v));
const flowDots = new Map();
let flow = null;

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } },
};

const S = {
  data: null, settings: { ...DEFAULTS, minInvest: { ...DEFAULTS.minInvest } }, result: null,
  history: [], source: '', tab: 'overview',
  feed: { bucket: 'ready', sub: 'all', q: '', sort: 'priority', limit: 40, where: {} },
  trail: [], page: 'overview',
  progress: store.get('storesense.progress', {}), openId: null,
  log: store.get('storesense.log', []), notes: store.get('storesense.notes', []), inquiries: store.get('storesense.inquiries', []),
  decisions: store.get('storesense.decisions', {}), reviewer: store.get('storesense.reviewer', ''),
};

// ---------------- data in ----------------
function load(sheets, source, quiet, notes = []) {
  const data = parseWorkbook(sheets);
  data.report.assumptions.unshift(...notes);
  for (const q of S.inquiries) if (!data.applications.some(a => a.id === q.id)) data.applications.push({ ...q });
  if (!data.applications.length) {
    toast('No applications found in this file. Check that one sheet lists applicants with a name or ID and a city or pin code.');
    return;
  }
  // A file with applicants only (e.g. one CSV of new leads) keeps the territory plan already loaded.
  if (!data.territories.length && S.data?.territories?.length) {
    data.territories = S.data.territories;
    data.report.assumptions.push(`No territories in this upload: kept the ${S.data.territories.length} territories from ${S.source}.`);
  }
  if (!data.territories.length) data.report.assumptions.push('No territories sheet found: nobody can be given a spot until territories are added, so strong applicants go on the waitlist.');
  S.data = data; S.source = source; S.history = [];
  if (S.result) startConvo();
  recompute();
  if (!quiet) {
    toast(`${data.applications.length} applications loaded`, 'How we read it', () => openReport());
    logActivity('upload', `Loaded ${source}`, `${data.applications.length} applications · ${data.territories.length} territories · ${data.stores.length} stores`, 'overview');
  }
}

function recompute() {
  S.result = run(S.data, S.settings);
  renderAll();
  loadPlaces();
}
// Fetch locality names for every pin in the file, then redraw once they arrive
function loadPlaces() {
  const r = S.result;
  const pins = [...r.territories.flatMap(t => t.pins.slice(0, 120)), ...r.stores.map(s => s.pin), ...r.apps.map(a => a.assignedPin || a.pin)].filter(Boolean);
  fetchPlaces(pins, got => {
    if (!got) return;
    renderTab(S.tab);
    if (S.openId) openDrawer(S.openId, true);
  });
}

// Any format, one or several files at once (e.g. applicants + territories); see ingest.js.
$('#file').addEventListener('change', async e => {
  const picked = [...e.target.files];
  e.target.value = '';
  if (!picked.length) return;
  try {
    const files = await Promise.all(picked.map(async f => ({ name: f.name, data: await f.arrayBuffer() })));
    const { sheets, notes, label } = await filesToSheets(files, globalThis.XLSX);
    load(sheets, label, false, notes);
  } catch (err) {
    toast(err?.message || `Could not read the file. Please upload ${ACCEPTED_FORMATS}.`);
  }
});
$('#btn-sample').addEventListener('click', () => load(sampleSheets(), 'Sample data'));
$('#btn-template').addEventListener('click', () => {
  const wb = XLSX.utils.book_new();
  for (const [n, rows] of Object.entries(sampleSheets())) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), n);
  XLSX.writeFile(wb, 'StoreSense_sample_Case1_format.xlsx');
});

// ---------------- tabs ----------------
$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('button[data-tab]');
  if (b) go(b.dataset.tab);
});
const PAGES = {
  overview: ['Today', 'Home', 'How every application is doing.'],
  log: ['Records', 'Activity log', 'Every search, question, enquiry and change, newest first.'],
  feed: ['Your list', 'To-do', 'Suggestions waiting for your decision.'],
  territories: ['Where we grow', 'Territories', 'Areas where we want new stores.'],
  map: ['Where we grow', 'Map', 'Stores, applicants and demand.'],
  onboarding: ['New stores', 'Openings', 'Steps to open each new store. Drag a card to move it.'],
  ask: ['Help', 'Ask', 'Ask a question in plain words.'],
  rules: ['How it works', 'Rules', 'How every suggestion is made. A person makes the final call.'],
};
function showTab(t) {
  S.tab = t;
  hover();
  const [eb, title, sub] = PAGES[t];
  $('#page-eyebrow').textContent = eb; $('#page-title').textContent = title; $('#page-sub').textContent = sub;
  window.scrollTo(0, 0);
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  $$('.view').forEach(v => v.classList.toggle('on', v.id === `view-${t}`));
  renderTab(t);
}

function renderAll() {
  const res = S.result;
  $('#source').textContent = `${S.source} · ${res.apps.length} applications · ${res.territories.length} territories · ${res.stores.length} stores`;
  $('#source').title = $('#source').textContent;
  const ready = res.apps.filter(a => a.bucket === 'ready' && !S.decisions[a.id]).length;
  const tb = $('#tabs [data-tab=feed]');
  (tb.querySelector('.count') || tb.appendChild(Object.assign(document.createElement('span'), { className: 'count' }))).textContent = ready;
  renderFoot();
  ovBuilt = false;
  renderTab(S.tab);
  if (S.openId) openDrawer(S.openId, true);
}
function renderTab(t) {
  ({ overview: renderOverview, feed: renderFeed, territories: renderTerritories, map: renderMap, onboarding: renderOnboarding, ask: renderAsk, rules: renderRules, log: renderLog })[t]();
  $('#fab')?.classList.toggle('hide', t === 'ask' || $('#assist')?.classList.contains('on'));
  if ($('#assist')?.classList.contains('on')) drawSuggestions();
  if (t !== 'overview') countUp($(`#view-${t}`));
  reveal($(`#view-${t}`));
}

function renderFoot() {
  const res = S.result;
  const to = ['territories', 'feed?bucket=unqualified&sub=pin-conflict', 'territories', 'feed?bucket=ready'];
  $('#foot').innerHTML = res.checks.map((c, i) => `<a class="${c.ok ? 'ok' : 'bad'} lnk" data-go="${to[i]}">${esc(c.text)}</a>`).join('') +
    `<a class="lnk" data-go="rules">Decided ${fmtDate(res.asOf)}</a>`;
}

// ---------------- shared page parts ----------------
// Summary band: clickable numbers that double as filters
function strip(items, active) {
  return `<div class="kpis strip">${items.map(i => `<button class="kpi ${i.key && i.key === active ? 'on' : ''}" data-k="${i.key ?? ''}"${i.key ? '' : ' disabled'}>
    <div class="l">${i.dot ? `<i class="dot" style="background:${i.dot}"></i>` : ''}${i.l}</div><div class="v">${i.v}</div>${i.s ? `<div class="small muted">${i.s}</div>` : ''}</button>`).join('')}</div>`;
}
const empty = t => `<div class="empty">${t}</div>`;

// ---------------- overview ----------------
let ovBuilt = false;
function renderOverview() {
  const v = $('#view-overview');
  if (!ovBuilt) {
    v.innerHTML = `
      ${welcomeHtml()}
      <div id="ov-banner"></div>
      <div class="card hero">
        <div class="card-h"><h2>Every application, sorted</h2><span class="muted">Each dot is one person · hover or click · move a slider to watch them move</span></div>
        <canvas id="flow" class="flow" aria-label="Applicants grouped by outcome"></canvas>
      </div>
      <div class="kpis" id="ov-kpis"></div>
      <div class="grid g-main">
        <div class="card">
          <div class="card-h"><h2>Where everyone is</h2><span class="muted" id="ov-total"></span></div>
          <div class="stack" id="ov-stack"></div>
          <div class="legend" id="ov-legend"></div>
          <div class="stages" id="ov-stages"></div>
        </div>
        <div class="card"><div class="card-h"><h2>Do this today</h2><span class="muted" id="ov-act-n"></span></div><div class="actions" id="ov-actions"></div></div>
      </div>
      <div class="card rules-card" id="rules-card">
        <div class="card-h"><div><h2>Try different rules</h2><p class="small muted" style="margin:4px 0 0">Move a slider or pick a preset. Everything on the page updates at once.</p></div>
          <div class="tools"><div class="seg-ctl" id="presets"><button data-p="strict">Strict</button><button data-p="balanced">Balanced</button><button data-p="growth">Growth</button></div><button class="btn sm ghost" id="sl-reset">Reset</button></div></div>
        <div class="impact" id="rules-impact"></div>
        <div class="rule-groups" id="ov-sliders"></div>
      </div>
      <div class="grid g-2">
        <div class="card"><div class="card-h"><h2>Find more partners here</h2><span class="muted">Empty spots</span></div><div id="ov-gaps"></div></div>
        <div class="card"><div class="card-h"><h2>Insights</h2><span class="muted">From your data</span></div><ul class="insights" id="ov-insights"></ul></div>
      </div>
      <div class="card" style="margin-top:16px"><div class="card-h"><h2>Traffic insights</h2><span class="muted">Estimated visitors a day at suggested-yes sites</span></div><div id="ov-traffic"></div></div>
      <div class="grid g-2" style="margin-top:16px">
        <div class="card"><div class="card-h"><h2>Money people can invest</h2><span class="muted">₹ lakh · by city size</span></div><div class="chart" id="ov-capital"></div><div id="ov-capital-note" class="small muted"></div></div>
        <div class="card"><div class="card-h"><h2>Years running a shop</h2><span class="muted">All applicants</span></div><div class="chart" id="ov-exp"></div><div id="ov-exp-note" class="small muted"></div></div>
      </div>`;
    buildSliders();
    flow = new Flow($('#flow'), {
      dots: flowDots, color: colr,
      onHover: (d, e) => tip(e, d ? `<b>${esc(d.name)}</b> · ${esc(d.id)}<br>${esc(DEC_SHORT[d.decision])}` : null),
      onClick: id => openDrawer(id),
    });
    $('#sl-reset').onclick = () => applyPreset('balanced', 'Reset to default rules');
    $$('#presets button').forEach(b => b.onclick = () => applyPreset(b.dataset.p));
    bindWelcome();
    ovBuilt = true;
  }
  updateOverview();
}

// Each control: what it changes, in plain words, and how many people it affects
const RULES_UI = [
  { g: 'Money', k: 't1', label: 'Big city minimum', min: 10, max: 80, step: 1, get: s => s.minInvest[1], set: (s, v) => { s.minInvest = { ...s.minInvest, 1: v }; }, fmt: v => `₹${v}L`, help: 'Least money a partner needs in a Tier 1 city.' },
  { g: 'Money', k: 't2', label: 'Mid city minimum', min: 5, max: 60, step: 1, get: s => s.minInvest[2], set: (s, v) => { s.minInvest = { ...s.minInvest, 2: v }; }, fmt: v => `₹${v}L`, help: 'Least money for a Tier 2 city.' },
  { g: 'Money', k: 't3', label: 'Small town minimum', min: 5, max: 40, step: 1, get: s => s.minInvest[3], set: (s, v) => { s.minInvest = { ...s.minInvest, 3: v }; }, fmt: v => `₹${v}L`, help: 'Least money for a Tier 3 town.' },
  { g: 'Money', k: 'tol', label: 'Say yes with a money to-do from', min: 50, max: 100, step: 5, get: s => Math.round(s.fundTolerance * 100), set: (s, v) => { s.fundTolerance = v / 100; }, fmt: v => `${v}%`, help: 'If they have at least this share of the money, they can still be approved — with a deadline to close the gap.' },
  { g: 'Money', k: 'pb', label: 'Earn back money within', min: 12, max: 48, step: 1, get: s => s.maxPayback, set: (s, v) => { s.maxPayback = v; }, fmt: v => `${v} months`, help: 'A store that takes longer to earn back its cost is never approved.' },
  { g: 'Partner', k: 'bar', label: 'Lowest partner score', min: 30, max: 85, step: 1, get: s => s.partnerBar, set: (s, v) => { s.partnerBar = v; }, fmt: v => `${v} / 100`, help: 'Below this, the application is declined.' },
  { g: 'Partner', k: 'exp', label: 'Shop experience needed', min: 0, max: 8, step: 0.5, get: s => s.minExp, set: (s, v) => { s.minExp = v; }, fmt: v => `${v} yr`, help: 'Below this, they need a much higher score and must hire a store manager.' },
  { g: 'Location', k: 'km', label: 'Space between stores', min: 0.5, max: 5, step: 0.5, get: s => s.overlapKm, set: (s, v) => { s.overlapKm = v; }, fmt: v => `${v} km`, help: 'Closer than this to one of our stores means a site visit is needed first.' },
  { g: 'Location', k: 'demo', label: 'Fewest households allowed', min: 0, max: 0.8, step: 0.05, get: s => s.minDemographic, set: (s, v) => { s.minDemographic = v; }, fmt: v => `${Math.round(v * 100)}%`, help: 'Pins with fewer households than this are not given a spot.' },
];
const PRESETS = {
  strict: { label: 'Strict', minInvest: { 1: 45, 2: 32, 3: 20 }, minExp: 2, partnerBar: 65, maxPayback: 24, overlapKm: 3, minDemographic: 0.45, fundTolerance: 0.95 },
  balanced: { label: 'Balanced', ...DEFAULTS },
  growth: { label: 'Growth', minInvest: { 1: 28, 2: 20, 3: 12 }, minExp: 0, partnerBar: 50, maxPayback: 36, overlapKm: 1.5, minDemographic: 0.3, fundTolerance: 0.75 },
};
function applyPreset(p, label) {
  const keep = { category: S.settings.category || DEFAULTS.category };
  S.settings = { ...DEFAULTS, ...PRESETS[p], ...keep, minInvest: { ...(PRESETS[p].minInvest || DEFAULTS.minInvest) } };
  delete S.settings.label;
  buildSliders();
  S.result = run(S.data, S.settings); renderFoot(); updateOverview();
  logActivity('rules', label || `Used the ${PRESETS[p].label} rules`, `${S.result.apps.filter(a => a.bucket === 'ready').length} ready to call`, 'overview');
}
function buildSliders() {
  const s = S.settings;
  const groups = [...new Set(RULES_UI.map(r => r.g))];
  $('#ov-sliders').innerHTML = groups.map(g => `<div class="rg"><h3>${g}</h3>${RULES_UI.filter(r => r.g === g).map(r => `
    <div class="slider" data-k="${r.k}"><label for="sl-${r.k}"><span>${r.label} <i class="hint" tabindex="0" title="${esc(r.help)}" aria-label="${esc(r.help)}">?</i></span><b id="slv-${r.k}">${r.fmt(r.get(s))}</b></label>
    <input type="range" id="sl-${r.k}" min="${r.min}" max="${r.max}" step="${r.step}" value="${r.get(s)}" aria-describedby="slp-${r.k}"><div class="pool" id="slp-${r.k}"></div></div>`).join('')}
    ${g === 'Partner' ? `<div class="slider"><label for="sl-cat"><span>Business type <i class="hint" tabindex="0" title="Applicants who ran this kind of business score highest on relevance.">?</i></span></label>
      <select class="input" id="sl-cat">${Object.entries(CATEGORIES).map(([k, c]) => `<option value="${k}" ${k === (s.category || 'retail') ? 'selected' : ''}>${c.label}</option>`).join('')}</select></div>` : ''}</div>`).join('');
  let t;
  RULES_UI.forEach(r => {
    const inp = $(`#sl-${r.k}`);
    inp.addEventListener('input', () => {
      r.set(S.settings, +inp.value);
      $(`#slv-${r.k}`).textContent = r.fmt(+inp.value);
      const box = inp.closest('.slider'); box.classList.add('moving'); clearTimeout(box.t); box.t = setTimeout(() => box.classList.remove('moving'), 250);
      clearTimeout(t); t = setTimeout(() => { S.result = run(S.data, S.settings); renderFoot(); updateOverview(); }, 40);
    });
    inp.addEventListener('change', () => logActivity('rules', `${r.label}: ${r.fmt(+inp.value)}`, `${S.result.apps.filter(a => a.bucket === 'ready').length} ready to call`, 'overview'));
  });
  $('#sl-cat').onchange = e => { S.settings.category = e.target.value; S.result = run(S.data, S.settings); renderFoot(); updateOverview(); logActivity('rules', `Business type: ${CATEGORIES[e.target.value].label}`, '', 'overview'); };
  $$('#presets button').forEach(b => b.classList.toggle('on', Object.entries(PRESETS[b.dataset.p]).every(([k, v]) => k === 'label' || JSON.stringify(S.settings[k]) === JSON.stringify(v))));
}
// The same file run with the default rules, for "what changed" comparisons
function baseline() {
  if (S._baseFor !== S.data) { S._base = run(S.data, { ...DEFAULTS, minInvest: { ...DEFAULTS.minInvest } }); S._baseFor = S.data; }
  return S._base;
}
function updateRules() {
  const res = S.result, s = S.settings, st = res.stats, apps = res.apps;
  const live = apps.filter(a => !a.withdrawn && !a.duplicateOf);
  const pool = {
    t1: () => { const p = poolAt(apps, 1, s.minInvest[1], 0), q = st.investByTier[1]; return q ? `<a class="lnk" data-go="feed?tier=1"><b>${p.meet} of ${p.of}</b></a> big-city applicants have this · most offer about ${lakh(q.median)}` : 'No big-city applicants'; },
    t2: () => { const p = poolAt(apps, 2, s.minInvest[2], 0), q = st.investByTier[2]; return q ? `<a class="lnk" data-go="feed?tier=2"><b>${p.meet} of ${p.of}</b></a> have this · most offer about ${lakh(q.median)}` : 'No mid-city applicants'; },
    t3: () => { const p = poolAt(apps, 3, s.minInvest[3], 0), q = st.investByTier[3]; return q ? `<a class="lnk" data-go="feed?tier=3"><b>${p.meet} of ${p.of}</b></a> have this · most offer about ${lakh(q.median)}` : 'No small-town applicants'; },
    tol: () => { const n = live.filter(a => a.decision !== 'hold' && a.coverage >= s.fundTolerance && a.coverage < 1).length; return `<b>${n}</b> people are short on money but within this`; },
    pb: () => `<b>${live.filter(a => isFinite(a.payback) && a.payback <= s.maxPayback && a.decision !== 'hold').length}</b> stores would earn back in time`,
    bar: () => `<b>${live.filter(a => a.partner >= s.partnerBar && a.decision !== 'hold').length}</b> people pass · most score about ${r1(median(live.filter(a => a.decision !== 'hold').map(a => a.partner)))}`,
    exp: () => { const p = poolAt(apps, null, 0, s.minExp); return `<a class="lnk" data-go="feed?exp=0"><b>${p.meet} of ${p.of}</b></a> have this · most have about ${r1(st.exp?.median ?? 0)} yrs`; },
    km: () => `<b>${live.filter(a => a.overlap).length}</b> applicants are this close to a store`,
    demo: () => `<b>${live.filter(a => a.demographic != null && a.demographic < s.minDemographic && a.decision !== 'hold').length}</b> pins fall below this`,
  };
  RULES_UI.forEach(r => { const el = $(`#slp-${r.k}`); if (el) el.innerHTML = pool[r.k](); });
  // What changed against the default rules
  const base = baseline(), bm = new Map(base.apps.map(a => [a.id, a.decision]));
  const changed = apps.filter(a => bm.get(a.id) !== a.decision);
  S.changed = { ids: new Set(changed.map(a => a.id)), label: 'Changed by your rules' };
  const delta = DEC.map(d => [d, apps.filter(a => a.decision === d).length - base.apps.filter(a => a.decision === d).length]).filter(([, n]) => n);
  $('#rules-impact').innerHTML = changed.length
    ? `<span>Compared with the default rules:</span>${delta.map(([d, n]) => `<a class="delta lnk" data-go="feed?dec=${d}"><i class="dot" style="background:var(--d-${d})"></i>${DEC_LEG[d]} <b>${n > 0 ? '+' : ''}${n}</b></a>`).join('')}<a class="btn sm" data-go="feed?changed=1">See the ${changed.length} ${changed.length === 1 ? 'person' : 'people'} who changed</a>`
    : '<span>These are the default rules. Move any slider to see who would change.</span>';
  $$('#presets button').forEach(b => b.classList.toggle('on', Object.entries(PRESETS[b.dataset.p]).every(([k, v]) => k === 'label' || JSON.stringify(S.settings[k]) === JSON.stringify(v))));
  // Insights
  $('#ov-insights').innerHTML = insights(res).map(i => `<li><a class="lnk" data-go="${i.go}">${esc(i.text)}</a></li>`).join('');
  $('#ov-traffic').innerHTML = trafficCard(res);
}
function trafficCard(res) {
  const tr = trafficSummary(res);
  if (!tr.sites.length) return empty('No suggested-yes sites to estimate traffic for.');
  const max = tr.busiest[0].t.visitors;
  const row = ({ a, t }) => `<a class="tr-row lnk" data-go="app/${a.id}" title="${esc(`${a.name}: about ${t.visitors} visitors and ${t.buyers} buyers a day; break-even needs ${t.breakEven}`)}"><span class="tr-n"><b>${esc(a.name)}</b><span class="muted">${a.id} · pin ${a.pin}${pinPlace(a.pin) ? ` · ${esc(pinPlace(a.pin).name)}` : ''}</span></span><span class="tr-bar"><i style="width:${Math.round(100 * t.visitors / max)}%"></i><s style="left:${Math.min(100, Math.round(100 * t.breakEven / max))}%" title="Break-even"></s></span><span class="tr-v"><b>${t.visitors}</b>/day<span class="${t.cushion < 1.5 ? 'warn-txt' : 'muted'}">${t.cushion.toFixed(1)}×</span></span></a>`;
  return `<div class="tr-kpis">
      <div><span class="muted small">All suggested sites</span><b>${tr.total.toLocaleString('en-IN')}</b><span class="small muted">visitors a day once settled</span></div>
      <div><span class="muted small">Buyers</span><b>${tr.buyers.toLocaleString('en-IN')}</b><span class="small muted">a day · ${Math.round(100 * TRAFFIC.conversion)}% of visitors</span></div>
      <div><span class="muted small">Thin margin</span><b>${tr.thin.length}</b><span class="small muted">under 1.5× break-even traffic</span></div>
      <div><span class="muted small">Our stores sharing visitors</span><b>${tr.stores.length}</b><span class="small muted">${tr.stores[0] ? `most: ${tr.stores[0].id}, about ${tr.stores[0].lost}/day` : 'none close enough'}</span></div>
    </div>
    <div class="grid g-2 tr-cols">
      <div><h3 class="small-h">Busiest</h3>${tr.busiest.slice(0, 5).map(row).join('')}</div>
      <div><h3 class="small-h">${tr.thin.length ? 'Thinnest margin' : 'Quietest'}</h3>${(tr.thin.length ? tr.thin : [...tr.busiest].reverse()).slice(0, 5).map(row).join('')}</div>
    </div>
    ${tr.stores.length ? `<p class="small">Could lose visitors: ${tr.stores.slice(0, 4).map(e => `<a class="lnk" data-go="map?store=${e.id}">${e.id}</a> about ${e.lost}/day to ${e.by.map(a => `<a class="lnk" data-go="app/${a.id}">${a.id}</a>`).join(', ')}`).join(' · ')}</p>` : ''}
    <p class="small muted">Bar = visitors a day; the line marks break-even. Estimated from each site's sales, average bill and nearby shops — the file has no footfall counts. Open a person for the full breakdown.</p>`;
}
function median(v) { const a = v.filter(x => x != null && isFinite(x)).sort((x, y) => x - y); if (!a.length) return 0; const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; }

function updateOverview() {
  const res = S.result, f = res.funnel, s = S.settings;
  flow?.setData(res.apps);
  $('#ov-banner').innerHTML = '';
  const n = k => f.outcome.find(o => o.key === k).n;
  const ready = n('approved') + n('conditional');
  $('#ov-kpis').innerHTML = [
    ['ready', 'Suggested yes', ready, `${n('approved')} approve · ${n('conditional')} with conditions`, 'var(--d-approved)'],
    ['human:pending', 'Awaiting your decision', res.apps.filter(a => !S.decisions[a.id] && !a.withdrawn).length, `${Object.keys(S.decisions).length} decided · ${res.apps.filter(a => humanYes(a)).length} approved by you`, 'var(--accent)'],
    ['nurture:hold', 'On hold', n('hold'), 'Need more info', 'var(--d-hold)'],
    ['nurture:waitlist', 'Waitlist', n('waitlist'), 'Good, but no spot yet', 'var(--d-waitlist)'],
    ['unqualified', 'Declined', n('declined'), `${res.apps.filter(a => a.sub === 'pin-conflict').length} where we already have a store`, 'var(--d-declined)'],
    ['territories', 'Spots left', res.territories.reduce((t, x) => t + Math.max(0, x.open), 0), `out of ${res.territories.reduce((t, x) => t + x.slots, 0)}`, 'var(--muted)'],
  ].map(([go, l, v, sub, c]) => `<button class="kpi" data-go="${go}"><div class="l"><i class="dot" style="background:${c}"></i>${l}</div><div class="v" data-count="${v}">${v}</div><div class="small muted">${sub}</div></button>`).join('');
  $$('#ov-kpis .kpi').forEach(b => b.onclick = () => goFeed(b.dataset.go));
  countUp($('#ov-kpis'));

  // Unified stacked funnel (segments are reused so widths animate)
  $('#ov-total').textContent = `${f.total} applications · click a colour`;
  const stack = $('#ov-stack');
  if (!stack.children.length) stack.innerHTML = DEC.map(d => `<div class="seg" data-d="${d}" style="background:var(--d-${d});flex-grow:0"></div>`).join('');
  for (const seg of stack.children) {
    const k = seg.dataset.d, v = n(k);
    seg.style.flexGrow = v; seg.textContent = v / f.total > 0.05 ? v : '';
    seg.title = `${DEC_SHORT[k]}: ${v}`;
    seg.onclick = () => goFeed(k === 'approved' || k === 'conditional' ? 'ready' : k === 'declined' ? 'unqualified' : `nurture:${k}`);
  }
  $('#ov-legend').innerHTML = DEC.map(d => `<a class="lnk" data-go="feed?dec=${d}"><i class="dot" style="background:var(--d-${d})"></i>${DEC_LEG[d]} <b>${n(d)}</b></a>`).join('');
  const stages = $('#ov-stages');
  if (!stages.children.length) stages.innerHTML = f.stages.map(st => `<div class="stage clickable" data-k="${st.key}" data-go="${st.key === 'received' ? 'feed?bucket=ready' : st.key === 'won' ? 'feed?bucket=ready' : `feed?stage=${st.key}`}" title="${st.key === 'won' || st.key === 'received' ? 'See who got a spot' : 'See who stopped at this step'}"><div>${st.label}</div><div class="bar"><i ${st.key === 'won' ? 'class="won"' : ''}></i></div><div class="n"></div><div class="drop"></div></div>`).join('');
  f.stages.forEach((st, i) => {
    const el = stages.children[i];
    el.firstElementChild.textContent = st.label;
    el.querySelector('.n').textContent = st.n;
    const bar = el.querySelector('i');
    bar.style.width = `${(st.n / f.total) * 100}%`;
    if (st.key === 'won') bar.innerHTML = `<em style="flex-grow:${n('approved')};background:var(--d-approved)" title="Outright ${n('approved')}"></em><em style="flex-grow:${n('conditional')};background:var(--d-conditional)" title="With conditions ${n('conditional')}"></em>`;
    el.querySelector('.drop').textContent = st.key === 'won' ? `${n('approved')} approved · ${n('conditional')} with conditions` : st.out ? `${st.out} ${st.outLabel}` : '';
  });

  updateRules();
  updateWelcome();

  // actions
  const acts = res.actions;
  const doneToday = store.get('storesense.today', {});
  const key = a => a.x ? `${a.kind}:${a.x.id}` : `${a.kind}:${a.t.id}`;
  const top = acts.slice(0, 8);
  $('#ov-act-n').textContent = `${top.filter(a => doneToday[key(a)]).length} of ${top.length} done`;
  $('#ov-actions').innerHTML = top.map((a, i) => {
    const icon = { call: 'i-phone', info: 'i-mail', redirect: 'i-arrow', leads: 'i-target' }[a.kind];
    const tag = a.x ? `<span class="pill d-${a.x.decision}">${a.x.id}</span>` : `<span class="tag prio">${a.t.id}</span>`;
    return `<div class="action ${doneToday[key(a)] ? 'done' : ''}" data-i="${i}"><div class="i"><svg><use href="#${icon}"/></svg></div><div><div class="t">${esc(a.title)}</div><div class="w">${esc(a.why)}</div></div>${tag}<button class="check" title="Mark done" aria-label="Mark done">✓</button></div>`;
  }).join('') || empty('Nothing to do today.');
  $$('#ov-actions .action').forEach(el => {
    const a = top[+el.dataset.i];
    el.onclick = () => a.x ? openDrawer(a.x.id) : go(`territories/${a.t.id}`);
    el.querySelector('.check').onclick = e => {
      e.stopPropagation();
      doneToday[key(a)] = !doneToday[key(a)]; store.set('storesense.today', doneToday);
      el.classList.toggle('done', doneToday[key(a)]);
      $('#ov-act-n').textContent = `${top.filter(x => doneToday[key(x)]).length} of ${top.length} done`;
      if (top.every(x => doneToday[key(x)])) { confetti(); toast('All done for today!'); }
    };
  });

  // gaps
  const gaps = res.territories.filter(t => t.open > 0).sort((a, b) => ({ High: 0, Medium: 1, Low: 2 }[a.priority] - { High: 0, Medium: 1, Low: 2 }[b.priority]) || b.open - a.open);
  $('#ov-gaps').innerHTML = gaps.length ? `<table class="t"><tr><th>Territory</th><th>How keen</th><th class="num">Empty</th><th>Status</th></tr>${gaps.map(t => `<tr class="clickable" data-go="territories/${t.id}"><td><b>${t.id}</b> ${esc(t.city)}</td><td>${t.priority}</td><td class="num">${t.open} of ${t.slots}</td><td>${t.needsLeads ? '<span class="tag bad">No one applied</span>' : `<span class="tag">${t.qualified} on waitlist</span>`}</td></tr>`).join('')}</table>`
    : empty('Every spot is taken.');

  drawCapital(); drawExp();
}

function goFeed(t) {
  const [b, sub] = t.split(':');
  if (b === 'human') return go(`feed?human=${sub}`);
  if (b === 'territories') return go('territories');
  go(`feed?bucket=${b}${sub ? `&sub=${sub}` : ''}`);
}

// ---------- charts ----------
let tipEl;
function tip(e, html) {
  tipEl ||= Object.assign(document.body.appendChild(document.createElement('div')), { className: 'tip' });
  if (!html) { tipEl.classList.remove('on'); return; }
  tipEl.innerHTML = html; tipEl.classList.add('on');
  const x = Math.min(e.clientX + 12, innerWidth - tipEl.offsetWidth - 8), y = Math.min(e.clientY + 12, innerHeight - tipEl.offsetHeight - 8);
  tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
}
function bindTips(root) {
  $$('[data-tip]', root).forEach(el => {
    el.addEventListener('mousemove', e => tip(e, el.dataset.tip));
    el.addEventListener('mouseleave', e => tip(e, null));
    if (el.dataset.app) el.addEventListener('click', () => openDrawer(el.dataset.app));
  });
}

function drawCapital() {
  const res = S.result, W = 600, rowH = 62, padL = 76, padR = 16, top = 8;
  const apps = res.apps.filter(a => a.invest != null && !a.withdrawn && !a.duplicateOf);
  const max = Math.min(120, Math.max(60, ...apps.map(a => a.invest)));
  const x = v => padL + (Math.min(v, max) / max) * (W - padL - padR);
  const H = top + rowH * 3 + 24;
  let g = '';
  for (let v = 0; v <= max; v += 20) g += `<line class="ax" x1="${x(v)}" x2="${x(v)}" y1="${top}" y2="${H - 22}" stroke-dasharray="2 3"/><text x="${x(v)}" y="${H - 6}" text-anchor="middle">${v}${v === max && max < Math.max(...apps.map(a => a.invest)) ? '+' : ''}</text>`;
  [1, 2, 3].forEach((t, i) => {
    const y0 = top + i * rowH, cy = y0 + rowH / 2;
    const q = res.stats.investByTier[t], need = res.stats.neededByTier[t];
    g += `<text x="0" y="${cy + 4}" class="lbl clickable" data-go="feed?tier=${t}">${['', 'Big city', 'Mid city', 'Small town'][t]}</text>`;
    if (!q) return;
    g += `<line x1="${x(q.min)}" x2="${x(q.max)}" y1="${cy}" y2="${cy}" stroke="${css('--text-2')}" stroke-width="1"/>`;
    g += `<rect x="${x(q.p25)}" y="${cy - 9}" width="${Math.max(2, x(q.p75) - x(q.p25))}" height="18" rx="4" fill="${css('--accent')}" opacity=".18" stroke="${css('--accent')}"/>`;
    g += `<line x1="${x(q.median)}" x2="${x(q.median)}" y1="${cy - 11}" y2="${cy + 11}" stroke="${css('--accent')}" stroke-width="2"/>`;
    apps.filter(a => a.tier === t).forEach(a => {
      const jy = cy + ((parseInt(a.id.replace(/\D/g, '')) * 37) % 22) - 11;
      g += `<circle cx="${x(a.invest)}" cy="${jy}" r="4" fill="var(--d-${a.decision})" stroke="${css('--surface')}" stroke-width="1.5" data-app="${a.id}" data-tip="<b>${esc(a.id)}</b> ${esc(a.name)}<br>Offers ${lakh(a.invest)} · needs ${lakh(a.needed)}<br>${DEC_SHORT[a.decision]}" style="cursor:pointer"/>`;
    });
    const minV = S.settings.minInvest[t];
    g += `<line x1="${x(minV)}" x2="${x(minV)}" y1="${y0 + 4}" y2="${y0 + rowH - 4}" stroke="${css('--d-declined')}" stroke-width="2" stroke-dasharray="4 3"/>`;
    if (need) g += `<text x="${x(minV) + 4}" y="${y0 + 12}" style="fill:var(--d-declined);font-size:10px">₹${minV}L</text>`;
  });
  $('#ov-capital').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Investment capacity by city tier">${g}</svg>`;
  bindTips($('#ov-capital'));
  const m = t => res.stats.investByTier[t]?.median, nd = t => res.stats.neededByTier[t]?.median;
  $('#ov-capital-note').innerHTML = `Each dot is a person. Red line is your minimum. Hover a dot to see who.`;
}

function drawExp() {
  const res = S.result, W = 600, H = 200, padL = 28, padB = 24, top = 8;
  const apps = res.apps.filter(a => a.exp != null && !a.withdrawn && !a.duplicateOf);
  const bins = Array.from({ length: 11 }, (_, i) => apps.filter(a => (i === 10 ? a.exp >= 10 : Math.floor(a.exp) === i)));
  const maxN = Math.max(1, ...bins.map(b => b.length));
  const bw = (W - padL) / 11;
  let g = '';
  for (let v = 0; v <= maxN; v += Math.ceil(maxN / 4)) { const y = H - padB - (v / maxN) * (H - padB - top); g += `<line class="ax" x1="${padL}" x2="${W}" y1="${y}" y2="${y}" stroke-dasharray="2 3"/><text x="${padL - 6}" y="${y + 4}" text-anchor="end">${v}</text>`; }
  bins.forEach((b, i) => {
    const h = (b.length / maxN) * (H - padB - top), xx = padL + i * bw + 2;
    const below = i < S.settings.minExp;
    g += `<rect x="${xx}" y="${H - padB - h}" width="${bw - 4}" height="${Math.max(0, h)}" rx="4" fill="${below ? css('--muted') : css('--accent')}" opacity="${below ? .45 : .9}" data-tip="${i === 10 ? '10+' : i} yrs: <b>${b.length}</b> applicants<br>${b.filter(a => a.bucket === 'ready').length} suggested yes<br>Click to see them" data-go="feed?exp=${i}" class="clickable"/>`;
    g += `<text x="${xx + (bw - 4) / 2}" y="${H - 8}" text-anchor="middle">${i === 10 ? '10+' : i}</text>`;
  });
  $('#ov-exp').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Retail experience histogram">${g}</svg>`;
  bindTips($('#ov-exp'));
  const q = res.stats.exp;
  $('#ov-exp-note').innerHTML = q ? `Most have about ${r1(q.median)} years. ${res.apps.filter(a => a.exp === 0).length} have never run a shop. Grey is below your minimum.` : '';
}

// ---------------- feed ----------------
const SUBS = {
  ready: [['all', 'Everyone'], ['approved', 'Approved', 'var(--d-approved)'], ['conditional', 'With conditions', 'var(--d-conditional)'], ['hot', 'Can open fast'], ['compliant', 'Easy to train']],
  nurture: [['all', 'Everyone'], ['hold', 'Need info', 'var(--d-hold)'], ['waitlist', 'Waitlist', 'var(--d-waitlist)'], ['funding', 'Short on money'], ['out-of-territory', 'Outside our areas']],
  unqualified: [['all', 'Everyone'], ['pin-conflict', 'Store already there'], ['score', 'Score too low'], ['funding', 'Too little money'], ['duplicate', 'Applied twice']],
};
const matchSub = (a, k) => k === 'all' || (k === 'hot' ? a.hot : k === 'compliant' ? a.compliant : a.decision === k || a.sub === k);
function feedItems() {
  const f = S.feed, res = S.result;
  const w = Object.entries(f.where || {});
  let xs = w.length ? res.apps.filter(a => w.every(([k, v]) => WHERE[k]?.test(a, v))) : res.apps.filter(a => a.bucket === f.bucket && matchSub(a, f.sub));
  if (f.human && f.human !== 'all' && !f.where.human) xs = xs.filter(a => WHERE.human.test(a, f.human));
  if (f.q) { const q = f.q.toLowerCase(); xs = xs.filter(a => `${a.id} ${a.name} ${a.cityName} ${a.pin} ${a.territory?.id || ''} ${a.business}`.toLowerCase().includes(q)); }
  const prio = a => (a.territory && a.territory.open >= 0 ? { High: 30, Medium: 15, Low: 0 }[a.territory.priority] : 0) + (a.compliant ? 15 : 0) + a.momentum * 0.4 + a.combined * 0.3 + (a.decision === 'approved' ? 10 : 0);
  const key = { priority: prio, momentum: a => a.momentum * 10 + a.combined / 10, readiness: a => a.partner, combined: a => a.combined }[f.sort];
  return xs.sort((a, b) => key(b) - key(a) || a.id.localeCompare(b.id));
}

function renderFeed() {
  const v = $('#view-feed'), f = S.feed, res = S.result;
  const inB = res.apps.filter(a => a.bucket === f.bucket);
  const items = feedItems();
  v.innerHTML = `
    <div class="toolbar">
      <div class="seg-ctl" role="tablist">${Object.entries(BUCKET).map(([k, l]) => `<button data-b="${k}" class="${!Object.keys(f.where).length && f.bucket === k ? 'on' : ''}">${l}<span class="c">${res.apps.filter(a => a.bucket === k).length}</span></button>`).join('')}</div>
    </div>
    ${Object.keys(f.where).length ? `<div class="filters"><span class="muted">Showing</span>${Object.entries(f.where).map(([k, v]) => `<button class="fchip" data-unset="${k}">${esc(WHERE[k].label(v))} <span aria-hidden="true">✕</span></button>`).join('')}<button class="btn sm ghost" id="fclear">Clear</button></div>`
      : strip(SUBS[f.bucket].map(([k, l, dot]) => ({ key: k, l, v: inB.filter(a => matchSub(a, k)).length, dot })), f.sub)}
    <div class="toolbar">
      <input class="input" id="fq" type="search" placeholder="Search name, city or pin  ( / )" value="${esc(f.q)}" aria-label="Search applications">
      <div class="tools">
        <select class="input" id="fs" aria-label="Sort">${[['priority', 'Most important'], ['momentum', 'Fastest to open'], ['readiness', 'Best partner'], ['combined', 'Best overall']].map(([k, l]) => `<option value="${k}" ${f.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <div class="seg-ctl" id="hseg" title="Filter by your decisions">${[['all', 'All'], ['pending', 'Awaiting you'], ['decided', 'Decided']].map(([k, l]) => `<button data-h="${k}" class="${(f.where.human || f.human || 'all') === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <button class="btn" id="bulk" title="Record the suggested decision for everyone listed who has no decision yet">Accept suggestions</button>
        <button class="btn" id="hs-all">Download list</button>
      </div>
    </div>
    <p class="count-line">${items.length} ${items.length === 1 ? 'person' : 'people'} · use ↑ ↓ and Enter</p>
    <div class="rows">${items.slice(0, f.limit).map(rowHtml).join('') || empty('No one here.')}</div>
    ${items.length > f.limit ? `<div class="more"><button class="btn" id="fmore">Show more</button></div>` : ''}`;
  $$('.seg-ctl button', v).forEach(b => b.onclick = () => go(`feed?bucket=${b.dataset.b}`));
  $$('.strip .kpi', v).forEach(b => b.onclick = () => go(`feed?bucket=${f.bucket}&sub=${b.dataset.k}`));
  $$('[data-unset]', v).forEach(b => b.onclick = () => { const w = { ...f.where }; delete w[b.dataset.unset]; go('feed?' + new URLSearchParams(w).toString()); });
  $('#fclear') && ($('#fclear').onclick = () => go(`feed?bucket=${f.bucket}`));
  $('#fq').oninput = e => { f.q = e.target.value; clearTimeout(renderFeed.t); renderFeed.t = setTimeout(() => { renderFeed(); const i = $('#fq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 150); };
  $('#fs').onchange = e => { f.sort = e.target.value; renderFeed(); };
  $('#fmore') && ($('#fmore').onclick = () => { f.limit += 40; renderFeed(); });
  $('#hs-all').onclick = () => exportHubspot(items);
  $$('#hseg button', v).forEach(b => b.onclick = () => { f.human = b.dataset.h; delete f.where.human; f.limit = 40; renderFeed(); });
  const pend = items.filter(a => !S.decisions[a.id] && !a.withdrawn);
  $('#bulk').textContent = `Accept suggestions (${pend.length})`; $('#bulk').disabled = !pend.length;
  $('#bulk').onclick = () => confirmBulk(pend);
  $$('.row', v).forEach(r => {
    r.onclick = () => openDrawer(r.dataset.id);
    r.querySelector('[data-q=msg]').onclick = e => { e.stopPropagation(); openDrawer(r.dataset.id); $('#dr-info').click(); };
    r.querySelector('[data-q=ask]').onclick = e => { e.stopPropagation(); go('ask'); sendAsk(`Why is ${r.dataset.id} ${S.result.apps.find(a => a.id === r.dataset.id).decision === 'hold' ? 'on hold' : 'here'}?`); };
  });
  kb.i = -1;
}

function meter(label, v, max = 100) {
  return `<div class="meter"><span>${label}</span><div class="track"><i style="width:${Math.max(0, Math.min(100, (v / max) * 100))}%"></i></div><b>${Math.round(v)}</b></div>`;
}

function rowHtml(a) {
  const t = a.territory;
  const tags = [
    a.hot && '<a class="tag hot lnk" data-go="feed?tag=hot">Can open fast</a>',
    a.compliant && '<a class="tag ok lnk" data-go="feed?tag=compliant">Easy to train</a>',
    t && t.priority === 'High' && t.open >= 0 && `<a class="tag prio lnk" data-go="territories/${t.id}">Top area</a>`,
    a.timeline?.festivalMiss && '<a class="tag lnk" data-go="feed?tag=festival">Misses festival</a>',
    a.flags?.length && `<a class="tag lnk" data-go="feed?tag=notes" title="${esc(a.flags.join('\n'))}">${a.flags.length} note${a.flags.length > 1 ? 's' : ''}</a>`,
  ].filter(Boolean).join(' ');
  return `<div class="row" data-id="${esc(a.id)}" tabindex="0">
    ${avatar(a)}
    <div>
      <div class="quick"><button data-q="msg" title="Write a message">Message</button><button data-q="ask" title="Ask why">Why?</button></div>
      <div class="who"><b>${esc(a.name)}</b><span class="id">${esc(a.id)}</span><a class="pill d-${a.decision} lnk" data-go="feed?dec=${a.decision}">${DEC_SHORT[a.decision]}</a>${finalPill(a)}${tags}</div>
      <div class="meta"><a class="lnk" data-go="map?city=${encodeURIComponent(a.cityName)}">${esc(a.cityName)}</a> ${a.pin ? pinLink(a.assignedPin || a.pin) : ''}${t ? ` · <a class="lnk" data-go="territories/${t.id}">${t.id}</a>` : ''} · ${lakh(a.invest)} · <a class="lnk" data-go="feed?exp=${Math.min(10, Math.floor(a.exp ?? 0))}">${a.exp ?? '—'} yrs in shops</a> · ${{ Owned: 'owns a shop', Rented: 'rents a shop', 'Not yet identified': 'no shop yet' }[a.spaceStd]} · open in ${a.launchUsed} mo</div>
      <div class="why">${linkText(a.headline)}</div>
    </div>
    <div class="scores">${a.decision === 'hold' || a.withdrawn ? `<span class="muted">Scores after we get the info</span>` : meter('Partner', a.partner) + meter('Location', a.site) + meter('Speed', a.momentum)}</div>
  </div>`;
}


// The applicant's own answers, word for word, with our reading shown only where we changed it
function answersHtml(a) {
  const rows = a.raw?.length ? a.raw : [
    ['Name', a.name, 'name'], ['City', a.city, 'city'], ['State', a.state, 'state'], ['Pin code', a.pin, 'pin'], ['Investment', a.invest, 'invest'], ['Experience', a.exp, 'exp'],
    ['Current / past business', a.business, 'business'], ['Space available', a.spaceRaw, 'space'], ['Space size', a.size, 'size'], ['Floor', a.floorRaw, 'floor'], ['Target launch', a.launch, 'launch'], ['Language', a.lang, 'lang'], ['Notes', a.notes, 'notes'],
  ].map(([h, v, k]) => ({ h, v: v ?? '', k }));
  const readAs = {
    invest: () => (a.invest == null ? (String(a.raw?.find(x => x.k === 'invest')?.v ?? '').trim() ? 'not readable' : 'missing') : lakh(a.invest)), exp: () => (a.exp == null ? (String(a.raw?.find(x => x.k === 'exp')?.v ?? '').trim() ? 'not readable' : 'missing') : `${a.exp} years`),
    space: () => a.spaceStd, floor: () => a.floorStd, launch: () => `${a.launchUsed} months`, pin: () => a.pin || 'missing',
    combo: () => `${a.cityName}, ${a.stateName}${a.pin ? ' ' + a.pin : ''}`, lang: () => a.lang, city: () => a.cityName, state: () => a.stateName,
    size: () => (a.sizeAssumed ? `${a.sizeUsed} sq ft (assumed)` : a.size != null ? `${a.size} sq ft` : ''),
  };
  const same = (x, y) => String(x ?? '').trim().toLowerCase().replace(/[\s,₹]/g, '') === String(y ?? '').trim().toLowerCase().replace(/[\s,₹]/g, '');
  const body = rows.map(r => {
    const raw = String(r.v ?? '').trim();
    const read = r.k && readAs[r.k] ? readAs[r.k]() : '';
    const num = x => { const m = String(x ?? '').replace(/,/g, '').match(/\d+(\.\d+)?/); return m ? +m[0] : null; };
    const numeric = ['invest', 'exp', 'size', 'launch'].includes(r.k);
    const changed = read && (numeric
      ? !raw || num(raw) !== num(read) || /\d[^\d.,]+\d/.test(raw.replace(/,/g, '')) || /crore|cr\b|k\b|month|week|year|asap|q[1-4]/i.test(raw) && r.k !== 'launch' && r.k !== 'exp' || /assumed/.test(read)
      : !same(raw, read));
    return `<tr><th scope="row">${esc(r.h)}</th><td>${raw ? `<span class="raw">${esc(raw)}</span>` : '<span class="blank">left blank</span>'}</td><td>${changed ? `<span class="readas">${esc(read)}</span>` : ''}</td></tr>`;
  }).join('');
  return `<div class="sec answers"><h3>Their answers <span>${a.inquiry ? 'from the enquiry form' : `exactly as in the file${a.row ? `, row ${a.row}` : ''}`}</span></h3>
    <div class="tbl-wrap"><table class="t raw-t"><tr><th>Question</th><th>What they wrote</th><th>We read it as</th></tr>${body}</table></div></div>`;
}


// Location deep-dive: traffic, potential and comparison with our stores, with the working shown
function trafficHtml(a) {
  const t = siteInsight(a, S.result);
  if (!t) return '';
  const n = v => Math.round(v).toLocaleString('en-IN');
  const cushionCls = t.cushion >= 1.5 ? 'ok' : t.cushion >= 1 ? 'warn' : 'bad';
  const bars = [{ label: '<b>This site</b> <span class="muted">when settled</span>', v: t.visitors, me: true }, ...t.near.map(s => ({ label: `<a class="lnk" data-go="map?pin=${s.pin}">${s.id}</a> <span class="muted">${s.km < 1 ? Math.round(s.km * 1000) + ' m' : s.km.toFixed(1) + ' km'} · ${s.years == null ? 'age unknown' : s.years + (s.years === 1 ? ' yr' : ' yrs') + ' open'}</span>`, v: s.visitors }))];
  const max = Math.max(...bars.map(b => b.v), 1);
  const cmp = t.basis === 'none' ? 'We have no store nearby or in a city of this size, so there is nothing fair to compare with yet.'
    : `${t.basis === 'same-size' ? 'No store of ours within 30 km, so this compares with our stores in similar-size cities. ' : ''}This site would get <b>${Math.abs(Math.round((t.rel - 1) * 100))}% ${t.rel >= 1 ? 'more' : 'fewer'}</b> visitors than ${t.near.length === 1 ? 'that store gets' : `the average of these ${t.near.length} stores (${n(t.bench)} a day)`} today.`;
  const rmax = Math.max(...t.ramp.map(r => r.visitors), 1);
  const ov = t.overlap.store;
  const overlap = !ov ? 'No store of ours to compare distance with.'
    : t.overlap.sharePct > 0 ? `<b>${ov.id}</b> is ${ov.km < 1 ? Math.round(ov.km * 1000) + ' m' : ov.km.toFixed(1) + ' km'} away. About <b>${Math.round(t.overlap.sharePct * 100)}%</b> of this site's visitors (${n(t.overlap.shared)} a day) would be shared with it, and ${ov.id} could lose up to <b>${n(t.overlap.fromStore)}</b> visitors a day. The ${S.result.cfg.overlapKm} km rule asks for a site visit before opening.`
    : `<b>${ov.id}</b> is ${ov.km.toFixed(1)} km away, beyond ${t.overlap.reach} km, so we expect no traffic taken from our stores.`;
  return `<div class="sec deep"><h3>Location deep-dive <span>estimates — the working is below</span></h3>
    <div class="deep-head"><span class="grade g-${t.grade.toLowerCase()}">${t.grade} potential</span><b class="num">${t.potential}</b><span class="muted">/100 · half location score (${a.site}), half traffic compared with our stores</span></div>
    <div class="deep-tiles">
      <div><span>People passing a day</span><b>${n(t.passers)}</b><em>in the shop's street and catchment</em></div>
      <div><span>Visitors a day</span><b>${n(t.visitors)}</b><em>${(t.capture * 100).toFixed(1)}% of people passing walk in</em></div>
      <div><span>Buyers a day</span><b>${n(t.buyers)}</b><em>${Math.round(t.conversion * 100)}% of visitors buy · ₹${n(t.bill)} average bill</em></div>
      <div class="${cushionCls}"><span>Visitors needed to break even</span><b>${n(t.breakEven)}</b><em>${t.cushion.toFixed(1)}× cushion over break-even</em></div>
    </div>
    <h4>Compared with our stores</h4>
    <div class="cmp">${bars.map(b => `<div class="cmp-row ${b.me ? 'me' : ''}"><div class="cmp-l">${b.label}</div><div class="cmp-bar"><i style="width:${(b.v / max) * 100}%"></i></div><div class="cmp-v num">${n(b.v)}</div></div>`).join('')}</div>
    <p class="small">${cmp}</p>
    <h4>Expected traffic in the first year</h4>
    <div class="ramp">${t.ramp.map(r => `<div class="ramp-c"><div class="ramp-bar"><i style="height:${(r.visitors / rmax) * 100}%"></i></div><b class="num">${n(r.visitors)}</b><span>${r.label}</span><em>${lakh(r.monthlySales)}/mo</em></div>`).join('')}</div>
    <p class="small muted">New stores build up: about 45% of settled traffic in the first three months, reaching full traffic in year two — the pattern we assume for our own stores.</p>
    <h4>Effect on our nearby store</h4>
    <p class="small">${overlap}</p>
    <h4>How it's worked out</h4>
    <table class="t drivers">${t.drivers.map(([k, v, eff]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td><td class="muted">${esc(eff)}</td></tr>`).join('')}</table>
    <p class="small muted">The file has no footfall counts, so these are worked backwards from the sales estimate behind the payback figure, and the same model is run on our existing stores (adjusted for how long each has been open). Swap in real footfall or till data to replace them.</p>
  </div>`;
}


// ---------------- human decisions: StoreSense suggests, a person decides ----------------
const humanYes = a => ['approved', 'conditional'].includes(S.decisions[a.id]?.d);
function planFor(a) {
  if (a.milestones) return a.milestones;
  if (!humanYes(a) || !a.timeline) return null;
  a.milestones = planMilestones(a, S.result.asOf);
  return a.milestones;
}
function finalPill(a) {
  const d = S.decisions[a.id];
  return d ? `<span class="pill final d-${d.d}" title="${esc(`${FINAL[d.d]} by ${d.by || 'a reviewer'} on ${fmtDate(d.at)}${d.note ? ' — ' + d.note : ''}`)}">✓ ${FINAL[d.d]}</span>` : '<span class="tag await">Awaiting you</span>';
}
function decisionHtml(a) {
  const d = S.decisions[a.id];
  const choices = [['approved', 'Approve'], ['conditional', 'Approve with conditions'], ['hold', 'Hold'], ['waitlist', 'Waitlist'], ['declined', 'Decline']];
  const t = a.territory, taken = t ? S.result.apps.filter(x => x.territory === t && x.id !== a.id && humanYes(x)).length : 0;
  const warn = t && t.slots && taken >= t.slots ? `<p class="small warn-line">Note: ${t.id} has ${t.slots} spot${t.slots > 1 ? 's' : ''} and you have already approved ${taken} there. Approving this person goes over the plan.</p>` : '';
  const drift = d && d.s && d.s !== a.decision ? `<p class="small warn-line">The suggestion has changed since you decided (was "${DEC_SHORT[d.s]}", now "${DEC_SHORT[a.decision]}"). Review if needed.</p>` : '';
  return `<div class="sec decide" id="decide-sec"><h3>Your decision <span>StoreSense only suggests — the final call is yours</span></h3>
    ${d ? `<div class="final-box"><span class="pill final d-${d.d}">✓ ${FINAL[d.d]}</span> <span class="small">by <b>${esc(d.by || 'a reviewer')}</b> on ${fmtDate(d.at)} · ${d.d === a.decision ? 'agrees with the suggestion' : `changed from "${DEC_SHORT[a.decision]}"`}</span>${d.note ? `<p class="small">“${esc(d.note)}”</p>` : ''}<button class="btn sm" type="button" id="dec-change">Change decision</button></div>${drift}` : ''}
    <div class="decide-form" ${d ? 'hidden' : ''}>
      <p class="small">Suggestion: <span class="pill d-${a.decision}">${DEC_SHORT[a.decision]}</span> — ${linkText(a.headline)}</p>
      <div class="decide-btns"><button class="btn primary" type="button" data-dec="${a.decision}">Accept suggestion</button>${choices.filter(([k]) => k !== a.decision).map(([k, l]) => `<button class="btn" type="button" data-dec="${k}">${l}</button>`).join('')}</div>
      <div class="decide-meta"><input class="input" id="dec-by" placeholder="Your name" value="${esc(S.reviewer)}" aria-label="Your name" maxlength="60"><input class="input" id="dec-note" placeholder="Reason (needed if you go against the suggestion)" aria-label="Reason" maxlength="240"></div>
      ${warn}
    </div></div>`;
}
function bindDecision(a) {
  $('#dec-change') && ($('#dec-change').onclick = () => { $('#decide-sec .decide-form').hidden = false; $('#dec-change').hidden = true; });
  $$('#decide-sec [data-dec]').forEach(b => b.onclick = () => {
    const choice = b.dataset.dec, note = $('#dec-note').value.trim(), by = $('#dec-by').value.trim();
    if (choice !== a.decision && !note) { toast('Add a short reason when you go against the suggestion'); $('#dec-note').focus(); $('#dec-note').classList.add('need'); return; }
    if (!by) { toast('Add your name so the decision can be traced'); $('#dec-by').focus(); $('#dec-by').classList.add('need'); return; }
    recordDecisions([a], choice, note, by);
  });
}
function recordDecisions(list, choice, note, by) {
  S.reviewer = by; store.set('storesense.reviewer', by);
  const at = new Date().toISOString();
  for (const a of list) {
    const c = choice || a.decision;
    S.decisions[a.id] = { d: c, s: a.decision, note: note || '', by, at };
    logActivity('decision', `${a.name} (${a.id}): ${FINAL[c]}`, `${c === a.decision ? 'Agreed with the suggestion' : `Changed from "${DEC_SHORT[a.decision]}"`}${note ? ` — ${note}` : ''} · by ${by}`, `app/${a.id}`);
  }
  store.set('storesense.decisions', S.decisions);
  renderAll();
  toast(list.length === 1 ? `Recorded: ${FINAL[choice || list[0].decision]}` : `Recorded ${list.length} decisions`, 'Undo', () => { for (const a of list) delete S.decisions[a.id]; store.set('storesense.decisions', S.decisions); logActivity('decision', `Undid ${list.length} decision${list.length > 1 ? 's' : ''}`, '', 'feed'); renderAll(); });
  if (list.length === 1 && humanYes(list[0])) confetti();
}
function confirmBulk(pend) {
  const box = $('#palette .pal-box');
  $('#palette').classList.add('on');
  const counts = DEC.map(d => [d, pend.filter(a => a.decision === d).length]).filter(([, n]) => n);
  box.innerHTML = `<h2>Accept ${pend.length} suggestion${pend.length > 1 ? 's' : ''}?</h2><div class="report">
    <p>This records the suggested decision as your final decision for everyone in this list who has no decision yet:</p>
    <ul>${counts.map(([d, n]) => `<li><b>${n}</b> × ${FINAL[d]}</li>`).join('')}</ul>
    <p class="small muted">You can change any of them later on their profile. Each one is logged with your name.</p>
    <input class="input" id="bulk-by" placeholder="Your name" value="${esc(S.reviewer)}" aria-label="Your name" style="width:100%;margin:8px 0 12px">
    <div style="display:flex;gap:8px"><button class="btn primary" type="button" id="bulk-ok">Accept ${pend.length}</button><button class="btn" type="button" id="bulk-no">Cancel</button></div></div>`;
  $('#bulk-no').onclick = () => closePalette();
  $('#bulk-ok').onclick = () => {
    const by = $('#bulk-by').value.trim();
    if (!by) { $('#bulk-by').classList.add('need'); $('#bulk-by').focus(); return; }
    closePalette(); recordDecisions(pend, null, 'Accepted in bulk from the To-do list', by);
  };
  setTimeout(() => $('#bulk-by').focus(), 50);
}

// ---------------- drawer ----------------
function openDrawer(id, keep, fromRoute) {
  const a = S.result.apps.find(x => x.id === id);
  if (!a) return;
  S.openId = id;
  const d = $('#drawer'), res = S.result, cfg = res.cfg;
  const prog = S.progress[a.id] || {};
  const costColors = ['--d-approved', '--d-conditional', '--d-hold', '--d-waitlist', '--muted'];
  const bd = a.breakdown || {};
  const costParts = [['Brand fee', bd.fee], ['Shop setup', bd.fitout], ['First stock', bd.stock], ['Rent deposit', bd.deposit], ['3 months costs', bd.workingCapital]];
  const scored = !(a.decision === 'hold' || a.withdrawn);
  d.innerHTML = `
    <div class="dr-h">
      <button class="btn sm ghost x" id="dr-x" aria-label="Close">✕</button>
      <div style="display:flex;gap:14px;align-items:center;margin-bottom:10px">${avatar(a)}<div><div class="small muted">${esc(a.id)} · <a class="lnk" data-go="map?city=${encodeURIComponent(a.cityName)}">${esc(a.cityName)}</a> ${a.pin ? pinLink(a.pin) : ''}</div>
      <h2 style="margin:0">${esc(a.name)}</h2></div></div>
      <a class="pill d-${a.decision} lnk" data-go="feed?dec=${a.decision}">${DEC_SHORT[a.decision]}</a> <a class="tag lnk" data-go="feed?bucket=${a.bucket}">${BUCKET[a.bucket]}</a>
      ${!(a.decision === 'hold' || a.withdrawn) ? `<div class="rings">${ring('Partner', a.partner)}${ring('Location', a.site)}${ring('Speed', a.momentum)}</div>` : ''}
      <p style="margin-top:8px">${linkText(a.headline)}</p>
    </div>
    <div class="dr-b">
      ${decisionHtml(a)}
      ${answersHtml(a)}
      <div class="sec"><h3>Why</h3><ul>${(a.reasons || []).map(r => `<li>${linkText(r)}</li>`).join('')}</ul></div>
      ${traceHtml(a)}

      ${scored ? `
      <div class="sec"><h3>Partner <span>score ${a.partner} · need ${cfg.partnerBar}</span></h3>
        ${Object.entries(a.parts).map(([k, v]) => meter({ experience: 'Shop experience', compliance: 'Easy to train', relevance: 'Right kind of work', capital: 'Money', commitment: 'Ready to start' }[k], v)).join('')}
        <p class="small muted" style="margin-top:6px">${esc(a.complianceLabel)}</p></div>
      <div class="sec"><h3>Money <span>${a.coverage >= 1 ? 'Has enough' : `${Math.round((1 - a.coverage) * 100)}% short`}</span></h3>
        <div class="costbar">${costParts.map(([l, v], i) => `<i style="flex-grow:${v || 0};background:var(${costColors[i]})" title="${l}: ${lakh(v)}"></i>`).join('')}</div>
        <div class="legend" style="margin:0 0 8px">${costParts.map(([l, v], i) => `<span><i class="dot" style="background:var(${costColors[i]})"></i>${l} <b>${lakh(v)}</b></span>`).join('')}</div>
        <dl class="kv"><dt>Needs</dt><dd><b>${lakh(a.needed)}</b></dd>
          <dt>Has</dt><dd>${lakh(a.invest)}${a.gap ? ` · short by ${lakh(a.gap)}` : ''}</dd>
          <dt>Sales</dt><dd>${lakh(a.monthlySales)} a month</dd>
          <dt>Fee to brand</dt><dd>${lakh(a.royalty)} a month</dd>
          <dt>Rent and staff</dt><dd>${lakh(a.monthlyFixed)} a month</dd>
          <dt>Partner keeps</dt><dd>${lakh(a.contribution)} a month</dd>
          <dt>Earns it back in</dt><dd><b>${isFinite(a.payback) ? Math.round(a.payback) + ' months' : 'Never'}</b> (goal ${cfg.maxPayback})</dd></dl></div>
      <div class="sec"><h3>Location</h3>
        <dl class="kv"><dt>Same pin</dt><dd>${a.conflictStore ? `<span class="tag bad">Our store ${a.conflictStore.id} is already here</span>` : '<span class="tag ok">No store here yet</span>'}${a.relocatedFrom ? ` · moved to ${pinLink(a.assignedPin)}` : ''}</dd>
          <dt>Closest store</dt><dd>${a.nearest ? `<a class="lnk" data-go="map?pin=${a.nearest.store.pin}">${a.nearest.store.id}</a> · ${r1(a.nearest.km)} km ${a.overlap ? '<span class="tag bad">Too close</span>' : ''}` : '—'}</dd>
          <dt>Area</dt><dd>${a.territory ? `<a class="lnk" data-go="territories/${a.territory.id}">${a.territory.id}</a> · ${a.territory.priority} interest` : 'Not one of our areas'}</dd>
          <dt>Shoppers</dt><dd>${level(a.demand)}</dd>
          <dt>Households</dt><dd>${level(a.demographic)} ${a.demographic < cfg.minDemographic ? '<span class="tag bad">Too few</span>' : ''}</dd>
          <dt>Similar shops</dt><dd>${a.competitors} nearby ${a.competitors >= 7 ? '<span class="tag bad">Crowded</span>' : ''}</dd>
          <dt>Location score</dt><dd><b>${a.site}</b></dd></dl></div>${trafficHtml(a)}` : ''}
      ${a.timeline ? `<div class="sec"><h3>Timeline</h3><dl class="kv"><dt>Target</dt><dd>${a.launchUsed} months</dd><dt>Earliest</dt><dd>${a.timeline.minMonths} months</dd><dt>Opening</dt><dd><b>${fmtDate(a.timeline.date)}</b></dd>${a.timeline.festival ? `<dt>Festival</dt><dd>${esc(a.timeline.festival)}</dd>` : ''}</dl></div>` : ''}
      ${humanYes(a) && planFor(a) ? `<div class="sec"><h3>Steps to open <span>${Object.values(prog).filter(Boolean).length} of ${planFor(a).length} done</span></h3><div class="msl">${planFor(a).map(m => `
        <label class="ms ${prog[m.key] ? 'done' : ''}"><input type="checkbox" data-ms="${m.key}" ${prog[m.key] ? 'checked' : ''}><div><div class="t">${esc(m.label)}</div><div class="d">${esc(m.detail)} · ${esc(m.owner)}</div></div><div class="due">${fmtDate(m.due)}</div></label>`).join('')}</div>
        </div>` : `<div class="sec"><h3>Suggested next steps <span>start after your decision</span></h3>${nextSteps(a, res)}</div>`}
      ${a.issues?.length ? `<div class="sec"><h3>Things we fixed or need</h3><ul>${a.issues.map(i => `<li>${i.level === 'block' ? '<b>Need:</b> ' : ''}${linkText(i.text)}</li>`).join('')}</ul></div>` : ''}
      <div class="sec" id="dr-compose-sec" hidden><h3>Message <span>${esc(a.lang)}</span></h3><textarea class="compose" id="dr-compose"></textarea><div style="margin-top:8px;display:flex;gap:8px"><button class="btn sm primary" id="dr-copy">Copy message</button><span class="small muted">Not sent automatically.</span></div></div>
    </div>
    <div class="dr-f">
      <button class="btn primary" id="dr-info"><svg><use href="#i-mail"/></svg>${!S.decisions[a.id] && a.decision === 'hold' ? 'Ask for info' : 'Write message'}</button>
      <button class="btn" id="dr-hs">Copy for HubSpot</button>
      <button class="btn ghost" id="dr-ask">Ask why</button>
    </div>`;
  $('#dr-x').onclick = () => closeDrawer(true);
  $$('[data-ms]', d).forEach(cb => cb.onchange = () => {
    S.progress[a.id] = { ...(S.progress[a.id] || {}), [cb.dataset.ms]: cb.checked };
    store.set('storesense.progress', S.progress);
    cb.closest('.ms').classList.toggle('done', cb.checked);
    if (S.tab === 'onboarding') renderOnboarding();
  });
  $('#dr-info').onclick = () => {
    if (!S.decisions[a.id] && a.decision !== 'hold') { toast('Record your decision first. StoreSense only suggests.'); $('#decide-sec')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); $('#decide-sec')?.classList.add('flash'); return; }
    $('#dr-compose-sec').hidden = false; $('#dr-compose').value = composeMessage(a); $('#dr-compose').scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  bindDecision(a);
  $('#dr-copy') && ($('#dr-copy').onclick = () => copy($('#dr-compose').value, 'Message copied'));
  $('#dr-hs').onclick = () => copy(JSON.stringify(hubspotPayload(a), null, 2), 'HubSpot record copied');
  $('#dr-ask').onclick = () => { go('ask'); sendAsk(`Explain ${a.id}`); };
  if (!keep) { d.querySelector('.dr-b').scrollTop = 0; }
  if (!keep && !fromRoute && decodeURIComponent(location.hash) !== `#/app/${id}`) { history.pushState(null, '', `#/app/${id}`); addTrail(`app/${id}`); }
  d.classList.add('on'); d.setAttribute('aria-hidden', 'false'); $('#scrim').classList.add('on');
  if ($('#assist').classList.contains('on')) drawSuggestions();
}
function closeDrawer(push) {
  if (push && S.openId) { history.pushState(null, '', '#/' + S.page); addTrail(S.page); }
  S.openId = null; $('#drawer').classList.remove('on'); $('#drawer').setAttribute('aria-hidden', 'true'); $('#scrim').classList.remove('on');
  if ($('#assist').classList.contains('on')) drawSuggestions(); }
$('#scrim').onclick = () => closeDrawer(true);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#palette').classList.contains('on') && S.openId) closeDrawer(true); if (e.key === 'Enter' && e.target.classList?.contains('row')) openDrawer(e.target.dataset.id); });

const MSG = {
  English: { hi: n => `Hello ${n},`, thanks: id => `Thank you for applying to open a store with us (application ${id}).`, need: 'To complete our review, please send us:', cond: 'Good news: your application is approved, with these steps to close before opening:', next: 'Your next steps:', wait: 'Your application is strong, and we are keeping it active:', bye: '— Expansion team' },
  Hindi: { hi: n => `नमस्ते ${n},`, thanks: id => `हमारे साथ स्टोर खोलने के लिए आवेदन करने के लिए धन्यवाद (आवेदन ${id})।`, need: 'समीक्षा पूरी करने के लिए कृपया यह जानकारी भेजें:', cond: 'खुशखबरी: आपका आवेदन स्वीकृत है। स्टोर खुलने से पहले ये कदम पूरे करने होंगे:', next: 'आपके अगले कदम:', wait: 'आपका आवेदन मज़बूत है और हम इसे सक्रिय रख रहे हैं:', bye: '— विस्तार टीम' },
  Kannada: { hi: n => `ನಮಸ್ಕಾರ ${n},`, thanks: id => `ನಮ್ಮೊಂದಿಗೆ ಮಳಿಗೆ ತೆರೆಯಲು ಅರ್ಜಿ ಸಲ್ಲಿಸಿದ್ದಕ್ಕೆ ಧನ್ಯವಾದಗಳು (ಅರ್ಜಿ ${id}).`, need: 'ಪರಿಶೀಲನೆ ಪೂರ್ಣಗೊಳಿಸಲು ದಯವಿಟ್ಟು ಈ ಮಾಹಿತಿ ಕಳುಹಿಸಿ:', cond: 'ಶುಭ ಸುದ್ದಿ: ನಿಮ್ಮ ಅರ್ಜಿ ಅನುಮೋದನೆಯಾಗಿದೆ. ಮಳಿಗೆ ತೆರೆಯುವ ಮೊದಲು ಈ ಹಂತಗಳನ್ನು ಪೂರ್ಣಗೊಳಿಸಿ:', next: 'ನಿಮ್ಮ ಮುಂದಿನ ಹಂತಗಳು:', wait: 'ನಿಮ್ಮ ಅರ್ಜಿ ಉತ್ತಮವಾಗಿದೆ, ನಾವು ಅದನ್ನು ಸಕ್ರಿಯವಾಗಿ ಇರಿಸಿದ್ದೇವೆ:', bye: '— ವಿಸ್ತರಣಾ ತಂಡ' },
};
function composeMessage(a) {
  const m = MSG[a.lang] || MSG.English;
  const fd = S.decisions[a.id]?.d || (a.decision === 'hold' ? 'hold' : null);
  let items;
  if (fd === 'hold') items = [m.need, ...(a.request || [S.decisions[a.id]?.note || 'a few more details']).map(r => `• ${r}`)];
  else if (fd === 'approved' || fd === 'conditional') items = [fd === 'conditional' ? m.cond : m.next, ...(fd === 'conditional' ? (a.conditions?.length ? a.conditions.map(c => `• ${c.text}`) : [`• ${S.decisions[a.id].note}`]) : []), ...planFor(a).slice(0, 3).map(x => `• ${x.label} — ${fmtDate(x.due)}`)];
  else if (fd === 'waitlist') items = [m.wait, `• ${S.decisions[a.id]?.note || a.headline}`, `• ${nurtureAdvice(a)}`];
  else items = [`• ${S.decisions[a.id]?.note || a.headline}`];
  const body = [m.hi(a.name), m.thanks(a.id), '', ...items, '', m.bye].join('\n');
  return a.lang !== 'English' ? `${body}\n\n(Details are in English so the team can check them.)` : body;
}

function hubspotPayload(a) {
  const [first, ...rest] = a.name.split(' ');
  return {
    contact: { firstname: first, lastname: rest.join(' '), city: a.cityName, state: a.stateName, zip: a.assignedPin || a.pin, hs_language: a.lang, franchise_application_id: a.id },
    deal: {
      dealname: `Franchise ${a.id} · ${a.cityName} ${a.assignedPin || a.pin}`, pipeline: 'franchise_partners',
      dealstage: S.decisions[a.id] ? { approved: 'approved', conditional: 'approved_with_conditions', hold: 'awaiting_information', waitlist: 'nurture', declined: 'closedlost' }[S.decisions[a.id].d] : 'awaiting_decision',
      suggested_decision: DEC_SHORT[a.decision], final_decision: S.decisions[a.id] ? FINAL[S.decisions[a.id].d] : '', decided_by: S.decisions[a.id]?.by || '', decision_note: S.decisions[a.id]?.note || '',
      amount: Math.round((a.invest || 0) * 1e5), territory: a.territory?.id || '', decision_reason: a.headline,
      partner_score: a.partner, site_score: a.site, payback_months: isFinite(a.payback) ? Math.round(a.payback) : null,
      conditions: (a.conditions || []).map(c => c.text).join(' | '), target_open_date: a.timeline ? a.timeline.date.toISOString().slice(0, 10) : '',
    },
  };
}
function exportHubspot(items) {
  const rows = [['Application ID', 'First name', 'Last name', 'City', 'Postal code', 'Language', 'Deal name', 'Deal stage', 'Amount', 'Territory', 'Decision reason', 'Partner score', 'Payback months', 'Conditions', 'Target open date']];
  for (const a of items) { const p = hubspotPayload(a); rows.push([a.id, p.contact.firstname, p.contact.lastname, p.contact.city, p.contact.zip, p.contact.hs_language, p.deal.dealname, p.deal.dealstage, p.deal.amount, p.deal.territory, p.deal.decision_reason, p.deal.partner_score, p.deal.payback_months, p.deal.conditions, p.deal.target_open_date]); }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const blob = new Blob([XLSX.utils.sheet_to_csv(ws)], { type: 'text/csv' });
  const u = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: u, download: 'storesense_hubspot_import.csv' }).click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
  toast(`${items.length} leads exported`);
}

// ---------------- territories ----------------
const TER_F = { all: () => true, open: t => t.open > 0, filled: t => t.slots > 0 && t.open === 0, leads: t => t.needsLeads, none: t => t.slots === 0 };
function renderTerritories() {
  const res = S.result, v = $('#view-territories'), f = (S.ter ||= { f: 'all', q: '', sort: 'priority' });
  const order = { High: 0, Medium: 1, Low: 2 };
  const all = res.territories;
  let ters = all.filter(TER_F[f.f]);
  if (f.q) { const q = f.q.toLowerCase(); ters = ters.filter(t => `${t.id} ${t.city} ${t.pins.join(' ')}`.toLowerCase().includes(q)); }
  ters.sort(f.sort === 'open' ? (a, b) => b.open - a.open || order[a.priority] - order[b.priority] : f.sort === 'applicants' ? (a, b) => b.applicants - a.applicants : (a, b) => order[a.priority] - order[b.priority] || a.id.localeCompare(b.id, undefined, { numeric: true }));
  const status = t => t.status === 'full-none-planned' ? '<span class="tag">No new stores</span>'
    : t.status === 'filled' ? '<span class="tag ok">Full</span>'
    : t.needsLeads ? '<span class="tag bad">Needs partners</span>' : `<span class="tag">${t.open} empty</span>`;
  v.innerHTML = `
    ${strip([
      { key: 'all', l: 'All areas', v: all.length },
      { key: 'open', l: 'Empty spots', v: all.reduce((n, t) => n + Math.max(0, t.open), 0), s: `out of ${all.reduce((n, t) => n + t.slots, 0)}` },
      { key: 'filled', l: 'Full', v: all.filter(TER_F.filled).length },
      { key: 'leads', l: 'Need partners', v: all.filter(TER_F.leads).length, dot: 'var(--d-declined)' },
      { key: 'none', l: 'No new stores', v: all.filter(TER_F.none).length },
    ], f.f)}
    <div class="toolbar">
      <input class="input" id="tq" type="search" placeholder="Search area, city or pin  ( / )" value="${esc(f.q)}" aria-label="Search territories">
      <div class="tools"><select class="input" id="ts" aria-label="Sort">${[['priority', 'Most wanted'], ['open', 'Most empty spots'], ['applicants', 'Most applicants']].map(([k, l]) => `<option value="${k}" ${f.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    </div>
    <p class="count-line">${ters.length} area${ters.length === 1 ? '' : 's'} · hover a team-up to see who</p>
    ${ters.length ? `<div class="ter-grid">${ters.map(t => `
      <div class="ter ${t.needsLeads && t.priority === 'High' ? 'alert' : ''}" id="ter-${t.id}">
        <div class="awning" aria-hidden="true"></div><div class="ter-body">
        <div class="ter-h"><div><b>${t.id}</b> · <a class="lnk" data-go="map?city=${encodeURIComponent(t.city)}">${esc(t.city)}</a><div class="sub">${['', 'Big city', 'Mid city', 'Small town'][t.tier]} · ${t.priority} interest · <a class="lnk" data-go="feed?ter=${t.id}">${t.applicants} applied</a></div></div>${status(t)}</div>
        ${t.slots ? `<div class="slots">${Array.from({ length: t.slots }, (_, i) => t.winners[i] ? `<i class="${t.winners[i].decision === 'approved' ? 'f' : 'c'}" data-app="${esc(t.winners[i].id)}" title="${esc(t.winners[i].name)}">${initials(t.winners[i].name)}</i>` : '<i title="Empty spot">+</i>').join('')}</div>` : ''}
        <dl class="kv">
          <dt>Got a spot</dt><dd><div class="winners">${t.winners.map(w => `<span class="winner" data-app="${esc(w.id)}" title="${esc(w.headline)}">${esc(w.name)} <span class="muted">${w.combined}</span></span>`).join('') || '—'}</div></dd>
          <dt>Waitlist</dt><dd>${t.waitlist.length ? t.waitlist.slice(0, 4).map(w => `<a href="#" data-app="${esc(w.id)}">${esc(w.id)}</a>`).join(', ') + (t.waitlist.length > 4 ? ` +${t.waitlist.length - 4}` : '') : '—'}</dd>
          <dt>Covers</dt><dd class="pins">${t.pins.slice(0, 12).map(pinLink).join('') || (t.prefixes?.length ? `pins starting ${t.prefixes.join(', ')}` : `all of ${esc(t.city)}`)}${t.pins.length > 12 ? `<span class="muted"> +${t.pins.length - 12} more</span>` : ''}</dd>
          ${(() => { const e = trafficSummary(res).byTer.get(t.id); return e ? `<dt>Traffic</dt><dd>about <b>${e.visitors}</b> visitors a day at ${e.n} suggested site${e.n > 1 ? 's' : ''}</dd>` : ''; })()}
          <dt>Empty pins</dt><dd class="pins">${t.pinsFree.map(pinLink).join('') || '—'}</dd>
          ${t.pairings.length ? `<dt>Team-ups</dt><dd><button class="linkish" data-pair="${t.id}">${t.pairings.length} pair${t.pairings.length > 1 ? 's' : ''} could invest together</button></dd>` : ''}
        </dl>
      </div></div>`).join('')}</div>` : empty('No areas here.')}`;
  $$('.strip .kpi', v).forEach(b => b.onclick = () => { f.f = b.dataset.k; renderTerritories(); });
  $('#tq').oninput = e => { f.q = e.target.value; clearTimeout(renderTerritories.t); renderTerritories.t = setTimeout(() => { renderTerritories(); const i = $('#tq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 150); };
  $('#ts').onchange = e => { f.sort = e.target.value; renderTerritories(); };
  $$('[data-app]', v).forEach(el => el.onclick = e => { e.preventDefault(); openDrawer(el.dataset.app); });
  $$('[data-pair]', v).forEach(el => {
    const t = res.territories.find(x => x.id === el.dataset.pair);
    const show = () => hover(el, `<h4>Could invest together · ${t.id}</h4><p class="muted" style="margin:0 0 6px">Back-ups only. They need ${lakh(t.pairings[0].needed)} together.</p>${t.pairings.map(p => `<div class="pair"><b>${esc(p.a.name)}</b> + <b>${esc(p.b.name)}</b><br>${lakh(p.capital)} · ${p.a.exp} + ${p.b.exp} yrs · scores ${p.a.partner} / ${p.b.partner}</div>`).join('')}`);
    el.addEventListener('mouseenter', show); el.addEventListener('focus', show);
    el.addEventListener('mouseleave', () => hover()); el.addEventListener('blur', () => hover());
  });
}
function hover(anchor, html) {
  const c = $('#hovercard');
  if (!anchor) { c.classList.remove('on'); return; }
  c.innerHTML = html; c.classList.add('on');
  const r = anchor.getBoundingClientRect();
  let x = r.left, y = r.bottom + 8;
  if (x + c.offsetWidth > innerWidth - 12) x = innerWidth - c.offsetWidth - 12;
  if (y + c.offsetHeight > innerHeight - 12) y = r.top - c.offsetHeight - 8;
  c.style.left = x + 'px'; c.style.top = y + 'px';
}
function flashTer(id) { const el = $(`#ter-${id}`); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.animate([{ boxShadow: '0 0 0 3px var(--accent)' }, { boxShadow: '0 0 0 0 transparent' }], { duration: 1600 }); } }

// ---------------- map ----------------
let map3d = null, mapCity = null, mapLayer = 'demand', mapMode = '3d', mapTarget = null;
function mapCityList(res) {
  const n = new Map();
  const add = (c, k) => { if (!c || c === '—') return; const e = n.get(c) || { apps: 0, ters: 0, stores: 0 }; e[k]++; n.set(c, e); };
  res.territories.forEach(t => add(t.city, 'ters'));
  res.stores.forEach(s => add(s.city, 'stores'));
  res.apps.forEach(a => a.point && add(a.cityName, 'apps'));
  return [...n.entries()].sort((a, b) => b[1].ters - a[1].ters || b[1].apps - a[1].apps).map(([c, e]) => ({ city: c, ...e }));
}
function renderMap() {
  const res = S.result, v = $('#view-map');
  const cities = mapCityList(res);
  if (!mapCity || (mapCity !== 'india' && !cities.some(c => c.city === mapCity))) mapCity = 'india';
  if (!$('#map3d')) {
    v.innerHTML = `
      <div class="toolbar"><div class="seg-ctl map-cities" id="map-cities"></div></div>
      <div class="toolbar">
        <div class="seg-ctl" id="map-mode"><button data-m="3d">3D map</button><button data-m="google">Google Maps</button></div>
        <div class="tools">
          <div class="seg-ctl" id="map-layer"><button data-l="demand">Shoppers</button><button data-l="demographic">Households</button><button data-l="none">Off</button></div>
          <button class="btn sm" id="map-tilt" title="Switch between 3D and flat">Flat view</button>
          <button class="btn sm" id="map-spin" title="Slowly turn the map">Rotate</button>
        </div>
      </div>
      <div id="map-strip"></div>
      <div class="map-wrap">
        <div class="map-stage"><div id="map3d"></div><iframe id="gmap-big" title="Google Maps" loading="lazy" referrerpolicy="no-referrer-when-downgrade" hidden></iframe></div>
        <div class="map-side">
          <div class="card gm-card"><div class="card-h"><h2>Google Maps</h2><span class="muted" id="gm-label"></span></div>
            <iframe id="gmap" title="Google Maps for the selected place" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
            <div class="gm-actions"><a class="btn sm" id="gm-open" target="_blank" rel="noopener">Open in Google Maps ↗</a></div>
            <p class="small muted" style="margin:8px 0 0">Click any dot, store or pin to see that exact place on Google Maps.</p></div>
          <div class="card"><h2 style="margin-bottom:12px">What you see</h2><div class="map-legend" id="map-legend"></div></div>
        </div>
      </div>`;
    map3d = new Map3D($('#map3d'), {
      dark: currentTheme() === 'dark', color: colr,
      onApp: id => openDrawer(id), onPin: p => go(`feed?pin=${p}`), onCity: c => go(`map?city=${encodeURIComponent(c)}`), onTarget: t => setGoogle(t),
    });
    $$('#map-mode button').forEach(b => b.onclick = () => { mapMode = b.dataset.m; applyMapMode(); });
    $('#map-tilt').onclick = () => { const flat = $('#map-tilt').textContent === 'Flat view'; map3d.setPitch(flat ? 0 : 55); $('#map-tilt').textContent = flat ? '3D view' : 'Flat view'; };
    $('#map-spin').onclick = () => { const on = map3d.toggleSpin(); $('#map-spin').classList.toggle('on', on); $('#map-spin').textContent = on ? 'Stop' : 'Rotate'; };
  }
  $('#map-cities').innerHTML = [{ city: 'india', label: 'All India', apps: res.apps.filter(a => a.point).length }, ...cities.map(c => ({ ...c, label: c.city }))]
    .map(c => `<button data-c="${esc(c.city)}" class="${c.city === mapCity ? 'on' : ''}">${esc(c.label)} <span class="c">${c.apps}</span></button>`).join('');
  $$('#map-cities button').forEach(b => b.onclick = () => go(`map?city=${encodeURIComponent(b.dataset.c)}`));
  $$('#map-layer button').forEach(b => { b.classList.toggle('on', b.dataset.l === mapLayer); b.onclick = () => { mapLayer = b.dataset.l; drawMap(); $$('#map-layer button').forEach(x => x.classList.toggle('on', x.dataset.l === mapLayer)); }; });
  applyMapMode();
  drawMap();
  setTimeout(() => map3d?.resize(), 80);
}
function applyMapMode() {
  $$('#map-mode button').forEach(b => b.classList.toggle('on', b.dataset.m === mapMode));
  $('#map3d').style.visibility = mapMode === '3d' ? 'visible' : 'hidden';
  $('#gmap-big').hidden = mapMode !== 'google';
  $('.gm-card').hidden = mapMode === 'google';
  ['#map-layer', '#map-tilt', '#map-spin'].forEach(sel => { $(sel).style.display = mapMode === '3d' ? '' : 'none'; });
  if (mapTarget) setGoogle(mapTarget);
}
function setGoogle(t) {
  mapTarget = t;
  const query = t.pin ? `${t.pin}${t.city && t.city !== 'india' ? ', ' + t.city : ''}, India` : t.city && t.city !== 'india' ? `${t.city}, India` : 'India';
  const q = encodeURIComponent(query), z = t.pin ? 15 : t.city && t.city !== 'india' ? 11 : 5;
  const src = `https://maps.google.com/maps?q=${q}&z=${z}&output=embed`;
  for (const sel of ['#gmap', '#gmap-big']) { const el = $(sel); if (el && !el.hidden && el.dataset.src !== src) { el.src = src; el.dataset.src = src; } else if (el) el.dataset.want = src; }
  if ($('#gm-label')) $('#gm-label').textContent = t.label || query;
  if ($('#gm-open')) $('#gm-open').href = `https://www.google.com/maps/search/?api=1&query=${q}`;
}
function drawMap() {
  const res = S.result, cfg = res.cfg, india = mapCity === 'india';
  const inCity = c => india || c === mapCity;
  const ters = res.territories.filter(t => inCity(t.city));
  const apps = res.apps.filter(a => a.point && inCity(a.cityName) && !a.issues.some(i => i.level === 'block' && i.field === 'pin'));
  const stores = res.stores.filter(s => s.point && (india || s.city === mapCity || ters.some(t => t.pins.includes(String(s.pin)))));
  const pinSet = new Map();
  ters.forEach(t => t.pins.slice(0, 400).forEach(p => pinSet.set(p, { tier: t.tier, city: t.city })));
  apps.forEach(a => pinSet.set(a.pin, { tier: a.tier, city: a.cityName }));
  const heat = [...pinSet].map(([p, o]) => { const pt = pinPoint(p, o.city), px = pinProxy(p, o.tier); return { lat: pt.lat, lng: pt.lng, w: mapLayer === 'demographic' ? px.demographic : px.demand }; });
  const free = ters.flatMap(t => t.pinsFree.slice(0, 60).map(p => { const pt = pinPoint(p, t.city); return { pin: p, place: pinPlace(p)?.name || '', ter: t.id, city: t.city, lat: pt.lat, lng: pt.lng }; }));
  const appsV = apps.map(a => ({ id: a.id, name: a.name, decision: a.decision, decLabel: DEC_SHORT[a.decision], pin: a.assignedPin || a.pin, place: pinPlace(a.assignedPin || a.pin)?.name || '', city: a.cityName, color: colr(`--d-${a.decision}`), ready: a.bucket === 'ready', score: Math.round(a.combined || 0), lat: a.point.lat, lng: a.point.lng }));
  const storesV = stores.map(s => ({ id: s.id, pin: String(s.pin), place: pinPlace(s.pin)?.name || '', opened: s.opened, city: s.city, lat: s.point.lat, lng: s.point.lng }));
  const cityAgg = india ? mapCityList(res).map(c => {
    const ci = cityInfo(c.city), pts = [...res.apps.filter(a => a.cityName === c.city && a.point).map(a => a.point), ...res.stores.filter(s => s.city === c.city && s.point).map(s => s.point)];
    const lat = ci?.lat ?? pts.reduce((x, p) => x + p.lat, 0) / (pts.length || 1), lng = ci?.lng ?? pts.reduce((x, p) => x + p.lng, 0) / (pts.length || 1);
    const tt = res.territories.filter(t => t.city === c.city);
    return { name: c.city, n: c.apps, ready: res.apps.filter(a => a.cityName === c.city && a.bucket === 'ready').length, open: tt.reduce((x, t) => x + Math.max(0, t.open), 0), stores: c.stores, lat, lng };
  }).filter(c => isFinite(c.lat) && isFinite(c.lng)) : [];
  let bounds = null;
  if (!india) {
    const pts = [...ters.flatMap(t => t.pins.slice(0, 200).map(p => pinPoint(p, t.city))), ...storesV];
    const use = pts.length ? pts : appsV;
    if (use.length) bounds = [[Math.min(...use.map(p => p.lng)), Math.min(...use.map(p => p.lat))], [Math.max(...use.map(p => p.lng)), Math.max(...use.map(p => p.lat))]];
  }
  let focus = null;
  if (S.mapFocus) {
    const p = S.mapFocus; S.mapFocus = null;
    const pt = pinPoint(p, india ? undefined : mapCity);
    focus = { pin: p, lat: pt.lat, lng: pt.lng };
    setGoogle({ pin: p, city: india ? '' : mapCity, label: `Pin ${p}${pinPlace(p) ? ' · ' + pinPlace(p).name : ''}` });
  } else if (!mapTarget || mapTarget.city !== mapCity) setGoogle({ city: mapCity, label: india ? 'All India' : mapCity });
  map3d.render({ mode: india ? 'india' : 'city', city: mapCity, apps: appsV, stores: storesV, cfg, layer: mapLayer, hide: S.mapHide || {}, heat, free, cities: cityAgg, bounds, focus });

  const est = [...pinSet.keys()].filter(p => pinPoint(p, pinSet.get(p).city).source === 'estimated').length;
  $('#map-strip').innerHTML = strip(india ? [
    { l: 'Cities', v: cityAgg.length }, { l: 'Our stores', v: stores.length }, { l: 'Applied', v: apps.length },
    { l: 'Suggested yes', v: apps.filter(a => a.bucket === 'ready').length, dot: 'var(--d-approved)' }, { l: 'Empty pins', v: free.length },
  ] : [
    { l: 'Our stores', v: stores.length }, { l: 'Applied', v: apps.length },
    { l: 'Suggested yes', v: apps.filter(a => a.bucket === 'ready').length, dot: 'var(--d-approved)' }, { l: 'Empty pins', v: free.length },
    { l: 'Shopper level', v: heat.length ? (heat.reduce((n, h) => n + h.w, 0) / heat.length).toFixed(2) : '—' },
  ]);
  $('#map-legend').innerHTML = `
    ${mapLayer !== 'none' ? `<div><b>${mapLayer === 'demand' ? 'Shoppers nearby' : 'Households nearby'}</b> <span class="muted">(estimate)</span><div class="heat-scale" style="margin-top:6px"></div><div class="small muted" style="display:flex;justify-content:space-between"><span>Low</span><span>High</span></div></div>` : ''}
    <div class="row-l"><span class="lg-store"></span>Our store · ${cfg.overlapKm} km ring around it${india ? '' : ' · white towers in 3D'}</div>
    ${DEC.map(d => `<button class="row-l legend-toggle ${(S.mapHide || {})[d] ? 'off' : ''}" data-dec="${d}" title="Show or hide"><i class="dot" style="background:var(--d-${d});width:10px;height:10px;border-radius:50%"></i>${DEC_LEG[d]}</button>`).join('')}
    <div class="row-l"><span class="lg-free"></span>Empty pin — where to find partners</div>
    ${india ? '<p class="small muted">Bubbles are cities: bigger means more applicants. Click one to fly in.</p>' : '<p class="small muted">Columns rise for people suggested yes: taller means a better score. Drag with the right mouse button (or two fingers) to tilt and turn.</p>'}
    <p class="small muted">${est ? `${est} of ${pinSet.size} pin locations are estimated near the city centre.` : 'All pin locations here are exact.'}</p>
    ${est ? '<button class="btn sm" id="refine">Make locations exact</button><div class="small muted" id="refine-s"></div>' : ''}`;
  $$('#map-legend .legend-toggle').forEach(b => b.onclick = () => { S.mapHide = { ...(S.mapHide || {}), [b.dataset.dec]: !(S.mapHide || {})[b.dataset.dec] }; drawMap(); });
  $('#refine') && ($('#refine').onclick = () => locatePins([...pinSet.keys(), ...stores.map(s => String(s.pin))]));
}
// Look pins up on OpenStreetMap, then re-run the rules and say exactly what changed
async function locatePins(pins) {
  const btn = $('#refine'); if (btn) btn.disabled = true;
  const before = S.result;
  const n = await refinePins(pins, (d, t) => { const el = $('#refine-s'); if (el) el.textContent = `Looking up ${d} of ${t} on OpenStreetMap…`; });
  if (!n) { toast('All locations were already exact'); return; }
  S.result = run(S.data, S.settings);
  const changed = S.result.apps.filter(a => before.apps.find(b => b.id === a.id)?.decision !== a.decision);
  S.changed = { ids: new Set(changed.map(a => a.id)), label: 'Changed after exact locations' };
  renderAll();
  logActivity('update', `Made ${n} pin locations exact`, changed.length ? `${changed.length} decisions changed` : 'No decision changed', changed.length ? 'feed?changed=1' : 'map');
  toast(`${n} pins located. ${changed.length ? `${changed.length} decisions changed.` : 'No decision changed.'}`, changed.length ? 'See' : '', changed.length ? () => go('feed?changed=1') : null);
}

// ---------------- onboarding ----------------
function renderOnboarding() {
  const res = S.result, v = $('#view-onboarding'), f = (S.onb ||= { f: 'all', q: '' });
  const today = new Date(), week = new Date(Date.now() + 7 * 864e5);
  const ready = res.apps.filter(a => humanYes(a) && planFor(a));
  const rows = ready.map(a => {
    const p = S.progress[a.id] || {}, ms = planFor(a);
    const idx = ms.findIndex(m => !p[m.key]);
    return { a, idx, m: ms[idx], n: ms.filter(m => p[m.key]).length };
  });
  const test = { all: () => true, overdue: r => r.m && r.m.due < today, week: r => r.m && r.m.due >= today && r.m.due <= week, cond: r => r.a.conditions.length, open: r => !r.m };
  let shown = rows.filter(test[f.f]);
  if (f.q) { const q = f.q.toLowerCase(); shown = shown.filter(r => `${r.a.id} ${r.a.name} ${r.a.cityName} ${r.a.territory?.id || ''}`.toLowerCase().includes(q)); }
  const cols = MILESTONES.map((m, i) => ({ ...m, items: shown.filter(r => r.idx === i) }));
  const done = shown.filter(r => r.idx < 0);
  v.innerHTML = `
    ${strip([
      { key: 'all', l: 'Getting ready', v: rows.length },
      { key: 'overdue', l: 'Late', v: rows.filter(test.overdue).length, dot: 'var(--d-declined)' },
      { key: 'week', l: 'Due this week', v: rows.filter(test.week).length },
      { key: 'cond', l: 'With conditions', v: rows.filter(test.cond).length, dot: 'var(--d-conditional)' },
      { key: 'open', l: 'Open for business', v: rows.filter(test.open).length },
    ], f.f)}
    <div class="toolbar"><input class="input" id="oq" type="search" placeholder="Search name or city  ( / )" value="${esc(f.q)}" aria-label="Search partners"></div>
    <p class="count-line">${shown.length} ${shown.length === 1 ? 'store' : 'stores'} · drag a card right when a step is done</p>
    ${!rows.length ? empty(`Onboarding starts only after a person approves a partner. <a class="lnk" data-go="feed?bucket=ready&human=pending">Review the ${S.result.apps.filter(x => x.bucket === 'ready' && !S.decisions[x.id]).length} suggested yeses</a>`) : shown.length ? `<div class="kanban">${cols.map((c, ci) => `<div class="col" data-col="${ci}"><h3>${esc(c.label)} <span>${c.items.length}</span></h3>
      ${c.items.sort((x, y) => x.m.due - y.m.due).map(({ a, m, n }) => `<div class="kcard" draggable="true" data-app="${a.id}"><b>${esc(a.name)}</b><div class="muted">${esc(a.cityName)} · ${a.territory?.id || 'no area'}</div><div class="${m.due < today ? 'late' : 'muted'}">Due ${fmtDate(m.due)}</div><div class="p"><i style="width:${(n / 8) * 100}%"></i></div></div>`).join('') || '<div class="small muted">—</div>'}
    </div>`).join('')}<div class="col" data-col="${MILESTONES.length}"><h3>🎉 Open <span>${done.length}</span></h3>${done.map(({ a }) => `<div class="kcard" draggable="true" data-app="${a.id}"><b>${esc(a.name)}</b><div class="muted">${a.territory?.id || 'no area'}</div></div>`).join('') || '<div class="small muted">—</div>'}</div></div>` : empty('No stores here.')}`;
  $$('.strip .kpi', v).forEach(b => b.onclick = () => { f.f = b.dataset.k; renderOnboarding(); });
  $('#oq').oninput = e => { f.q = e.target.value; clearTimeout(renderOnboarding.t); renderOnboarding.t = setTimeout(() => { renderOnboarding(); const i = $('#oq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 150); };
  $$('[data-app]', v).forEach(el => el.onclick = () => openDrawer(el.dataset.app));
  // Drag a card to a column: every step before that column is marked done
  $$('.kcard', v).forEach(c => {
    c.ondragstart = e => { e.dataTransfer.setData('text/plain', c.dataset.app); c.classList.add('dragging'); };
    c.ondragend = () => c.classList.remove('dragging');
  });
  $$('.col', v).forEach(col => {
    col.ondragover = e => { e.preventDefault(); col.classList.add('over'); };
    col.ondragleave = () => col.classList.remove('over');
    col.ondrop = e => {
      e.preventDefault(); col.classList.remove('over');
      const id = e.dataTransfer.getData('text/plain'), ci = +col.dataset.col;
      const prev = { ...(S.progress[id] || {}) };
      S.progress[id] = Object.fromEntries(MILESTONES.map((m, i) => [m.key, i < ci]));
      store.set('storesense.progress', S.progress);
      renderOnboarding();
      const name = S.result.apps.find(a => a.id === id).name;
      if (ci === MILESTONES.length) { confetti(); toast(`${name}'s store is open!`, 'Undo', () => { S.progress[id] = prev; store.set('storesense.progress', S.progress); renderOnboarding(); }); }
      else toast(`${name} moved to ${MILESTONES[ci].label}`, 'Undo', () => { S.progress[id] = prev; store.set('storesense.progress', S.progress); renderOnboarding(); });
    };
  });
}

// ---------------- ask: chat, transcripts, notes, and the side panel on every page ----------------
const GREETING = '<p>Hi! I can find people, explain any suggestion, do the maths, and take you to any page. Ask in plain words — I only answer from your data and the rules, and say so when I don\'t know. I can see the page you are on, so "why is this person on hold?" works on a profile.</p>';
// Every conversation is recorded as a transcript in this browser
S.convos = store.get('storesense.convos', []);
const convoNow = () => S.convos.find(c => c.id === S.convoId);
function startConvo(force) {
  const cur = convoNow();
  if (!force && cur && !cur.msgs.some(m => m.who === 'me')) { S.chat = cur.msgs; return; }
  const c = { id: 'c' + Date.now().toString(36), started: new Date().toISOString(), updated: new Date().toISOString(), title: 'New chat', msgs: [{ who: 'bot', html: GREETING, t: new Date().toISOString() }] };
  S.convos.unshift(c); S.convoId = c.id; S.chat = c.msgs; saveConvos();
}
function openConvo(id) { const c = S.convos.find(x => x.id === id); if (!c) return; S.convoId = id; S.chat = c.msgs; store.set('storesense.convo', id); drawChat(); }
function saveConvos() {
  const c = convoNow();
  if (c) { c.updated = new Date().toISOString(); c.title = c.msgs.find(m => m.who === 'me')?.text.slice(0, 80) || 'New chat'; }
  S.convos = S.convos.filter(x => x.id === S.convoId || x.msgs.some(m => m.who === 'me')).slice(0, 60);
  store.set('storesense.convos', S.convos); store.set('storesense.convo', S.convoId);
}
S.convoId = store.get('storesense.convo', null);
if (convoNow()) S.chat = convoNow().msgs; else startConvo(true);

const when = t => new Date(t).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
function pageLabel() {
  if (S.openId) { const a = S.result?.apps.find(x => x.id === S.openId); return a ? `${a.id} · ${a.name}` : S.openId; }
  const [pg, id] = (S.page || 'overview').split('?')[0].split('/');
  return id ? `${PAGES[pg]?.[1] || pg} · ${id}` : PAGES[S.tab]?.[1] || 'Home';
}
// "this person", "this area": fill in what is open on screen so questions work like asking about the current tab
function withContext(q) {
  if (/\b(app-?\d+|ter-?\d+)\b/i.test(q)) return q;
  if (S.openId && /\b(this|that) (person|applicant|one|profile|partner|site|location|shop)\b|\b(him|her|them|they|he|she|their|his)\b/i.test(q)) return `${q} ${S.openId}`;
  const ter = (S.page || '').match(/^territories\/(TER-\d+)/i)?.[1];
  if (ter && /\b(this|that) (area|territory)\b|\bhere\b/i.test(q)) return `${q} ${ter}`;
  return q;
}
function chatHtml(prefix) {
  return `<div class="msgs" id="${prefix}msgs" aria-live="polite"></div>
    <div class="sugg" id="${prefix}sugg"></div>
    <form class="composer" id="${prefix}composer"><input class="input" id="${prefix}q" placeholder="Ask anything or share news…" aria-label="Message" autocomplete="off"><button class="btn primary">Ask</button><button type="button" class="btn" id="${prefix}undo" title="Undo the last change">Undo</button></form>`;
}
function bindChat(prefix) {
  $(`#${prefix}composer`).onsubmit = e => { e.preventDefault(); const i = $(`#${prefix}q`), q = i.value.trim(); if (q) { i.value = ''; sendAsk(q); } };
  $(`#${prefix}undo`).onclick = () => sendAsk('undo');
  $(`#${prefix}msgs`).onclick = e => {
    const b = e.target.closest('[data-pin],[data-cp]'); if (!b) return;
    const m = S.chat[+(b.dataset.pin ?? b.dataset.cp)]; if (!m) return;
    const q = [...S.chat.slice(0, S.chat.indexOf(m))].reverse().find(x => x.who === 'me')?.text || 'Note';
    if (b.dataset.cp != null) return copy(plainText(m.html), 'Answer copied');
    S.notes.unshift({ t: new Date().toISOString(), q, a: plainText(m.html).replace(/Worked out from .*$/, '').slice(0, 1200), go: m.go || '', pinned: true, page: m.page });
    store.set('storesense.notes', S.notes); m.pinned = true; saveConvos(); drawChat(); refreshNotes(); toast('Saved to notes');
  };
}
function renderAsk() {
  const v = $('#view-ask');
  if (!$('#msgs')) {
    v.innerHTML = `<div class="grid g-main ask-grid"><div class="card chat">${chatHtml('')}</div><div class="card notes-card"><div class="seg-ctl side-tabs" id="ask-tabs"><button data-t="transcripts" class="on">Transcripts</button><button data-t="notes">Notes</button></div><div id="ask-side"></div></div></div>`;
    bindChat('');
    $$('#ask-tabs button').forEach(b => b.onclick = () => { $$('#ask-tabs button').forEach(x => x.classList.toggle('on', x === b)); S.askSide = b.dataset.t; drawAskSide(); });
  }
  drawSuggestions();
  drawAskSide();
  drawChat();
}
function drawAskSide() { const el = $('#ask-side'); if (!el) return; (S.askSide || 'transcripts') === 'notes' ? renderNotes(el) : renderTranscripts(el); }
function drawSuggestions() {
  const sug = suggestionsFor(S.tab, S.result, S.openId);
  for (const id of ['#sugg', '#a-sugg']) {
    const el = $(id); if (!el) continue;
    el.innerHTML = sug.map(x => `<button class="chip" type="button">${esc(x)}</button>`).join('');
    $$('.chip', el).forEach(b => b.onclick = () => sendAsk(b.textContent));
  }
  if ($('#as-ctx')) $('#as-ctx').innerHTML = `<svg><use href="#i-target"/></svg><span>Looking at <b>${esc(pageLabel())}</b></span>`;
}
const ctxNow = () => ({ data: S.data, settings: S.settings, result: S.result, rerun: (d, s) => run(d, s), human: S.decisions });
const linkify = h => linkText(h, true);
function drawChat(typing) {
  const html = S.chat.map((c, i) => c.who === 'me'
    ? `<div class="msg me">${esc(c.text)}${c.page ? `<span class="msg-ctx">on ${esc(c.page)}</span>` : ''}</div>`
    : `<div class="msg bot">${linkify(c.html)}${i ? `<div class="msg-act"><span>${c.t ? when(c.t) : ''}</span><button type="button" data-pin="${i}" ${c.pinned ? 'disabled' : ''}>${c.pinned ? '✓ In notes' : '+ Add to notes'}</button><button type="button" data-cp="${i}">Copy</button></div>` : ''}</div>`).join('')
    + (typing ? '<div class="msg bot"><span class="typing"><i></i><i></i><i></i></span></div>' : '');
  for (const id of ['#msgs', '#a-msgs']) { const m = $(id); if (m) { m.innerHTML = html; m.scrollTop = m.scrollHeight; } }
  if ($('#as-title')) $('#as-title').textContent = convoNow()?.title || 'New chat';
}
function sendAsk(q) {
  if (!S.chat.length) S.chat.push({ who: 'bot', html: GREETING, t: new Date().toISOString() });
  S.chat.push({ who: 'me', text: q, t: new Date().toISOString(), page: pageLabel() });
  saveConvos();
  const visible = $('#msgs') || $('#assist.on');
  drawChat(!!visible);
  setTimeout(() => answerAsk(q), visible ? 380 : 0);
}
const plainText = h => String(h).replace(/<(script|style)[\s\S]*?<\/\1>/g, '').replace(/<\/(p|li|h\d|tr|div)>/g, '\n').replace(/<[^>]+>/g, ' ').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').trim().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const botSay = (html, extra) => S.chat.push({ who: 'bot', html, t: new Date().toISOString(), ...extra });
function answerAsk(q) {
  const before = S.result;
  const out = ask(withContext(q), ctxNow());
  if (out.undo) {
    const prev = S.history.pop();
    if (prev) { S.data = prev.data; S.settings = prev.settings; S.result = run(S.data, S.settings); botSay(`<p>Undone: "${esc(prev.label)}".</p>`); afterChange(); logActivity('update', `Undo: ${prev.label}`, '', 'ask'); }
    else botSay('<p>Nothing to undo.</p>');
  } else if (out.reset) {
    botSay('<p>To start over, click Use sample or upload your file again.</p>');
  } else {
    if (out.data || out.settings) {
      S.history.push({ data: S.data, settings: S.settings, label: q });
      if (out.data) S.data = out.data;
      if (out.settings) S.settings = out.settings;
      S.result = out.result;
      afterChange();
      toast('Updated', 'Undo', () => sendAsk('undo'));
      if (out.focus && before.apps.find(a => a.id === out.focus)?.bucket !== 'ready' && S.result.apps.find(a => a.id === out.focus)?.bucket === 'ready') confetti();
    }
    const goPath = out.focus ? `app/${out.focus}` : out.data || out.settings ? 'overview' : '';
    botSay(out.html, goPath ? { go: goPath } : {});
    const first = plainText(out.html).replace(/\n/g, ' ').replace(/Worked out from .*$/, '').slice(0, 220);
    if (!out.help && !out.unknown && !out.nav) addNote(q, first, goPath);
    logActivity(out.data || out.settings ? 'update' : 'question', q, out.unknown ? 'Not understood — nothing guessed' : first, out.nav || (out.focus ? `app/${out.focus}` : 'ask'));
    if (out.nav) setTimeout(() => go(out.nav), 250);
  }
  saveConvos();
  drawChat();
  drawSuggestions();
  refreshNotes();
}
function refreshNotes() {
  if (S.tab === 'ask') drawAskSide();
  if ($('#a-notes') && !$('#a-notes').hidden) renderNotes($('#a-notes'));
  if ($('#a-trans') && !$('#a-trans').hidden) renderTranscripts($('#a-trans'));
}

// Transcripts: every conversation, word for word, with time and the page it was asked on
function transcriptText(c) {
  return [`StoreSense chat — ${c.title}`, `Started ${when(c.started)} · last message ${when(c.updated)}`, '',
    ...c.msgs.slice(1).map(m => m.who === 'me' ? `[${when(m.t)}${m.page ? ' · on ' + m.page : ''}] You: ${m.text}` : `[${when(m.t)}] StoreSense:\n${plainText(m.html)}\n`)].join('\n');
}
function download(name, text) { const u = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); Object.assign(document.createElement('a'), { href: u, download: name }).click(); setTimeout(() => URL.revokeObjectURL(u), 1000); }
function renderTranscripts(el, viewId) {
  if (!el) return;
  const list = S.convos.filter(c => c.msgs.some(m => m.who === 'me'));
  const c = viewId && S.convos.find(x => x.id === viewId);
  if (c) {
    el.innerHTML = `<div class="tr-head"><button class="btn sm ghost" data-x="back">‹ All transcripts</button><div class="tools"><button class="btn sm" data-x="cont">${c.id === S.convoId ? 'Back to chat' : 'Continue'}</button><button class="btn sm" data-x="copy">Copy</button><button class="btn sm" data-x="dl">Download</button><button class="btn sm ghost" data-x="del" title="Delete this transcript">Delete</button></div></div>
      <h3 class="tr-title">${esc(c.title)}</h3><p class="small muted">${when(c.started)} · ${c.msgs.filter(m => m.who === 'me').length} questions</p>
      <div class="transcript">${c.msgs.slice(1).map(m => m.who === 'me'
        ? `<div class="tl me"><div class="tl-h"><b>You</b><span>${when(m.t)}${m.page ? ` · on ${esc(m.page)}` : ''}</span></div><div>${esc(m.text)}</div></div>`
        : `<div class="tl bot"><div class="tl-h"><b>StoreSense</b><span>${when(m.t)}</span></div><div>${linkify(m.html)}</div></div>`).join('')}</div>`;
    $('[data-x=back]', el).onclick = () => renderTranscripts(el);
    $('[data-x=cont]', el).onclick = () => { openConvo(c.id); S.tab === 'ask' && !$('#assist.on') ? $('#q')?.focus() : (assistTab('chat'), $('#a-q')?.focus()); };
    $('[data-x=copy]', el).onclick = () => copy(transcriptText(c), 'Transcript copied');
    $('[data-x=dl]', el).onclick = () => download(`storesense_chat_${c.started.slice(0, 10)}.txt`, transcriptText(c));
    $('[data-x=del]', el).onclick = () => {
      const keep = S.convos.slice(); S.convos = S.convos.filter(x => x.id !== c.id);
      if (c.id === S.convoId) startConvo(true); else saveConvos();
      drawChat(); renderTranscripts(el);
      toast('Transcript deleted', 'Undo', () => { S.convos = keep; S.convoId = c.id; S.chat = c.msgs; saveConvos(); drawChat(); renderTranscripts(el); });
    };
    return;
  }
  const qv = el.dataset.q || '';
  const shown = qv ? list.filter(x => x.msgs.some(m => (m.text || plainText(m.html || '')).toLowerCase().includes(qv.toLowerCase()))) : list;
  el.innerHTML = `<div class="card-h"><h2>Transcripts</h2><div class="tools"><button class="btn sm" data-x="new">+ New chat</button>${list.length ? '<button class="btn sm" data-x="all">Download all</button>' : ''}</div></div>
    ${list.length ? `<input class="input tr-search" type="search" placeholder="Search your conversations" value="${esc(qv)}" aria-label="Search transcripts">` : ''}
    ${shown.length ? `<ul class="tr-list">${shown.map(x => `<li><button type="button" data-open="${x.id}" class="${x.id === S.convoId ? 'cur' : ''}"><b>${esc(x.title)}</b><span class="muted small">${when(x.updated)} · ${x.msgs.filter(m => m.who === 'me').length} question${x.msgs.filter(m => m.who === 'me').length === 1 ? '' : 's'}${x.id === S.convoId ? ' · current' : ''}</span></button></li>`).join('')}</ul>`
      : `<p class="small muted">${qv ? 'No conversation mentions that.' : 'Every conversation is recorded here, word for word, with the time and the page you asked on. Saved in this browser only.'}</p>`}`;
  $('[data-x=new]', el).onclick = () => { startConvo(); drawChat(); drawSuggestions(); $('#assist.on') ? assistTab('chat') : renderTranscripts(el); toast('New chat started. The last one is saved in Transcripts.'); };
  $('[data-x=all]', el) && ($('[data-x=all]', el).onclick = () => download('storesense_transcripts.txt', list.map(transcriptText).join('\n\n' + '-'.repeat(40) + '\n\n')));
  const sq = $('.tr-search', el);
  if (sq) sq.oninput = e => { el.dataset.q = e.target.value; clearTimeout(renderTranscripts.t); renderTranscripts.t = setTimeout(() => { renderTranscripts(el); const i = $('.tr-search', el); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 150); };
  $$('[data-open]', el).forEach(b => b.onclick = () => renderTranscripts(el, b.dataset.open));
}

// Notes: your own notes, answers you saved, a line for every answer, and insights from the data
function addNote(q, a, goPath) {
  S.notes = S.notes.filter(n => n.pinned || n.q.toLowerCase() !== q.toLowerCase());
  S.notes.unshift({ t: new Date().toISOString(), q, a, go: goPath });
  if (S.notes.length > 150) S.notes.length = 150;
  store.set('storesense.notes', S.notes);
}
function renderNotes(el) {
  if (!el) return;
  const mine = store.get('storesense.mynotes', '');
  const saved = S.notes.filter(n => n.pinned), auto = S.notes.filter(n => !n.pinned);
  const item = n => `<li class="${n.pinned ? 'pinned' : ''}"><div class="qn-q">${esc(n.q)}<span class="muted"> · ${when(n.t)}</span></div><div class="qn-a">${n.go ? `<a class="lnk" data-go="${esc(n.go)}">${esc(n.a)}</a>` : esc(n.a)}</div><button class="qn-x" data-del="${S.notes.indexOf(n)}" aria-label="Remove note">✕</button></li>`;
  el.innerHTML = `<div class="card-h"><h2>Notes</h2><div class="tools"><button class="btn sm" data-n="copy">Copy</button><button class="btn sm" data-n="dl">Download</button></div></div>
    <h3 class="notes-h">My notes</h3>
    <textarea class="compose mynotes" placeholder="Type your own notes. Saved in this browser as you type.">${esc(mine)}</textarea>
    <div class="note-tools"><button class="btn sm ghost" type="button" data-n="stamp" title="Add the time and the page you are on">+ Time and page</button></div>
    <h3 class="notes-h">Saved answers <span class="muted">${saved.length}</span></h3>
    ${saved.length ? `<ul class="qnotes">${saved.map(item).join('')}</ul>` : '<p class="small muted">Click "+ Add to notes" under any answer to keep it here.</p>'}
    <h3 class="notes-h">From your questions <span class="muted">${auto.length}</span></h3>
    ${auto.length ? `<ul class="qnotes">${auto.slice(0, 30).map(item).join('')}</ul><button class="btn sm ghost" data-n="clear">Clear these</button>` : '<p class="small muted">Each answer adds a one-line note here.</p>'}
    <h3 class="notes-h">Insights from your data</h3>
    <ul class="insights">${insights(S.result).map(i => `<li><a class="lnk" data-go="${i.go}">${esc(i.text)}</a></li>`).join('')}</ul>`;
  $$('[data-del]', el).forEach(b => b.onclick = () => { S.notes.splice(+b.dataset.del, 1); store.set('storesense.notes', S.notes); renderNotes(el); });
  const ta = $('.mynotes', el);
  ta.oninput = e => store.set('storesense.mynotes', e.target.value);
  $('[data-n=stamp]', el).onclick = () => { ta.value = `${ta.value.replace(/\s*$/, '')}${ta.value.trim() ? '\n\n' : ''}— ${when(new Date())} · ${pageLabel()}\n`; store.set('storesense.mynotes', ta.value); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); ta.scrollTop = ta.scrollHeight; };
  const text = () => ['StoreSense notes', '', 'My notes:', store.get('storesense.mynotes', ''), '', 'Saved answers:', ...saved.map(n => `- ${n.q}\n  ${n.a.replace(/\n/g, '\n  ')}`), '', 'From questions:', ...auto.map(n => `- ${n.q} → ${n.a}`), '', 'Insights:', ...insights(S.result).map(i => '- ' + i.text)].join('\n');
  $('[data-n=copy]', el).onclick = () => copy(text(), 'Notes copied');
  $('[data-n=dl]', el).onclick = () => download('storesense_notes.txt', text());
  $('[data-n=clear]', el) && ($('[data-n=clear]', el).onclick = () => { S.notes = S.notes.filter(n => n.pinned); store.set('storesense.notes', S.notes); renderNotes(el); });
}

// The side panel: docked on the right of every page, like a browser's assistant sidebar
function openAssist(tab = 'chat') {
  const p = $('#assist');
  if (!p.dataset.built) {
    p.innerHTML = `<div class="as-grip" title="Drag to resize" aria-hidden="true"></div>
      <header class="as-h"><div class="as-brand"><svg><use href="#i-chat"/></svg><div><b>StoreSense</b><span id="as-title" class="muted small"></span></div></div>
        <button class="btn sm ghost" id="as-new" title="New chat (the current one is saved)">+ New</button><button class="btn sm ghost" id="as-x" aria-label="Close" title="Close (Alt+A)">✕</button></header>
      <div class="as-tabs"><div class="seg-ctl" id="as-tabs"><button data-t="chat" class="on">Chat</button><button data-t="trans">Transcripts</button><button data-t="notes">Notes</button></div></div>
      <div class="as-ctx" id="as-ctx"></div>
      <div class="as-b"><div id="a-chat" class="chat">${chatHtml('a-')}</div><div id="a-trans" class="as-pane" hidden></div><div id="a-notes" class="as-pane" hidden></div></div>
      <p class="as-foot">Answers come only from your file and the rules. Chats and notes stay in this browser.</p>`;
    bindChat('a-');
    $('#as-x').onclick = closeAssist;
    $('#as-new').onclick = () => { startConvo(); drawChat(); drawSuggestions(); assistTab('chat'); toast('New chat started. The last one is saved in Transcripts.'); };
    $$('#as-tabs button').forEach(b => b.onclick = () => assistTab(b.dataset.t));
    const grip = $('.as-grip', p);
    grip.onpointerdown = e => {
      e.preventDefault(); grip.setPointerCapture(e.pointerId); document.body.classList.add('as-resizing');
      grip.onpointermove = m => { const w = Math.max(320, Math.min(720, innerWidth - m.clientX)); document.documentElement.style.setProperty('--as-w', w + 'px'); };
      grip.onpointerup = () => { grip.onpointermove = null; document.body.classList.remove('as-resizing'); dispatchEvent(new Event('resize')); store.set('storesense.asw', parseInt(getComputedStyle(document.documentElement).getPropertyValue('--as-w'))); };
    };
    p.dataset.built = 1;
  }
  p.classList.add('on'); p.setAttribute('aria-hidden', 'false');
  document.body.classList.add('assist-open'); store.set('storesense.assistOpen', true);
  setTimeout(() => dispatchEvent(new Event('resize')), 380);
  $('#fab').classList.add('hide');
  assistTab(tab);
  drawChat(); drawSuggestions();
  setTimeout(() => tab === 'chat' && $('#a-q')?.focus(), 80);
}
function assistTab(t) {
  $$('#as-tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  $('#a-chat').hidden = t !== 'chat'; $('#a-notes').hidden = t !== 'notes'; $('#a-trans').hidden = t !== 'trans';
  if (t === 'notes') renderNotes($('#a-notes'));
  if (t === 'trans') renderTranscripts($('#a-trans'));
  if (t === 'chat') drawChat();
}
function closeAssist() {
  $('#assist').classList.remove('on'); $('#assist').setAttribute('aria-hidden', 'true');
  document.body.classList.remove('assist-open'); store.set('storesense.assistOpen', false);
  setTimeout(() => dispatchEvent(new Event('resize')), 380);
  $('#fab').classList.toggle('hide', S.tab === 'ask');
}
$('#fab').onclick = () => ($('#assist').classList.contains('on') ? closeAssist() : openAssist());
document.addEventListener('keydown', e => { if (e.altKey && e.code === 'KeyA') { e.preventDefault(); $('#assist').classList.contains('on') ? closeAssist() : openAssist(); } });
{ const w = store.get('storesense.asw', 0); if (w) document.documentElement.style.setProperty('--as-w', w + 'px'); }
// Reopen the panel if it was open last time (wide screens only, where it docks beside the page)
if (store.get('storesense.assistOpen', false) && innerWidth >= 1100) { const t = setInterval(() => { if (S.result) { clearInterval(t); openAssist(); } }, 120); }
function afterChange() { renderAll(); $('#source').textContent = `${S.source} · edited ${S.history.length}× · ${S.result.apps.length} applications`; }

// ---------------- rulebook ----------------
function renderRules() {
  const cfg = S.result.cfg;
  const steps = [
    ['Check the form', 'Missing or mixed-up details? We put it on hold and ask.'],
    ['Same pin as our store', 'We never open two stores in one pin code. Declined.'],
    ['Partner score', `Below ${cfg.partnerBar}? Declined, with the reason.`],
    ['Money', 'Less than half the money needed? Declined.'],
    ['Our areas', 'Not in an area we want, or no spots left? Waitlist.'],
    ['Ready to fund', `Short on money, earns back slower than ${cfg.maxPayback} months, or too little experience? Waitlist.`],
    ['Pick the best', 'Highest score in each area gets the spot. One store per pin code.'],
    ['Suggest yes, or yes with conditions', 'If something small is missing, the suggestion is yes with a to-do and a deadline.'],
    ['You decide', 'A person accepts or changes every suggestion on the profile, with a reason when they change it. Nothing happens until then.'],
  ];
  $('#view-rules').innerHTML = `
    ${strip([{ l: 'Lowest partner score', v: cfg.partnerBar }, { l: 'Earn back within', v: `${cfg.maxPayback} mo` }, { l: 'Shop experience', v: `${cfg.minExp} yr` }, { l: 'Space between stores', v: `${cfg.overlapKm} km` }, { l: 'Money needed', v: `₹${cfg.minInvest[1]}L`, s: `big city · ₹${cfg.minInvest[2]}L mid · ₹${cfg.minInvest[3]}L small` }])}
    <div class="grid g-2">
    <div class="card"><div class="card-h"><h2>The 8 steps</h2><span class="muted">In this order</span></div>
      <table class="t">${steps.map(([k, v], i) => { const st = RULE_STAGE[i]; const n = st === 'human' ? S.result.apps.filter(a => !S.decisions[a.id] && !a.withdrawn).length : st === 'done' ? S.result.apps.filter(a => a.bucket === 'ready').length : S.result.apps.filter(a => stopStep(a) === st).length; return `<tr class="clickable" data-step="${i + 1}" data-go="${st === 'human' ? 'feed?human=pending' : st === 'done' ? 'feed?bucket=ready' : `feed?stage=${st}`}"><td class="num muted">${i + 1}</td><td><b>${k}</b></td><td>${v}</td><td class="num"><span class="tag">${n}</span></td></tr>`; }).join('')}</table></div>
    <div class="card"><div class="card-h"><h2>Partner score</h2><span class="muted">Out of 100</span></div>
      <table class="t"><tr><th>What we look at</th><th class="num">Points</th></tr>
      <tr><td>Years running a shop</td><td class="num">${WEIGHTS.experience}</td></tr>
      <tr><td>Has worked in a chain or franchise</td><td class="num">${WEIGHTS.compliance}</td></tr>
      <tr><td>Has done shop work before</td><td class="num">${WEIGHTS.relevance}</td></tr>
      <tr><td>Has enough money</td><td class="num">${WEIGHTS.capital}</td></tr>
      <tr><td>Has a shop and a plan</td><td class="num">${WEIGHTS.commitment}</td></tr></table></div>
    <div class="card"><div class="card-h"><h2>What a store costs</h2><span class="muted">₹ lakh</span></div><div class="tbl-wrap"><table class="t"><tr><th></th><th class="num">Big city</th><th class="num">Mid city</th><th class="num">Small town</th></tr>
      ${[['Brand fee', 'fee'], ['First stock', 'stock'], ['Staff a month', 'staff'], ['Bills a month', 'util']].map(([l, k]) => `<tr><td>${l}</td>${[1, 2, 3].map(t => `<td class="num">${ECON[t][k]}</td>`).join('')}</tr>`).join('')}</table></div>
      <p class="small muted" style="margin-top:12px">Plus shop setup and rent. The brand takes ${MARGIN.royalty * 100}% of sales.</p></div>
    <div class="card"><div class="card-h"><h2>Good to know</h2></div><table class="t">
      <tr><td><b>Works for</b></td><td>Any pin code in India.</td></tr>
      <tr><td><b>Estimates</b></td><td>Shoppers, households and nearby shops are best guesses.</td></tr>
      <tr><td><b>Festivals</b></td><td>We check Dasara, Diwali, Christmas and Sankranti dates.</td></tr>
      <tr><td><b>Decided on</b></td><td>${fmtDate(S.result.asOf)}</td></tr></table></div>
    </div>`;
}

// ---------------- utils ----------------
function toast(t, label = '', fn = null) {
  const el = $('#toast'), btn = el.querySelector('button');
  el.querySelector('span').textContent = t; btn.textContent = label;
  btn.onclick = () => { el.classList.remove('on'); fn?.(); };
  el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), fn ? 5000 : 2600);
}
async function copy(text, msg) { try { await navigator.clipboard.writeText(text); toast(msg); } catch { toast('Copy blocked by browser'); } }




// ---------------- navigation: addresses, trail, filters, trace ----------------
// Where an applicant stopped in the rulebook (matches the funnel on Home)
function stopStep(a) {
  if (a.withdrawn || a.duplicateOf || a.decision === 'hold') return 'clean';
  if (a.sub === 'pin-conflict') return 'pin';
  if (a.decision === 'declined') return 'bar';
  if (['out-of-territory', 'territory-full'].includes(a.sub)) return 'territory';
  if (['funding', 'payback', 'experience', 'demographic'].includes(a.sub)) return 'fundable';
  if (['lost-slot', 'pin-taken'].includes(a.sub)) return 'won';
  return 'done';
}
const RULE_STAGE = ['clean', 'pin', 'bar', 'bar', 'territory', 'fundable', 'won', 'done', 'human'];
const STAGE_LABEL = { clean: 'Stopped at: info missing', pin: 'Stopped at: store already there', bar: 'Stopped at: score or money too low', territory: 'Stopped at: outside our areas', fundable: 'Stopped at: money or site not ready', won: 'Stopped at: spot went to someone better' };
const TAG_LABEL = { hot: 'Can open fast', compliant: 'Easy to train', festival: 'Misses festival', notes: 'Has location notes' };
const WHERE = {
  stage: { label: v => STAGE_LABEL[v] || v, test: (a, v) => stopStep(a) === v },
  dec: { label: v => DEC_SHORT[v] || v, test: (a, v) => a.decision === v },
  city: { label: v => `City: ${v}`, test: (a, v) => a.cityName === v },
  ter: { label: v => `Territory: ${v}`, test: (a, v) => a.territory?.id === v },
  pin: { label: v => `Pin ${v}`, test: (a, v) => String(a.assignedPin || a.pin) === v || String(a.pin) === v },
  tier: { label: v => ['', 'Big city', 'Mid city', 'Small town'][v] || `Tier ${v}`, test: (a, v) => String(a.tier) === String(v) },
  exp: { label: v => (v === '10' ? '10+ years in shops' : `${v} year${v === '1' ? '' : 's'} in shops`), test: (a, v) => a.exp != null && (v === '10' ? a.exp >= 10 : Math.floor(a.exp) === +v) },
  changed: { label: () => S.changed?.label || 'Changed', test: a => !!S.changed?.ids.has(a.id) },
  human: { label: v => ({ pending: 'Awaiting your decision', decided: 'Decided by a person', agree: 'You agreed with the suggestion', changed: 'You changed the suggestion' }[v] || v), test: (a, v) => { const d = S.decisions[a.id]; return v === 'pending' ? !d && !a.withdrawn : v === 'decided' ? !!d : v === 'agree' ? !!d && d.d === a.decision : v === 'changed' ? !!d && d.d !== a.decision : true; } },
  final: { label: v => `Final: ${FINAL[v] || v}`, test: (a, v) => S.decisions[a.id]?.d === v },
  tag: { label: v => TAG_LABEL[v] || v, test: (a, v) => (v === 'hot' ? a.hot : v === 'compliant' ? a.compliant : v === 'festival' ? !!a.timeline?.festivalMiss : v === 'notes' ? a.flags?.length > 0 : false) },
};

const placeTitle = p => { const pl = pinPlace(p); return pl ? `${pl.name}, ${pl.district}, ${pl.state}${pl.others?.length ? ` · also ${pl.others.join(', ')}` : ''}` : `Pin ${p}`; };
const pinLink = p => { const pl = pinPlace(p); return `<a class="lnk pin" data-go="map?pin=${esc(p)}" title="${esc(placeTitle(p))} — show on the map">${esc(p)}${pl ? ` <span class="pin-place">${esc(pl.name)}</span>` : ''}</a>`; };
// Turn IDs, territories, stores and pin codes inside any text into links
function linkText(text, isHtml) {
  const h = isHtml ? String(text) : esc(text);
  return h.replace(/\b(APP-\d{2,5}|TER-\d{1,3}|ST-\d{1,3}|[1-8]\d{5})\b(?![^<]*>)/g, m =>
    m.startsWith('APP') ? `<a class="lnk" data-go="app/${m}">${m}</a>`
      : m.startsWith('TER') ? `<a class="lnk" data-go="territories/${m}">${m}</a>`
      : m.startsWith('ST') ? `<a class="lnk" data-go="map?store=${m}">${m}</a>`
      : `<a class="lnk" data-go="map?pin=${m}" title="${esc(placeTitle(m))}">${m}</a>`);
}

// Step-by-step path through the rulebook for one applicant
function traceHtml(a) {
  const steps = [['clean', 'Info complete', 1], ['pin', 'No store in this pin', 2], ['bar', 'Good partner, enough money', 3], ['territory', 'In one of our areas', 5], ['fundable', 'Ready to fund', 6], ['won', 'Got a spot', 7]];
  const stop = stopStep(a), at = stop === 'done' ? steps.length : steps.findIndex(x => x[0] === stop);
  const rows = steps.map(([k, label, rule], i) => {
    const st = i < at ? 'pass' : i === at ? 'fail' : 'skip';
    const note = st === 'fail' ? `<div class="tr-note">${linkText(a.headline)} · <a class="lnk" data-go="feed?stage=${k}">see everyone stopped here</a></div>` : '';
    return `<li class="tr-${st}"><a class="tr-dot" data-go="rules?step=${rule}" title="Rule ${rule}">${st === 'pass' ? '✓' : st === 'fail' ? '✕' : ''}</a><div><a class="lnk" data-go="rules?step=${rule}">${label}</a>${note}</div></li>`;
  }).join('');
  const end = stop === 'done' ? `<li class="tr-pass tr-end"><a class="tr-dot" data-go="rules?step=8">★</a><div><a class="lnk" data-go="feed?dec=${a.decision}">${DEC_SHORT[a.decision]}</a></div></li>` : '';
  return `<div class="sec"><h3>Decision path <span>click any step</span></h3><ol class="trace">${rows}${end}</ol></div>`;
}

// Addresses look like #/feed?stage=bar, #/app/APP-012, #/territories/TER-06, #/map?pin=560034
function parseHash() {
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  const [path, q = ''] = h.split('?');
  return { path: h, parts: path.split('/').filter(Boolean), params: Object.fromEntries(new URLSearchParams(q)) };
}
function go(path) {
  const h = '#/' + path;
  if (decodeURIComponent(location.hash) === decodeURIComponent(h)) route(); else location.hash = h;
}
addEventListener('hashchange', route);
function route() {
  if (!S.result) return;
  const { path, parts, params } = parseHash();
  const [page = 'overview', id] = parts;
  if (page === 'app') { addTrail(path); if (S.openId !== id) openDrawer(id, false, true); return; }
  if (S.openId) closeDrawer(false);
  const tab = PAGES[page] ? page : 'overview';
  S.page = path || 'overview';
  addTrail(S.page);
  if (tab === 'feed') {
    const where = {};
    for (const k of Object.keys(WHERE)) if (params[k] != null && params[k] !== '') where[k] = params[k];
    Object.assign(S.feed, { where, limit: 40 });
    if (params.bucket) S.feed.bucket = params.bucket;
    S.feed.human = params.human && params.bucket ? params.human : 'all';
    if (params.human && params.bucket) delete S.feed.where.human;
    S.feed.sub = params.sub || 'all';
  }
  if (tab === 'territories') { S.ter ||= { f: 'all', q: '', sort: 'priority' }; S.ter.f = params.f || 'all'; S.ter.q = ''; }
  if (tab === 'map') {
    let pin = params.pin;
    if (params.store) pin = String(S.result.stores.find(x => x.id === params.store)?.pin || '');
    if (params.city) mapCity = params.city;
    if (!params.city && !params.pin && !params.store && !mapCity) mapCity = 'india';
    if (pin) {
      S.mapFocus = pin;
      mapCity = S.result.apps.find(a => a.pin === pin)?.cityName || S.result.territories.find(t => t.pins.includes(pin))?.city || S.result.stores.find(x => String(x.pin) === pin)?.city || mapCity;
    }
  }
  showTab(tab);
  if (tab === 'territories' && id) setTimeout(() => flashTer(id), 60);
  if (tab === 'rules' && params.step) setTimeout(() => { const tr = $(`tr[data-step="${params.step}"]`); if (tr) { tr.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' }); tr.classList.remove('flash'); void tr.offsetWidth; tr.classList.add('flash'); } }, 80);
}

// The trail: the last places you visited, newest on the right
function labelFor(path) {
  const [p, q = ''] = path.split('?'), [page, id] = p.split('/'), params = Object.fromEntries(new URLSearchParams(q));
  if (page === 'app') { const a = S.result.apps.find(x => x.id === id); return a ? `${a.name}` : id; }
  if (page === 'feed') {
    const w = Object.entries(params).filter(([k]) => WHERE[k]);
    if (w.length) return w.map(([k, v]) => WHERE[k].label(v)).join(', ');
    return `To-do · ${BUCKET[params.bucket || 'ready']}${params.sub && params.sub !== 'all' ? ` · ${(SUBS[params.bucket || 'ready'].find(x => x[0] === params.sub) || [, params.sub])[1]}` : ''}`;
  }
  if (page === 'territories') return id || (params.f && params.f !== 'all' ? `Territories · ${params.f}` : 'Territories');
  if (page === 'map') return params.pin ? `Map · pin ${params.pin}` : params.store ? `Map · ${params.store}` : params.city ? `Map · ${params.city === 'india' ? 'All India' : params.city}` : 'Map';
  if (page === 'rules') return params.step ? `Rule ${params.step}` : 'Rules';
  return PAGES[page]?.[1] || 'Home';
}
function addTrail(path) {
  const t = S.trail;
  if (t.length && t[t.length - 1] === path) return renderTrail();
  const i = t.indexOf(path);
  if (i >= 0) t.splice(i, 1);
  t.push(path);
  if (t.length > 6) t.shift();
  renderTrail();
}
function renderTrail() {
  const el = $('#trail');
  if (!el || !S.result) return;
  el.innerHTML = S.trail.map((p, i) => `${i ? '<span class="sep" aria-hidden="true">›</span>' : ''}<a class="crumb ${i === S.trail.length - 1 ? 'on' : ''}" data-go="${esc(p)}" title="${esc(labelFor(p))}">${esc(labelFor(p))}</a>`).join('');
  el.scrollLeft = el.scrollWidth;
}
$('#nav-back').onclick = () => history.back();
$('#nav-fwd').onclick = () => history.forward();

// One click handler for every link-like element in the app
document.addEventListener('click', e => {
  const g = e.target.closest?.('[data-go]');
  if (!g || g.closest('#palette')) return;
  e.preventDefault(); e.stopPropagation();
  go(g.dataset.go);
}, true);

// ---------------- immersive touches ----------------
// Score ring: an animated circle that fills to the score
function ring(label, v) {
  const C = 2 * Math.PI * 22, val = Math.max(0, Math.min(100, Math.round(v)));
  return `<div class="ring" style="--off:${C * (1 - val / 100)};--c:${C}"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="22"/><circle class="fill" cx="26" cy="26" r="22"/></svg><b>${val}</b><span>${label}</span></div>`;
}
// Sections ease in as they scroll into view
const revealer = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); revealer.unobserve(e.target); } }), { rootMargin: '0px 0px -40px 0px' }) : null;
function reveal(root) {
  if (!root || !revealer || reduced()) return;
  $$('.card, .kpi, .row, .ter, .col', root).forEach((el, i) => {
    if (el.classList.contains('in')) return;
    el.classList.add('reveal'); el.style.transitionDelay = `${Math.min(i, 10) * 30}ms`;
    revealer.observe(el);
  });
  // Backup: anything already on screen is shown even if the observer never fires
  setTimeout(() => $$('.reveal:not(.in)', root).forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.top < innerHeight && r.bottom > 0) { el.classList.add('in'); revealer.unobserve(el); }
  }), 700);
  addEventListener('scroll', revealOnScroll, { passive: true });
}
function revealOnScroll() {
  $$('.reveal:not(.in)').forEach(el => { const r = el.getBoundingClientRect(); if (r.top < innerHeight - 20 && r.bottom > 0) el.classList.add('in'); });
}
// Depth: the wallpaper drifts against the pointer, and tiles tilt toward it
let tiltEl = null, parallaxQueued = false, lastPt = { x: 0, y: 0 };
document.addEventListener('pointermove', e => {
  if (reduced() || e.pointerType === 'touch') return;
  lastPt = { x: e.clientX, y: e.clientY };
  if (!parallaxQueued) {
    parallaxQueued = true;
    requestAnimationFrame(() => {
      parallaxQueued = false;
      document.documentElement.style.setProperty('--px', (lastPt.x / innerWidth - 0.5).toFixed(3));
      document.documentElement.style.setProperty('--py', (lastPt.y / innerHeight - 0.5).toFixed(3));
    });
  }
  const el = e.target.closest?.('.kpi:not(:disabled), .ter, .kcard');
  if (tiltEl && tiltEl !== el) { tiltEl.classList.remove('tilt'); tiltEl.style.removeProperty('--rx'); tiltEl.style.removeProperty('--ry'); }
  tiltEl = el;
  if (el) {
    const r = el.getBoundingClientRect(), px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--rx', `${(-py * 7).toFixed(2)}deg`);
    el.style.setProperty('--ry', `${(px * 9).toFixed(2)}deg`);
    el.classList.add('tilt');
  }
}, { passive: true });
document.addEventListener('pointerleave', () => { tiltEl?.classList.remove('tilt'); tiltEl = null; });

// A soft light that follows the pointer over cards
document.addEventListener('pointermove', e => {
  const el = e.target.closest?.('.card, .kpi, .row, .ter, .kcard, .action');
  if (!el) return;
  const r = el.getBoundingClientRect();
  el.style.setProperty('--mx', `${e.clientX - r.left}px`);
  el.style.setProperty('--my', `${e.clientY - r.top}px`);
}, { passive: true });


// ---------------- welcome: search, enquiry, recent activity ----------------
function welcomeHtml() {
  return `<section class="welcome" id="welcome">
    <div class="wl-head"><div class="logo big" aria-hidden="true"><svg><use href="#i-shop"/></svg></div>
      <div><p class="eyebrow" style="margin:0">Welcome to</p><h2 class="wl-title">StoreSense</h2></div></div>
    <p class="wl-tag">Find the right franchise partners in the right places, and get their stores open. Every suggestion follows fixed rules you can read, and a person makes every final decision.</p>
    <form class="gsearch" id="gsearch" autocomplete="off" role="search">
      <svg aria-hidden="true"><use href="#i-search"/></svg>
      <input id="gq" placeholder="Search a name, pin code, city or territory — or ask anything" aria-label="Search or ask" aria-autocomplete="list" aria-controls="gs-drop">
      <button class="btn primary">Search</button>
      <div class="gs-drop" id="gs-drop" role="listbox" hidden></div>
    </form>
    <div class="wl-chips">
      <button class="chip" type="button" id="wl-enq">✉ Send a new enquiry</button>
      <button class="chip" type="button" id="wl-lucky">★ Today's top lead</button>
      <button class="chip" type="button" data-go="feed?bucket=ready">Who to call</button>
      <button class="chip" type="button" data-go="map?city=india">India map</button>
      <button class="chip" type="button" data-go="log">Activity log</button>
    </div>
    <div class="enquiry card" id="enquiry" hidden></div>
    <div class="wl-info">
      <div><b>What it does</b><p>Reads your file, checks every application against the rules, and tells you who to call today.</p></div>
      <div><b>How it suggests</b><p>Eight fixed steps give a suggestion — the same file always gives the same one. You make every final decision. <a class="lnk" data-go="rules">See the rules</a></p></div>
      <div><b>Your data</b><p id="wl-data"></p></div>
      <div><b>Recent activity</b><ul class="wl-log" id="wl-log"></ul></div>
    </div>
  </section>`;
}
let gsItems = [], gsIndex = -1;
function searchItems(q) {
  const s = q.trim().toLowerCase(), res = S.result, out = [];
  if (!s) return out;
  for (const a of res.apps.filter(a => `${a.id} ${a.name} ${a.pin} ${a.assignedPin || ''}`.toLowerCase().includes(s)).slice(0, 5))
    out.push({ kind: 'Person', label: a.name, sub: `${a.id} · ${a.cityName} · ${DEC_SHORT[a.decision]}`, go: `app/${a.id}`, a });
  for (const t of res.territories.filter(t => `${t.id} ${t.city}`.toLowerCase().includes(s)).slice(0, 3))
    out.push({ kind: 'Territory', label: `${t.id} · ${t.city}`, sub: `${t.open > 0 ? `${t.open} empty spots` : 'Full'} · ${t.applicants} applied`, go: `territories/${t.id}` });
  const cities = [...new Set(res.apps.map(a => a.cityName))].filter(c => c && c.toLowerCase().includes(s)).slice(0, 2);
  for (const c of cities) out.push({ kind: 'City', label: c, sub: `${res.apps.filter(a => a.cityName === c).length} applied · see on the map`, go: `map?city=${encodeURIComponent(c)}` });
  if (/^\d{6}$/.test(s)) out.push({ kind: 'Pin', label: `Pin ${s}${pinPlace(s) ? ' · ' + pinPlace(s).name : ''}`, sub: `${res.apps.filter(a => a.pin === s).length} applied here · ${pinPlace(s)?.district || cityForPin(s)?.name || stateForPin(s) || 'India'}`, go: `map?pin=${s}` });
  for (const [k, [, title]] of Object.entries(PAGES)) if (title.toLowerCase().startsWith(s)) out.push({ kind: 'Page', label: title, sub: 'Open page', go: k });
  out.push({ kind: 'Ask', label: `Ask: “${q.trim()}”`, sub: 'Answered from your data and the rules', ask: q.trim() });
  return out;
}
function drawSearch() {
  const d = $('#gs-drop');
  if (!gsItems.length) { d.hidden = true; return; }
  d.hidden = false;
  d.innerHTML = gsItems.map((it, i) => `<div class="gs-item ${i === gsIndex ? 'on' : ''}" role="option" data-i="${i}" aria-selected="${i === gsIndex}">${it.a ? avatar(it.a) : `<span class="gs-kind">${it.kind}</span>`}<div><b>${esc(it.label)}</b><div class="small muted">${esc(it.sub)}</div></div></div>`).join('');
  $$('.gs-item', d).forEach(el => { el.onmousedown = e => { e.preventDefault(); pickSearch(gsItems[+el.dataset.i]); }; });
}
function pickSearch(it) {
  const q = $('#gq').value.trim();
  $('#gs-drop').hidden = true; gsItems = [];
  if (!it) return;
  if (it.ask) { logActivity('question', it.ask, 'Sent to Ask', 'ask'); go('ask'); sendAsk(it.ask); return; }
  logActivity('search', q || it.label, `${it.kind}: ${it.label}`, it.go);
  go(it.go);
}
function bindWelcome() {
  const q = $('#gq');
  q.oninput = () => { gsItems = searchItems(q.value); gsIndex = -1; drawSearch(); };
  q.onkeydown = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); gsIndex = Math.min(gsItems.length - 1, gsIndex + 1); drawSearch(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); gsIndex = Math.max(-1, gsIndex - 1); drawSearch(); }
    if (e.key === 'Escape') { $('#gs-drop').hidden = true; }
  };
  q.onblur = () => setTimeout(() => { $('#gs-drop') && ($('#gs-drop').hidden = true); }, 150);
  $('#gsearch').onsubmit = e => {
    e.preventDefault();
    const text = q.value.trim(); if (!text) return;
    const items = searchItems(text);
    const exact = items.find(it => it.kind !== 'Ask' && (it.a ? it.a.id.toLowerCase() === text.toLowerCase() || it.a.name.toLowerCase() === text.toLowerCase() : it.label.toLowerCase().startsWith(text.toLowerCase()) || it.kind === 'Pin'));
    pickSearch(gsIndex >= 0 ? gsItems[gsIndex] : exact || items[items.length - 1]);
  };
  $('#wl-enq').onclick = () => toggleEnquiry();
  $('#wl-lucky').onclick = () => { const top = S.result.actions.find(a => a.x); if (top) { logActivity('search', 'Today\'s top lead', top.title, `app/${top.x.id}`); openDrawer(top.x.id); } };
}
function updateWelcome() {
  const res = S.result, rep = S.data.report;
  if (!$('#wl-data')) return;
  $('#wl-data').innerHTML = `${res.apps.length} applications · ${res.territories.length} territories · ${res.stores.length} stores, from <b>${esc(S.source)}</b>${S.inquiries.length ? ` (+${S.inquiries.length} enquiries)` : ''}. <a class="lnk" id="wl-report">How we read your file</a>`;
  $('#wl-report').onclick = () => openReport();
  $('#wl-log').innerHTML = S.log.slice(0, 4).map(l => `<li><a class="lnk" data-go="${esc(l.go || 'log')}"><span class="tag">${LOG_TYPES[l.type] || l.type}</span> ${esc(l.text)}</a></li>`).join('') || '<li class="muted">Nothing yet. Searches, questions and enquiries appear here.</li>';
}

// Enquiry form: one new applicant, run through the same rules
function toggleEnquiry(show) {
  const box = $('#enquiry');
  const open = show ?? box.hidden;
  box.hidden = !open;
  if (!open) return;
  box.innerHTML = `<div class="card-h"><h2>Send a new enquiry</h2><button class="btn sm ghost" type="button" id="enq-x">Close</button></div>
    <p class="small muted" style="margin-top:-8px">Fill in what you know. It goes through the same rules as everyone else and you see the decision straight away.</p>
    <form id="enq-form" class="enq-grid">
      <label>Name *<input class="input" name="name" required maxlength="80"></label>
      <label>Pin code *<input class="input" name="pin" required inputmode="numeric" pattern="[1-9][0-9]{5}" maxlength="6" placeholder="6 digits"></label>
      <label>City<input class="input" name="city" placeholder="Filled from the pin"></label>
      <label>State<input class="input" name="state" placeholder="Filled from the pin"></label>
      <label>Money to invest (₹ lakh) *<input class="input" name="invest" required type="number" min="0" step="0.5"></label>
      <label>Years running a shop *<input class="input" name="exp" required type="number" min="0" step="0.5"></label>
      <label class="wide">Current or past work<input class="input" name="business" placeholder="e.g. Runs a footwear store"></label>
      <label>Shop space<select class="input" name="space"><option>Not yet identified</option><option>Owned</option><option>Rented</option></select></label>
      <label>Size (sq ft)<input class="input" name="size" type="number" min="0"></label>
      <label>Floor<select class="input" name="floor"><option>Not known</option><option>Ground</option><option>Upper</option><option>Mall unit</option></select></label>
      <label>Open in (months)<input class="input" name="launch" type="number" min="1" value="6"></label>
      <label>Language<select class="input" name="lang"><option>English</option><option>Hindi</option><option>Kannada</option><option>Tamil</option><option>Telugu</option><option>Marathi</option><option>Bengali</option><option>Malayalam</option><option>Gujarati</option></select></label>
      <label class="wide">Notes<input class="input" name="notes" maxlength="200"></label>
      <div class="wide enq-actions"><button class="btn primary">Send through StoreSense</button><span class="small muted">Saved in this browser only.</span></div>
    </form><div id="enq-result"></div>`;
  $('#enq-x').onclick = () => toggleEnquiry(false);
  const f = $('#enq-form');
  f.pin.oninput = () => { const p = f.pin.value; if (/^\d{6}$/.test(p)) { if (!f.city.value) f.city.value = cityForPin(p)?.name || ''; if (!f.state.value) f.state.value = stateForPin(p) || ''; } };
  f.onsubmit = e => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f));
    const n = S.inquiries.length + 1;
    const app = {
      id: `INQ-${String(n).padStart(3, '0')}`, name: v.name.trim(), city: v.city.trim() || cityForPin(v.pin)?.name || '', state: v.state.trim() || stateForPin(v.pin) || '', pin: v.pin,
      invest: +v.invest, exp: +v.exp, business: v.business.trim(), spaceRaw: v.space, space: v.space, size: v.size ? +v.size : null, floorRaw: v.floor, floor: v.floor,
      launch: +v.launch || 6, lang: v.lang, notes: v.notes.trim(), extra: { Source: 'Enquiry form' }, row: null, inquiry: true,
    };
    app.raw = [['Name', v.name, 'name'], ['Pin code', v.pin, 'pin'], ['City', v.city, 'city'], ['State', v.state, 'state'], ['Money to invest (₹ lakh)', v.invest, 'invest'], ['Years running a shop', v.exp, 'exp'], ['Current or past work', v.business, 'business'], ['Shop space', v.space, 'space'], ['Size (sq ft)', v.size, 'size'], ['Floor', v.floor, 'floor'], ['Open in (months)', v.launch, 'launch'], ['Language', v.lang, 'lang'], ['Notes', v.notes, 'notes']].map(([h, val, k]) => ({ h, v: val, k }));
    S.inquiries.push(app); store.set('storesense.inquiries', S.inquiries);
    S.data = { ...S.data, applications: [...S.data.applications, { ...app }] };
    S.result = run(S.data, S.settings);
    renderAll();
    const x = S.result.apps.find(a => a.id === app.id);
    logActivity('enquiry', `${app.name} · ${app.city || app.pin}`, x.headline, `app/${x.id}`);
    toggleEnquiry(true);
    $('#enq-result').innerHTML = `<div class="enq-out"><div style="display:flex;gap:12px;align-items:center">${avatar(x)}<div><b>${esc(x.name)}</b> <span class="muted">${x.id}</span><br><span class="pill d-${x.decision}">${DEC_SHORT[x.decision]}</span> ${linkText(x.headline)}</div></div>${traceHtml(x)}
      <div class="enq-actions"><button class="btn primary" type="button" data-go="app/${x.id}">Open full details</button><button class="btn" type="button" id="enq-again">Send another</button></div></div>`;
    $('#enq-again').onclick = () => { toggleEnquiry(true); $('#enq-form').name.focus(); };
    if (x.bucket === 'ready') confetti();
  };
  setTimeout(() => f.name.focus(), 50);
}

// ---------------- activity log ----------------
const LOG_TYPES = { decision: 'Decision', search: 'Search', question: 'Question', enquiry: 'Enquiry', update: 'Update', rules: 'Rules', upload: 'File' };
function logActivity(type, text, result = '', goPath = '') {
  S.log.unshift({ t: new Date().toISOString(), type, text: String(text).slice(0, 200), result: String(result).replace(/<[^>]+>/g, '').slice(0, 220), go: goPath });
  if (S.log.length > 400) S.log.length = 400;
  store.set('storesense.log', S.log);
  if (S.tab === 'log') renderLog(); else if ($('#wl-log')) updateWelcome();
}
function renderLog() {
  const v = $('#view-log'), f = (S.logF ||= { type: 'all', q: '' });
  let rows = S.log.filter(l => f.type === 'all' || l.type === f.type);
  if (f.q) { const q = f.q.toLowerCase(); rows = rows.filter(l => `${l.text} ${l.result}`.toLowerCase().includes(q)); }
  const count = t => S.log.filter(l => t === 'all' || l.type === t).length;
  v.innerHTML = `
    ${strip([{ key: 'all', l: 'Everything', v: count('all') }, ...Object.entries(LOG_TYPES).map(([k, l]) => ({ key: k, l, v: count(k) }))], f.type)}
    <div class="toolbar"><input class="input" id="lq" type="search" placeholder="Search the log  ( / )" value="${esc(f.q)}" aria-label="Search the log">
      <div class="tools"><button class="btn" id="log-dl">Download log</button><button class="btn ghost" id="log-clear">Clear log</button></div></div>
    <p class="count-line">${rows.length} ${rows.length === 1 ? 'entry' : 'entries'} · saved in this browser</p>
    ${rows.length ? `<div class="card tbl-wrap" style="padding:8px 16px"><table class="t log-t"><tr><th>When</th><th>Type</th><th>What</th><th>Result</th><th></th></tr>${rows.slice(0, 200).map(l => `<tr class="${l.go ? 'clickable' : ''}" ${l.go ? `data-go="${esc(l.go)}"` : ''}><td class="muted">${fmtDate(l.t)} ${new Date(l.t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</td><td><span class="tag">${LOG_TYPES[l.type] || l.type}</span></td><td>${esc(l.text)}</td><td class="muted">${esc(l.result)}</td><td>${l.go ? '<span class="lnk">Open ›</span>' : ''}</td></tr>`).join('')}</table></div>` : empty('Nothing logged yet. Search, ask a question or send an enquiry from Home.')}`;
  $$('.strip .kpi', v).forEach(b => b.onclick = () => { f.type = b.dataset.k; renderLog(); });
  $('#lq').oninput = e => { f.q = e.target.value; clearTimeout(renderLog.t); renderLog.t = setTimeout(() => { renderLog(); const i = $('#lq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 150); };
  $('#log-dl').onclick = () => {
    const csv = [['Time', 'Type', 'What', 'Result'], ...S.log.map(l => [l.t, LOG_TYPES[l.type] || l.type, l.text, l.result])].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const u = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    Object.assign(document.createElement('a'), { href: u, download: 'storesense_activity_log.csv' }).click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  };
  $('#log-clear').onclick = e => {
    if (e.target.dataset.sure) { S.log = []; store.set('storesense.log', S.log); renderLog(); toast('Log cleared'); }
    else { e.target.dataset.sure = 1; e.target.textContent = 'Click again to clear'; }
  };
}

// ---------------- how we read your file ----------------
function openReport() {
  const rep = S.data.report || { sheets: [], assumptions: [] };
  const box = $('#palette .pal-box');
  $('#palette').classList.add('on');
  const KIND = { applications: 'Applications', territories: 'Territories', stores: 'Existing stores', skipped: 'Skipped' };
  box.innerHTML = `<h2>How we read your file</h2><div class="report">
    ${rep.sheets.map(sh => `<div class="rep-sheet"><b>${esc(sh.name)}</b> <span class="tag">${KIND[sh.type] || sh.type}</span>${sh.type !== 'skipped' ? ` <span class="muted small">${sh.read} rows read · headers on row ${sh.header}</span>
      <div class="small">${Object.entries(sh.columns || {}).map(([k, h]) => `<span class="tag ok" title="Used as ${k}">${esc(h)}</span>`).join(' ')}</div>
      ${sh.missing?.length ? `<div class="small muted">Not in this sheet: ${sh.missing.join(', ')} — treated as unknown.</div>` : ''}
      ${sh.extra?.length ? `<div class="small muted">Kept but not used for decisions: ${sh.extra.map(esc).join(', ')}.</div>` : ''}` : ' <span class="muted small">no applicant, territory or store table found</span>'}</div>`).join('') || '<p class="muted">Sample data in the case template layout.</p>'}
    ${rep.assumptions.length ? `<h3>Assumptions</h3><ul>${rep.assumptions.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : '<p class="small muted">No assumptions were needed.</p>'}
    <p class="small muted">Row-level fixes (like "₹25,00,000 read as 25 lakh") are listed in each applicant's details.</p>
    <button class="btn" type="button" id="rep-x">Close</button></div>`;
  $('#rep-x').onclick = () => closePalette();
}

// ---------------- small helpers ----------------
const initials = n => String(n).split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
const avatar = a => `<div class="avatar" style="background:var(--d-${a.decision})" aria-hidden="true">${esc(initials(a.name))}</div>`;
const level = x => (x == null ? '—' : x >= 0.7 ? 'High' : x >= 0.45 ? 'Medium' : 'Low');
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Numbers in tiles roll up from their last value
const lastCount = new Map();
function countUp(root) {
  if (!root) return;
  $$('.kpi .v', root).forEach(el => {
    const to = Number(el.textContent);
    if (!Number.isInteger(to)) return;
    const key = el.closest('.kpi').querySelector('.l')?.textContent + root.id;
    const from = lastCount.get(key) ?? 0;
    lastCount.set(key, to);
    if (from === to || reduced()) return;
    const t0 = performance.now(), dur = 600;
    const step = now => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

// A short burst of confetti for wins
function confetti() {
  if (reduced()) return;
  const colors = ['--d-approved', '--d-conditional', '--d-hold', '--d-waitlist', '--spot', '--accent'].map(css);
  for (let i = 0; i < 90; i++) {
    const c = document.body.appendChild(Object.assign(document.createElement('i'), { className: 'confetti' }));
    c.style.background = colors[i % colors.length];
    const x0 = innerWidth / 2 + (Math.random() - 0.5) * 200, x1 = x0 + (Math.random() - 0.5) * innerWidth * 0.9;
    const y1 = innerHeight * (0.6 + Math.random() * 0.5), rot = (Math.random() - 0.5) * 1440;
    c.animate([{ transform: `translate(${x0}px, -20px) rotate(0)`, opacity: 1 }, { transform: `translate(${x1}px, ${y1}px) rotate(${rot}deg)`, opacity: 0 }],
      { duration: 1400 + Math.random() * 900, easing: 'cubic-bezier(.2,.6,.4,1)' }).onfinish = () => c.remove();
  }
}

// ---------------- quick search (Ctrl/⌘ K) ----------------
const pal = { items: [], i: 0 };
function openPalette(mode = 'search') {
  const box = $('#palette .pal-box');
  $('#palette').classList.add('on');
  if (mode === 'keys') {
    box.innerHTML = `<h2>Keyboard shortcuts</h2><div class="keys">
      <kbd>Ctrl K</kbd><span>Find anyone or any page</span><kbd>/</kbd><span>Search this page</span>
      <kbd>1 – 7</kbd><span>Go to a page</span><kbd>↑ ↓</kbd><span>Move through the To-do list</span>
      <kbd>Enter</kbd><span>Open the selected person</span><kbd>T</kbd><span>Switch light and dark</span>
      <kbd>Esc</kbd><span>Close</span></div>`;
    return;
  }
  box.innerHTML = `<input id="pal-q" placeholder="Type a name, ID, city or page…" autocomplete="off" aria-label="Find"><div class="pal-list" id="pal-list"></div>`;
  const q = $('#pal-q');
  q.oninput = () => { pal.i = 0; drawPalette(q.value); };
  q.onkeydown = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); pal.i = Math.min(pal.items.length - 1, pal.i + 1); drawPalette(q.value, true); }
    if (e.key === 'ArrowUp') { e.preventDefault(); pal.i = Math.max(0, pal.i - 1); drawPalette(q.value, true); }
    if (e.key === 'Enter') { e.preventDefault(); pal.items[pal.i]?.go(); }
  };
  pal.i = 0; drawPalette('');
  setTimeout(() => q.focus(), 0);
}
function closePalette() { $('#palette').classList.remove('on'); if ($('#palette').contains(document.activeElement)) document.activeElement.blur(); }
function drawPalette(text, keepScroll) {
  const q = text.trim().toLowerCase(), res = S.result;
  const pages = Object.entries(PAGES).map(([k, [, title, sub]]) => ({ group: 'Pages', title, sub, go: () => { closePalette(); go(k); } }));
  const people = res.apps.filter(a => !q || `${a.id} ${a.name} ${a.cityName} ${a.pin}`.toLowerCase().includes(q))
    .sort((a, b) => (a.bucket === 'ready' ? 0 : 1) - (b.bucket === 'ready' ? 0 : 1)).slice(0, q ? 12 : 5)
    .map(a => ({ group: 'People', a, title: a.name, sub: `${a.id} · ${a.cityName} · ${DEC_SHORT[a.decision]}`, go: () => { closePalette(); openDrawer(a.id); } }));
  const areas = res.territories.filter(t => q && `${t.id} ${t.city} ${t.pins.join(' ')}`.toLowerCase().includes(q)).slice(0, 5)
    .map(t => ({ group: 'Territories', title: `${t.id} · ${t.city}`, sub: `${t.open > 0 ? `${t.open} empty spots` : 'Full'} · ${t.priority} interest`, go: () => { closePalette(); go(`territories/${t.id}`); } }));
  pal.items = [...pages.filter(p => !q || p.title.toLowerCase().includes(q)), ...people, ...areas];
  let last = '';
  $('#pal-list').innerHTML = pal.items.map((it, i) => {
    const head = it.group !== last ? `<div class="pal-group">${(last = it.group)}</div>` : '';
    return `${head}<div class="pal-item ${i === pal.i ? 'on' : ''}" data-i="${i}">${it.a ? avatar(it.a) : ''}<div class="grow"><b>${esc(it.title)}</b><div>${esc(it.sub)}</div></div></div>`;
  }).join('') || '<div class="empty" style="margin:8px">Nothing found.</div>';
  $$('#pal-list .pal-item').forEach(el => { el.onclick = () => pal.items[+el.dataset.i].go(); el.onmousemove = () => { if (pal.i !== +el.dataset.i) { pal.i = +el.dataset.i; drawPalette(text, true); } }; });
  if (keepScroll) $('#pal-list .pal-item.on')?.scrollIntoView({ block: 'nearest' });
}
$('#palette').addEventListener('click', e => { if (e.target.id === 'palette') closePalette(); });
$('#btn-search').onclick = () => openPalette();
$('#btn-keys').onclick = () => openPalette('keys');

// ---------------- theme ----------------
function currentTheme() { return document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); }
function setTheme(t) {
  document.documentElement.dataset.theme = t; colorCache = {}; if (flow) flow.sprites = null;
  if (map3d) { try { map3d.map?.remove(); } catch { /* already gone */ } map3d = null; $('#view-map').innerHTML = ''; }
  try { localStorage.setItem('storesense.theme2', t); } catch { /* storage blocked */ }
  $$('#theme button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  renderAll();
}
$$('#theme button').forEach(b => { b.classList.toggle('on', b.dataset.t === currentTheme()); b.onclick = () => setTheme(b.dataset.t); });

// ---------------- keyboard ----------------
const kb = { i: -1 };
function moveRow(d) {
  const rows = $$('#view-feed .row');
  if (!rows.length) return;
  kb.i = Math.max(0, Math.min(rows.length - 1, kb.i + d));
  rows.forEach((r, i) => r.classList.toggle('kb', i === kb.i));
  rows[kb.i].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
document.addEventListener('keydown', e => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#palette').classList.contains('on') ? closePalette() : openPalette(); return; }
  if (e.key === 'Escape') { closePalette(); return; }
  if (typing || e.metaKey || e.ctrlKey || e.altKey || $('#palette').classList.contains('on')) return;
  const tabs = Object.keys(PAGES);
  if (/^[1-8]$/.test(e.key)) { go(tabs[+e.key - 1]); return; }
  if (e.key === '/') { const i = $(`#view-${S.tab} input[type=search], #view-${S.tab} #q`); e.preventDefault(); i ? i.focus() : openPalette(); return; }
  if (e.key === '?') { openPalette('keys'); return; }
  if (e.key.toLowerCase() === 't') { setTheme(currentTheme() === 'dark' ? 'light' : 'dark'); return; }
  if (S.tab === 'feed' && !$('#drawer').classList.contains('on')) {
    if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); moveRow(1); }
    if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); moveRow(-1); }
    if (e.key === 'Enter' && kb.i >= 0) { const r = $$('#view-feed .row')[kb.i]; r && openDrawer(r.dataset.id); }
  }
});

load(sampleSheets(), 'Sample data', true);
{ const t = new URLSearchParams(location.search).get('tab'); if (t && PAGES[t] && !location.hash) history.replaceState(null, '', '#/' + t); }
route();
