// parse.js — reads any franchise workbook as given. Sheets can be in any order and
// named anything; headers are recognised from many common wordings; values are
// cleaned (₹ amounts, ranges, dates, yes/no answers). Everything it assumes is
// written into a report so the team can see exactly how the file was understood.
// Input: { sheetName: rows[][] } so it works with SheetJS in the browser and in Node.

import { cityInfo, cityForPin, stateForPin, stateName } from './geo.js';

const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// The brand's ten open stores, used if the upload has no Existing stores sheet.
export const DEFAULT_STORES = [
  ['ST-01', 'Bengaluru', '560001', 2019], ['ST-02', 'Bengaluru', '560034', 2020], ['ST-03', 'Bengaluru', '560038', 2021],
  ['ST-04', 'Bengaluru', '560066', 2022], ['ST-05', 'Bengaluru', '560076', 2023], ['ST-06', 'Mysuru', '570009', 2021],
  ['ST-07', 'Mysuru', '570017', 2024], ['ST-08', 'Mangaluru', '575001', 2022], ['ST-09', 'Hubballi-Dharwad', '580020', 2023],
  ['ST-10', 'Belagavi', '590001', 2024],
].map(([id, city, pin, opened]) => ({ id, city, pin, opened }));

const any = (...pats) => h => pats.some(p => (p instanceof RegExp ? p.test(h) : typeof p === 'function' ? p(h) : h === p));
// Column wordings seen across franchise, retail, food, logistics and services datasets
const APP_COLS = {
  id: any(/^(application|app|lead|enquiry|inquiry|request|form|registration)(id|no|number|code|ref)?$/, /^(applicant|ref|reference)(id|no|number|code)$/, 'id', 'srno', 'sno', 'serialno', 'leadno', 'ticket'),
  name: any(/applicantname|^name$|fullname|partnername|candidate|contactname|contactperson|franchiseename|investorname|ownername|^applicant$|personname/, h => h.includes('name') && !/store|outlet|business|company|shop|brand|territor|city|zone|region|area|file|sheet|user/.test(h)),
  combo: h => (h.includes('city') && h.includes('pin')) || /^(location|address|preferredlocation|proposedlocation|siteaddress|fulladdress)$/.test(h),
  city: any('city', 'town', 'preferredcity', 'targetcity', 'cityname', 'district', 'proposedcity', 'locationcity'),
  state: any('state', 'province', 'statename', 'region'),
  pin: any('pincode', 'pin', 'postalcode', 'zip', 'zipcode', 'postcode', 'pinno', 'areapincode', 'preferredpincode', 'sitepincode', 'pincodeofsite'),
  invest: any(/^(investment|capital|budget|funds|fund|investable|networth|amount|corpus|liquidity|finance)/),
  exp: any(/^(retailexperience|experience|yearsofexperience|yrsofexp|yrsexp|businessexperience|industryexperience|workexperience|exp)/),
  business: any(/business|occupation|profession|currentwork|background|industry|sector|currentjob|pastwork|workdetails/),
  space: any(/^(spaceavailable|space|property|premises|shopspace|sitestatus|propertystatus|ownership|shopavailable|hasspace|locationstatus)/),
  size: any(/^(spacesize|size|area|carpetarea|builtuparea|sqft|shopsize|propertysize)/, h => h.includes('sqft')),
  floor: any(/^floor/),
  launch: any(/^(targetlaunch|launch|timeline|openingin|startin|readyin|expectedopening|timetoopen|plannedopening|openby|monthstolaunch)/),
  lang: any(/language/),
  notes: any(/^(notes|note|remarks|comments|comment|message|additional|othernotes|notesfromapplicant|description)/),
  phone: any(/phone|mobile|contactno|whatsapp/),
  email: any(/email|mail/),
};
const TER_COLS = {
  id: any(/^(territory|zone|region|area|market|cluster|beat|circle)(id|code|no|name)?$/),
  combo: any('citystate', 'citystatename'),
  city: any('city', 'town', 'cityname', 'district', 'location'),
  state: any('state', 'province', 'statename'),
  pins: any(/pincodescovered|^pincodes$|^pins$|pincodelist|postalcodes|^coverage|pinsinarea|pinscovered|pincoderange|^pincode$|zipcodes|servicepincodes/),
  tier: any(/tier|citycategory|cityclass|^class$|citysize/),
  slots: any(/openslots|^slots$|targetstores|storestoopen|openings|vacancies|^capacity|required|newstores|plannedstores|^target$|seats|franchisesrequired/),
  priority: any(/^priority|importance|^focus|urgency|^rank$/),
};
const STORE_COLS = {
  id: any(/^(store|outlet|branch|shop|existingstore|location)(id|code|no)?$/),
  name: any(/storename|outletname|branchname/),
  city: any('city', 'citystate', 'town', 'district'),
  pin: any('pincode', 'pin', 'postalcode', 'zip', 'zipcode'),
  opened: any(/^opened|openingyear|yearopened|^since|launchdate|openedon|openingdate|startyear|^year$/),
};
const SPECS = { applications: APP_COLS, territories: TER_COLS, stores: STORE_COLS };
const NAME_HINT = {
  applications: /appl|lead|enquir|inquir|candidate|partner|prospect|franchisee|request/i,
  territories: /territor|region|zone|market|cluster|area|expansion|target/i,
  stores: /store|outlet|branch|existing|current|network|shop/i,
};

