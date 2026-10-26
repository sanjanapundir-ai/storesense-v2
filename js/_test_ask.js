import { sampleSheets } from './sample.js';
import { parseWorkbook } from './parse.js';
import { run } from './engine.js';
import { ask, insights } from './ask.js';
const data = parseWorkbook(sampleSheets(), { today: '2026-10-26' });
const settings = { asOf: '2026-10-26' };
const res = run(data, settings);
const ctx = { data, settings, result: res, rerun: (d, s) => run(d, s) };
const qs = process.argv.slice(2).length ? process.argv.slice(2) : [
 'Why is APP-007 on hold?', 'What is APP-012\'s payback?', 'How much money does APP-003 have?', 'Where is APP-005?', 'What are the conditions for APP-001?', 'When will APP-001 open?',
 'Compare APP-001 and APP-003', 'What if APP-012 had 60 lakh?', 'What if APP-012 found a ground-floor shop?',
 'Average money of people ready to call', 'Median experience in big cities', 'Highest investment in Mysuru', 'Lowest payback', 'Total money in TER-01',
 'Top 5 partners', 'Best leads in Mangaluru', 'Which territory has the most applicants?', 'Which city has the most empty spots?', 'Which territory has no applicants?',
 'Who can open fastest?', 'How many spots are left?', 'How many on hold in Bengaluru?', 'List waitlist in Mysuru',
 'What is payback?', 'What does waitlist mean?', 'What is cannibalisation?', 'Define catchment', 'How is the partner score calculated?',
 'What should I do today?', 'Open the map', 'Show Mysuru on the map', 'Take me to territories', 'Go to TER-06', 'Open APP-012', 'Where do I upload my file?',
 'What is the weather in Paris?', 'Who will win the cricket match?', 'APP-012 has now found a ground-floor space',
];
for (const q of qs) { const o = ask(q, ctx); console.log('\n### ' + q + (o.nav ? `  [nav → ${o.nav}]` : '') + (o.data ? '  [CHANGED DATA]' : '')); console.log((o.html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 330)); }
console.log('\nINSIGHTS'); for (const i of insights(res)) console.log('-', i.text, '→', i.go);
