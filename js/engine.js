// engine.js — the rulebook. Pure and deterministic: the same data and settings
// always give the same decisions. Nothing here uses AI.
import { cityInfo, cityForPin, stateForPin, guessTier, pinPoint, km, hash01, cityKey } from './geo.js';

export const DEFAULTS = {
  minInvest: { 1: 35, 2: 25, 3: 15 },  // ₹ lakh policy floor by city tier (slider)
  minExp: 1,                           // years (slider)
  partnerBar: 55,                      // partner score needed to be considered
  maxPayback: 30,                      // months; a store above this is never approved
  overlapKm: 2,                        // one catchment radius for every city
  minDemographic: 0.35,                // demographic suitability floor (proxy index 0–1)
  fundTolerance: 0.85,                 // share of capital needed to be approved with a funding condition
  category: 'retail',                  // the brand's business type, used to judge business relevance
};

// Unit economics by tier (₹ lakh unless noted). Assumptions to be replaced by
// the brand's actual store P&Ls.
export const ECON = {
  1: { fee: 4, fitPerSqft: 2500, stock: 8, rentSqft: 120, staff: 0.9, util: 0.2, salesSqft: 2200 },
  2: { fee: 3, fitPerSqft: 2000, stock: 6, rentSqft: 70, staff: 0.65, util: 0.15, salesSqft: 1600 },
  3: { fee: 2, fitPerSqft: 1600, stock: 4.5, rentSqft: 45, staff: 0.45, util: 0.1, salesSqft: 1200 },
};
export const MARGIN = { gross: 0.34, royalty: 0.06, marketing: 0.02 };
export const WEIGHTS = { experience: 30, compliance: 15, relevance: 20, capital: 20, commitment: 15 };
const PRIORITY_VAL = { High: 1, Medium: 0.65, Low: 0.35 };
const DEFAULT_SIZE = 500;

const FESTIVALS = [
  ['Dasara', /dasara|dussehra|navrat|vijayadashami/i, ['2026-10-20', '2027-10-09', '2028-09-27']],
  ['Diwali', /diwali|deepavali|dipawali/i, ['2026-11-08', '2027-10-29', '2028-10-17']],
  ['Christmas', /christmas|xmas/i, ['2026-12-25', '2027-12-25', '2028-12-25']],
  ['Sankranti', /sankranti|pongal/i, ['2027-01-14', '2028-01-15']],
];

const r1 = n => Math.round(n * 10) / 10;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const lerp = (x, pts) => { // piecewise-linear lookup
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  }
  return pts[pts.length - 1][1];
};
export const lakh = n => (n == null ? '—' : `₹${r1(n)}L`);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addMonths = (d, n) => addDays(d, Math.round(n * 30.4));
export const fmtDate = d => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// ---------------- Text readers (deterministic keyword rules) ----------------
const REL_HIGH = /foot ?wear|shoe|apparel|garment|cloth|textile|fashion|eyewear|optic|spectacle|retail|showroom|boutique|electronic|mobile|phone|kirana|grocer|supermarket|mart\b|pharma|chemist|medical store|cosmetic|beauty store|stationer|jewel|watch|toy|book ?store|gift|store|shop|outlet|franchise/i;
const REL_MID = /restaurant|cafe|bakery|sweet|salon|parlou?r|travel|distribut|wholesale|dealer|trading|agency|business|sales|merchandis|supply|logistic|courier|hotel/i;
const REL_LOW = /\bit\b|software|engineer|teacher|student|government|govt|bank|salaried|job|homemaker|housewife|retired|doctor|lawyer|farmer|agricultur|accountant|consult|army|defen[cs]e|clerk/i;
const NEG = /^(none|nil|no|na|n\/a|-|not applicable|nothing)\.?$/i;

export const CATEGORIES = {
  retail: { label: 'Retail store', re: REL_HIGH },
  food: { label: 'Food & beverage', re: /restaurant|cafe|café|food|bakery|qsr|cloud kitchen|catering|sweet|tea|coffee|juice|ice cream|dhaba|canteen|pizza|burger|biryani|mithai|dairy/i },
  logistics: { label: 'Delivery & logistics', re: /courier|logistic|delivery|transport|warehouse|cargo|fleet|parcel|supply chain|last.?mile|dispatch|e-?commerce/i },
  eyewear: { label: 'Eyewear & optical', re: /optic|eyewear|spectacle|optometr|lens|eye care/i },
  pharmacy: { label: 'Pharmacy & health', re: /pharma|chemist|medical|drug|health|clinic|diagnostic|lab|hospital|nurs/i },
  education: { label: 'Education & training', re: /school|tuition|coaching|teacher|teaching|education|training|academy|preschool|tutor|institute/i },
  fitness: { label: 'Fitness & wellness', re: /gym|fitness|yoga|sports|trainer|wellness|spa|salon|beauty/i },
  services: { label: 'Services', re: /salon|spa|laundry|repair|service cent|clean|travel|agency|consult|insurance|bank/i },
};
let BRAND = 'retail';
export function setCategory(c) { BRAND = CATEGORIES[c] ? c : 'retail'; }

function readBusiness(text) {
  const t = String(text || '').trim();
  if (!t || NEG.test(t)) return { relevance: 15, signal: 30, label: 'Not described' };
  if (BRAND !== 'retail') {
    const same = CATEGORIES[BRAND].re.test(t), shop = REL_HIGH.test(t);
    const franchise = /franchis|chain|brand outlet|company outlet/i.test(t);
    const managed = /manag|supervis|in-?charge|worked (at|in)|employee/i.test(t);
    const relevance = same ? 100 : shop ? 70 : REL_MID.test(t) ? 55 : REL_LOW.test(t) ? 25 : 45;
    const signal = franchise && relevance >= 55 ? 100 : managed && relevance >= 55 ? 80 : relevance >= 55 ? 60 : 35;
    const label = same ? `Has run a ${CATEGORIES[BRAND].label.toLowerCase()} business` : shop ? 'Has run a customer-facing business' : relevance >= 55 ? 'Related business background' : 'No related business background';
    return { relevance, signal, label: franchise && relevance >= 55 ? 'Has run a franchise / chain outlet' : label };
  }
  const franchise = /franchis|chain|brand outlet|company outlet|exclusive (brand )?(store|outlet)|\b(lenskart|bata|titan|reliance|dmart|more|trends|max|pantaloons|decathlon|tanishq|apollo|zudio)\b/i.test(t);
  const managed = /manag|supervis|store (in-?)?charge|worked (at|in)|employee|staff at|cashier|floor/i.test(t);
  const own = /\b(run|runs|ran|own|owns|owned|family|my)\b/i.test(t);
  let relevance = REL_HIGH.test(t) ? 100 : REL_MID.test(t) ? 60 : REL_LOW.test(t) ? 25 : 45;
  if (/\b(no|never|without)\b.*(shop|retail|business)/i.test(t)) relevance = Math.min(relevance, 25);
  let signal, label;
  if (franchise && relevance >= 60) { signal = 100; label = 'Has run a franchise / chain outlet'; }
  else if (managed && relevance >= 60) { signal = 80; label = 'Managed a store to a set process'; }
  else if (own && relevance >= 60) { signal = 60; label = 'Independent shop owner'; }
  else if (relevance >= 60) { signal = 55; label = 'Retail-adjacent background'; }
  else { signal = 35; label = 'No retail operating background'; }
  return { relevance, signal, label };
}