function mapHeader(row, spec) {
  const map = {}, labels = {};
  (row || []).forEach((cell, i) => {
    const h = norm(cell);
    if (!h) return;
    for (const [key, test] of Object.entries(spec)) if (map[key] === undefined && test(h)) { map[key] = i; labels[key] = String(cell).trim(); break; }
  });
  return { map, labels };
}

// How well a header row fits each kind of table
function scoreFit(type, map) {
  const k = Object.keys(map);
  if (type === 'applications') return (map.name !== undefined || map.id !== undefined) && (map.pin !== undefined || map.combo !== undefined || map.city !== undefined) ? k.length + (map.invest !== undefined ? 3 : 0) + (map.exp !== undefined ? 2 : 0) : 0;
  if (type === 'territories') return map.pins !== undefined || (map.id !== undefined && map.slots !== undefined) ? k.length + (map.pins !== undefined ? 3 : 0) + (map.slots !== undefined ? 3 : 0) : 0;
  if (type === 'stores') return map.pin !== undefined && (map.id !== undefined || map.opened !== undefined) ? k.length + (map.opened !== undefined ? 2 : 0) : 0;
  return 0;
}

function classify(name, rows) {
  if (/gloss|readme|instruction|help|legend|about|cover/i.test(name)) return null;
  let best = null;
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    for (const [type, spec] of Object.entries(SPECS)) {
      const { map, labels } = mapHeader(rows[r], spec);
      let sc = scoreFit(type, map);
      if (!sc) continue;
      if (NAME_HINT[type].test(name)) sc += 4;
      if (!best || sc > best.score) best = { type, header: r, map, labels, score: sc };
    }
  }
  return best;
}

const blank = v => v === undefined || v === null || String(v).trim() === '';

// Money → ₹ lakh. Handles ₹/INR/Rs, lakh/lac/L, crore/Cr, thousands/k, plain rupees, ranges.
export function parseLakh(v, unit = '') {
  if (blank(v)) return { value: null };
  const u = norm(unit);
  if (typeof v === 'number') {
    if (/crore/.test(u)) return { value: v * 100, note: `read ${v} crore as ${v * 100} lakh` };
    if (/thousand|000s/.test(u)) return { value: +(v / 100).toFixed(2), note: `read ${v} thousand as ${(v / 100).toFixed(1)} lakh` };
    if (v > 5000 || /rupee|inr|rs$/.test(u) && v > 500) return { value: +(v / 1e5).toFixed(2), note: `read ₹${v.toLocaleString('en-IN')} as ${(v / 1e5).toFixed(1)} lakh` };
    return { value: v };
  }
  const s = String(v).toLowerCase().replace(/,/g, '').replace(/₹|inr|rs\.?/g, ' ');
  if (/^(nil|none|no|zero|na|n\/a|-)\s*$/.test(s.trim())) return { value: 0, note: `"${v}" read as 0` };
  const nums = s.match(/\d+(\.\d+)?/g);
  if (!nums) return { value: null, note: `could not read "${v}"` };
  let n = parseFloat(nums[0]);
  let note = nums.length > 1 && /-|to|–/.test(s) ? `gave a range "${v}"; used the lower figure` : null;
  if (/crore|cr\b/.test(s) || /crore/.test(u)) { n *= 100; note = `read "${v}" as ${r1(n)} lakh`; }
  else if (/lakh|lac|\bl\b|lakhs|lacs|\d\s*l\b/.test(s)) { /* already lakh */ }
  else if (/\d\s*k\b|thousand/.test(s) || /thousand/.test(u)) { n = +(n / 100).toFixed(2); note = `read "${v}" as ${n} lakh`; }
  else if (/million|mn\b/.test(s)) { n *= 10; note = `read "${v}" as ${n} lakh`; }
  else if (n > 5000) { n = +(n / 1e5).toFixed(2); note = `read "${v}" as ${n} lakh`; }
  return { value: n, note };
}
const r1 = n => Math.round(n * 10) / 10;

