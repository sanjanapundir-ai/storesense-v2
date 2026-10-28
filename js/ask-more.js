// ask-more.js — wider coverage for "Ask StoreSense". Tidies the question (typos, chat shorthand, Hinglish, old city
// names), then answers many more kinds of question straight from the engine's results: lists by any detail,
// pin and city questions, rules, batch summaries, data notes and open questions about the franchise plan.
// Like the rest of the assistant it never guesses: every answer is computed from the loaded file and the rules.
import { lakh, fmtDate, ECON, MILESTONES, pinProxy, trafficSummary, siteInsight } from './engine.js';

// ---------- 1. Tidy the question ----------
const WORDS = [
  [/\b(aproved|approvd|aprooved|apprvd|apporved)\b/g, 'approved'], [/\b(declind|rejectd)\b/g, 'declined'], [/\b(waitlistd|wait listed|wait-listed)\b/g, 'waitlisted'],
  [/\b(aplicants?|applicnts?|applicats?|applicnats?|appliants?)\b/g, 'applicants'], [/\b(shw|sho)\b/g, 'show'], [/\b(wht|wat|wut)\b/g, 'what'], [/\bwhats\b/g, 'what is'],
  [/\bhw\b/g, 'how'], [/\br\b/g, 'are'], [/\bu\b/g, 'you'], [/\b(ppl|peeps)\b/g, 'people'], [/\b(pls|plz)\b/g, 'please'], [/\babt\b/g, 'about'], [/\b(invstment|investmnt)\b/g, 'investment'],
  [/\b(territry|teritory|terrtory)\b/g, 'territory'], [/\b(experiance|experince)\b/g, 'experience'], [/\b(thx|thnx|ty)\b/g, 'thanks'],
  // Hinglish
  [/\b(kitne|kitna|kitni)\b/g, 'how many'], [/\b(kaun|kon)\b/g, 'who'], [/\b(kyun|kyu|kyon)\b/g, 'why'], [/\bkya\b/g, 'what'], [/\b(dikhao|batao|bataiye)\b/g, 'show'],
  [/\bsabse\b/g, 'most'], [/\b(acha|accha)\b/g, 'good'], [/\bmein\b/g, 'in'], [/\b(hai|hain|hy)\b/g, ''], [/\blog\b(?= (approved|declined|hold|waitlisted|in|ke|ki))/g, 'people'],
  // old and short city names
  [/\b(bangalore|banglore|bengalore|blr)\b/g, 'Bengaluru'], [/\bmysore\b/g, 'Mysuru'], [/\b(tumkur|tumakur)\b/g, 'Tumakuru'], [/\b(hubli|hubballi|dharwad|hubli-dharwad)\b/g, 'Hubballi-Dharwad'],
  [/\bbelgaum\b/g, 'Belagavi'], [/\bmangalore\b/g, 'Mangaluru'], [/\bdavangere\b/g, 'Davanagere'],
];
export function normalizeQuestion(q) {
  let s = String(q ?? '');
  for (const [re, to] of WORDS) s = s.replace(new RegExp(re.source, 'gi'), to);
  return s.replace(/\s{2,}/g, ' ').trim();
}