// ---------------- Main run ----------------
export function run(data, settings = {}) {
  const cfg = { ...DEFAULTS, ...settings, minInvest: { ...DEFAULTS.minInvest, ...(settings.minInvest || {}) } };
  setCategory(cfg.category);
  const asOf = settings.asOf ? new Date(settings.asOf) : new Date();
  asOf.setHours(0, 0, 0, 0);

  const stores = data.stores.map(s => ({ ...s, point: pinPoint(s.pin, s.city) }));
  const storeByPin = new Map(stores.map(s => [String(s.pin), s]));
  const territories = data.territories.map(t => ({
    ...t,
    tier: t.tier || guessTier(t.city),
    tierGuessed: !t.tier,
    pinsFree: [], winners: [], candidates: [], waitlist: [], pairings: [],
  }));
  const terByPin = new Map();
  for (const t of territories) for (const p of t.pins) {
    const prev = terByPin.get(p);
    if (!prev || PRIORITY_VAL[t.priority] > PRIORITY_VAL[prev.priority]) terByPin.set(p, t);
  }
  const better = (a, b) => (!a || (b && PRIORITY_VAL[b.priority] > PRIORITY_VAL[a.priority]) ? b : a);
  const findTer = (pin, cityName) => {
    if (terByPin.has(pin)) return terByPin.get(pin);
    let hit = null;
    for (const t of territories) if ((t.prefixes || []).some(px => pin.startsWith(px))) hit = better(hit, t);
    if (hit) return hit;
    const ck = cityKey(cityName);
    for (const t of territories) if (t.matchByCity && cityKey(t.city) === ck) hit = better(hit, t);
    return hit;
  };

  // 1. Read, clean, and flag contradictions
  const seenIds = new Map(), seenPeople = new Map();
  const apps = data.applications.map(a => {
    const x = { ...a, issues: [], conditions: [], reasons: [], flags: [] };
    const block = (field, text, ask) => x.issues.push({ level: 'block', field, text, ask });
    const warn = (field, text) => x.issues.push({ level: 'warn', field, text });
    if (a.withdrawn) { x.withdrawn = true; return x; }

    // duplicates
    const personKey = `${String(a.name).toLowerCase().replace(/\s+/g, ' ')}|${a.pin}`;
    if (seenIds.has(a.id)) x.duplicateOf = seenIds.get(a.id);
    else if (seenPeople.has(personKey) && a.name !== '(no name given)') x.duplicateOf = seenPeople.get(personKey);
    else { seenIds.set(a.id, a.id); seenPeople.set(personKey, a.id); }

    // location
    const pinOk = /^\d{6}$/.test(a.pin || '');
    const statedCity = cityInfo(a.city);
    if (!pinOk) block('pin', a.pin ? `pin code "${a.pin}" is not a 6-digit pin` : 'no pin code was given', 'the 6-digit pin code of the area where you want to open the store');
    else {
      const pinCity = cityForPin(a.pin), pinState = stateForPin(a.pin);
      if (statedCity && pinCity && statedCity.name !== pinCity.name)
        block('pin', `pin ${a.pin} belongs to ${pinCity.name}, but the city given is ${statedCity.name}`, `which city you want to open in, and the correct pin code there (you wrote ${a.city}, pin ${a.pin})`);
      else if (a.state && pinState && pinState !== 'North East' && pinState.toLowerCase() !== a.state.toLowerCase())
        block('pin', `pin ${a.pin} is in ${pinState}, but the state given is ${a.state}`, `the correct state and pin code (you wrote ${a.state}, pin ${a.pin})`);
      else if (statedCity && a.state && statedCity.state.toLowerCase() !== a.state.toLowerCase())
        warn('state', `${statedCity.name} is in ${statedCity.state}, not ${a.state}; used ${statedCity.state}`);
      if (!a.city) warn('city', `no city given; used ${(pinCity || {}).name || pinState || 'the pin code'}`);
    }
    x.cityName = statedCity?.name || (pinOk && cityForPin(a.pin)?.name) || a.city || '—';
    x.stateName = statedCity?.state || (pinOk && stateForPin(a.pin)) || a.state || '—';

    // money and experience
    if (a.invest == null) block('invest', 'investment capacity is missing', 'how much you can invest in the store, in ₹ lakh');
    else if (a.invest <= 0) block('invest', `investment capacity of ${a.invest} lakh is not usable`, 'how much you can invest in the store, in ₹ lakh');
    else if (a.invest > 500) warn('invest', `investment of ₹${a.invest} lakh is unusually high; please confirm`);
    if (a.investNote) warn('invest', `investment ${a.investNote}`);
    if (a.exp == null) block('exp', 'retail experience is missing', 'how many years you have run or managed a shop (0 if none)');
    else if (a.exp < 0) block('exp', 'retail experience is negative', 'how many years you have run or managed a shop (0 if none)');
    if (a.expNote) warn('exp', `experience ${a.expNote}`);
    if (a.spaceNote) warn('space', a.spaceNote);
    if (a.launchNote) warn('launch', `target launch ${a.launchNote}`);

    // space
    x.spaceStd = a.space || 'Not yet identified';
    if (!a.space) warn('space', a.spaceRaw ? `space answer "${a.spaceRaw}" is unclear; treated as not yet identified` : 'space not stated; treated as not yet identified');
    x.floorStd = a.floor;
    x.sizeUsed = a.size;
    const noSpaceNote = /(looking|search|yet to find|no (shop|space)|need (a )?(shop|space)|will find)/i.test(a.notes || '');
    if (x.spaceStd !== 'Not yet identified') {
      if (noSpaceNote) block('space', `space is "${x.spaceStd}" but the note says "${a.notes}"`, 'whether you already have the shop space (owned or rented), and its size and floor');
      if (!a.size) { warn('size', `space is ${x.spaceStd.toLowerCase()} but no size was given; assumed ${DEFAULT_SIZE} sq ft`); x.sizeUsed = DEFAULT_SIZE; x.sizeAssumed = true; }
      else if (a.size < 150 || a.size > 3000) warn('size', `space size of ${a.size} sq ft is outside the usual 150–3,000 sq ft`);
      if (a.floor === 'Not known') warn('floor', 'space is available but the floor is not known');
    } else {
      if (a.size || (a.floor && a.floor !== 'Not known')) warn('space', `says no space yet, but gave ${[a.size && `${a.size} sq ft`, a.floor !== 'Not known' && a.floor].filter(Boolean).join(', ')}; treated as no space yet`);
      x.sizeUsed = DEFAULT_SIZE; x.sizeAssumed = true; x.floorStd = 'Not known';
    }
    if (a.launch == null) { warn('launch', 'target launch not given; assumed 6 months'); x.launchUsed = 6; }
    else if (a.launch <= 0) { warn('launch', `target launch of ${a.launch} months read as 1 month`); x.launchUsed = 1; }
    else x.launchUsed = a.launch;
    return x;
  });

  // 2. Score everything that can be scored
  for (const x of apps) {
    if (x.withdrawn) { Object.assign(x, { partner: 0, site: 0, combined: 0, momentum: 0, parts: {}, flags: [], compliance: 0 }); continue; }
    const pinOk = /^\d{6}$/.test(x.pin || '');
    x.territory = pinOk ? findTer(x.pin, x.cityName) : null;
    x.tier = x.territory?.tier || cityInfo(x.cityName)?.tier || guessTier(x.cityName);
    x.point = pinOk ? pinPoint(x.pin, x.cityName) : null;
    scorePartner(x, cfg);
    scoreFinance(x, cfg);
    scoreSite(x, cfg, stores);
    scoreMomentum(x);
    x.combined = r1(0.6 * x.partner + 0.4 * x.site);
  }

  // 3. Decide, in a fixed order of rules
  for (const x of apps) {
    if (x.withdrawn) { set(x, 'declined', 'withdrawn', 'Withdrew the application'); continue; }
    if (x.duplicateOf) { set(x, 'declined', 'duplicate', `Duplicate of ${x.duplicateOf}`, [`The same person and pin code already applied as ${x.duplicateOf}; only that application is reviewed.`]); x.archived = true; continue; }
    const blocks = x.issues.filter(i => i.level === 'block');
    if (blocks.length) { set(x, 'hold', 'missing-info', `On hold: ${blocks[0].text}`, blocks.map(b => `Hold because ${b.text}.`)); continue; }
    const store = storeByPin.get(x.pin);
    if (store) {
      set(x, 'declined', 'pin-conflict', `Pin conflict: ${store.id} already open in ${x.pin}`,
        [`The brand never opens two stores in the same pin code, and ${store.id} (${store.city}, opened ${store.opened}) already serves ${x.pin}. Automatically archived.`]);
      x.archived = true; x.conflictStore = store;
      if (x.partner >= cfg.partnerBar) x.redirect = nearestFreePin(x, territories, storeByPin, new Set());
      continue;
    }
    if (x.partner < cfg.partnerBar) {
      const weak = weakest(x);
      set(x, 'declined', 'score', `Partner score ${x.partner} is below the ${cfg.partnerBar} bar`,
        [`Partner score ${x.partner} is below the ${cfg.partnerBar} bar. Weakest areas: ${weak}.`, 'Can reapply once these improve.']);
      continue;
    }
    if (x.coverage < 0.5) {
      set(x, 'declined', 'funding', `Funding ${pct(1 - x.coverage)} short — far below minimum`,
        [`Needs about ${lakh(x.needed)} to open and run the first three months; can invest ${lakh(x.invest)} (${pct(1 - x.coverage)} short). That is too far from the minimum to close with a co-investor.`]);
      continue;
    }
    if (!x.territory) {
      x.redirect = nearestFreePin(x, territories, storeByPin, new Set());
      set(x, 'waitlist', 'out-of-territory', 'Pin code not in target territories',
        [`Pin code ${x.pin} is not in any territory the brand is growing in right now, so we cannot give a spot yet.`,
         `Rule: a partner who clears the bar in an unlisted pin is waitlisted (never auto-approved and never auto-declined), and the pin is logged as a possible new territory.`,
         x.redirect ? `Nearest open option: pin ${x.redirect.pin} in ${x.redirect.territory.id} (${x.redirect.territory.city}, ${r1(x.redirect.km)} km away).` : 'No territory with open slots nearby to redirect to.']);
      continue;
    }
    if (x.territory.slots === 0) {
      set(x, 'waitlist', 'territory-full', `${x.territory.id} has no open spots`,
        [`${x.territory.id} (${x.territory.city}) has no spots — the brand is not opening more stores there now.`, 'First in line if a spot opens up.']);
      continue;
    }
    // fundability gates
    const gate = [];
    if (x.coverage < cfg.fundTolerance) gate.push(['funding', `Funding is ${pct(1 - x.coverage)} short`, `Needs ${lakh(x.needed)} (set-up ${lakh(x.capex)} + 3 months working capital ${lakh(x.workingCapital)}${x.needed > x.required ? `; policy minimum for Tier ${x.tier} is ${lakh(cfg.minInvest[x.tier])}` : ''}); can invest ${lakh(x.invest)}.`]);
    if (!(x.payback <= cfg.maxPayback)) gate.push(['payback', isFinite(x.payback) ? `Payback ${Math.round(x.payback)} months is above the ${cfg.maxPayback}-month target` : 'Store would not cover its monthly costs', isFinite(x.payback) ? `Estimated monthly contribution ${lakh(x.contribution)} on sales of ${lakh(x.monthlySales)} gives payback of ${Math.round(x.payback)} months.` : `At ${x.sizeUsed} sq ft, sales of ${lakh(x.monthlySales)}/month do not cover rent, staff and royalty.`]);
    if (x.exp < cfg.minExp && x.partner < cfg.partnerBar + 10) gate.push(['experience', `${x.exp} years of retail experience is below the ${cfg.minExp}-year minimum`, `A partner below the experience minimum needs a partner score of at least ${cfg.partnerBar + 10} (has ${x.partner}) to be approved with a hired store manager.`]);
    if (x.demographic < cfg.minDemographic) gate.push(['demographic', `Pin ${x.pin} fails the demographic suitability check`, `Demographic index ${x.demographic.toFixed(2)} is below ${cfg.minDemographic}.`]);
    if (gate.length) {
      const alt = gate[0][0] === 'demographic' ? nearestFreePin(x, [x.territory], storeByPin, new Set([x.pin])) : null;
      set(x, 'waitlist', gate[0][0], gate[0][1], gate.map(g => `${g[1]}. ${g[2]}`));
      if (alt) { x.redirect = alt; x.reasons.push(`Suggested alternative: pin ${alt.pin} in the same territory.`); }
      if (gate[0][0] === 'funding') x.reasons.push('Next: find a co-investor or a loan, or pick a smaller shop, then apply again.');
      x.nurtureGap = gate[0][0];
      continue;
    }
    x.territory.candidates.push(x);
  }

  // 4. Fill slots per territory in combined-score order; one store per pin
  const takenPins = new Set(storeByPin.keys());
  const pinHolder = new Map();
  for (const t of territories) {
    t.candidates.sort((a, b) => b.combined - a.combined || b.momentum - a.momentum || a.id.localeCompare(b.id));
    for (const x of t.candidates) {
      if (t.winners.length >= t.slots) {
        const last = t.winners[t.winners.length - 1];
        set(x, 'waitlist', 'lost-slot', `A stronger applicant took the last spot in ${t.id}`,
          [`${t.id} has ${t.slots} open spot${t.slots > 1 ? 's' : ''}, all filled by higher combined scores (lowest winner: ${last.id} at ${last.combined}; this application: ${x.combined}).`, 'First in line if a spot opens up.']);
        t.waitlist.push(x); continue;
      }
      if (!takenPins.has(x.pin)) { takenPins.add(x.pin); pinHolder.set(x.pin, x); t.winners.push(x); x.slotRank = t.winners.length; continue; }
      // Pin already taken: a stronger applicant keeps it; this one is offered the nearest free pin in the territory
      const holder = pinHolder.get(x.pin);
      const alt = nearestFreePin(x, [t], storeByPin, takenPins);
      if (alt) {
        takenPins.add(alt.pin); pinHolder.set(alt.pin, x); t.winners.push(x); x.slotRank = t.winners.length;
        x.relocatedFrom = x.pin; x.assignedPin = alt.pin;
        x.conditions.push({ text: `Relocate to pin ${alt.pin} (${r1(alt.km)} km away): ${x.pin} goes to ${holder.id}, who scored higher (${holder.combined} vs ${x.combined})`, days: 45, kind: 'site' });
      } else {
        set(x, 'waitlist', 'pin-taken', `Pin ${x.pin} given to ${holder.id} (higher score)`,
          [`The brand opens one store per pin code. ${holder.id} scored ${holder.combined} against ${x.combined} for pin ${x.pin}, and no other pin in ${t.id} is free.`]);
        t.waitlist.push(x);
      }
    }
    for (const x of t.winners) approve(x, cfg, asOf);
    t.pinsFree = [...new Set([...t.pins, ...apps.filter(x => x.territory === t && x.pin && !t.pins.includes(x.pin)).map(x => x.pin)])].filter(p => !takenPins.has(p));
  }

  // 5. Timelines and onboarding for everyone moving forward; requests for holds
  for (const x of apps) {
    if (x.withdrawn) { x.bucket = 'unqualified'; continue; }
    x.timeline = timeline(x, asOf);
    if (x.decision === 'hold') x.request = x.issues.filter(i => i.level === 'block').map(i => i.ask);
    if (x.decision === 'approved' || x.decision === 'conditional') x.milestones = milestones(x, asOf);
    x.bucket = x.decision === 'approved' || x.decision === 'conditional' ? 'ready' : x.decision === 'declined' ? 'unqualified' : 'nurture';
    x.compliant = x.compliance >= 75 && x.partner >= 65;
  }

  // 6. Co-investor pairings: waitlisted only for funding, same territory, together fully funded
  for (const t of territories) {
    const short = apps.filter(x => x.territory === t && x.decision === 'waitlist' && x.sub === 'funding');
    for (let i = 0; i < short.length; i++) for (let j = i + 1; j < short.length; j++) {
      const a = short[i], b = short[j];
      if (a.invest + b.invest >= Math.max(a.needed, b.needed)) t.pairings.push({ a, b, capital: r1(a.invest + b.invest), exp: r1(Math.max(a.exp, b.exp)), needed: Math.max(a.needed, b.needed) });
    }
    t.pairings.sort((p, q) => (q.a.partner + q.b.partner) - (p.a.partner + p.b.partner));
    t.pairings = t.pairings.slice(0, 6);
    t.qualified = apps.filter(x => x.territory === t && ['approved', 'conditional', 'waitlist'].includes(x.decision) && x.sub !== 'territory-full').length;
    t.applicants = apps.filter(x => x.territory === t && !x.withdrawn).length;
    t.open = t.slots - t.winners.length;
    t.status = t.slots === 0 ? 'full-none-planned' : t.open === 0 ? 'filled' : t.winners.length ? 'partly' : 'empty';
    t.needsLeads = t.open > 0 && t.priority !== 'Low' && t.winners.length < t.slots && apps.filter(x => x.territory === t && x.bucket !== 'unqualified').length < t.open;
  }

  const result = { apps, territories, stores, cfg, asOf };
  result.funnel = funnel(apps, cfg);
  result.checks = checks(result);
  result.actions = actions(result);
  result.stats = stats(apps);
  return result;
}