export function parseYears(v) {
  if (blank(v)) return { value: null };
  if (typeof v === 'number') return { value: Math.max(0, v) };
  const s = String(v).toLowerCase();
  if (/^(none|nil|no|zero|fresher|na|n\/a|nothing|new|first time|-)\b/.test(s.trim())) return { value: 0 };
  const m = s.match(/\d+(\.\d+)?/);
  if (!m) return { value: null, note: `could not read "${v}"` };
  let n = parseFloat(m[0]);
  if (/month/.test(s)) n = +(n / 12).toFixed(1);
  const extra = s.replace(m[0], '').match(/\d/);
  return { value: n, note: extra ? `gave "${v}"; used ${n}` : null };
}

export function parseNum(v) {
  if (blank(v)) return null;
  if (typeof v === 'number') return v;
  const m = String(v).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

// Launch timing → months from today. Accepts "3", "3 months", "6-9 months", "ASAP", "Q1 2027", "Jan 2027", dates.
export function parseLaunch(v, today = new Date()) {
  if (blank(v)) return { value: null };
  if (typeof v === 'number') {
    if (v > 20000 && v < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + v * 864e5); return monthsTo(d, today, v); }
    return { value: v };
  }
  const s = String(v).toLowerCase().trim();
  if (/asap|immediate|right away|now|at once/.test(s)) return { value: 1, note: `"${v}" read as 1 month` };
  const q = s.match(/q([1-4])\s*'?\s*(20\d\d|\d\d)/);
  if (q) { const y = +(q[2].length === 2 ? '20' + q[2] : q[2]); return monthsTo(new Date(y, (+q[1] - 1) * 3 + 1, 1), today, v); }
  const d = Date.parse(s.replace(/(\d+)(st|nd|rd|th)/, '$1'));
  if (!/^\d+(\.\d+)?$/.test(s) && !/month|week|year|day/.test(s) && !isNaN(d)) return monthsTo(new Date(d), today, v);
  const m = s.match(/\d+(\.\d+)?/);
  if (!m) return { value: null, note: `could not read "${v}"` };
  let n = parseFloat(m[0]);
  if (/week/.test(s)) n = Math.max(1, Math.round(n / 4.3));
  else if (/year|yr/.test(s)) n *= 12;
  else if (/day/.test(s)) n = Math.max(1, Math.round(n / 30));
  return { value: n, note: /-|to|–/.test(s) && /\d.*\d/.test(s) ? `gave "${v}"; used ${n} months` : null };
}
function monthsTo(d, today, raw) {
  const n = Math.max(1, Math.round((d - today) / (30.4 * 864e5)));
  return { value: n, note: `read "${raw}" as ${n} months from today` };
}

export function normSpace(v) {
  const s = String(v ?? '').toLowerCase().trim();
  if (!s) return null;
  if (/not\s*yet|not\s*identified|^no\b|none|looking|search|yet to|tbd|not found|don.?t have|do not have|need|will find|^n$|^false$/.test(s)) return 'Not yet identified';
  if (/own|self|ancestral|family|inherit|purchased|bought/.test(s)) return 'Owned';
  if (/rent|lease|tenan|licen[cs]e/.test(s)) return 'Rented';
  if (/^(yes|y|available|have|has|true)\b/.test(s)) return 'Rented?';
  return null;
}

export function normFloor(v) {
  const s = String(v ?? '').toLowerCase().trim();
  if (!s) return 'Not known';
  if (/mall|shopping cent|complex/.test(s)) return 'Mall unit';
  if (/ground|^gf$|^g$|street|road.?facing|^0$|plinth|high street/.test(s)) return 'Ground';
  if (/upper|first|1st|second|2nd|third|3rd|top|floor\s*\d|mezzanine|basement|^[1-9]$/.test(s)) return 'Upper';
  return 'Not known';
}

export function normTier(v) {
  const s = String(v ?? '').toLowerCase();
  if (/metro/.test(s)) return 1;
  const m = s.match(/[123]/);
  if (m) return +m[0];
  if (/iii/.test(s)) return 3;
  if (/ii/.test(s)) return 2;
  if (/\bi\b|\ba\b/.test(s)) return 1;
  if (/\bb\b/.test(s)) return 2;
  if (/\bc\b|small|rural/.test(s)) return 3;
  return null;
}

export function normPriority(v) {
  if (typeof v === 'number' || /^\d+(\.\d+)?$/.test(String(v ?? '').trim())) {
    const n = Number(v);
    if (n <= 3) return n <= 1 ? 'High' : n <= 2 ? 'Medium' : 'Low';
    return n >= 7 ? 'High' : n >= 4 ? 'Medium' : 'Low';
  }
  const s = String(v ?? '').toLowerCase().trim();
  if (/^h|urgent|top|critical|p1/.test(s)) return 'High';
  if (/^m|normal|p2|moderate/.test(s)) return 'Medium';
  if (/^l|p3|later/.test(s)) return 'Low';
  return 'Medium';
}

export function normLang(v) {
  const s = String(v ?? '').toLowerCase();
  const known = ['Kannada', 'Hindi', 'English', 'Tamil', 'Telugu', 'Malayalam', 'Marathi', 'Bengali', 'Gujarati', 'Punjabi', 'Odia', 'Urdu', 'Assamese'];
  const hit = known.find(k => s.includes(k.toLowerCase().slice(0, 4)));
  if (hit) return hit;
  return s.trim() ? String(v).trim() : 'English';
}

const clean = s => String(s ?? '').trim().replace(/\s+/g, ' ');

// "T Nagar, Chennai, Tamil Nadu 600017" → city Chennai, state Tamil Nadu, pin 600017
function splitCombo(v) {
  const s = String(v ?? '');
  const pin = (s.replace(/(\d{3})\s+(\d{3})/, '$1$2').match(/\b[1-9]\d{5}\b/) || [null])[0];
  const parts = s.replace(/(\d{3})\s?(\d{3})/g, ' ').split(/[·|,•\n;]/).map(x => x.trim().replace(/[-–]+$/, '').trim()).filter(Boolean);
  let city = '', state = '';
  for (const p of parts) if (!state && stateName(p)) state = stateName(p);
  for (const p of [...parts].reverse()) if (!city && cityInfo(p)) city = cityInfo(p).name;
  if (!city) for (const p of [...parts].reverse()) for (const w of p.split(/\s+/).reverse()) if (!city && cityInfo(w)) city = cityInfo(w).name;
  if (!city && pin && cityForPin(pin)) city = cityForPin(pin).name;
  if (!city) { const rest = parts.filter(p => stateName(p) !== state); city = rest[rest.length - 1] || ''; }
  if (!state) for (const p of parts) for (const w of p.split(/\s+/)) if (!state && stateName(w)) state = stateName(w);
  if (!state && pin) state = stateForPin(pin) || '';
  return { city, state, pin };
}

function cleanPin(v) {
  if (blank(v)) return null;
  const s = String(v).replace(/\.0+$/, '').replace(/\s/g, '');
  const six = s.match(/\d{6}/);
  return six ? six[0] : s;
}

// Territory pin lists: "560001, 560002", "560001-560010", "560*", "560xxx"
function readPins(v) {
  const s = String(v ?? '').replace(/\.0\b/g, '');
  const pins = new Set(), prefixes = new Set();
  for (const m of s.matchAll(/(\d{6})\s*(?:-|–|to)\s*(\d{6})/g)) {
    const a = +m[1], b = +m[2];
    if (b >= a && b - a <= 300) for (let p = a; p <= b; p++) pins.add(String(p));
  }
  for (const m of s.replace(/(\d{6})\s*(?:-|–|to)\s*(\d{6})/g, ' ').matchAll(/\b\d{6}\b/g)) pins.add(m[0]);
  for (const m of s.matchAll(/\b(\d{2,5})(?:\*|x+|X+)/g)) prefixes.add(m[1]);
  return { pins: [...pins], prefixes: [...prefixes] };
}

function openedYear(v) {
  if (blank(v)) return null;
  if (typeof v === 'number') return v > 20000 && v < 80000 ? new Date(Date.UTC(1899, 11, 30) + v * 864e5).getUTCFullYear() : Math.round(v);
  const y = String(v).match(/(19|20)\d\d/);
  return y ? +y[0] : null;
}

export function parseWorkbook(sheets, opts = {}) {
  const out = { applications: [], territories: [], stores: [], storesFromFile: false, notes: [], report: { sheets: [], assumptions: [] } };
  const today = opts.today ? new Date(opts.today) : new Date();
  for (const [name, rows] of Object.entries(sheets)) {
    if (!rows?.length) continue;
    const fit = classify(name, rows);
    const entry = { name, rows: Math.max(0, rows.length - 1), type: fit?.type || 'skipped' };
    out.report.sheets.push(entry);
    if (!fit) continue;
    entry.header = fit.header + 1;
    entry.columns = fit.labels;
    const used = new Set(Object.values(fit.map));
    entry.extra = (rows[fit.header] || []).map((c, i) => (!used.has(i) && !blank(c) ? String(c).trim() : null)).filter(Boolean);
    entry.missing = Object.keys(SPECS[fit.type]).filter(k => fit.map[k] === undefined && !(k === 'combo' && (fit.map.city !== undefined || fit.map.pin !== undefined)) && !['phone', 'email', 'name', 'combo', 'state'].includes(k));
    const before = { applications: out.applications.length, territories: out.territories.length, stores: out.stores.length }[fit.type];
    ({ applications: readApplications, territories: readTerritories, stores: readStores })[fit.type](rows, fit, out, today);
    entry.read = { applications: out.applications.length, territories: out.territories.length, stores: out.stores.length }[fit.type] - before;
  }
  if (!out.stores.length) {
    out.stores = DEFAULT_STORES.map(s => ({ ...s }));
    out.notes.push('No existing-stores sheet in the upload, so the brand\'s 10 open stores from the template were used.');
    out.report.assumptions.push('No existing-stores sheet found: used the 10 stores from the case template.');
  }
  // ID clashes across sheets or missing IDs
  const seen = new Map();
  out.applications.forEach((a, i) => {
    if (!a.id || a.id.startsWith('ROW-')) { a.id = `APP-${String(i + 1).padStart(3, '0')}`; a.idMade = true; }
    else if (/^\d+$/.test(a.id)) { a.id = `APP-${a.id.padStart(3, '0')}`; a.idNumbered = true; }
  });
  if (out.applications.some(a => a.idNumbered)) out.report.assumptions.push('Application IDs were plain numbers: shown as APP-001, APP-002, … so they can be searched and linked.');
  if (out.applications.some(a => a.idMade)) out.report.assumptions.push('Some applications had no ID: numbered them APP-001, APP-002, … in file order.');
  out.territories.forEach((t, i) => { if (!t.id) t.id = `TER-${String(i + 1).padStart(2, '0')}`; if (seen.has(t.id)) t.id += `-${i + 1}`; seen.set(t.id, 1); });
  return out;
}

function readApplications(rows, { header, map, labels }, out, today) {
  for (let r = header + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const get = k => (map[k] === undefined ? undefined : row[map[k]]);
    if (blank(get('id')) && blank(get('name')) && blank(get('pin')) && blank(get('combo'))) continue;
    const combo = map.combo !== undefined ? splitCombo(get('combo')) : {};
    const inv = parseLakh(get('invest'), labels.invest);
    const exp = parseYears(get('exp'));
    const launch = parseLaunch(get('launch'), today);
    const rawSpace = get('space');
    let space = normSpace(rawSpace), spaceNote = null;
    if (space === 'Rented?') { space = 'Rented'; spaceNote = `space answer "${rawSpace}" doesn't say owned or rented; treated as rented`; }
    // pin can also hide inside notes or an address column
    let pin = cleanPin(get('pin') ?? combo.pin);
    if (!pin) { const m = String(get('notes') ?? '').match(/\b[1-8]\d{5}\b/); if (m) pin = m[0]; }
    const extra = {};
    row.forEach((v, i) => { if (!Object.values(map).includes(i) && !blank(v) && !blank(rows[header][i])) extra[String(rows[header][i]).trim()] = v; });
    // Every answer exactly as written, in the file's own column order
    const keyAt = Object.fromEntries(Object.entries(map).map(([k, i]) => [i, k]));
    const raw = (rows[header] || []).map((h, i) => ({ h: String(h ?? '').trim(), v: row[i] ?? '', k: keyAt[i] || null })).filter(x => x.h);
    out.applications.push({
      id: blank(get('id')) ? `ROW-${r + 1}` : String(get('id')).trim(),
      name: clean(get('name')) || '(no name given)',
      city: clean(get('city') ?? combo.city),
      state: stateName(clean(get('state') ?? combo.state)) || clean(get('state') ?? combo.state),
      pin,
      invest: inv.value, investNote: inv.note,
      exp: exp.value, expNote: exp.note,
      business: clean(get('business')),
      spaceRaw: blank(rawSpace) ? '' : String(rawSpace).trim(),
      space, spaceNote,
      size: parseNum(get('size')),
      floorRaw: clean(get('floor')),
      floor: normFloor(get('floor')),
      launch: launch.value, launchNote: launch.note,
      lang: normLang(get('lang')),
      notes: clean(get('notes')),
      phone: clean(get('phone')), email: clean(get('email')),
      extra, raw,
      row: r + 1,
    });
  }
}

function readTerritories(rows, { header, map }, out) {
  for (let r = header + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const get = k => (map[k] === undefined ? undefined : row[map[k]]);
    if (blank(get('id')) && blank(get('pins')) && blank(get('city'))) continue;
    const combo = map.combo !== undefined ? splitCombo(get('combo')) : {};
    const { pins, prefixes } = readPins(get('pins'));
    const slotsRaw = parseNum(get('slots'));
    const t = {
      id: clean(get('id')),
      city: clean(get('city') ?? combo.city),
      state: stateName(clean(get('state') ?? combo.state)) || clean(get('state') ?? combo.state),
      pins, prefixes,
      tierRaw: get('tier'),
      tier: normTier(get('tier')),
      slots: Math.max(0, Math.round(slotsRaw ?? 1)),
      priority: normPriority(get('priority')),
      notes: [],
    };
    if (slotsRaw == null) { t.notes.push('open slots not given; assumed 1'); out.report.assumptions.push(`${t.id || 'A territory'}: open slots not given, assumed 1.`); }
    if (!pins.length && !prefixes.length) { t.matchByCity = true; t.notes.push('no pin codes listed; applicants are matched by city name'); out.report.assumptions.push(`${t.id || t.city}: no pin codes listed, so applicants are matched by city.`); }
    out.territories.push(t);
  }
}

function readStores(rows, { header, map }, out) {
  for (let r = header + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const get = k => (map[k] === undefined ? undefined : row[map[k]]);
    if (blank(get('id')) && blank(get('pin'))) continue;
    out.stores.push({ id: blank(get('id')) ? `ST-${String(out.stores.length + 1).padStart(2, '0')}` : clean(get('id')), city: splitCombo(get('city')).city || clean(get('city')), pin: cleanPin(get('pin')), opened: openedYear(get('opened')) });
  }
  out.storesFromFile = true;
}
