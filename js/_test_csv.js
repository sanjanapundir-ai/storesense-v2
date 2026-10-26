import { parseWorkbook } from './parse.js';
import { run } from './engine.js';
const d = parseWorkbook({ 'leads.csv': [
  ['Sr No', 'Name of franchisee', 'Town', 'State', 'Zip code', 'Funds available', 'Experience (yrs)', 'Background', 'Shop available?', 'Opening in'],
  ['1', 'Karan Mehta', 'Pune', 'MH', '411001', '30,00,000', '4', 'Runs a mobile shop', 'yes - rented', '3 months'],
  ['2', 'Divya Nair', 'Kochi', 'Kerala', '682016', '22 lacs', '6 months', 'Retail store manager', 'No', 'Jan 2027'],
]}, { today: '2026-10-26' });
console.log(d.report.sheets.map(x => `${x.name}: ${x.type}, read ${x.read}, missing ${x.missing}`).join('\n'), '\n', d.report.assumptions.join(' | '));
console.log(d.applications.map(a => [a.id, a.name, a.city, a.state, a.pin, a.invest, a.exp, a.space, a.launch].join(' | ')).join('\n'));
const r = run(d, { asOf: '2026-10-26' });
console.log(r.apps.map(a => [a.id, a.decision, a.headline].join(' | ')).join('\n'));