const pct = f => `${Math.round(f * 100)}%`;

function set(x, decision, sub, headline, reasons = []) {
  x.decision = decision; x.sub = sub; x.headline = headline; x.reasons = reasons;
}

function weakest(x) {
  return Object.entries(x.parts).sort((a, b) => a[1] - b[1]).slice(0, 2)
    .map(([k, v]) => `${PART_LABEL[k]} ${Math.round(v)}/100`).join(', ');
}
export const PART_LABEL = { experience: 'retail experience', compliance: 'formula compliance', relevance: 'business relevance', capital: 'capital fit', commitment: 'commitment & plan' };

function scorePartner(x, cfg) {
  const exp = x.exp ?? 0;
  const biz = readBusiness(x.business);
  const experience = lerp(exp, [[0, 0], [1, 35], [2, 55], [3, 70], [4, 82], [5, 90], [6, 100]]);
  const compliance = 0.7 * biz.signal + 0.3 * Math.min(exp / 5, 1) * 100;
  const space = { Owned: 45, Rented: 38, 'Not yet identified': 10 }[x.spaceStd];
  const floor = x.spaceStd === 'Not yet identified' ? 5 : { Ground: 25, 'Mall unit': 20, Upper: 10, 'Not known': 5 }[x.floorStd];
  const launch = x.launchUsed <= 6 ? 15 : x.launchUsed <= 9 ? 10 : 5;
  const reason = /diwali|deepavali|festiv|dasara|launch|open (by|before)|ready|manager|staff|loan|sanction|family|son|daughter|own|brand/i.test(x.notes) ? 15 : x.notes ? 8 : 0;
  const commitment = Math.min(100, space + floor + launch + reason);
  x.business_ = biz;
  x.parts = { experience, compliance, relevance: biz.relevance, capital: 0, commitment };
  x.compliance = Math.round(compliance);
  x.complianceLabel = biz.label;
  // capital filled after finance
  x._partnerNoCap = (WEIGHTS.experience * experience + WEIGHTS.compliance * compliance + WEIGHTS.relevance * biz.relevance + WEIGHTS.commitment * commitment) / 100;
}

