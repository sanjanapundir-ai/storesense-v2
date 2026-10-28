// Incomplete data: every file below is missing something. Each must load and give every applicant a suggestion,
// and the engine, explanations, insights and assistant must not crash on any of them.
// Run: node js/_test_incomplete.js
import { sampleSheets } from './sample.js';
import { parseWorkbook } from './parse.js';
import { run, siteInsight, trafficSummary, milestones } from './engine.js';
import { ask, explain, nextSteps, nurtureAdvice, insights, suggestionsFor } from './ask.js';

const S = sampleSheets(40);
const A = S.Applications, T = S.Territories, ST = S['Existing stores'];
const col = (rows, keep) => { const idx = keep.map(k => rows[0].findIndex(h => String(h).toLowerCase().includes(k))); return rows.map(r => idx.map(i => (i < 0 ? '' : r[i]))); };
const blankOut = (rows, share, seed = 7) => { let s = seed; const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280); return rows.map((r, i) => (i === 0 ? r : r.map(c => (rnd() < share ? '' : c)))); };

const CASES = {
  'names only': { Applications: col(A, ['applicant name']) },
  'names + city': { Applications: col(A, ['applicant name', 'city']) },
  'names + pin': { Applications: col(A, ['applicant name', 'pin']) },
  'ids + pins only': { Applications: col(A, ['application id', 'pin']) },
  'no money or experience': { Applications: col(A, ['application id', 'applicant name', 'city', 'pin']), Territories: T },
  'no territories, no stores': { Applications: A },
  'territories without pins': { Applications: A, Territories: col(T, ['territory', 'city', 'tier', 'slots', 'priority']) },
  'territories without slots or priority': { Applications: A, Territories: col(T, ['territory', 'city', 'pin codes']) },
  'stores without year': { Applications: A, Territories: T, 'Existing stores': col(ST, ['store', 'city', 'pin']) },
  'stores without pins': { Applications: A, Territories: T, 'Existing stores': col(ST, ['store', 'city', 'opened']) },
  '30% of cells blank': { Applications: blankOut(A, 0.3), Territories: blankOut(T, 0.3), 'Existing stores': blankOut(ST, 0.3) },
  '70% of cells blank': { Applications: blankOut(A, 0.7, 3), Territories: blankOut(T, 0.7, 5) },
  'junk values': { Applications: [A[0], ...A.slice(1, 15).map(r => r.map((c, i) => (i < 2 ? c : ['n/a', '??', '-', 'TBD', 'abc', '0', '999999999', ' '][i % 8])))], Territories: T },
  'unknown cities and pins outside India': { Applications: [A[0], ...A.slice(1, 10).map(r => { const x = [...r]; x[2] = 'Atlantis'; x[4] = '000000'; return x; })], Territories: T },
  'one applicant, nothing else': { Applications: [A[0], A[1]] },
  'header row only': { Applications: [A[0]], Territories: [T[0]] },
  'no header row, just values': { Applications: A.slice(1, 10) },
  'duplicate IDs': { Applications: [A[0], A[1], A[1], A[2], A[2]], Territories: T },
  'all applicants in one pin': { Applications: [A[0], ...A.slice(1, 12).map(r => { const x = [...r]; x[4] = A[1][4]; return x; })], Territories: T },
  'territory with 0 slots everywhere': { Applications: A, Territories: T.map((r, i) => (i ? r.map((c, j) => (String(T[0][j]).toLowerCase().includes('slot') ? 0 : c)) : r)) },
  'empty workbook': {},
};

let failures = 0;
const QUESTIONS = id => [`Why is ${id} on hold?`, `${id} has now found a ground-floor space`, 'Who is waitlisted?', 'Which territories need leads?', 'What if Tier 1 minimum is 50 lakh?', `Compare ${id} with APP-002`, 'summary'];
for (const [name, sheets] of Object.entries(CASES)) {
  const step = { at: 'parse' };
  try {
    const data = parseWorkbook(sheets, { today: '2026-10-26' });
    if (!data.applications.length) { console.log(`ok   ${name}: no applicants (the app shows a "no applications found" message)`); continue; }
    step.at = 'run';
    const settings = { asOf: '2026-10-26' };
    const res = run(data, settings);
    const undecided = res.apps.filter(x => !x.decision || !x.headline);
    if (undecided.length) throw new Error(`${undecided.length} applicants without a suggestion or headline`);
    step.at = 'summary';
    insights(res); trafficSummary(res);
    for (const tab of ['home', 'todo', 'territories', 'map', 'openings', 'ask', 'rules', 'log']) suggestionsFor(tab, res, res.apps[0].id);
    for (const x of res.apps) {
      step.at = `applicant ${x.id}`;
      explain(x, res); nextSteps(x, res); nurtureAdvice(x); siteInsight(x, res); milestones(x, settings.asOf);
    }
    const ctx = { data, settings, result: res, rerun: (d, s) => run(d, s) };
    for (const q of QUESTIONS(res.apps[0].id)) { step.at = `ask "${q}"`; ask(q, ctx); }
    const by = {}; res.apps.forEach(x => (by[x.decision] = (by[x.decision] || 0) + 1));
    console.log(`ok   ${name}: ${res.apps.length} applicants · ${data.territories.length} territories · ${res.stores.length} stores · ${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  } catch (e) {
    failures++;
    console.log(`FAIL ${name} at ${step.at}: ${e.message}\n     ${String(e.stack).split('\n')[1]?.trim()}`);
  }
}
// Without a header row the columns are guessed from the values; the suggestions must match the same file with headers.
{
  const sug = sheets => run(parseWorkbook(sheets, { today: '2026-10-26' }), { asOf: '2026-10-26' }).apps.map(x => `${x.id} ${x.decision} ${x.combined}`).join('\n');
  const same = sug({ Applications: A, Territories: T }) === sug({ Leads: A.slice(1), Territories: T });
  if (!same) failures++;
  console.log(`${same ? 'ok  ' : 'FAIL'} header-less applicants give the same suggestions as with headers`);
}
console.log(failures ? `${failures} failed` : 'all passed');
process.exit(failures ? 1 : 0);
