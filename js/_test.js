import { sampleSheets } from './sample.js';
import { parseWorkbook } from './parse.js';
import { run } from './engine.js';
import { ask } from './ask.js';
const data = parseWorkbook(sampleSheets());
const settings = { asOf: '2026-10-26' };
const res = run(data, settings);
console.log('apps', res.apps.length, 'ters', res.territories.length, 'stores', res.stores.length);
console.log(res.funnel.stages.map(s => `${s.label}:${s.n}(-${s.out})`).join(' | '));
console.log(res.funnel.outcome.map(o => `${o.key}:${o.n}`).join(' '));
const subs = {}; res.apps.forEach(a => subs[a.decision + '/' + a.sub] = (subs[a.decision + '/' + a.sub] || 0) + 1); console.log(subs);
console.log(res.checks);
for (const t of res.territories) console.log(t.id, t.priority, 'slots', t.slots, 'won', t.winners.map(w => w.id + ':' + w.combined).join(','), 'wl', t.waitlist.length, 'pair', t.pairings.length, 'needsLeads', t.needsLeads, t.status);
for (const id of ['APP-001', 'APP-002', 'APP-007', 'APP-012', 'APP-019', 'APP-020', 'APP-005', 'APP-018']) { const x = res.apps.find(a => a.id === id); console.log(id, x.decision, x.sub, '|', x.headline, '| partner', x.partner, 'site', x.site, 'comb', x.combined, 'need', x.needed, 'inv', x.invest, 'pb', Math.round(x.payback)); }
console.log('actions', res.actions.slice(0, 8).map(a => a.title));
const pb = res.apps.filter(a => isFinite(a.payback)).map(a => Math.round(a.payback)).sort((a, b) => a - b); console.log('payback p10/50/90', pb[Math.floor(pb.length * .1)], pb[Math.floor(pb.length * .5)], pb[Math.floor(pb.length * .9)]);
const ctx = { data, settings, result: res, rerun: (d, s) => run(d, s) };
for (const q of process.argv.slice(2).length ? process.argv.slice(2) : ['Why is APP-007 on hold?', 'APP-012 has now found a ground-floor space', 'Which territories need leads?', 'What if Tier 1 minimum is 50 lakh?', 'TER-06 now has 3 open slots']) {
  const o = ask(q, ctx); console.log('\nQ:', q, '\n', (o.html || JSON.stringify(o)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 900));
}