function scoreFinance(x, cfg) {
  const e = ECON[x.tier] || ECON[2];
  const size = x.sizeUsed || DEFAULT_SIZE;
  const fl = x.floorStd;
  const rentMult = fl === 'Mall unit' ? 1.6 : fl === 'Upper' ? 0.7 : 1;
  const salesMult = fl === 'Mall unit' ? 1.15 : fl === 'Upper' ? 0.8 : 1;
  const owned = x.spaceStd === 'Owned';
  const rent = owned ? 0 : (e.rentSqft * rentMult * size) / 1e5;
  const staff = e.staff * Math.pow(clamp(size / 500, 0.6, 2), 0.6);
  const fixed = rent + staff + e.util;
  const fee = e.fee;
  const fitout = (e.fitPerSqft * (fl === 'Mall unit' ? 1.15 : 1) * size) / 1e5;
  const stock = e.stock * Math.pow(clamp(size / 500, 0.5, 2.5), 0.7);
  const deposit = 6 * rent;
  const wc = 3 * fixed;
  const capex = fee + fitout + stock + deposit;
  const required = capex + wc;
  const needed = Math.max(required, cfg.minInvest[x.tier] ?? 0);
  x.demand = demandIdx(x);
  const sales = (e.salesSqft * salesMult * size * (0.75 + 0.5 * x.demand)) / 1e5;
  const royalty = sales * MARGIN.royalty;
  const contribution = sales * (MARGIN.gross - MARGIN.royalty - MARGIN.marketing) - fixed;
  Object.assign(x, {
    breakdown: { fee: r1(fee), fitout: r1(fitout), stock: r1(stock), deposit: r1(deposit), workingCapital: r1(wc) },
    capex: r1(capex), workingCapital: r1(wc), required: r1(required), needed: r1(needed),
    monthlyRent: r1(rent), monthlyFixed: r1(fixed), monthlySales: r1(sales), royalty: r1(royalty), contribution: r1(contribution),
    payback: contribution > 0 ? required / contribution : Infinity,
    coverage: x.invest ? x.invest / needed : 0,
  });
  x.gap = r1(Math.max(0, needed - (x.invest || 0)));
  const capital = lerp(x.coverage, [[0.5, 0], [0.85, 55], [1, 85], [1.3, 100]]);
  x.parts.capital = capital;
  x.partner = r1(x._partnerNoCap + (WEIGHTS.capital * capital) / 100);
}