// ---------- helpers ----------
const n0 = v => Math.round(v).toLocaleString('en-IN');
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '0%');
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function answerMore(q, ctx, h) {
  const { data, result: res } = ctx;
  const s = q.toLowerCase().trim().replace(/[?!.]+$/, '');
  const ids = h.findIds(q, res), ters = h.findTers(q, res);
  const cfg = res.cfg;
  const L = (text, go) => `<a class="lnk" data-go="${go}">${h.esc(text)}</a>`;
  const who = x => `${L(`${x.name} (${x.id})`, `app/${x.id}`)}`;
  const list = (xs, line, max = 12) => `<ol>${xs.slice(0, max).map(x => `<li>${line(x)}</li>`).join('')}</ol>${xs.length > max ? `<p class="muted">…and ${xs.length - max} more.</p>` : ''}`;
  const cities = [...new Set(res.apps.map(a => a.cityName).concat(res.territories.map(t => t.city), res.stores.map(x => x.city)))].filter(Boolean).sort((a, b) => b.length - a.length);
  const city = cities.find(c => s.includes(c.toLowerCase()));
  const isWhatIf = /^(what if|suppose|imagine|hypothetically)\b|\bwhat would happen if\b/.test(s);

  // ---------- small talk ----------
  if (/^(thanks|thank you|thank u|great|cool|ok|okay|nice|awesome|perfect|got it|bye)\b/.test(s) && s.split(' ').length <= 4) return { plain: true, html: '<p>Happy to help. Ask me about any applicant, pin, city, territory, rule or number in your file.</p>' };

  // ---------- 2. One applicant ----------
  if (ids.length === 1 && !isWhatIf) {
    const x = res.apps.find(a => a.id === ids[0]);
    if (x) {
      if (/\b(message|draft|email|whatsapp|write to|what (should|do) (we|i) (tell|say|send)|reply to|letter)\b/.test(s)) return { focus: x.id, html: draftMessage(x, res, h) };
      if (/\b(risk|risks|risky|concern|red flag|worr|weak|downside|problem)\b/.test(s)) return { focus: x.id, html: risksOf(x, res, h, L) };
      if (/\b(how far|distance|nearest store|closest store|km from|near (our|a) store)\b/.test(s)) {
        const n = x.nearest;
        return { focus: x.id, html: n ? `<p>${who(x)}'s site (pin ${h.esc(x.assignedPin || x.pin)}) is <b>${n.km.toFixed(1)} km</b> from our nearest store, ${L(n.store.id, `map?store=${n.store.id}`)} (pin ${h.esc(n.store.pin)}). ${n.km < cfg.overlapKm ? `That is inside the ${cfg.overlapKm} km ring, so a site visit is needed before opening.` : `That is outside the ${cfg.overlapKm} km ring, so the two stores are not expected to share many customers.`}</p>` : `<p>${who(x)} has no confirmed location yet, so the distance can't be worked out.</p>` };
      }
      if (/\b(what would (make|change|it take)|how (can|could|do|does) .*(get|become|be|turn) (approved|a spot|a slot|in|yes)|approvable|unblock|what is missing|what's missing|improve|fix (this|it))\b/.test(s)) return { focus: x.id, html: whatWouldChange(x, res, h, L) };
      if (/\bshould (we|i) (approve|accept|reject|decline|take|pick|go with)\b/.test(s)) return { focus: x.id, html: `<p>The rules ${h.DECISION_LABEL[x.decision].toLowerCase()} for ${who(x)}: ${h.esc(x.headline)}.</p>${(x.reasons || []).length ? `<ul>${x.reasons.slice(0, 4).map(r => `<li>${h.esc(typeof r === 'string' ? r : r.text || '')}</li>`).join('')}</ul>` : ''}<p>That is a suggestion. You make the final call on ${L('the profile', `app/${x.id}`)}; going against it only needs a short reason.</p>` };
    }
  }

  // ---------- 3. Rules and definitions ----------
  if (/\b(minimum|min|least) (investment|money|capital|amount)\b|\bhow much (money|investment|capital) (do (you|we|i) need|is needed|is required|for)\b|\bcost (to|of) (open|opening|setting up)\b/.test(s) && !isWhatIf && !ids.length) {
    const byTier = [1, 2, 3].map(t => { const xs = res.apps.filter(a => a.tier === t && a.needed); return { t, n: xs.length, need: h.median(xs.map(a => a.needed)) }; });
    return { html: `<p>The money floor (a rule you can change on ${L('Rules', 'rules')}): <b>₹${cfg.minInvest[1]}L</b> in big cities (Tier 1), <b>₹${cfg.minInvest[2]}L</b> in mid-size cities (Tier 2), <b>₹${cfg.minInvest[3]}L</b> in small towns (Tier 3).</p><p>What a store really costs depends on its size and rent: brand fee, fit-out, first stock and 3 months of working capital. Typical total needed in this batch: ${byTier.filter(x => x.n).map(x => `Tier ${x.t} ${lakh(x.need)}`).join(', ')}. Brand fee: ₹${ECON[1].fee}L / ₹${ECON[2].fee}L / ₹${ECON[3].fee}L by tier.</p>` };
  }
  if (/\b(one|single|1) store per pin|two stores (in|per) (one|a|the same) pin|same pin( code)?\b.*\b(rule|why)|why (only|just) one/.test(s)) return { html: `<p>The brand never opens two stores in the same pin code: they would compete for the same customers (cannibalisation), and both would earn less. So any applicant in a pin that already has one of our ${res.stores.length} stores, or a pin already given to a stronger applicant, can't be approved there. ${res.apps.filter(a => a.sub === 'pin-conflict').length} applicants in this file hit that rule; where possible they're offered a nearby free pin instead.</p>` };
  if (/\b(\d+(\.\d+)?\s*km|radius|ring|catchment|space between stores|distance rule)\b/.test(s) && /\b(rule|what is|what's|mean|why|explain|how)\b/.test(s) && !isWhatIf && !ids.length) {
    const inside = res.apps.filter(a => a.overlap).length;
    return { html: `<p>The <b>${cfg.overlapKm} km rule</b>: a new site closer than ${cfg.overlapKm} km to one of our stores could take its customers, so it needs a site visit before it can open. The same ${cfg.overlapKm} km applies to every city and territory. ${plural(inside, 'applicant')} in this file ${inside === 1 ? 'is' : 'are'} inside a ring.</p><p>Change it for all territories at once with "Space between stores" on ${L('Rules', 'rules')} (Strict uses 3 km, Growth 1.5 km), or ask "What if the radius was 3 km?".</p>` };
  }
  if (/\b(co-?investor|team.?up|pairing|pair up|partnership pair)/.test(s) && /^(who|which|list|show|find|any)\b/.test(s) && !ids.length) {
    const short = res.apps.filter(a => a.gap > 0 && a.partner >= cfg.partnerBar && !a.withdrawn).sort((a, b) => b.partner - a.partner);
    const pairs = res.territories.flatMap(t => t.pairings.map(p => ({ ...p, t })));
    return { html: `${short.length ? `<p><b>${short.length}</b> good partners are short of money and could use a co-investor or loan:</p>${list(short, a => `${who(a)} · short by ${lakh(a.gap)} · partner score ${a.partner} · ${h.DECISION_LABEL[a.decision].toLowerCase()}`, 10)}` : '<p>No good partner is short of money.</p>'}${pairs.length ? `<p>Suggested pairs: ${pairs.map(p => `${L(p.a.id, `app/${p.a.id}`)} + ${L(p.b.id, `app/${p.b.id}`)} (${lakh(p.capital)})`).join(', ')}.</p>` : ''}` };
  }
  if (/\b(co-?investor|team.?up|pairing|pair up|partnership pair)/.test(s) && /\b(what|mean|how|explain|need)\b/.test(s) && !ids.length) {
    const pairs = res.territories.flatMap(t => t.pairings.map(p => ({ ...p, t })));
    const short = res.apps.filter(a => a.sub === 'funding');
    return { html: `<p>A <b>co-investor pair</b> joins a strong operator who is short of money with someone in the same territory who has money but less experience. Together they can fund one store. Pairs are suggestions, kept as backups behind the slot winners.</p>${pairs.length ? `<p>${plural(pairs.length, 'pair')} suggested in this file:</p>${list(pairs, p => `${L(p.a.id, `app/${p.a.id}`)} + ${L(p.b.id, `app/${p.b.id}`)} in ${L(p.t.id, `territories/${p.t.id}`)}: ${lakh(p.capital)} together`, 8)}` : '<p>No pairs are suggested in this file.</p>'}${short.length ? `<p>${plural(short.length, 'applicant')} wait only because of money: ${short.slice(0, 6).map(who).join(', ')}${short.length > 6 ? '…' : ''}.</p>` : ''}` };
  }
  if (/\badkar\b/.test(s)) return { html: '<p><b>ADKAR</b> is a change model with five steps: Awareness, Desire, Knowledge, Ability, Reinforcement. StoreSense uses it two ways. For partners: the onboarding plan checks which step is weakest (for example, a first-time owner lacks Knowledge and Ability, so training and shadowing come first). For the expansion team: the tool explains every suggestion (Awareness), saves them time (Desire), shows the rules (Knowledge), lets them override with a reason (Ability) and logs every change (Reinforcement).</p>' };
  if (/\bhow long\b.*\b(open|launch|take)|\btime to open\b|\bhow (soon|quickly|fast) can (a|we|they|stores?)\b/.test(s) && !ids.length) {
    const ready = res.apps.filter(a => a.bucket === 'ready' && a.timeline);
    const withSpace = ready.filter(a => a.spaceStd !== 'Not yet identified'), without = ready.filter(a => a.spaceStd === 'Not yet identified');
    return { html: `<p>From approval, a store goes through ${MILESTONES.length} steps: ${MILESTONES.map(m => m.label.toLowerCase()).join(' → ')}.</p><p>In this file, people suggested yes ${withSpace.length ? `with a shop already can open in about <b>${Math.round(h.median(withSpace.map(a => a.timeline.minMonths)))} months</b>` : ''}${withSpace.length && without.length ? ', and ' : ''}${without.length ? `those still looking for a shop in about <b>${Math.round(h.median(without.map(a => a.timeline.minMonths)))} months</b>` : ''}. Earliest: ${ready.length ? [...ready].sort((a, b) => a.timeline.date - b.timeline.date).slice(0, 3).map(a => `${who(a)} ${fmtDate(a.timeline.date)}`).join(', ') : 'none yet'}.</p>` };
  }
  if (/\b(is (this|it|storesense) (an? )?ai|who (makes the|takes the)? ?decid|ai or (a )?(person|human)|does (the )?ai decide|can (we|i) trust|is it automatic|machine learning|chatgpt|llm)\b/.test(s)) return { html: '<p>The suggestions come from fixed rules, not AI: the same file always gives the same suggestion, and every one shows its reasons and numbers. A person makes the final decision on each profile (accept, or change it with a reason). This assistant reads your question and answers from the engine\'s results. If it uses AI for an open question, the answer is built only from your data and is labelled.</p>' };
  if (/\bcan (i|we) (change|edit|adjust|tune) (the )?(rules|settings|thresholds|weights|bar)|\bwhere (are|do i change) the rules\b/.test(s)) return { html: `<p>Yes. ${L('Rules', 'rules')} has sliders for the money floor by tier, minimum experience, partner score bar (${cfg.partnerBar}), payback limit (${cfg.maxPayback} months), space between stores (${cfg.overlapKm} km) and more, plus Strict / Balanced / Growth presets. Every suggestion updates at once and the change is logged. You can also ask here, for example "What if Tier 1 minimum is 50 lakh?".</p>` };
  if (/\b(make it|be|go) (more )?(strict|stricter|tougher|harder|looser|easier|lenient|relaxed)\b|\b(strict|growth|balanced) (mode|preset)\b/.test(s)) return { nav: 'rules', html: `<p>Opening ${L('Rules', 'rules')}: pick <b>Strict</b> (higher money floor, 2 years experience, partner bar 65, payback within 24 months, 3 km between stores) or <b>Growth</b> (lower floors, no experience needed, bar 50, 36 months, 1.5 km). Or change one thing here, for example "What if the partner score bar is 65?".</p>` };

  // ---------- 4. Pins, places and stores ----------
  const pinM = s.match(/\b[1-8]\d{5}\b/);
  if (pinM && !ids.length && !isWhatIf && !/\b(store opened|opened a store|new store)\b/.test(s)) {
    const pin = pinM[0];
    const store = res.stores.find(x => String(x.pin) === pin);
    const holder = res.apps.find(a => a.bucket === 'ready' && String(a.assignedPin || a.pin) === pin);
    const ter = res.territories.find(t => t.pins.includes(pin) || (t.prefixes || []).some(p => pin.startsWith(p)));
    const appsHere = res.apps.filter(a => String(a.pin) === pin);
    const near = res.stores.filter(x => x.point).map(x => ({ x, km: null }));
    return { html: `<p><b>Pin ${h.esc(pin)}</b>: ${store ? `we already have ${L(store.id, `map?store=${store.id}`)} here, so no new store can open in this pin.` : holder ? `already suggested for ${who(holder)}, so it's taken in this round.` : ter ? `free, inside ${L(ter.id, `territories/${ter.id}`)} (${h.esc(ter.city)}, ${ter.priority} priority, ${ter.open} of ${ter.slots} spots open).` : 'free, but not inside any of our territories; a store here would need a new territory.'}</p>${appsHere.length ? `<p>${plural(appsHere.length, 'applicant')} applied here: ${appsHere.slice(0, 6).map(a => `${who(a)} (${h.DECISION_LABEL[a.decision].toLowerCase()})`).join(', ')}.</p>` : '<p>No applicant asked for this pin.</p>'}<p>${L('See it on the map', `map?pin=${pin}`)}</p>`.replace(/near/, () => near && '') };
  }
  if ((/\b(free|empty|open|available|unused) (pins?|pin codes?|spots?|locations?)\b/.test(s) || /\b(pins?|pin codes?)\b.*\b(free|empty|available|open|unused|left)\b/.test(s)) && !ids.length) {
    const ts = res.territories.filter(t => (!city || t.city === city) && t.pinsFree.length);
    return { html: ts.length ? `<p>Free pins${city ? ` in ${h.esc(city)}` : ''} (no store and nobody suggested yet):</p><ul>${ts.map(t => `<li>${L(t.id, `territories/${t.id}`)} ${h.esc(t.city)} (${t.open} spots open): ${t.pinsFree.slice(0, 10).join(', ')}${t.pinsFree.length > 10 ? '…' : ''}</li>`).join('')}</ul>` : `<p>No free pins${city ? ` in ${h.esc(city)}` : ''}: every territory pin has a store or a suggested partner.</p>` };
  }
  if (/\b(our|existing|current|open|any) (stores?|outlets?|shops?)\b|\bstores? (in|at|near)\b|\bis there a store\b|\bwhere are (our|the) stores\b|\b(newest|youngest|latest|oldest|first) store\b/.test(s) && !ids.length && !/\bhurt|cannibal|lose|affect|steal\b/.test(s)) {
    let xs = res.stores.filter(x => !city || x.city === city || h.cityOf(x) === city);
    if (/newest|youngest|latest|oldest|first/.test(s)) xs = [...res.stores].sort((a, b) => (/oldest|first/.test(s) ? (a.opened || 9999) - (b.opened || 9999) : (b.opened || 0) - (a.opened || 0))).slice(0, 3);
    return { html: xs.length ? `<p>${/newest|youngest|latest|oldest|first/.test(s) ? (/oldest|first/.test(s) ? 'Oldest' : 'Newest') + ' stores' : `${plural(xs.length, 'store')}${city ? ` in ${h.esc(city)}` : ' open today'}`}:</p>${list(xs, x => `${L(x.id, `map?store=${x.id}`)} · ${h.esc(x.city)} · pin ${h.esc(String(x.pin))}${x.opened ? ` · opened ${x.opened}` : ''}`, 15)}` : `<p>We have no store${city ? ` in ${h.esc(city)}` : ''} yet${city ? `, so ${h.esc(city)} is an open market` : ''}.</p>` };
  }
  if (/\b(where should we (open|expand|go)|where to (open|expand)|open next|expand next|underserved|under-?served|white ?space|gaps? in (the )?(map|network)|where is (the )?demand|demand (is )?highest|highest demand|best (areas?|pins?|locations?|places?) to open)\b/.test(s)) {
    const cands = res.territories.filter(t => t.open > 0 || t.needsLeads).flatMap(t => t.pinsFree.map(pin => ({ pin, t, d: pinProxy(pin, t.tier).demand })));
    cands.sort((a, b) => ({ High: 0, Medium: 1, Low: 2 }[a.t.priority] - { High: 0, Medium: 1, Low: 2 }[b.t.priority]) || b.d - a.d);
    const needs = res.territories.filter(t => t.needsLeads);
    return { html: `${needs.length ? `<p>Territories with open spots but not enough good applicants: ${needs.map(t => `${L(`${t.id} ${t.city}`, `territories/${t.id}`)} (${t.open} open, ${t.priority})`).join(', ')}.</p>` : '<p>Every territory with open spots has enough good applicants.</p>'}${cands.length ? `<p>Best free pins to fill next (by priority, then demand):</p>${list(cands, c => `Pin ${L(c.pin, `map?pin=${c.pin}`)} in ${L(c.t.id, `territories/${c.t.id}`)} ${h.esc(c.t.city)} · demand ${Math.round(c.d * 100)}/100 · ${c.t.priority} priority`, 8)}` : '<p>No free pins in territories with open spots.</p>'}<p class="muted">Demand here is an estimate from city size and pin, until real order data per pin is loaded.</p>` };
  }
  if (/\b(full|filled|no (open )?(spots|slots) left)\b/.test(s) && /\bterritor|area|zone\b/.test(s)) {
    const full = res.territories.filter(t => t.open <= 0);
    return { html: full.length ? `<p>${plural(full.length, 'territory', 'territories')} with no spots left:</p>${list(full, t => `${L(t.id, `territories/${t.id}`)} ${h.esc(t.city)} · ${t.slots ? `${t.slots} of ${t.slots} filled` : 'no new store planned'}`)}` : '<p>Every territory still has open spots.</p>' };
  }
  const prio = s.match(/\b(high|medium|low)[- ]priority\b|\bpriority (high|medium|low)\b/);
  if (prio && !ids.length && !/\bset|make|change|now has\b/.test(s)) {
    const p = (prio[1] || prio[2]); const P = p[0].toUpperCase() + p.slice(1);
    const ts = res.territories.filter(t => t.priority === P);
    return { html: ts.length ? `<p>${plural(ts.length, `${P}-priority territory`, `${P}-priority territories`)}:</p>${list(ts, t => `${L(t.id, `territories/${t.id}`)} ${h.esc(t.city)} · ${t.open} of ${t.slots} spots open · ${t.applicants} applicants${t.needsLeads ? ' · needs leads' : ''}`)}` : `<p>No ${P.toLowerCase()}-priority territories in this file.</p>` };
  }
  if (ters.length === 1 && /\b(how many|number of) (slots|spots)|\bslots?\b|\bspots?\b/.test(s) && /\bhow many|left|open|free|available\b/.test(s)) {
    const t = ters[0];
    return { html: `<p>${L(t.id, `territories/${t.id}`)} ${h.esc(t.city)}: <b>${t.slots}</b> spots planned, ${t.winners.length} suggested, <b>${Math.max(0, t.open)}</b> still open. ${t.waitlist.length} on its waitlist.</p>` };
  }

  // ---------- 5. Lists by any detail ----------
  const listy = /^(who|which|list|show|find|any|anyone|people|applicants|give me|get me|all|are there)\b|\b(who|which applicants|which people|anyone)\b/.test(s);
  if (listy && !ids.length && !isWhatIf) {
    const f = h.filtersFrom(q, res);
    const tests = [];
    if (/\b(no|without|not (yet )?(found|got|have|identified)|haven't found|looking for|yet to find)\b.*\b(space|shop|site|premises|location)\b|\bno space\b/.test(s)) tests.push(['without a shop yet', a => a.spaceStd === 'Not yet identified']);
    else if (/\bown(s|ed)?\b.*\b(shop|space|property|premises|building)\b|\bowned\b/.test(s)) tests.push(['who own their shop', a => a.spaceStd === 'Owned']);
    else if (/\brent(s|ed|ing)?\b|\blease/.test(s)) tests.push(['who rent their shop', a => a.spaceStd === 'Rented']);
    if (/\b(zero|no|0|without|nil|any) (retail |shop |prior )?experience\b|\bfreshers?\b|\bfirst[- ]time\b|\bnever run\b/.test(s)) tests.push(['with no shop experience', a => a.exp === 0]);
    const yrs = s.match(/\b(more than|over|above|at least|min(imum)?|>=?)\s*(\d+(\.\d+)?)\s*(years?|yrs)\b/) || s.match(/\b(\d+(\.\d+)?)\+?\s*(years?|yrs)( or more)?\b/);
    if (yrs && /experience|years|yrs/.test(s)) { const v = +(yrs[3] || yrs[1]); tests.push([`with ${v}+ years of experience`, a => a.exp != null && a.exp >= v]); }
    const less = s.match(/\b(less than|under|below|<)\s*(\d+(\.\d+)?)\s*(lakh|lac|l\b|lakhs)/), more = s.match(/\b(more than|over|above|at least|>=?|minimum)\s*(\d+(\.\d+)?)\s*(lakh|lac|l\b|lakhs)/) || s.match(/\b(\d+(\.\d+)?)\s*(lakh|lac|l)\+/);
    if (less) tests.push([`with less than ₹${less[2]}L`, a => a.invest != null && a.invest < +less[2]]);
    else if (more) { const v = +(more[2] && /\d/.test(more[2]) ? more[2] : more[1]); tests.push([`with ₹${v}L or more`, a => a.invest != null && a.invest >= v]); }
    const lang = s.match(/\b(speaks?|language|prefer(s|red)?|training in)\b.*\b(kannada|english|hindi|tamil|telugu|malayalam|marathi|bengali|gujarati|urdu)\b|\b(kannada|english|hindi|tamil|telugu|malayalam|marathi|bengali|gujarati|urdu)[- ](speaking|speakers?)\b/);
    if (lang) { const l = (lang[3] || lang[4]); tests.push([`who prefer ${l[0].toUpperCase() + l.slice(1)}`, a => String(a.lang || '').toLowerCase() === l]); }
    const fest = s.match(/\b(diwali|deepavali|dasara|dussehra|christmas|sankranti|pongal|festival)\b/);
    if (fest) tests.push([`who want to open for ${fest[1] === 'festival' ? 'a festival' : fest[1][0].toUpperCase() + fest[1].slice(1)}`, a => !!a.timeline?.festival || new RegExp(fest[1] === 'festival' ? 'diwali|deepavali|dasara|dussehra|christmas|sankranti|pongal|festival' : fest[1], 'i').test(`${a.notes || ''} ${a.launchNote || ''}`)]);
    if (/\b(missing|incomplete|blank|unclear|contradict)\b.*\b(info|information|data|details|fields?)?\b|\bneed(s)? (more )?(info|information|details)\b/.test(s)) tests.push(['with missing or unclear information', a => (a.issues || []).some(i => i.level === 'block') || a.decision === 'hold']);
    if (/\b(same|duplicate|shared?) pins?\b|\bpin clash/.test(s)) { const c = {}; res.apps.forEach(a => { if (a.pin) c[a.pin] = (c[a.pin] || 0) + 1; }); tests.push(['who share a pin with another applicant', a => a.pin && c[a.pin] > 1]); }
    if (/\bground[- ]floor\b/.test(s)) tests.push(['with a ground-floor shop', a => a.floorStd === 'Ground']);
    if (/\bmall\b/.test(s)) tests.push(['with a mall unit', a => a.floorStd === 'Mall unit']);
    if (/\bupper[- ]floor|first floor|1st floor\b/.test(s)) tests.push(['with an upper-floor shop', a => a.floorStd === 'Upper']);
    if (/\b(co-?investor|short (of|on) money|funding gap|money gap|need(s)? (a )?loan)\b/.test(s)) tests.push(['who are short of money', a => a.gap > 0]);
    if (/\b(inside|within) (the )?(ring|radius|\d+ ?km)|too close to (a|our) store/.test(s)) tests.push(['inside a store\'s ring', a => a.overlap]);
    if (/\b(outside|not in) (any |our )?(territor|area)/.test(s)) tests.push(['outside our territories', a => !a.territory]);
    if (/\b(withdrew|withdrawn|dropped out)\b/.test(s)) tests.push(['who withdrew', a => a.withdrawn]);
    if (tests.length) {
      const pool = h.applyF(res.apps, f).filter(a => tests.every(([, fn]) => fn(a)));
      const label = [...tests.map(([l]) => l), ...f.label].join(', ');
      return { html: pool.length ? `<p><b>${pool.length}</b> applicant${pool.length === 1 ? '' : 's'} ${h.esc(label)}:</p>${list(pool, a => `${who(a)} · ${h.esc(a.cityName || a.city || '—')} · ${h.DECISION_LABEL[a.decision].toLowerCase()}`, 15)}` : `<p>Nobody ${h.esc(label)}.</p>` };
    }
  }

  // ---------- 6. Superlatives ----------
  if (!ids.length && !isWhatIf) {
    const f = h.filtersFrom(q, res), pool = h.applyF(res.apps, f).filter(a => !a.withdrawn);
    const sup = [
      [/\bmost experienced|longest experience|most years\b/, 'Most experience', a => a.exp, -1, a => `${a.exp} yrs`],
      [/\bleast experienced|least experience\b/, 'Least experience', a => a.exp, 1, a => `${a.exp} yrs`],
      [/\b(worst|weakest|lowest[- ]ranked|bottom) (applicant|partner|candidate|one|lead)s?\b|\bworst\b/, 'Weakest by combined score', a => a.combined, 1, a => `combined ${a.combined}`],
      [/\b(cheapest|lowest cost|least expensive|smallest investment needed)\b/, 'Cheapest stores to open', a => a.needed, 1, a => `needs ${lakh(a.needed)}`],
      [/\b(most expensive|costliest|highest cost)\b/, 'Most expensive stores to open', a => a.needed, -1, a => `needs ${lakh(a.needed)}`],
      [/\b(longest|slowest) payback\b/, 'Longest payback', a => (isFinite(a.payback) ? a.payback : null), -1, a => `${Math.round(a.payback)} months`],
      [/\b(richest|most money|deepest pockets|biggest investor)\b/, 'Most money to invest', a => a.invest, -1, a => lakh(a.invest)],
    ].find(([re]) => re.test(s));
    if (sup) {
      const [, label, val, dir, show] = sup;
      const xs = pool.filter(a => val(a) != null && isFinite(val(a))).sort((a, b) => dir * (val(a) - val(b)));
      return { html: xs.length ? `<p>${label}${f.label.length ? ' ' + h.esc(f.label.join(', ')) : ''}:</p>${list(xs, a => `${who(a)} · ${show(a)} · ${h.DECISION_LABEL[a.decision].toLowerCase()}`, 5)}` : '<p>No applicants have that number.</p>' };
    }
    if (/\b(riskiest|most risky|weakest|shakiest) (approval|yes|suggestion|site|store)s?\b|\brisk(y|iest)? approvals?\b/.test(s)) {
      const ready = res.apps.filter(a => a.bucket === 'ready').map(a => ({ a, t: siteInsight(a, res) }));
      ready.sort((x, y) => (x.t?.cushion ?? 9) - (y.t?.cushion ?? 9) || (y.a.conditions?.length || 0) - (x.a.conditions?.length || 0));
      return { html: ready.length ? `<p>Suggested-yes applicants with the thinnest safety margin:</p>${list(ready, ({ a, t }) => `${who(a)} · ${t ? `${t.cushion.toFixed(1)}× break-even traffic` : 'no traffic estimate'} · payback ${isFinite(a.payback) ? Math.round(a.payback) + ' mo' : '—'} · ${plural(a.conditions?.length || 0, 'condition')}`, 5)}` : '<p>Nobody is suggested yes yet.</p>' };
    }
  }

  // ---------- 7. The whole batch ----------
  if (/\b(approval|acceptance|rejection|decline|success|conversion) rate\b|\b(percent|percentage|%|proportion|share) (of )?(approved|declined|on hold|waitlisted|applicants)\b|\bwhat (percent|percentage|%)\b/.test(s)) {
    const N = res.apps.length, c = d => res.apps.filter(a => a.decision === d).length, ready = res.apps.filter(a => a.bucket === 'ready').length;
    return { html: `<p>Of ${N} applicants: <b>${pct(ready, N)}</b> suggested yes (${pct(c('approved'), N)} outright, ${pct(c('conditional'), N)} with conditions), ${pct(c('hold'), N)} on hold, ${pct(c('waitlist'), N)} waitlisted, ${pct(c('declined'), N)} declined.</p>` };
  }
  if (/\b(why|reasons?|causes?)\b.*\b(declin|reject|turned down|said no)|\b(declin|reject)\w*\b.*\b(why|reasons?)\b|\bhow many (people )?(were )?(declined|rejected) and why\b/.test(s) && !ids.length) {
    const dec = res.apps.filter(a => a.decision === 'declined'); const by = {};
    dec.forEach(a => { (by[a.sub] ||= []).push(a); });
    const LBL = { 'pin-conflict': 'a store already exists in that pin', score: 'partner score below the bar', funding: 'too far short of money', payback: "store wouldn't earn back in time", experience: 'not enough shop experience', demographic: 'area demographics too weak', duplicate: 'duplicate application', 'out-of-territory': 'outside our territories', 'missing-info': 'key information missing' };
    return { html: dec.length ? `<p><b>${dec.length}</b> suggested decline, by main reason:</p><ul>${Object.entries(by).sort((a, b) => b[1].length - a[1].length).map(([k, xs]) => `<li><b>${xs.length}</b> ${h.esc(LBL[k] || k)} — e.g. ${xs.slice(0, 3).map(who).join(', ')}</li>`).join('')}</ul>` : '<p>Nobody is suggested decline.</p>' };
  }
  if (/\b(hurt|cannibali[sz]|eat into|steal|take (customers|sales|visitors) from|affect|impact)\b.*\b(our|existing|current) (stores?|outlets?)\b|\bexisting stores?\b.*\b(lose|hurt|affected)\b/.test(s)) {
    const tr = trafficSummary(res);
    return { html: tr.stores.length ? `<p>${plural(tr.stores.length, 'of our stores could', 'of our stores could')} lose some visitors to suggested new sites:</p>${list(tr.stores, x => `${L(x.id, `map?store=${x.id}`)} (pin ${h.esc(x.pin)}): about ${x.lost} visitors a day to ${x.by.map(a => L(a.id, `app/${a.id}`)).join(', ')}`, 8)}<p class="muted">New sites inside the ${cfg.overlapKm} km ring also get a site-visit condition before opening.</p>` : `<p>No suggested site is close enough to share customers with our stores. Every suggested site is outside the ${cfg.overlapKm} km ring, or no site is suggested yet.</p>` };
  }
  if (/\b(problems?|issues?|errors?|quality|wrong|messy|dirty)\b.*\b(data|file|sheet|upload)\b|\b(how did you|how was|how is) (read|reading|understand)|\bassum(e|ed|ption)s?\b|\bwhat did you (read|understand|change)\b/.test(s)) {
    const rep = data.report || { sheets: [], assumptions: [] };
    const issues = {}; res.apps.forEach(a => (a.issues || []).forEach(i => { issues[i.text.replace(/\d{6}|\d+(\.\d+)?/g, '#').slice(0, 70)] = (issues[i.text.replace(/\d{6}|\d+(\.\d+)?/g, '#').slice(0, 70)] || 0) + 1; }));
    const top = Object.entries(issues).sort((a, b) => b[1] - a[1]).slice(0, 6);
    return { html: `<p>How the file was read:</p><ul>${rep.sheets.map(x => `<li>"${h.esc(x.name)}": ${x.type === 'skipped' ? 'skipped (no records)' : `${x.type}, ${x.read ?? 0} read`}${x.missing?.length ? `, missing columns: ${h.esc(x.missing.join(', '))}` : ''}</li>`).join('')}</ul>${rep.assumptions.length ? `<p>Assumptions made:</p><ul>${rep.assumptions.slice(0, 8).map(a => `<li>${h.esc(a)}</li>`).join('')}</ul>` : ''}${top.length ? `<p>Most common problems in the rows:</p><ul>${top.map(([t, n]) => `<li>${n} × ${h.esc(t)}</li>`).join('')}</ul>` : '<p>No problems found in the rows.</p>'}<p>${L('Applicants on hold', 'feed?dec=hold')} are the ones waiting for missing details.</p>` };
  }
  if (/\b(hubspot|crm|export|download)\b/.test(s)) return { plain: true, html: '<p>Open any applicant and use <b>Copy for HubSpot</b> at the bottom of the profile: it copies the record with the suggestion, your final decision, scores and next step, ready to paste into HubSpot. Only decisions a person has recorded are treated as final. The activity log can be downloaded as CSV from the Log page.</p>' };
  if (/\bwho (should i|do i|to) (call|contact|ring|phone|reach out to|start with)( first)?\b|\b(first|next) (call|person to call)\b|\bwho first\b/.test(s)) {
    const acts = res.actions.filter(a => a.x).slice(0, 6);
    return { html: acts.length ? `<p>Call these first:</p><ol>${acts.map(a => `<li>${who(a.x)}${a.x.phone ? ` · ${h.esc(a.x.phone)}` : ''} — ${h.esc(a.why)}</li>`).join('')}</ol>` : '<p>Nobody needs a call right now.</p>' };
  }
  if (city && /\b(how (are|is) (things|it|the market|business)|what about|tell me about|how is|status of|doing in|update on|summary (of|for)|overview of|good market|potential|opportunit|worth (it|opening))\b/.test(s) && !ids.length) return { html: cityView(city, res, h, L, who) };
  if (/\b(summar\w*|overview|recap|status|what is happening|what's happening|how are (we|things) (doing|going)|is everything (ok|okay|fine|good|alright)|any (news|updates?)|update me|state of (things|play)|big picture|where do we stand)\b/.test(s) && !ids.length) return { html: batchSummary(res, h, L) };
  if (/\b(how (can|do|could|should) we (get|find|attract|recruit|bring in) (more )?(applicants|partners|leads|franchisees)|more (leads|applicants|partners) (in|for)|attract (more )?(partners|applicants))\b/.test(s)) return { html: recruitAdvice(city, res, h, L) };

  // ---------- 8. Open questions about the franchise plan ----------
  if (/\b(how (do|does) (a )?franchis(e|ing|es) work|what is (a )?franchis(e|ing)|explain franchis)/.test(s)) return { html: `<p>In a franchise, a local partner (the franchisee) invests in and runs a store under the brand (the franchisor). The partner pays for the shop, fit-out, first stock and working capital, plus a brand fee (₹${ECON[3].fee}–${ECON[1].fee}L here), and shares 6% of monthly sales as royalty plus 2% for marketing. The brand gives the name, products, training, systems and support. StoreSense covers the brand's side: choosing the right partner in the right place, then onboarding them until the store opens.</p>` };
  if (/\b(what makes|qualities of|ideal|perfect|good|great|strong) (a )?(good |great |strong |ideal )?(franchise )?(partner|franchisee|applicant|candidate)\b|\bwhat do (we|you) look for\b/.test(s) && !ids.length) {
    const top = [...res.apps].filter(a => a.bucket === 'ready').sort((a, b) => b.partner - a.partner).slice(0, 3);
    return { html: `<p>A strong partner, as the partner score measures it (out of 100): shop experience (${h.WEIGHTS.experience}), running a chain or franchise before, so they follow a set way of working (${h.WEIGHTS.compliance}), related business (${h.WEIGHTS.relevance}), enough money for the store and a cushion (${h.WEIGHTS.capital}), and a shop plus a clear plan (${h.WEIGHTS.commitment}). The bar is ${cfg.partnerBar}. Then the place has to work too: shoppers nearby, no store of ours within ${cfg.overlapKm} km, and payback within ${cfg.maxPayback} months.</p>${top.length ? `<p>Best examples in this file: ${top.map(a => `${who(a)} (${a.partner})`).join(', ')}.</p>` : ''}` };
  }
  if (/\b(roll ?out|pilot|adoption|launch plan for the tool|implementation plan|go[- ]live)\b/.test(s)) {
    const pilotCity = cities.find(c => /mysuru/i.test(c)) || cities[0];
    return { html: `<p>A three-step rollout:</p><ol><li><b>Pilot (4 weeks, ${h.esc(pilotCity || 'one city')}):</b> the team works as usual while StoreSense suggests in parallel. Compare the two and log every override with its reason.</li><li><b>All of Karnataka:</b> StoreSense suggests and the team reviews only the exceptions (holds, conditions, overrides). Track days to open, % of approved partners who open, override rate, sales at nearby stores and 6-month survival.</li><li><b>Real data and new states:</b> replace estimated demand with real orders per pin, review the rule weights every quarter using the overrides, then add new states.</li></ol><p>In this batch the pilot would cover ${res.apps.filter(a => a.cityName === pilotCity).length} applicants in ${h.esc(pilotCity || '')}.</p>` };
  }
  if (/\b(biggest|main|key|top) (risks?|concerns?|issues?|problems?)\b|\bwhat could go wrong\b|\brisks? (in|for|of) (this|the) (batch|file|plan|round)\b/.test(s) && !ids.length) return { html: batchRisks(res, h, L, who) };
  if (/\b(explain|tour of|walk me through|how (do i|to) use) (this|the) (dashboard|app|tool|site|page)|\bwhat is this (app|tool|dashboard)\b|\bhow does this work\b/.test(s)) return { html: `<p>StoreSense reads your applicant and territory file, suggests a decision for every applicant using fixed rules, and helps you open the stores. Pages:</p><ul><li>${L('Home', 'overview')}: the funnel, today's actions and insights.</li><li>${L('To-do', 'feed')}: everyone grouped as suggested yes, keep warm or suggested no; open a person to decide.</li><li>${L('Territories', 'territories')}: spots, winners, waitlists and free pins.</li><li>${L('Map', 'map')}: stores, applicants, rings and demand.</li><li>${L('Openings', 'onboarding')}: the onboarding board.</li><li>${L('Rules', 'rules')}: every rule and slider.</li><li>${L('Log', 'log')}: every change.</li></ul><p>Ask me anything about the file, for example "Why is ${h.esc(res.apps.find(a => a.decision === 'hold')?.id || 'APP-007')} on hold?".</p>` };

  // ---------- 9. Clearly outside StoreSense ----------
  if (!ids.length && !ters.length && !city && !/\b(territor|store|pin|applicant|partner|franchis|slot|spot)/.test(s) && /\b(capital of|weather|joke|poem|song|recipe|cricket|movie|stock price|news today|who won|president|prime minister|translate|write (a|me) (poem|story|essay|code))\b/.test(s)) return { plain: true, offTopic: true, html: '<p>I only answer questions about StoreSense and the file you loaded: applicants, territories, stores, pins, money, rules and the opening plan.</p>' };
  return null;
}

// ---------- answer builders ----------
function draftMessage(x, res, h) {
  const first = String(x.name).split(' ')[0];
  const lines = {
    hold: `we need a few details to finish reviewing your application: ${(x.request || (x.issues || []).filter(i => i.level === 'block').map(i => i.ask || i.text)).join('; ') || 'a few missing details'}. Once we have them, we'll update you within 2 working days.`,
    approved: `good news: your application is suggested for approval${x.territory ? ` in ${x.territory.city}` : ''}. The next step is the letter of intent and brand fee; our team will call you to walk through the opening plan.`,
    conditional: `your application looks strong and can move forward once ${x.conditions?.length ? x.conditions.map(c => c.text.toLowerCase()).join('; ') : 'a few conditions are met'}. We'll help you with each step.`,
    waitlist: `thank you for your patience. Your application is good, but ${h.esc(String(x.headline || '').replace(/^suggest waitlist:?\s*/i, '').toLowerCase()) || 'there is no open spot right now'}. You're on our waitlist and we'll contact you first when a spot opens.`,
    declined: `thank you for applying. We can't take your application forward right now: ${h.esc(String(x.headline || '').replace(/^suggest decline:?\s*/i, '').toLowerCase())}. You're welcome to apply again if things change.`,
  }[x.decision] || 'thank you for applying.';
  return `<p>Draft message for <b>${h.esc(x.name)}</b> (${h.esc(x.lang || 'English')}${x.phone ? `, ${h.esc(x.phone)}` : ''}):</p><blockquote>Hello ${h.esc(first)}, ${lines}<br>— StoreSense expansion team</blockquote><p class="muted">Based on the current suggestion (${h.DECISION_LABEL[x.decision].toLowerCase()}). Send it once a person has confirmed the decision on the profile; the profile's message button has it in ${h.esc(x.lang || 'English')}.</p>`;
}

function risksOf(x, res, h, L) {
  const r = [];
  (x.issues || []).forEach(i => r.push(`${i.level === 'block' ? 'Blocking: ' : ''}${i.text}`));
  if (x.gap > 0) r.push(`Short of money by ${lakh(x.gap)} (has ${lakh(x.invest)}, needs ${lakh(x.needed)}).`);
  if (isFinite(x.payback) && x.payback > res.cfg.maxPayback * 0.8) r.push(`Payback of ${Math.round(x.payback)} months is close to the ${res.cfg.maxPayback}-month limit.`);
  if (!isFinite(x.payback)) r.push('At this size and rent the store would not cover its monthly costs.');
  if (x.exp === 0) r.push('No shop experience: needs a trained store manager and pre-opening training.');
  if (x.overlap) r.push(`Within ${res.cfg.overlapKm} km of ${x.nearest?.store?.id}; could share customers.`);
  if (x.spaceStd === 'Not yet identified') r.push('No shop found yet, so opening depends on finding a site.');
  if (x.competitors >= 7) r.push(`About ${x.competitors} similar shops nearby.`);
  const t = siteInsight(x, res); if (t && t.cushion < 1.5) r.push(`Thin traffic: only ${t.cushion.toFixed(1)}× the visitors needed to break even.`);
  if (x.timeline?.festivalMiss) r.push('Wants to open for a festival that is too close to make.');
  (x.flags || []).forEach(f => r.push(typeof f === 'string' ? f : f.text || ''));
  return `<p>Risks for ${L(`${x.name} (${x.id})`, `app/${x.id}`)} (${h.DECISION_LABEL[x.decision].toLowerCase()}):</p>${r.length ? `<ul>${[...new Set(r.filter(Boolean))].map(t => `<li>${h.esc(t)}</li>`).join('')}</ul>` : '<p>No notable risks: money, payback, location and experience all clear the rules.</p>'}`;
}

function whatWouldChange(x, res, h, L) {
  const steps = [];
  (x.issues || []).filter(i => i.level === 'block').forEach(i => steps.push(`Send ${i.ask || i.text}.`));
  if (x.gap > 0) steps.push(`Close the ${lakh(x.gap)} money gap (co-investor, loan, or a smaller format).`);
  (x.conditions || []).forEach(c => steps.push(`${c.text} (within ${c.days} days).`));
  if (x.sub && h.nurtureAdvice) { const adv = h.nurtureAdvice(x); if (adv && !/keep in touch/.test(adv)) steps.push(adv[0].toUpperCase() + adv.slice(1)); }
  if (x.sub === 'score') steps.push(`Raise the partner score from ${x.partner} to ${res.cfg.partnerBar}: more shop experience, a found shop, or more money all help.`);
  if (x.sub === 'pin-conflict') steps.push('Choose a different pin: we already have a store in this one.');
  return `<p>${L(`${x.name} (${x.id})`, `app/${x.id}`)} is ${h.DECISION_LABEL[x.decision].toLowerCase()}: ${h.esc(x.headline)}.</p>${steps.length ? `<p>What would change it:</p><ul>${[...new Set(steps)].map(t => `<li>${h.esc(t)}</li>`).join('')}</ul>` : '<p>Nothing to fix: this is already the best outcome the rules allow.</p>'}<p class="muted">Tell me new information (for example "${h.esc(x.id)} can now invest 40 lakh") and I'll re-run the rules.</p>`;
}

function cityView(city, res, h, L, who) {
  const apps = res.apps.filter(a => a.cityName === city), ters = res.territories.filter(t => t.city === city), stores = res.stores.filter(x => x.city === city || h.cityOf(x) === city);
  const c = d => apps.filter(a => a.decision === d).length, ready = apps.filter(a => a.bucket === 'ready');
  const inv = h.median(apps.map(a => a.invest)), tier = apps[0]?.tier || ters[0]?.tier;
  const open = ters.reduce((n, t) => n + Math.max(0, t.open), 0), slots = ters.reduce((n, t) => n + t.slots, 0);
  const free = ters.flatMap(t => t.pinsFree);
  const dem = free.length ? Math.round(h.median(free.map(p => pinProxy(p, tier).demand)) * 100) : null;
  const best = [...ready].sort((a, b) => b.combined - a.combined)[0];
  return `<p><b>${h.esc(city)}</b>${tier ? ` (Tier ${tier})` : ''}: ${apps.length} applicants, ${plural(stores.length, 'store')} of ours today${stores.length ? '' : ' (an open market)'}, ${ters.length ? `${plural(ters.length, 'territory', 'territories')} planning ${slots} new stores, ${open} spots still open` : 'no territory yet'}.</p><ul><li>${ready.length} suggested yes, ${c('hold')} on hold, ${c('waitlist')} waitlisted, ${c('declined')} declined.</li>${inv != null ? `<li>Typical money offered: ${lakh(inv)}.</li>` : ''}${free.length ? `<li>${free.length} free pins${dem != null ? `, typical demand ${dem}/100 (estimate)` : ''}.</li>` : ''}${best ? `<li>Strongest applicant: ${who(best)} (combined ${best.combined}).</li>` : ''}${ters.some(t => t.needsLeads) ? '<li><b>Needs more applicants</b> for its open spots.</li>' : ''}</ul><p>${L(`See ${city} on the map`, `map?city=${encodeURIComponent(city)}`)} · ${L(`Applicants in ${city}`, `feed?city=${encodeURIComponent(city)}`)}</p>`;
}

function batchSummary(res, h, L) {
  const N = res.apps.length, c = d => res.apps.filter(a => a.decision === d).length, ready = res.apps.filter(a => a.bucket === 'ready').length;
  const open = res.territories.reduce((n, t) => n + Math.max(0, t.open), 0), slots = res.territories.reduce((n, t) => n + t.slots, 0);
  const ins = (h.insights ? h.insights(res) : []).slice(1, 6);
  return `<p><b>${N} applicants</b> for ${slots} new stores across ${plural(res.territories.length, 'territory', 'territories')} (${res.stores.length} stores open today).</p><p>${ready} suggested yes (${c('approved')} outright, ${c('conditional')} with conditions) · ${c('hold')} on hold · ${c('waitlist')} waitlisted · ${c('declined')} declined. ${open} spots still open.</p>${ins.length ? `<ul>${ins.map(i => `<li>${i.go ? L(i.text, i.go) : h.esc(i.text)}</li>`).join('')}</ul>` : ''}<p>${L("Today's actions", 'overview')}</p>`;
}

function batchRisks(res, h, L, who) {
  const r = [], tr = trafficSummary(res);
  if (tr.thin.length) r.push(`${plural(tr.thin.length, 'suggested site')} with thin traffic (under 1.5× break-even), e.g. ${tr.thin.slice(0, 2).map(t => who(t.a)).join(', ')}.`);
  if (tr.stores.length) r.push(`${plural(tr.stores.length, 'existing store')} could lose visitors to new sites, most ${L(tr.stores[0].id, `map?store=${tr.stores[0].id}`)}.`);
  const holds = res.apps.filter(a => a.decision === 'hold'); if (holds.length) r.push(`${holds.length} applicants on hold for missing or contradictory data; the batch isn't complete until they reply.`);
  const fund = res.apps.filter(a => a.sub === 'funding'); if (fund.length) r.push(`${fund.length} good partners are held back only by money.`);
  const cond = res.apps.filter(a => a.decision === 'conditional'); if (cond.length) r.push(`${cond.length} approvals depend on conditions with deadlines; if they slip, the waitlist moves up.`);
  const zero = res.apps.filter(a => a.bucket === 'ready' && a.exp === 0); if (zero.length) r.push(`${zero.length} suggested-yes partners have no shop experience and need a manager and training.`);
  const needs = res.territories.filter(t => t.needsLeads); if (needs.length) r.push(`${plural(needs.length, 'territory', 'territories')} can't fill their spots: ${needs.map(t => L(t.id, `territories/${t.id}`)).join(', ')}.`);
  const fest = res.apps.filter(a => a.timeline?.festivalMiss); if (fest.length) r.push(`${fest.length} applicants expect to open for a festival they can't make.`);
  r.push('Demand and traffic are estimates until real order data per pin is loaded.');
  return `<p>Biggest risks in this batch:</p><ol>${r.map(t => `<li>${t}</li>`).join('')}</ol>`;
}

function recruitAdvice(city, res, h, L) {
  const ters = res.territories.filter(t => (!city || t.city === city) && (t.needsLeads || t.open > 0));
  const nearby = res.apps.filter(a => a.decision === 'waitlist' && a.partner >= res.cfg.partnerBar && (!city || a.cityName !== city)).slice(0, 5);
  return `<p>To find more partners${city ? ` in ${h.esc(city)}` : ''}:</p><ol><li>Target the free pins ${ters.length ? `in ${ters.map(t => `${L(t.id, `territories/${t.id}`)} (${t.pinsFree.slice(0, 4).join(', ')}${t.pinsFree.length > 4 ? '…' : ''})`).join(', ')}` : 'in territories with open spots'}: local ads, shop-owner associations and the brand's existing customers there.</li><li>Approach owners of related shops (footwear, apparel, optical, mobile, pharmacy, kirana): they score highest on related business and already know retail.</li><li>Offer team-ups: pair an experienced operator with a local investor (co-investor pairs).</li>${nearby.length ? `<li>Ask strong waitlisted applicants from other areas if they would move: ${nearby.map(a => L(`${a.name} (${a.id})`, `app/${a.id}`)).join(', ')}.</li>` : ''}<li>Use the enquiry form on Home: new leads are scored live.</li></ol>`;
}
