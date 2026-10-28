// ask.js — "Ask StoreSense". Reads a plain-language question with fixed patterns,
// applies any new information to the data, re-runs the rulebook, and explains
// what changed. Rules suggest and people decide; this file only reads the question and writes answers.
import { normFloor, parseLakh } from './parse.js';
import { lakh, fmtDate, PART_LABEL, WEIGHTS, siteInsight, trafficSummary } from './engine.js';
import { normalizeQuestion, answerMore } from './ask-more.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r1 = n => Math.round(n * 10) / 10;

export const DECISION_LABEL = { approved: 'Suggest approve', conditional: 'Suggest approve with conditions', hold: 'Suggest hold', waitlist: 'Suggest waitlist', declined: 'Suggest decline' };
export const FINAL_LABEL = { approved: 'Approved', conditional: 'Approved with conditions', hold: 'On hold', waitlist: 'Waitlisted', declined: 'Declined' };
let HUMAN = {};

function findIds(q, result) {
  const ids = new Set();
  const all = result.apps.map(a => a.id);
  for (const m of q.matchAll(/\bapp(?:lication)?[\s\-#_]*0*(\d{1,4})\b/gi)) {
    const n = +m[1];
    const hit = all.find(id => +(id.match(/\d+/) || [NaN])[0] === n);
    if (hit) ids.add(hit);
  }
  // names ("Why is Ravi Kumar on hold?")
  if (!ids.size) {
    const lq = q.toLowerCase();
    for (const a of result.apps) if (a.name.length > 4 && lq.includes(a.name.toLowerCase())) ids.add(a.id);
  }
  return [...ids];
}
function findTers(q, result) {
  const out = [];
  for (const m of q.matchAll(/\bter(?:ritory)?[\s\-#_]*0*(\d{1,3})\b/gi)) {
    const t = result.territories.find(t => +(t.id.match(/\d+/) || [NaN])[0] === +m[1]);
    if (t) out.push(t);
  }
  return out;
}

// ---------- New information → data edits ----------
function appEdits(q, app) {
  const s = q.toLowerCase();
  const e = {}, said = [];
  if (/withdr|pulled out|no longer interested|not interested|dropped out|backed out/.test(s)) { e.withdrawn = true; said.push('withdrew'); return { e, said }; }
  if (/(lost|no longer has|gave up|cancelled).*(space|shop|lease)/.test(s)) { e.space = 'Not yet identified'; e.size = null; e.floor = 'Not known'; said.push('no longer has a space'); }
  else if (/(found|got|secured|identified|signed|leased|rented|bought|purchased|acquired|has now|now has|owns|taken).*(space|shop|premises|unit|store|property|site|floor)/.test(s) ||
      /(ground|upper|first|mall)[- ]floor (space|shop|unit)/.test(s)) {
    e.space = /bought|purchased|owns|own (a|the)|acquired|family property|inherited/.test(s) ? 'Owned' : 'Rented';
    said.push(`now has a space (${e.space.toLowerCase()})`);
    const fl = /mall/.test(s) ? 'Mall unit' : /ground/.test(s) ? 'Ground' : /(upper|first|second|1st|2nd)/.test(s) ? 'Upper' : null;
    if (fl) { e.floor = fl; said.push(`floor: ${fl.toLowerCase()}`); }
    const sz = s.match(/(\d[\d,]*)\s*(sq|square|sft)/);
    if (sz) { e.size = +sz[1].replace(/,/g, ''); said.push(`${e.size} sq ft`); }
  }
  const money = s.match(/(\d[\d,.]*)\s*(lakh|lac|l\b|crore|cr\b)/);
  if (money && /(invest|capital|fund|budget|loan|co-?investor|money|afford|raise|sanction)/.test(s)) {
    const v = parseLakh(`${money[1]} ${money[2]}`).value;
    if (/(more|additional|extra|another|top.?up|plus)/.test(s) && app.invest != null) { e.invest = r1(app.invest + v); said.push(`investment up by ${lakh(v)} to ${lakh(e.invest)}`); }
    else { e.invest = v; said.push(`investment now ${lakh(v)}`); }
  }
  const yrs = s.match(/(\d+(\.\d+)?)\s*(years?|yrs)/);
  if (yrs && /(experience|retail|running|managed|managing|run)/.test(s)) { e.exp = +yrs[1]; said.push(`retail experience ${e.exp} years`); }
  const pin = s.match(/\b(\d{6})\b/);
  if (pin && /(pin|move|moved|relocat|instead|switch)/.test(s)) { e.pin = pin[1]; said.push(`pin code ${pin[1]}`); }
  const mon = s.match(/(\d+)\s*months?/);
  if (mon && /(launch|open|start|ready)/.test(s)) { e.launch = +mon[1]; said.push(`target launch ${e.launch} months`); }
  if (/hired|has a (store )?manager|appointed .*manager/.test(s)) { e.notes = `${app.notes ? app.notes + '. ' : ''}Has hired an experienced store manager`; said.push('has hired a store manager'); }
  const lang = s.match(/prefers? (kannada|hindi|english)/);
  if (lang) { e.lang = lang[1][0].toUpperCase() + lang[1].slice(1); said.push(`training language ${e.lang}`); }
  const biz = q.match(/(?:now runs|now works as|business is|used to run|has run)\s+(.+?)(?:[.;]|$)/i);
  if (biz) { e.business = biz[1]; said.push(`business: "${biz[1]}"`); }
  if (/(city|located) (is|in) /.test(s)) {
    const c = q.match(/(?:city|located) (?:is|in) ([A-Za-z\- ]+)/i);
    if (c) { e.city = c[1].trim(); said.push(`city ${e.city}`); }
  }
  return { e, said };
}

function settingEdits(q, settings) {
  const s = q.toLowerCase(), out = {}, said = [];
  const tier = s.match(/tier[\s-]*([123])/);
  const money = s.match(/(\d+(\.\d+)?)\s*(lakh|lac|l\b)/);
  if (tier && money && /(min|require|floor|threshold|at least|need)/.test(s)) {
    out.minInvest = { ...settings.minInvest, [tier[1]]: +money[1] }; said.push(`Tier ${tier[1]} minimum investment = ${lakh(+money[1])}`);
  }
  const yrs = s.match(/(\d+(\.\d+)?)\s*(years?|yrs)/);
  if (yrs && /(min|require|threshold|at least)/.test(s) && /experience/.test(s)) { out.minExp = +yrs[1]; said.push(`minimum retail experience = ${+yrs[1]} years`); }
  const pb = s.match(/payback.*?(\d+)\s*months?|(\d+)\s*months?.*payback/);
  if (pb && /(target|max|limit|within|under|set)/.test(s)) { out.maxPayback = +(pb[1] || pb[2]); said.push(`payback target = ${out.maxPayback} months`); }
  const bar = s.match(/(?:bar|cut-?off|partner score).*?(\d{2})/);
  if (bar && /(set|raise|lower|change|make|what if|is)/.test(s)) { out.partnerBar = +bar[1]; said.push(`partner score bar = ${out.partnerBar}`); }
  const km = s.match(/(\d+(\.\d+)?)\s*(km|kilomet)/);
  if (km && /(radius|ring|distance|between stores|gap|catchment|space)/.test(s)) { out.overlapKm = +km[1]; said.push(`space between stores = ${out.overlapKm} km for every territory`); }
  return { out, said };
}

function terEdits(q, t) {
  const s = q.toLowerCase(), e = {}, said = [];
  const sl = s.match(/(\d+)\s*(open )?slots?/) || s.match(/slots?\s*(to|=|is|are)?\s*(\d+)/);
  if (sl) { e.slots = +(sl[1].match(/\d/) ? sl[1] : sl[2]); said.push(`${e.slots} open slots`); }
  const pr = s.match(/\b(high|medium|low)\b/);
  if (pr && /priority/.test(s)) { e.priority = pr[1][0].toUpperCase() + pr[1].slice(1); said.push(`priority ${e.priority}`); }
  const addPin = s.match(/add(?:ed)?\s+(?:pin\s*(?:code)?\s*)?(\d{6})/);
  if (addPin) { e.pins = [...new Set([...t.pins, addPin[1]])]; said.push(`now covers pin ${addPin[1]}`); }
  return { e, said };
}

// ---------- Explanations ----------
export function explain(x, res) {
  const cfg = res.cfg;
  const tag = `<span class="pill d-${x.decision}">${DECISION_LABEL[x.decision]}</span>`;
  const hd = HUMAN[x.id];
  let h = `<p><b>${esc(x.id)} · ${esc(x.name)}</b> ${tag}</p><p>${esc(x.headline)}.</p>`;
  h += hd ? `<p class="ask-sub">Your decision</p><p><b>${FINAL_LABEL[hd.d]}</b> by ${esc(hd.by || 'a reviewer')} on ${fmtDate(new Date(hd.at))}${hd.d === x.decision ? ' (agrees with the suggestion)' : ` (changed from the suggestion${hd.note ? `: “${esc(hd.note)}”` : ''})`}.</p>` : `<p class="small">This is a suggestion. Nobody has made the final decision yet; record it on <a class="lnk" data-go="app/${x.id}">the profile</a>.</p>`;
  if (x.reasons?.length) h += `<p class="ask-sub">Why</p><ul>${x.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>`;
  if (!x.withdrawn && x.decision !== 'hold' && x.parts) {
    h += `<p class="ask-sub">Numbers</p><ul>
      <li>Partner score <b>${x.partner}</b> (need ${cfg.partnerBar}). Location score <b>${x.site}</b>.</li>
      <li>Needs ${lakh(x.needed)}, has ${lakh(x.invest)}.${isFinite(x.payback) ? ` Earns it back in about ${Math.round(x.payback)} months.` : ''}</li>
      <li>${x.territory ? `Area ${x.territory.id} (${x.territory.priority} interest).` : 'Not in one of our areas.'}${x.nearest ? ` Closest store ${r1(x.nearest.km)} km away.` : ''}</li></ul>`;
  }
  if (x.issues?.some(i => i.level === 'warn')) h += `<p class="ask-sub">We fixed</p><ul>${x.issues.filter(i => i.level === 'warn').map(i => `<li>${esc(i.text)}</li>`).join('')}</ul>`;
  h += `<p class="ask-sub">Next</p>${nextSteps(x, res)}`;
  return h;
}

export function nextSteps(x, res) {
  if (x.decision === 'hold') return `<ul><li>Ask them (in ${esc(x.lang)}) for: ${x.request.map(esc).join('; ')}.</li><li>When they reply, tell me, for example "${esc(x.id)} can invest 30 lakh".</li></ul>`;
  if (x.decision === 'approved' || x.decision === 'conditional')
    return `<ol>${x.milestones.map(m => `<li><b>${esc(m.label)}</b> by ${fmtDate(m.due)} (${esc(m.owner)}): ${esc(m.detail)}</li>`).join('')}</ol>`;
  if (x.decision === 'waitlist') {
    const pos = x.territory ? x.territory.waitlist.indexOf(x) : -1;
    return `<ul>${pos >= 0 ? `<li>Position ${pos + 1} on the ${esc(x.territory.id)} waitlist.</li>` : ''}${x.redirect ? `<li>Offer pin ${x.redirect.pin} in ${esc(x.redirect.territory.id)} (${r1(x.redirect.km)} km away).</li>` : ''}<li>Nurture: ${esc(nurtureAdvice(x))}</li></ul>`;
  }
  if (x.archived && x.redirect) return `<ul><li>Suggested for the archive. A strong partner, so the archive note offers pin ${x.redirect.pin} in ${esc(x.redirect.territory.id)} if they want to re-apply.</li></ul>`;
  return `<ul><li>${x.withdrawn ? 'No action.' : 'Send a polite decline with the reason; they can re-apply later.'}</li></ul>`;
}

export function nurtureAdvice(x) {
  return {
    funding: `close the ${lakh(x.gap)} gap with a co-investor or loan, or choose a smaller format.`,
    payback: 'look for a ground-floor or owned space with lower rent so the store pays back inside target.',
    experience: 'work or shadow at a brand store for 6 months, or bring in an experienced store manager.',
    demographic: 'pick a different pin with stronger demographics (we suggest one where possible).',
    'out-of-territory': 'keep warm; the pin is logged as a candidate for a future territory.',
    'territory-full': 'keep warm until the brand opens a slot here.',
    'lost-slot': 'first in line if a winner drops out or a slot opens.',
    'pin-taken': 'offer another pin in the same city when one frees up.',
  }[x.sub] || 'keep in touch monthly.';
}

function terExplain(t, res) {
  const label = t.status === 'full-none-planned' ? 'Full — no new store planned' : t.status === 'filled' ? 'All slots filled' : `${t.open} of ${t.slots} slots still open`;
  return `<p><b>${esc(t.id)} · ${esc(t.city)}</b> (Tier ${t.tier}, ${t.priority} priority): ${label}.</p><ul>
    <li>Winners: ${t.winners.length ? t.winners.map(w => `${esc(w.id)} ${esc(w.name)} (${w.combined})`).join(', ') : 'none'}.</li>
    <li>Waitlist: ${t.waitlist.length ? t.waitlist.map(w => `${esc(w.id)} (${w.combined})`).join(', ') : 'none'}.</li>
    <li>Free pins: ${t.pinsFree.join(', ') || 'none'}.</li>
    ${t.pairings.length ? `<li>${t.pairings.length} suggested co-investor partnerships (backups, not slot winners): ${t.pairings.map(p => `${esc(p.a.id)} + ${esc(p.b.id)} = ${lakh(p.capital)}`).join('; ')}.</li>` : ''}
    ${t.needsLeads ? '<li><b>Needs new leads:</b> not enough qualified applicants for the open slots.</li>' : ''}</ul>`;
}

export function diff(before, after, focus = []) {
  const prev = new Map(before.apps.map(a => [a.id, a]));
  const changes = [];
  for (const a of after.apps) {
    const b = prev.get(a.id);
    if (!b) continue;
    if (b.decision !== a.decision || (focus.includes(a.id) && b.headline !== a.headline))
      changes.push({ id: a.id, name: a.name, from: b.decision, to: a.decision, why: a.headline, focus: focus.includes(a.id) });
  }
  changes.sort((p, q) => q.focus - p.focus);
  return changes;
}

function renderChanges(changes) {
  if (!changes.length) return '<p>No decision changed.</p>';
  return `<p class="ask-sub">Changes</p><ul>${changes.slice(0, 12).map(c =>
    `<li><b>${esc(c.id)}</b> ${esc(c.name)}: ${DECISION_LABEL[c.from]} → <b>${DECISION_LABEL[c.to]}</b>. ${esc(c.why)}.</li>`).join('')}${changes.length > 12 ? `<li>…and ${changes.length - 12} more.</li>` : ''}</ul>`;
}

const HELP = `<p>Examples:</p><ul>
<li>Why is APP-007 on hold?</li>
<li>APP-012 has now found a ground-floor space</li>
<li>TER-06 now has 3 open slots</li>
<li>What if Tier 1 minimum is 50 lakh?</li>
<li>Which territories need leads?</li></ul>`;

// ctx: { data, settings, result, rerun(data, settings) → result }
function askCore(q, ctx) {
  const { data, settings, result } = ctx;
  const s = q.toLowerCase().trim();
  if (!s || /^(help|\?|what can you do)/.test(s)) return { html: HELP };
  if (/^(undo|revert|go back)/.test(s)) return { undo: true };
  if (/^(reset|start over)/.test(s)) return { reset: true };

  const ids = findIds(q, result), ters = findTers(q, result);
  const isQuestion = /^(why|what|how|which|who|when|where|is|are|does|do|can|explain|show|tell|list|status|give)\b/.test(s) && !/what if/.test(s);

  // New store opened
  const storeM = s.match(/(new )?store (opened|open|launched).*?(\d{6})/) || s.match(/opened a store .*?(\d{6})/);
  if (storeM && !isQuestion) {
    const pin = storeM[3] || storeM[1];
    const nd = { ...data, stores: [...data.stores, { id: `ST-${String(data.stores.length + 1).padStart(2, '0')}`, city: '', pin, opened: new Date().getFullYear() }] };
    const after = ctx.rerun(nd, settings);
    return { data: nd, result: after, html: `<p>Store added in ${pin}.</p>${renderChanges(diff(result, after))}` };
  }

  // Settings (what-if)
  const set = settingEdits(q, settings);
  if (set.said.length && (/what if|set|change|require|raise|lower|make|minimum|target/.test(s)) && !ids.length) {
    const ns = { ...settings, ...set.out };
    const after = ctx.rerun(data, ns);
    return { settings: ns, result: after, html: `<p>Applied: ${set.said.join(', ')}.</p><p>${after.funnel.outcome.map(o => `${DECISION_LABEL[o.key]} ${o.n}`).join(' · ')}</p>${renderChanges(diff(result, after))}<p class="muted">Say "undo" to revert.</p>` };
  }

  // Territory edits
  if (ters.length && !isQuestion) {
    const t = ters[0];
    const { e, said } = terEdits(q, t);
    if (said.length) {
      const nd = { ...data, territories: data.territories.map(x => (x.id === t.id ? { ...x, ...e } : x)) };
      const after = ctx.rerun(nd, settings);
      return { data: nd, result: after, html: `<p>Updated ${esc(t.id)}: ${said.join(', ')}.</p>${renderChanges(diff(result, after))}` };
    }
  }

  // Applicant edits ("APP-012 has now found a ground-floor space")
  if (ids.length && !isQuestion) {
    let nd = data, allSaid = [];
    for (const id of ids) {
      const app = data.applications.find(a => a.id === id);
      const { e, said } = appEdits(q, app);
      if (!said.length) continue;
      nd = { ...nd, applications: nd.applications.map(a => (a.id === id ? { ...a, ...e } : a)) };
      allSaid.push(`${id}: ${said.join(', ')}`);
    }
    if (allSaid.length) {
      const after = ctx.rerun(nd, settings);
      const changes = diff(result, after, ids);
      const x = after.apps.find(a => a.id === ids[0]);
      return { data: nd, result: after, focus: ids[0], html: `<p>Updated ${esc(allSaid.join('; '))}.</p>${renderChanges(changes)}<hr>${explain(x, after)}` };
    }
  }

  // Questions about applicants
  if (ids.length) {
    if (/next|step|prepare|training|onboard|milestone/.test(s)) return { focus: ids[0], html: ids.map(id => { const x = result.apps.find(a => a.id === id); return `<p><b>${esc(x.id)} · ${esc(x.name)}</b> — ${DECISION_LABEL[x.decision]}</p>${nextSteps(x, result)}`; }).join('') };
    return { focus: ids[0], html: ids.map(id => explain(result.apps.find(a => a.id === id), result)).join('<hr>') };
  }
  if (ters.length) return { html: ters.map(t => terExplain(t, result)).join('<hr>') };

  // Pool questions
  if (/lead|gap|where.*(drive|need|recruit)|no (qualified )?applicant|empty/.test(s)) {
    const g = result.territories.filter(t => t.needsLeads);
    return { html: g.length ? `<p>Territories with open slots and not enough qualified applicants:</p><ul>${g.map(t => `<li><b>${esc(t.id)}</b> ${esc(t.city)} (${t.priority}): ${t.open} open, ${t.winners.length} filled. Free pins: ${t.pinsFree.join(', ')}</li>`).join('')}</ul>` : '<p>Every territory with open slots has enough qualified applicants.</p>' };
  }
  const city = result.territories.map(t => t.city).concat(result.apps.map(a => a.cityName)).find(c => c && s.includes(c.toLowerCase()));
  const dec = /condition/.test(s) ? 'conditional' : /approv|winner|ready/.test(s) ? 'approved' : /hold/.test(s) ? 'hold' : /wait|nurture/.test(s) ? 'waitlist' : /declin|reject|archiv|unqualif/.test(s) ? 'declined' : null;
  if (dec || city || /how many|count|summary|overview|total/.test(s)) {
    let pool = result.apps;
    if (city) pool = pool.filter(a => a.cityName === city);
    if (dec === 'approved') pool = pool.filter(a => a.bucket === 'ready'); else if (dec) pool = pool.filter(a => a.decision === dec);
    const counts = ['approved', 'conditional', 'hold', 'waitlist', 'declined'].map(d => `${DECISION_LABEL[d]} ${result.apps.filter(a => a.decision === d && (!city || a.cityName === city)).length}`).join(' · ');
    // A why/how/should question that only matched a city or a decision word gets a list, which may not answer it.
    const weak = /^(why|how|what|should|is|can|does|do|will|would|could)\b/.test(s) && !/how many|count/.test(s);
    if (/how many|count|summary|overview|total/.test(s) && !/list|show|who/.test(s)) return { weak, html: `<p>${city ? esc(city) + ': ' : ''}${counts}.</p>` };
    return { weak, html: `<p>${pool.length} ${dec ? DECISION_LABEL[dec].toLowerCase() : ''} ${city ? 'in ' + esc(city) : ''}:</p><ul>${pool.slice(0, 25).map(a => `<li><b>${esc(a.id)}</b> ${esc(a.name)} — ${esc(a.headline)}</li>`).join('')}${pool.length > 25 ? `<li>…and ${pool.length - 25} more (see Applications).</li>` : ''}</ul>` };
  }
  if (/rule|how.*decide|ai|why trust/.test(s)) return { weak: !/^(how|what) .*(rules?|decide)/.test(s), html: '<p>Every suggestion comes from fixed rules in a fixed order: data check → pin-code knockout → partner score bar → funding floor → territory match → fundability (funding, payback, experience, demographics) → slot allocation by combined score, one store per pin. The same file always gives the same answer. A person makes the final decision on each profile; this assistant only reads your question and explains the suggestion.</p>' };
  return { html: `<p>I couldn't match that to an applicant, territory, number or rule, so I won't guess.</p>${HELP}`, unknown: true };
}


// ===================== Smarter assistant (still rules-only, never guesses) =====================
const GLOSSARY = {
  'franchisee': 'The local partner who invests in and runs a store under the brand.',
  'franchisor': 'The brand that grants the franchise.',
  'catchment': 'The area around a store that its customers come from. We use a ring of the set distance around each store.',
  'cannibalisation': 'A new store taking sales from one of our existing stores nearby. That is why we never open two stores in one pin code, and flag anything inside the ring around a store.',
  'payback': 'How long a partner takes to earn back their investment: money needed ÷ what the partner keeps each month.',
  'onboarding': 'Everything between a partner being accepted and their store opening: letter of intent, financing, site, training, fit-out, staff, audit, opening.',
  'territory': 'An area where the brand wants new stores. Applicants are matched to territories by pin code, never by ID.',
  'spot': 'An open slot: one more store the brand wants in a territory. A territory never gets more approvals than its spots.',
  'partner score': 'A 0–100 score for the person: shop experience 30, chain or franchise background 15, related work 20, money 20, having a shop and a plan 15.',
  'location score': 'A 0–100 score for the place: shoppers nearby 40, how keen we are on the area 25, households 20, few similar shops 15, minus 15 inside a store\'s ring.',
  'speed': 'How fast they can open: owning or renting a shop and a short launch time score highest.',
  'on hold': 'Something important is missing or contradictory (like the pin code or the money). We ask for it; nothing is decided until then.',
  'waitlist': 'A good applicant without a spot yet: the area is full, outside our areas, or money or site is not ready. First in line when things change.',
  'declined': 'The rules suggest no: below the minimums, or a store already exists in that pin code. A person confirms it on the profile; they can apply again later.',
  'approved': 'The rules suggest yes with nothing left to fix. A person confirms it on the profile before onboarding starts.',
  'conditions': 'The rules suggest yes, but with a to-do and a deadline first, such as closing a small money gap or finding a shop.',
  'suggested yes': 'Everyone the rules suggest saying yes to, with or without conditions. A person makes the final call.',
  'ready to call': 'Old name for "suggested yes": everyone the rules suggest saying yes to. A person makes the final call.',
  'suggestion': 'What the rules recommend for an applicant. It is never final: a person accepts or changes it on the profile, with a reason when they change it.',
  'final decision': 'The decision a person records on the profile. Only final decisions start onboarding, messages and exports.',
  'keep warm': 'People on hold or on the waitlist. Each one has a named next step.',
  'not now': 'Declined applications, kept for the record.',
  'city tier': 'Rough city size: Tier 1 = big metros, Tier 2 = mid-size cities, Tier 3 = smaller towns.',
  'royalty': 'The brand\'s share of monthly sales (6%), plus a 2% marketing fund.',
  'working capital': 'Three months of rent, staff and bills kept aside so the store can run while it builds up.',
  'empty pin': 'A pin code inside a territory with no store and no approved applicant yet: a place to find partners.',
  'footfall': 'People who walk into a store. The file has no counts, so StoreSense estimates them from expected sales, the average bill and the share of visitors who buy.',
  'potential': 'A 0–100 grade for a site: half its location score, half its estimated traffic compared with our nearby stores. 75+ Strong, 55+ Good, 40+ Fair.',
  'break-even': 'The number of visitors a day a store needs so that sales cover rent, staff, bills and the brand fee.',
};
const TERM_ALIAS = { 'traffic': 'footfall', 'foot traffic': 'footfall', 'site potential': 'potential', 'break even': 'break-even', 'franchise partner': 'franchisee', 'partner': 'franchisee', 'cannibalization': 'cannibalisation', 'slot': 'spot', 'open slot': 'spot', 'open slots': 'spot', 'site score': 'location score', 'momentum': 'speed', 'hold': 'on hold', 'nurture': 'keep warm', 'conditional': 'conditions', 'approved with conditions': 'conditions', 'tier': 'city tier', 'free pin': 'empty pin', 'fee to brand': 'royalty', 'catchment area': 'catchment', 'payback period': 'payback' };

const PAGE_WORDS = [
  [/home|overview|dashboard|start/, 'overview', 'Home'], [/to-?do|feed|list|leads|who to call/, 'feed', 'To-do'], [/territor|areas|zones/, 'territories', 'Territories'],
  [/map|india/, 'map', 'Map'], [/opening|onboard|launch board/, 'onboarding', 'Openings'], [/rule|how .*decide/, 'rules', 'Rules'], [/log|activity|history/, 'log', 'Activity log'], [/ask|chat|assistant/, 'ask', 'Ask'],
];

const r1x = n => Math.round(n * 10) / 10;
function median(v) { const a = v.filter(x => x != null && isFinite(x)).sort((x, y) => x - y); if (!a.length) return null; const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; }

function filtersFrom(q, result) {
  const s = q.toLowerCase(), f = { label: [] };
  const cities = [...new Set(result.apps.map(a => a.cityName).concat(result.territories.map(t => t.city)))].filter(Boolean).sort((a, b) => b.length - a.length);
  const city = cities.find(c => s.includes(c.toLowerCase()));
  if (city) { f.city = city; f.label.push(`in ${city}`); }
  const ter = findTers(q, result)[0];
  if (ter) { f.ter = ter.id; f.label.push(`in ${ter.id}`); }
  const tier = /tier\s*1|big cit|metro/.test(s) ? 1 : /tier\s*2|mid/.test(s) ? 2 : /tier\s*3|small town/.test(s) ? 3 : null;
  if (tier) { f.tier = tier; f.label.push(['', 'in big cities', 'in mid cities', 'in small towns'][tier]); }
  const dec = /with condition|conditional/.test(s) ? 'conditional' : /ready to call|suggested yes|approved|winners?/.test(s) ? 'ready' : /on hold|\bhold\b/.test(s) ? 'hold' : /wait|keep warm|nurture/.test(s) ? 'waitlist' : /declin|reject|not now/.test(s) ? 'declined' : null;
  if (dec) { f.dec = dec; f.label.push(dec === 'ready' ? 'suggested yes' : DECISION_LABEL[dec].toLowerCase()); }
  return f;
}
function applyF(apps, f) {
  return apps.filter(a => (!f.city || a.cityName === f.city) && (!f.ter || a.territory?.id === f.ter) && (!f.tier || a.tier === f.tier)
    && (!f.dec || (f.dec === 'ready' ? a.bucket === 'ready' : a.decision === f.dec)));
}
const filterPath = f => 'feed?' + new URLSearchParams(Object.fromEntries([['city', f.city], ['ter', f.ter], ['tier', f.tier], ['dec', f.dec && f.dec !== 'ready' ? f.dec : null], ['bucket', f.dec === 'ready' ? 'ready' : null]].filter(([, v]) => v != null))).toString();

const METRICS = [
  [/money needed|need(ed)? money|capital needed/, 'needed', 'money needed', v => lakh(v)],
  [/money|invest|capital|budget|fund/, 'invest', 'money to invest', v => lakh(v)],
  [/experience|years/, 'exp', 'years running a shop', v => `${r1x(v)} yrs`],
  [/payback|earn.* back/, 'payback', 'months to earn back', v => `${Math.round(v)} months`],
  [/location score|site score/, 'site', 'location score', v => r1x(v)],
  [/partner score|readiness|score/, 'partner', 'partner score', v => r1x(v)],
];

function personFact(x, s, res) {
  const L = (t, go) => `<a class="lnk" data-go="${go}">${esc(t)}</a>`;
  const cfg = res.cfg;
  if (/traffic|footfall|visitor|people passing|walk.?in|potential|busy|crowd|break.?even|cannibal|take .*from/.test(s)) {
    const t = siteInsight(x, res);
    if (!t) return `${esc(x.name)} is on hold, so there is no confirmed site to estimate traffic for yet.`;
    const ov = t.overlap.store;
    return `<b>${t.grade} potential (${t.potential}/100)</b> for ${esc(x.name)}'s site. About <b>${t.passers.toLocaleString('en-IN')}</b> people pass a day, <b>${t.visitors}</b> would visit and <b>${t.buyers}</b> buy once the store settles (break-even needs ${t.breakEven} visitors, a ${t.cushion.toFixed(1)}× cushion). First year: ${t.ramp.map(r => `${r.label} ${r.visitors}/day`).join(', ')}.${t.bench ? ` Our ${t.basis === 'nearby' ? 'nearby' : 'similar-city'} stores average ${t.bench}/day today.` : ' No comparable store of ours yet.'}${ov && t.overlap.sharePct ? ` It would share about ${Math.round(t.overlap.sharePct * 100)}% of its visitors with ${L(ov.id, `map?pin=${ov.pin}`)} (${ov.km.toFixed(1)} km away).` : ''} <span class="muted">Estimates — the file has no footfall counts; worked out from the sales estimate.</span>`;
  }
  if (/payback|earn.* back/.test(s)) return isFinite(x.payback) ? `${esc(x.name)} would earn the money back in about <b>${Math.round(x.payback)} months</b> (goal: ${cfg.maxPayback}). Needs ${lakh(x.needed)}; keeps about ${lakh(x.contribution)} a month after costs and the brand fee.` : `${esc(x.name)}'s store would not cover its monthly costs at this size, so it never earns the money back.`;
  if (/money|invest|budget|capital|fund|short/.test(s)) return `${esc(x.name)} can invest <b>${lakh(x.invest)}</b> and needs <b>${lakh(x.needed)}</b>${x.gap ? `, so is short by ${lakh(x.gap)}` : ', so has enough'}.`;
  if (/experience|years/.test(s)) return `${esc(x.name)} has <b>${x.exp ?? 'unknown'} years</b> running or managing a shop (${esc(x.business || 'work not given')}).`;
  if (/location score|site/.test(s)) return `Location score <b>${x.site}</b>: shoppers ${x.demand?.toFixed(2)}, households ${x.demographic?.toFixed(2)}, ${x.competitors} similar shops nearby${x.territory ? `, area ${x.territory.id} (${x.territory.priority})` : ''}.`;
  if (/score|rank/.test(s)) return `Partner score <b>${x.partner}</b> (need ${cfg.partnerBar}), location score <b>${x.site}</b>, combined <b>${x.combined}</b>.`;
  if (/where|location|pin|city|address/.test(s)) { const pinIssue = x.issues?.find(i => i.level === 'block' && i.field === 'pin'); return `${esc(x.name)} wants to open in ${L(x.cityName, `map?city=${encodeURIComponent(x.cityName)}`)}, pin ${x.pin ? L(x.assignedPin || x.pin, `map?pin=${x.assignedPin || x.pin}`) : 'not given'}${x.territory ? `, area ${L(x.territory.id, `territories/${x.territory.id}`)}` : ', outside our areas'}.${pinIssue ? ` <b>Note:</b> ${esc(pinIssue.text)}, so this application is on hold until it is cleared up.` : ''}`; }
  if (/territor|area|zone/.test(s)) return x.territory ? `${esc(x.name)} is in ${L(x.territory.id, `territories/${x.territory.id}`)} (${esc(x.territory.city)}, ${x.territory.priority} interest, ${x.territory.slots} spots).` : `${esc(x.name)}'s pin ${x.pin || ''} is not in any of our areas.`;
  if (/condition|to-?do|deadline/.test(s)) return x.conditions?.length ? `Conditions for ${esc(x.name)}:<ul>${x.conditions.map(c => `<li>${esc(c.text)} — within ${c.days} days</li>`).join('')}</ul>` : `${esc(x.name)} has no conditions${x.bucket === 'ready' ? ' (approved outright)' : ''}.`;
  if (/when|open|launch|timeline|date|diwali|festival/.test(s)) return x.timeline ? `Wants to open in ${x.launchUsed} months; earliest realistic is ${x.timeline.minMonths} months, so opening <b>${fmtDate(x.timeline.date)}</b>.${x.timeline.festival ? ' ' + esc(x.timeline.festival) : ''}` : null;
  if (/language|training/.test(s)) return `${esc(x.name)} wants training in <b>${esc(x.lang)}</b>.`;
  if (/phone|contact|email|call/.test(s)) return `${esc(x.name)}: ${esc(x.phone || 'no phone given')}${x.email ? ` · ${esc(x.email)}` : ''}. Preferred language ${esc(x.lang)}.`;
  if (/shop|space|floor|size/.test(s)) return `${esc(x.name)}: ${esc(x.spaceStd.toLowerCase())}${x.spaceStd !== 'Not yet identified' ? `, ${esc(x.floorStd.toLowerCase())}, ${x.sizeUsed} sq ft${x.sizeAssumed ? ' (assumed)' : ''}` : ''}.`;
  return null;
}

export function insights(res) {
  const out = [], apps = res.apps, n = d => apps.filter(a => a.decision === d).length;
  const ready = apps.filter(a => a.bucket === 'ready');
  const top = [...ready].sort((a, b) => b.combined - a.combined)[0];
  out.push({ text: `${ready.length} suggested yes (${n('approved')} approve, ${n('conditional')} with conditions).${top ? ` Strongest: ${top.name} (${top.id}).` : ''}`, go: 'feed?bucket=ready' });
  const decided = apps.filter(a => HUMAN[a.id]), pend = apps.filter(a => !HUMAN[a.id] && !a.withdrawn);
  out.push({ text: decided.length ? `You have decided ${decided.length}; ${decided.filter(a => HUMAN[a.id].d !== a.decision).length} differ from the suggestion. ${pend.length} still await your decision.` : `No final decisions yet. All ${pend.length} suggestions await a person's decision.`, go: 'feed?human=pending' });
  const tr = trafficSummary(res);
  if (tr.busiest.length) { const b = tr.busiest[0]; out.push({ text: `Busiest suggested site: ${b.a.name} (${b.a.id}), about ${b.t.visitors} visitors a day at pin ${b.a.pin}. All ${tr.sites.length} suggested sites together: about ${tr.total.toLocaleString('en-IN')} a day.`, go: `app/${b.a.id}` }); }
  if (tr.thin.length) out.push({ text: `${tr.thin.length} suggested site${tr.thin.length > 1 ? 's have' : ' has'} thin traffic: under 1.5× the visitors needed to break even. Thinnest: ${tr.thin[0].a.id} (${tr.thin[0].t.cushion.toFixed(1)}×).`, go: `app/${tr.thin[0].a.id}` });
  if (tr.stores.length) out.push({ text: `${tr.stores.length} of our stores could lose visitors to new sites; most: ${tr.stores[0].id} (about ${tr.stores[0].lost} a day).`, go: `map?store=${tr.stores[0].id}` });
  const gaps = res.territories.filter(t => t.needsLeads);
  if (gaps.length) out.push({ text: `${gaps.length} area${gaps.length > 1 ? 's need' : ' needs'} partners: ${gaps.map(t => `${t.id} ${t.city} (${t.open} empty)`).join(', ')}.`, go: `territories/${gaps[0].id}` });
  const stops = res.funnel.stages.filter(s => s.out).sort((a, b) => b.out - a.out)[0];
  if (stops) out.push({ text: `Biggest drop-off: ${stops.out} people at "${stops.label}" (${stops.outLabel}).`, go: stops.key === 'won' ? 'feed?bucket=nurture&sub=lost-slot' : `feed?stage=${stops.key}` });
  const holds = apps.filter(a => a.decision === 'hold');
  if (holds.length) {
    const c = {}; holds.forEach(a => a.issues.filter(i => i.level === 'block').forEach(i => { c[i.field] = (c[i.field] || 0) + 1; }));
    const [f, k] = Object.entries(c).sort((a, b) => b[1] - a[1])[0] || [];
    if (f) out.push({ text: `${holds.length} on hold; most common missing item: ${{ invest: 'money to invest', pin: 'pin code or a city/pin mismatch', exp: 'years of experience', space: 'shop details' }[f] || f} (${k}).`, go: 'feed?dec=hold' });
  }
  const t1 = apps.filter(a => a.tier === 1 && a.invest != null), t3 = apps.filter(a => a.tier === 3 && a.invest != null);
  if (t1.length && t3.length) out.push({ text: `Typical money offered: big cities ${lakh(median(t1.map(a => a.invest)))}, small towns ${lakh(median(t3.map(a => a.invest)))}; big cities need about ${lakh(median(t1.map(a => a.needed)))}.`, go: 'feed?tier=1' });
  const fund = apps.filter(a => a.sub === 'funding' && a.decision === 'waitlist');
  if (fund.length) out.push({ text: `${fund.length} good partners wait only because of money. Team-ups or loans could unlock them.`, go: 'feed?bucket=nurture&sub=funding' });
  const fest = apps.filter(a => a.timeline?.festivalMiss);
  if (fest.length) out.push({ text: `${fest.length} want to open for a festival they can't make in time.`, go: 'feed?tag=festival' });
  const conflicts = apps.filter(a => a.sub === 'pin-conflict');
  if (conflicts.length) out.push({ text: `${conflicts.length} applied in a pin where we already have a store; they were archived automatically.`, go: 'feed?bucket=unqualified&sub=pin-conflict' });
  return out;
}

export function suggestionsFor(tab, res, openId) {
  const s = [];
  if (openId) { const x = res.apps.find(a => a.id === openId); if (x) s.push(`Why is ${x.id} ${x.decision === 'hold' ? 'on hold' : DECISION_LABEL[x.decision].toLowerCase()}?`, `What is ${x.id}'s payback?`, `Next steps for ${x.id}`); }
  const hold = res.apps.find(a => a.decision === 'hold'), wl = res.apps.find(a => a.decision === 'waitlist' && a.territory);
  const by = {
    overview: ['What should I do today?', 'Which territories need partners?', 'How many await my decision?'],
    feed: ['Top 5 partners', 'Traffic insights', 'Who can open fastest?'],
    territories: ['Which territory has the most applicants?', 'Which territories need partners?', res.territories[0] ? `Explain ${res.territories[0].id}` : ''],
    map: ['Show Mysuru on the map', 'Take me to All India', 'Which city has the most applicants?'],
    onboarding: ['What happens after approval?', 'What does onboarding mean?', 'Who can open fastest?'],
    rules: ['How is the partner score calculated?', 'What is payback?', 'What if Tier 1 minimum is 50 lakh?'],
    log: ['What should I do today?', 'Take me home'],
    ask: [hold && `Why is ${hold.id} on hold?`, wl && `What if ${wl.id} had 60 lakh?`, 'Median experience in big cities', 'Compare APP-001 and APP-003'],
  }[tab] || [];
  return [...s, ...by].filter(Boolean).slice(0, 5);
}

function sourceLine(result) {
  return `<p class="src">Worked out from ${result.apps.length} applications, ${result.territories.length} territories and ${result.stores.length} stores in your file, using the rules as set now. Nothing is guessed.</p>`;
}

export function ask(q, ctx) {
  HUMAN = ctx.human || {};
  q = normalizeQuestion(q);
  const out = askSmart(q, ctx);
  if (out.html && !out.undo && !out.reset && !out.help && !out.nav && !out.unknown && !out.plain) out.html += sourceLine(out.result || ctx.result);
  return out;
}

function askSmart(q, ctx) {
  const { data, settings, result } = ctx;
  const s = q.toLowerCase().trim().replace(/[?!.]+$/, '');
  if (!s || /^(help|\?|what can you do|hi|hello|hey)\b/.test(s)) return { html: HELP, help: true };
  const ids = findIds(q, result);

  // 1. Navigation: "open the map", "take me to territories", "show APP-012", "show Mysuru on the map"
  const navVerb = /^(go to|goto|open|take me( to)?|navigate( to)?|bring up|jump to|show me the|show the)\b/.test(s) || /\bon the map\b|^show .* map/.test(s);
  if (navVerb && !/^why|what if/.test(s)) {
    if (ids.length) return { nav: `app/${ids[0]}`, html: `<p>Opening ${esc(ids[0])}.</p>` };
    const ter = findTers(q, result)[0];
    const f = filtersFrom(q, result);
    if (/map|india/.test(s)) {
      const pin = s.match(/\b[1-8]\d{5}\b/);
      const path = pin ? `map?pin=${pin[0]}` : f.city ? `map?city=${encodeURIComponent(f.city)}` : 'map?city=india';
      return { nav: path, html: `<p>Showing ${pin ? 'pin ' + pin[0] : f.city || 'All India'} on the map.</p>` };
    }
    if (ter) return { nav: `territories/${ter.id}`, html: `<p>Opening ${esc(ter.id)}.</p>` };
    if (f.city || f.dec || f.tier) return { nav: filterPath(f), html: `<p>Showing ${f.label.join(', ')}.</p>` };
    const page = PAGE_WORDS.find(([re]) => re.test(s));
    if (page) return { nav: page[1], html: `<p>Opening ${page[2]}.</p>` };
  }
  // 1b. Wider coverage: lists by any detail, pins and cities, rules, batch views, open questions (ask-more.js)
  if (!/^(undo|revert|go back|reset|start over)\b/.test(s)) {
    const more = answerMore(q, ctx, { findIds, findTers, esc, DECISION_LABEL, filtersFrom, applyF, median, nurtureAdvice, insights, WEIGHTS, cityOf: x => x.city });
    if (more) return more;
  }
  if (/where (do|can) i (upload|add|load)|how (do|can) i upload/.test(s)) return { plain: true, html: '<p>Use <b>Upload file</b> at the bottom of the menu (or click the file name at the top). Excel or CSV works; sheets and columns are recognised automatically, and "How we read your file" on Home shows what was understood.</p>' };

  // 2. Definitions: "what is payback", "what does waitlist mean"
  const def = s.match(/^(what is|what's|what are|what does|define|meaning of|explain the term|explain)\s+(an? |the )?(.+?)(\s+mean)?$/);
  if (def && !ids.length && !findTers(q, result).length && !/\b(average|mean|median|total|highest|lowest|typical)\b/.test(s)) {
    const term = def[3].replace(/['"]/g, '').trim();
    const key = GLOSSARY[term] ? term : TERM_ALIAS[term] || Object.keys(GLOSSARY).find(k => term.includes(k)) || Object.keys(TERM_ALIAS).find(k => term.includes(k)) && TERM_ALIAS[Object.keys(TERM_ALIAS).find(k => term.includes(k))];
    if (key && GLOSSARY[key]) return { html: `<p><b>${esc(key[0].toUpperCase() + key.slice(1))}:</b> ${esc(GLOSSARY[key])}</p>` };
  }

  // 3. Hypothetical: "what if APP-012 had 60 lakh" — calculated, never saved
  if (ids.length && /^(what if|suppose|imagine|hypothetically)|would .* if/.test(s)) {
    const id = ids[0], app = data.applications.find(a => a.id === id);
    const { e, said } = appEdits(q.replace(/what if|suppose|imagine|hypothetically/i, '').replace(/\bhad\b/i, 'can now invest').replace(/\bfound\b/i, 'has now found'), app);
    if (!said.length) return { html: `<p>I couldn't tell what would change for ${esc(id)}. Try "What if ${esc(id)} had 50 lakh" or "What if ${esc(id)} found a ground-floor shop".</p>` };
    const nd = { ...data, applications: data.applications.map(a => (a.id === id ? { ...a, ...e } : a)) };
    const after = ctx.rerun(nd, settings);
    const x = after.apps.find(a => a.id === id), b = result.apps.find(a => a.id === id);
    const real = q.replace(/^\s*(what if|suppose|imagine|hypothetically)\s*/i, '').replace(/\?\s*$/, '').replace(/\bhad\b/i, 'can now invest').replace(/\bfound\b/i, 'has now found');
    return { html: `<p><b>If</b> ${esc(id)}: ${esc(said.join(', '))} → <b>${DECISION_LABEL[x.decision]}</b> (now ${DECISION_LABEL[b.decision].toLowerCase()}). ${esc(x.headline)}.</p>${renderChanges(diff(result, after, [id]))}<p class="muted">Nothing was saved. To make it real, say "${esc(real)}".</p>` };
  }

  // 4. Today's priorities
  if (/what should i do|where (do i|should i) start|today|priorit|next actions|my tasks/.test(s) && !ids.length) {
    const acts = result.actions.slice(0, 6);
    return { html: acts.length ? `<p>Do these first:</p><ol>${acts.map(a => `<li><a class="lnk" data-go="${a.x ? `app/${a.x.id}` : `territories/${a.t.id}`}">${esc(a.title)}</a> — ${esc(a.why)}</li>`).join('')}</ol><p class="muted">${result.actions.length - acts.length} more can wait.</p>` : '<p>Nothing needs action today.</p>' };
  }

  // 5. Compare two applicants
  if (ids.length >= 2 && /compare|vs|versus|better|difference|between|or\b/.test(s)) {
    const xs = ids.slice(0, 3).map(id => result.apps.find(a => a.id === id));
    const rows = [['Decision', x => DECISION_LABEL[x.decision]], ['Partner score', x => x.partner], ['Location score', x => x.site], ['Combined', x => x.combined], ['Money / needed', x => `${lakh(x.invest)} / ${lakh(x.needed)}`], ['Shop experience', x => `${x.exp ?? '—'} yrs`], ['Earns back in', x => (isFinite(x.payback) ? `${Math.round(x.payback)} mo` : '—')], ['Area', x => x.territory?.id || '—']];
    const best = [...xs].filter(x => x.decision !== 'hold').sort((a, b) => b.combined - a.combined)[0];
    return { html: `<table class="t"><tr><th></th>${xs.map(x => `<th><a class="lnk" data-go="app/${x.id}">${esc(x.id)}</a><br>${esc(x.name)}</th>`).join('')}</tr>${rows.map(([l, f]) => `<tr><td>${l}</td>${xs.map(x => `<td>${esc(String(f(x)))}</td>`).join('')}</tr>`).join('')}</table>${best ? `<p>Higher combined score: <b>${esc(best.name)}</b> (${best.combined}). In the same area, the higher combined score gets the spot first.</p>` : ''}` };
  }

  // 5b. Your decisions: "how many await my decision", "what have I decided"
  if (!ids.length && /(await|pending|waiting|not (yet )?decided|undecided).*(decision|you|me)|my decisions?|decided|final decisions?|overrid|changed the suggestion/.test(s)) {
    const pend = result.apps.filter(a => !HUMAN[a.id] && !a.withdrawn), dec = result.apps.filter(a => HUMAN[a.id]), diff = dec.filter(a => HUMAN[a.id].d !== a.decision);
    const byD = Object.keys(FINAL_LABEL).map(d => [d, dec.filter(a => HUMAN[a.id].d === d).length]).filter(([, n]) => n);
    return { html: `<p><b>${pend.length}</b> suggestion${pend.length === 1 ? '' : 's'} await a person's decision (${pend.filter(a => a.bucket === 'ready').length} of them suggested yes). <a class="lnk" data-go="feed?human=pending">See them</a></p>${dec.length ? `<p><b>${dec.length}</b> decided: ${byD.map(([d, n]) => `${n} ${FINAL_LABEL[d].toLowerCase()}`).join(', ')}. ${diff.length ? `<a class="lnk" data-go="feed?human=changed">${diff.length} differ from the suggestion</a>.` : 'All agree with the suggestion.'}</p>` : '<p>No final decisions recorded yet. StoreSense only suggests; open a profile to decide.</p>'}` };
  }

  // 5c. Traffic across all suggested sites: "traffic insights", "which site has the most traffic"
  if (!ids.length && /traffic|footfall|visitors|walk-?ins?|busiest|cannibal/.test(s)) {
    const tr = trafficSummary(result);
    if (!tr.sites.length) return { html: '<p>No suggested-yes sites to estimate traffic for.</p>' };
    const row = ({ a, t }) => `<li><a class="lnk" data-go="app/${a.id}">${esc(a.name)}</a> (${a.id}, pin ${esc(String(a.pin))}): about <b>${t.visitors}</b> visitors a day, ${t.buyers} buyers, ${t.cushion.toFixed(1)}× break-even</li>`;
    const quiet = [...tr.busiest].reverse().slice(0, 3);
    return { html: `<p>Estimated daily traffic at the ${tr.sites.length} suggested-yes sites: about <b>${tr.total.toLocaleString('en-IN')}</b> visitors and ${tr.buyers.toLocaleString('en-IN')} buyers a day once settled.</p>
      <p class="ask-sub">Busiest</p><ol>${tr.busiest.slice(0, 3).map(row).join('')}</ol>
      <p class="ask-sub">Quietest</p><ol>${quiet.map(row).join('')}</ol>
      ${tr.thin.length ? `<p class="ask-sub">Thin margin (under 1.5× break-even)</p><ul>${tr.thin.slice(0, 5).map(row).join('')}</ul>` : '<p>Every suggested site clears break-even by at least 1.5×.</p>'}
      ${tr.stores.length ? `<p class="ask-sub">Our stores that could lose visitors</p><ul>${tr.stores.slice(0, 4).map(e => `<li><a class="lnk" data-go="map?store=${e.id}">${e.id}</a> (pin ${esc(e.pin)}): about ${e.lost} a day to ${e.by.map(a => a.id).join(', ')}</li>`).join('')}</ul>` : '<p>No suggested site is close enough to share visitors with one of our stores.</p>'}
      <p class="small muted">Worked backwards from each site's sales estimate (average bill, ${Math.round(0.35 * 100)}% of visitors buying). The file has no footfall counts, so these are estimates.</p>` };
  }

  // 6. One fact about one applicant: "What is APP-012's payback?"
  const asking = /^(what|what's|how|where|when|which|who|is|are|does|do|can|tell|show|give)\b/.test(s) || /\?\s*$/.test(q);
  if (ids.length === 1 && asking && !/^why\b|explain|next step|^(apply|set|make)\b/.test(s)) {
    const x = result.apps.find(a => a.id === ids[0]);
    const fact = x && personFact(x, s.replace(/app-?\d+/g, ''), result);
    if (fact) return { focus: x.id, html: `<p>${fact}</p><p><a class="lnk" data-go="app/${x.id}">Open ${esc(x.id)}</a></p>` };
  }

  // 7. Numbers across the pool: averages, medians, totals, highest/lowest, top N, rankings
  const agg = /\b(average|mean|avg)\b/.test(s) ? 'avg' : /\b(median|typical)\b/.test(s) ? 'median' : /\b(total|sum|combined)\b/.test(s) ? 'sum' : /\b(highest|maximum|max|biggest|largest|most money|richest)\b/.test(s) ? 'max' : /\b(lowest|minimum|min|smallest|least)\b/.test(s) ? 'min' : null;
  const metric = METRICS.find(([re]) => re.test(s));
  if (agg && metric && !ids.length && !/^(what if|suppose|imagine)|\bif (the |we )/.test(s)) {
    const f = filtersFrom(q, result), pool = applyF(result.apps, f).filter(a => a[metric[1]] != null && isFinite(a[metric[1]]));
    if (!pool.length) return { html: `<p>No applicants match ${esc(f.label.join(', ') || 'that')}, so there is nothing to calculate.</p>` };
    const vals = pool.map(a => a[metric[1]]);
    const v = agg === 'avg' ? vals.reduce((x, y) => x + y, 0) / vals.length : agg === 'median' ? median(vals) : agg === 'sum' ? vals.reduce((x, y) => x + y, 0) : agg === 'max' ? Math.max(...vals) : Math.min(...vals);
    const who = agg === 'max' || agg === 'min' ? pool.find(a => a[metric[1]] === v) : null;
    return { html: `<p>${{ avg: 'Average', median: 'Median', sum: 'Total', max: 'Highest', min: 'Lowest' }[agg]} ${metric[2]}${f.label.length ? ' ' + esc(f.label.join(', ')) : ''}: <b>${metric[3](v)}</b>${who ? ` — <a class="lnk" data-go="app/${who.id}">${esc(who.name)} (${who.id})</a>` : ''}.</p><p class="muted">Across ${pool.length} applicant${pool.length > 1 ? 's' : ''} with this number. <a class="lnk" data-go="${filterPath(f)}">See them</a></p>` };
  }
  const topN = s.match(/\b(top|best)\s*(\d+)?\b.*\b(partners?|leads?|applicants?|people|candidates?|guys|ones|folks)\b/) || s.match(/\bwho (is|are) the best\b/);
  if (topN && !ids.length) {
    const k = Math.min(15, +(topN[2] || 5)), f = filtersFrom(q, result);
    const pool = applyF(result.apps, f).filter(a => a.decision !== 'hold' && !a.withdrawn).sort((a, b) => (/partner/.test(s) ? b.partner - a.partner : b.combined - a.combined)).slice(0, k);
    return { html: `<p>Top ${pool.length} by ${/partner/.test(s) ? 'partner score' : 'combined score'}${f.label.length ? ' ' + esc(f.label.join(', ')) : ''}:</p><ol>${pool.map(a => `<li><a class="lnk" data-go="app/${a.id}">${esc(a.name)} (${a.id})</a> — ${/partner/.test(s) ? a.partner : a.combined} · ${DECISION_LABEL[a.decision]}</li>`).join('')}</ol>` };
  }
  if (/which (territor|area|city|zone).*(most|least|fewest|no )/.test(s)) {
    const byCity = /city/.test(s);
    const groups = byCity ? [...new Set(result.apps.map(a => a.cityName))].map(c => ({ id: c, n: result.apps.filter(a => a.cityName === c).length, ready: result.apps.filter(a => a.cityName === c && a.bucket === 'ready').length, open: result.territories.filter(t => t.city === c).reduce((x, t) => x + Math.max(0, t.open), 0), go: `map?city=${encodeURIComponent(c)}` }))
      : result.territories.map(t => ({ id: `${t.id} ${t.city}`, n: t.applicants, ready: t.winners.length, open: t.open, go: `territories/${t.id}` }));
    const key = /empty|open|spot|slot/.test(s) ? 'open' : /ready|approved/.test(s) ? 'ready' : 'n';
    const lab = { open: 'empty spots', ready: 'suggested yes', n: 'applicants' }[key];
    groups.sort((a, b) => (/least|fewest|no /.test(s) ? a[key] - b[key] : b[key] - a[key]));
    return { html: `<p>${/least|fewest|no /.test(s) ? 'Fewest' : 'Most'} ${lab}:</p><ol>${groups.slice(0, 5).map(g => `<li><a class="lnk" data-go="${g.go}">${esc(g.id)}</a> — ${g[key]} ${lab}</li>`).join('')}</ol>` };
  }
  if (/fastest|soonest|quickest|open (first|quickly|fast)/.test(s)) {
    const pool = result.apps.filter(a => a.bucket === 'ready' && a.timeline).sort((a, b) => a.timeline.date - b.timeline.date).slice(0, 6);
    return { html: `<p>Earliest realistic openings among people suggested yes:</p><ol>${pool.map(a => `<li><a class="lnk" data-go="app/${a.id}">${esc(a.name)}</a> — ${fmtDate(a.timeline.date)} (${esc(a.spaceStd.toLowerCase())})</li>`).join('')}</ol>` };
  }
  if (/^how many\b/.test(s) && !/stores|outlets|territor|spots|slots/.test(s) && !ids.length) {
    const f = filtersFrom(q, result), pool = applyF(result.apps, f);
    return { html: `<p><b>${pool.length}</b> ${pool.length === 1 ? 'applicant' : 'applicants'}${f.label.length ? ' ' + esc(f.label.join(', ')) : ' in total'}. <a class="lnk" data-go="${filterPath(f)}">See them</a></p>` };
  }
  if (/how many (stores|outlets)|how many territor|how many (spots|slots)|spots? left|slots? left/.test(s)) {
    const open = result.territories.reduce((x, t) => x + Math.max(0, t.open), 0), total = result.territories.reduce((x, t) => x + t.slots, 0);
    return { html: `<p>${result.stores.length} stores are open today. ${result.territories.length} territories plan ${total} new stores; <b>${open}</b> spots are still empty.</p>` };
  }
  if (/how (is|are|do you) .*(partner score|score|location score|site score).*(calculat|work|made)|how .*score/.test(s)) {
    return { html: `<p><b>Partner score</b> (0–100): shop experience 30, chain or franchise background 15, related work 20, enough money 20, having a shop and a plan 15. Need ${result.cfg.partnerBar} to be considered.</p><p><b>Location score</b> (0–100): shoppers nearby 40, how keen we are on the area 25, households 20, few similar shops 15; minus 15 inside an existing store's ring. Spots go to the highest combined score: 60% partner + 40% location.</p>` };
  }
  if (/after approv|what happens next|onboarding steps|steps to open/.test(s) && !ids.length) {
    return { html: '<p>After approval: 1 letter of intent and brand fee, 2 financing, 3 brand-approved site, 4 training in their language (4–6 weeks + shadowing), 5 fit-out and first stock, 6 staff hired and trained, 7 pre-opening audit, 8 store opens. Track it on <a class="lnk" data-go="onboarding">Openings</a>.</p>' };
  }

  // Everything else: the original rule-book answers (edits, explanations, counts, lists)
  return askCore(q, ctx);
}