function demandIdx(x) {
  if (!x.pin) return 0.5;
  const base = { 1: 0.68, 2: 0.56, 3: 0.46 }[x.tier] ?? 0.5;
  return r1(clamp(base + (hash01(x.pin, 3) - 0.5) * 0.55, 0.08, 1) * 100) / 100;
}

export function pinProxy(pin, tier) {
  const base = { 1: 0.68, 2: 0.56, 3: 0.46 }[tier] ?? 0.5;
  return {
    demand: Math.round(clamp(base + (hash01(pin, 3) - 0.5) * 0.55, 0.08, 1) * 100) / 100,
    demographic: Math.round(clamp(({ 1: 0.72, 2: 0.6, 3: 0.5 }[tier] ?? 0.55) + (hash01(pin, 5) - 0.5) * 0.6, 0.05, 1) * 100) / 100,
    competitors: Math.round(hash01(pin, 9) * ({ 1: 12, 2: 8, 3: 5 }[tier] ?? 6)),
  };
}

function scoreSite(x, cfg, stores) {
  if (!x.point) { x.site = 0; x.demographic = 0; x.competitors = 0; return; }
  const p = pinProxy(x.pin, x.tier);
  x.demographic = p.demographic; x.competitors = p.competitors;
  let nearest = null;
  for (const s of stores) { const d = km(x.point, s.point); if (!nearest || d < nearest.km) nearest = { store: s, km: d }; }
  x.nearest = nearest;
  x.overlap = nearest && nearest.km < cfg.overlapKm && nearest.store.pin !== x.pin;
  const prio = x.territory ? PRIORITY_VAL[x.territory.priority] : 0;
  let s = 40 * x.demand + 25 * prio + 20 * x.demographic + 15 * (1 - Math.min(x.competitors / 10, 1));
  if (x.overlap) s -= 15;
  x.site = r1(clamp(s, 0, 100));
  x.siteParts = { demand: x.demand, priority: prio, demographic: x.demographic, competition: 1 - Math.min(x.competitors / 10, 1) };
  if (x.competitors >= 7) x.flags.push(`High competitor density: about ${x.competitors} similar stores within ${cfg.overlapKm} km`);
  if (x.demographic < 0.45) x.flags.push(`Weak demographic fit (index ${x.demographic.toFixed(2)})`);
  if (x.demand < 0.4) x.flags.push(`Low demand pin (index ${x.demand.toFixed(2)})`);
  if (x.overlap) x.flags.push(`${r1(nearest.km)} km from ${nearest.store.id}, inside the ${cfg.overlapKm} km catchment`);
}

function scoreMomentum(x) {
  const sp = { Owned: 50, Rented: 40, 'Not yet identified': 10 }[x.spaceStd];
  const l = x.launchUsed;
  const lv = l <= 1 ? 50 : l <= 2 ? 45 : l <= 3 ? 38 : l <= 6 ? 25 : 10;
  x.momentum = sp + lv;
  x.hot = x.spaceStd !== 'Not yet identified' && l <= 2;
}

function nearestFreePin(x, territories, storeByPin, taken) {
  if (!x.point) return null;
  let best = null;
  for (const t of territories) {
    if (!t.slots || t.winners.length >= t.slots) continue;
    for (const p of t.pins) {
      if (storeByPin.has(p) || taken.has(p) || p === x.pin) continue;
      const d = km(x.point, pinPoint(p, t.city));
      if (!best || d < best.km) best = { pin: p, territory: t, km: d };
    }
  }
  return best && best.km < 60 ? best : null;
}

function approve(x, cfg, asOf) {
  const c = x.conditions;
  if (x.coverage < 1) c.push({ text: `Close the ${lakh(x.gap)} funding gap (co-investor, bank loan or smaller format)`, days: 30, kind: 'finance' });
  if (x.exp < cfg.minExp) c.push({ text: `Hire an experienced store manager before opening (partner has ${x.exp} yr${x.exp === 1 ? '' : 's'}; minimum is ${cfg.minExp})`, days: 45, kind: 'people' });
  else if (x.exp < 2) c.push({ text: 'Complete the extended 6-week franchisor training before opening', days: 60, kind: 'training' });
  if (x.spaceStd === 'Not yet identified') c.push({ text: `Secure a brand-approved site in pin ${x.assignedPin || x.pin} within 60 days`, days: 60, kind: 'site' });
  if (x.sizeAssumed && x.spaceStd !== 'Not yet identified') c.push({ text: `Confirm space size (we assumed ${DEFAULT_SIZE} sq ft)`, days: 7, kind: 'info' });
  if (x.overlap) c.push({ text: `Catchment site visit: ${r1(x.nearest.km)} km from ${x.nearest.store.id}`, days: 14, kind: 'site' });
  x.decision = c.length ? 'conditional' : 'approved';
  x.sub = c.length ? 'conditions' : 'outright';
  const t = x.territory;
  x.headline = c.length ? `Approved with ${c.length} condition${c.length > 1 ? 's' : ''} — spot ${x.slotRank} of ${t.slots} in ${t.id}` : `Approved — spot ${x.slotRank} of ${t.slots} in ${t.id}`;
  x.reasons = [
    `Won spot ${x.slotRank} of ${t.slots} in ${t.id} (${t.city}, ${t.priority} priority) with combined score ${x.combined} (partner ${x.partner}, site ${x.site}).`,
    `Funding: can invest ${lakh(x.invest)} against ${lakh(x.needed)} needed (${pct(Math.min(x.coverage, 9.99))} covered). Payback about ${Math.round(x.payback)} months, inside the ${cfg.maxPayback}-month target.`,
    ...c.map(k => `Condition: ${k.text}.`),
  ];
}

function timeline(x, asOf) {
  let min = { Owned: 2, Rented: 3, 'Not yet identified': 4 }[x.spaceStd];
  if (x.floorStd === 'Mall unit') min += 1;
  if ((x.exp ?? 0) < 2) min += 1;
  const months = Math.max(x.launchUsed, min);
  const date = addMonths(asOf, months);
  const out = { minMonths: min, months, date, unrealistic: x.launchUsed < min };
  for (const [name, re, dates] of FESTIVALS) {
    if (!re.test(x.notes || '')) continue;
    const next = dates.map(d => new Date(d)).find(d => d >= asOf);
    if (!next) continue;
    const days = Math.round((next - asOf) / 864e5);
    if (date > next) {
      const after = dates.map(d => new Date(d)).find(d => d > date);
      out.festival = `Wants to open before ${name}. ${name} is on ${fmtDate(next)} (${days} days away), but the earliest realistic opening is ${fmtDate(date)}. ${after ? `Plan for ${name} ${after.getFullYear()} (${fmtDate(after)}) instead, or open earlier in the off-season.` : ''}`;
      out.festivalMiss = true;
    } else out.festival = `On track to open before ${name} (${fmtDate(next)}).`;
  }
  return out;
}

export const MILESTONES = [
  { key: 'loi', label: 'Letter of intent', owner: 'Partner' },
  { key: 'finance', label: 'Financing', owner: 'Partner + Finance' },
  { key: 'site', label: 'Site secured', owner: 'Expansion team' },
  { key: 'training', label: 'Training', owner: 'Training team' },
  { key: 'fitout', label: 'Fit-out', owner: 'Projects team' },
  { key: 'staff', label: 'Staff hired', owner: 'Partner' },
  { key: 'audit', label: 'Pre-opening audit', owner: 'Ops excellence' },
  { key: 'open', label: 'Store open', owner: 'Everyone' },
];

function milestones(x, asOf) {
  const open = x.timeline.date;
  const total = Math.max(30, Math.round((open - asOf) / 864e5));
  const at = f => addDays(asOf, Math.round(total * f));
  const weeks = x.exp < 2 ? 6 : 4;
  const detail = {
    loi: 'Sign the letter of intent and pay the franchise fee of ' + lakh(ECON[x.tier].fee),
    finance: x.coverage < 1 ? `Close the ${lakh(x.gap)} gap; share the loan sanction or co-investor agreement` : `Show proof of funds for ${lakh(x.needed)}`,
    site: x.spaceStd === 'Owned' ? `Brand site audit of the owned ${x.floorStd.toLowerCase()} space (${x.sizeUsed} sq ft)` : x.spaceStd === 'Rented' ? 'Lease review and site audit; lease must run 9+ years with lock-in' : `Shortlist two ground-floor spaces in pin ${x.assignedPin || x.pin}; sign the approved one`,
    training: `${weeks}-week franchisor programme in ${x.lang}: SOPs, POS, stock, visual merchandising, plus 2 weeks shadowing at the nearest store${x.nearest ? ` (${x.nearest.store.id})` : ''}`,
    fitout: `Brand-standard fit-out and opening stock (${lakh(x.breakdown.fitout + x.breakdown.stock)})`,
    staff: x.exp < 1 ? 'Hire an experienced store manager plus 2–3 staff; all complete store-staff training' : 'Hire 2–3 staff; all complete store-staff training',
    audit: 'Ops team checks fit-out, stock, staff training and systems against the launch checklist',
    open: `Launch ${fmtDate(open)}${x.timeline.festival ? ' · ' + x.timeline.festival : ''}`,
  };
  const due = { loi: at(0.06), finance: at(0.25), site: at(0.35), training: at(0.7), fitout: at(0.8), staff: at(0.85), audit: at(0.95), open };
  return MILESTONES.map(m => ({ ...m, detail: detail[m.key], due: due[m.key] }));
}

function funnel(apps, cfg) {
  const all = apps;
  const notHold = all.filter(x => x.decision !== 'hold' && !x.duplicateOf && !x.withdrawn);
  const pinClear = notHold.filter(x => x.sub !== 'pin-conflict');
  const passBar = pinClear.filter(x => !(x.decision === 'declined' && ['score', 'funding'].includes(x.sub)));
  const inTer = passBar.filter(x => !['out-of-territory', 'territory-full'].includes(x.sub));
  const fundable = inTer.filter(x => !['funding', 'payback', 'experience', 'demographic'].includes(x.sub));
  const won = fundable.filter(x => x.bucket === 'ready');
  return {
    total: all.length,
    stages: [
      { key: 'received', label: 'Applied', n: all.length, out: 0 },
      { key: 'clean', label: 'Info complete', n: notHold.length, out: all.length - notHold.length, outLabel: 'need more info' },
      { key: 'pin', label: 'No store there yet', n: pinClear.length, out: notHold.length - pinClear.length, outLabel: 'already have a store there' },
      { key: 'bar', label: 'Good partner', n: passBar.length, out: pinClear.length - passBar.length, outLabel: 'score too low' },
      { key: 'territory', label: 'In our areas', n: inTer.length, out: passBar.length - inTer.length, outLabel: 'outside our areas' },
      { key: 'fundable', label: 'Enough money', n: fundable.length, out: inTer.length - fundable.length, outLabel: 'money or site not ready' },
      { key: 'won', label: 'Got a spot', n: won.length, out: fundable.length - won.length, outLabel: 'spot went to someone better' },
    ],
    outcome: ['approved', 'conditional', 'hold', 'waitlist', 'declined'].map(d => ({ key: d, n: all.filter(x => x.decision === d).length })),
  };
}

function checks(res) {
  const { apps, territories, stores } = res;
  const live = apps;
  const winners = live.filter(x => x.bucket === 'ready');
  const pins = winners.map(x => x.assignedPin || x.pin);
  const storePins = new Set(stores.map(s => String(s.pin)));
  const dupPins = pins.filter((p, i) => pins.indexOf(p) !== i);
  const sum = res.funnel.outcome.reduce((s, o) => s + o.n, 0);
  const slotsOver = territories.filter(t => t.winners.length > t.slots);
  const totalSlots = territories.reduce((s, t) => s + t.slots, 0);
  return [
    { ok: slotsOver.length === 0, text: `${winners.length} of ${totalSlots} spots filled` },
    { ok: pins.every(p => !storePins.has(p)), text: `${pins.filter(p => storePins.has(p)).length} next to our stores` },
    { ok: dupPins.length === 0, text: `${dupPins.length} double bookings` },
    { ok: sum === live.length, text: `${sum} of ${live.length} decided` },
  ];
}

function actions(res) {
  const out = [];
  for (const x of res.apps) {
    if (x.withdrawn) continue;
    const t = x.territory;
    const boost = (t && t.priority === 'High' ? 20 : t && t.priority === 'Medium' ? 8 : 0) + (x.compliant ? 10 : 0) + x.momentum * 0.3;
    if (x.decision === 'approved') out.push({ x, kind: 'call', score: 100 + boost, title: `Call ${x.name} to say yes`, why: `Approved in ${t.id}${x.hot ? ' · can open fast' : ''}` });
    else if (x.decision === 'conditional') out.push({ x, kind: 'call', score: 80 + boost, title: `Call ${x.name} about next steps`, why: x.conditions.map(c => c.text).slice(0, 2).join('; ') });
    else if (x.decision === 'hold') out.push({ x, kind: 'info', score: 50 + x.partner * 0.2 + (t?.priority === 'High' ? 10 : 0), title: `Ask ${x.name} for missing info`, why: x.issues.find(i => i.level === 'block').text });
    else if (x.decision === 'waitlist' && x.redirect && x.partner >= 65) out.push({ x, kind: 'redirect', score: 40 + boost, title: `Offer ${x.name} a nearby spot`, why: `${x.headline}; ${x.redirect.territory.id} has a free pin ${r1(x.redirect.km)} km away` });
  }
  for (const t of res.territories) if (t.needsLeads && t.priority === 'High')
    out.push({ t, kind: 'leads', score: 125, title: `Find partners in ${t.city} (${t.id})`, why: `${t.open} empty spot${t.open > 1 ? 's' : ''} · ${t.winners.length ? 'few' : 'no'} good applicants` });
  out.sort((a, b) => b.score - a.score);
  return out;
}

function quantiles(arr) {
  const v = arr.filter(n => n != null && isFinite(n)).sort((a, b) => a - b);
  if (!v.length) return null;
  const q = p => { const i = (v.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return v[lo] + (v[hi] - v[lo]) * (i - lo); };
  return { n: v.length, min: v[0], p25: q(0.25), median: q(0.5), p75: q(0.75), max: v[v.length - 1], values: v };
}

function stats(apps) {
  const live = apps.filter(x => !x.withdrawn && !x.duplicateOf);
  const byTier = t => live.filter(x => x.tier === t);
  return {
    invest: quantiles(live.map(x => x.invest)),
    exp: quantiles(live.map(x => x.exp)),
    investByTier: { 1: quantiles(byTier(1).map(x => x.invest)), 2: quantiles(byTier(2).map(x => x.invest)), 3: quantiles(byTier(3).map(x => x.invest)) },
    neededByTier: { 1: quantiles(byTier(1).map(x => x.needed)), 2: quantiles(byTier(2).map(x => x.needed)), 3: quantiles(byTier(3).map(x => x.needed)) },
  };
}

// Pool size at a given threshold (for "how does the pool shrink" read-outs)
export function poolAt(apps, tier, minInvest, minExp) {
  const live = apps.filter(x => !x.withdrawn && !x.duplicateOf && x.invest != null && (tier ? x.tier === tier : true));
  return { meet: live.filter(x => x.invest >= minInvest && (x.exp ?? 0) >= minExp).length, of: live.length };
}

// ---------------- Location deep-dive: traffic, potential, comparison with our stores ----------------
// No footfall counts are in the file, so traffic is worked backwards from the same sales estimate
// that drives payback, then compared with the same model run on our existing stores.
export const TRAFFIC = {
  bill: { 1: 1400, 2: 1100, 3: 900 },   // average spend per buyer, ₹
  conversion: 0.35,                    // share of visitors who buy
  capture: 0.06,                       // share of people passing who walk in, before competition
  ramp: [['Months 1–3', 0.45], ['Months 4–6', 0.65], ['Months 7–12', 0.85], ['Year 2 on', 1]],
  maturity: y => (y < 1 ? 0.6 : y < 2 ? 0.85 : 1),
  shareAtStore: 0.3,                   // most a store right next door could share
};
function trafficFromSales(salesL, tier, competitors) {
  const bill = TRAFFIC.bill[tier] || 1100;
  const buyers = (salesL * 1e5) / 30 / bill;
  const visitors = buyers / TRAFFIC.conversion;
  const capture = TRAFFIC.capture * (1 - Math.min(0.3, 0.03 * competitors));
  return { bill, buyers, visitors, capture, passers: visitors / capture };
}
export function siteInsight(x, res) {
  if (!x || !x.point || x.monthlySales == null || x.decision === 'hold' || x.withdrawn) return null;
  const cfg = res.cfg, yearNow = res.asOf.getFullYear();
  const t = trafficFromSales(x.monthlySales, x.tier, x.competitors);
  const all = res.stores.filter(s => s.point).map(s => ({ s, d: km(x.point, s.point), tier: cityInfo(s.city)?.tier || guessTier(s.city) || x.tier })).sort((a, b) => a.d - b.d);
  // Compare with our stores nearby; if none within 30 km, with our stores in same-size cities; otherwise say there is nothing comparable
  let basis = 'nearby', pick = all.filter(o => o.d <= 30);
  if (!pick.length) { pick = all.filter(o => o.tier === x.tier); basis = pick.length ? 'same-size' : 'none'; }
  const near = pick.slice(0, 3).map(({ s, d, tier }) => {
    const px = pinProxy(s.pin, tier), e = ECON[tier] || ECON[2];
    const sales = (e.salesSqft * 500 * (0.75 + 0.5 * px.demand)) / 1e5;
    const mature = trafficFromSales(sales, tier, px.competitors).visitors;
    const years = s.opened ? Math.max(0, yearNow - s.opened) : null;
    return { id: s.id, pin: String(s.pin), city: s.city, km: d, years, mature: Math.round(mature), visitors: Math.round(mature * TRAFFIC.maturity(years ?? 3)) };
  });
  const bench = near.length ? near.reduce((n, b) => n + b.visitors, 0) / near.length : null;
  const closest = all[0] ? { id: all[0].s.id, pin: String(all[0].s.pin), km: all[0].d, visitors: near.find(n => n.id === all[0].s.id)?.visitors ?? null } : null;
  const reach = cfg.overlapKm * 2;
  const sharePct = closest && closest.km < reach ? TRAFFIC.shareAtStore * (1 - closest.km / reach) : 0;
  const shared = Math.round(t.visitors * sharePct);
  const net = t.visitors - shared;
  const fromStore = closest && sharePct ? Math.round(closest.visitors != null ? Math.min(closest.visitors * 0.5, shared) : shared) : 0;
  const netMargin = MARGIN.gross - MARGIN.royalty - MARGIN.marketing;
  const beBuyers = (x.monthlyFixed * 1e5) / 30 / (t.bill * netMargin);
  const beVisitors = beBuyers / TRAFFIC.conversion;
  const rel = bench ? net / bench : 1;
  const potential = Math.round(Math.max(0, Math.min(100, 0.5 * x.site + 0.5 * Math.min(100, rel * 70))));
  const e = ECON[x.tier] || ECON[2];
  const floorMult = x.floorStd === 'Mall unit' ? 1.15 : x.floorStd === 'Upper' ? 0.8 : 1;
  return {
    passers: Math.round(t.passers), visitors: Math.round(net), grossVisitors: Math.round(t.visitors), buyers: Math.round(net * TRAFFIC.conversion),
    bill: t.bill, capture: t.capture, conversion: TRAFFIC.conversion,
    breakEven: Math.round(beVisitors), cushion: net / beVisitors,
    ramp: TRAFFIC.ramp.map(([label, f]) => ({ label, visitors: Math.round(net * f), monthlySales: Math.round(x.monthlySales * f * 10) / 10 })),
    near, basis, bench: bench ? Math.round(bench) : null, rel,
    overlap: { store: closest || null, sharePct, shared, fromStore, reach },
    potential, grade: potential >= 75 ? 'Strong' : potential >= 55 ? 'Good' : potential >= 40 ? 'Fair' : 'Weak',
    drivers: [
      ['City size', `Tier ${x.tier}`, `₹${e.salesSqft.toLocaleString('en-IN')} sales per sq ft a month to start from`],
      ['Shoppers nearby', x.demand.toFixed(2), `sales × ${(0.75 + 0.5 * x.demand).toFixed(2)}`],
      ['Floor', x.floorStd, `sales × ${floorMult}`],
      ['Shop size', `${x.sizeUsed} sq ft${x.sizeAssumed ? ' (assumed)' : ''}`, `₹${Math.round(x.monthlySales * 1e5 / 30).toLocaleString('en-IN')} sales a day`],
      ['Average bill', `₹${t.bill.toLocaleString('en-IN')}`, `${Math.round(t.buyers)} buyers a day`],
      ['Visitors who buy', `${Math.round(TRAFFIC.conversion * 100)}%`, `${Math.round(t.visitors)} visitors a day`],
      ['Similar shops nearby', String(x.competitors), `${(t.capture * 100).toFixed(1)}% of people passing walk in`],
    ],
  };
}

export { cityKey };
