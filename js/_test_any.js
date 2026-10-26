import { parseWorkbook } from './parse.js';
import { run } from './engine.js';
const sheets = {
  'Cover': [['Franchise data dump'], ['generated 2026-10-01']],
  'Leads (Oct)': [
    ['', '', 'Lead export'],
    ['Lead No', 'Full Name', 'Location', 'Budget (INR)', 'Years of experience', 'Occupation', 'Property', 'Carpet Area', 'Floor level', 'Expected opening', 'Language', 'Remarks', 'Mobile'],
    ['L-1', 'Anand Raj', 'T Nagar, Chennai, Tamil Nadu 600017', '₹ 35,00,000', '3-4 yrs', 'Runs a cloud kitchen', 'Yes', 600, 'GF', 'Q1 2027', 'Tamil', '', '98xxxxxx'],
    ['L-2', 'Priya Sharma', 'Connaught Place, Delhi 110001', '2.5 Cr', '10+', 'Franchise owner of a cafe chain', 'Own premises', '1,200', '1st floor', 'ASAP', 'Hindi', 'wants a high street spot', ''],
    ['L-3', 'Rahul Verma', 'Gurgaon, Haryana 122002', '40 lakhs', 'fresher', 'IT professional', 'no', '', '', '6 months', 'English', '', ''],
    ['L-4', 'Meena K', 'Coimbatore 641002', '18L', '5 years', 'Bakery and sweets shop', 'leased', 400, 'ground', '2027-02-15', 'Tamil', '', ''],
    ['L-5', 'S Iyer', 'Madurai', '', '2', 'Catering', 'TBD', '', '', '9', 'Tamil', 'pin 625001', ''],
  ],
  'Expansion Regions': [
    ['Zone Code', 'City', 'State', 'Postal codes', 'City category', 'Target stores', 'Importance'],
    ['Z-CHN', 'Chennai', 'Tamil Nadu', '600001-600020', 'Metro', 3, 1],
    ['Z-DEL', 'Delhi', 'Delhi', '110*', 'A', '2', 'urgent'],
    ['Z-CBE', 'Coimbatore', 'Tamil Nadu', '', 'Tier II', '', 'normal'],
  ],
  'Our Outlets': [
    ['Outlet Code', 'City', 'Zip', 'Opening date'],
    ['O-1', 'Chennai', 600020, 44562],
    ['O-2', 'Delhi', '110005', 'March 2021'],
  ],
};
const d = parseWorkbook(sheets, { today: '2026-10-26' });
console.log(JSON.stringify(d.report, null, 1).slice(0, 1500));
console.log(d.applications.map(a => [a.id, a.name, a.city, a.state, a.pin, a.invest, a.exp, a.space, a.floor, a.size, a.launch, a.lang].join(' | ')).join('\n'));
console.log(d.territories.map(t => [t.id, t.city, t.pins.length, t.prefixes, t.tier, t.slots, t.priority, t.matchByCity || ''].join(' | ')).join('\n'));
console.log(d.stores.map(s => [s.id, s.city, s.pin, s.opened].join(' | ')).join('\n'));
const r = run(d, { asOf: '2026-10-26', category: 'food' });
console.log(r.apps.map(a => [a.id, a.decision, a.sub, a.headline, a.territory?.id, 'rel', a.parts?.relevance].join(' | ')).join('\n'));
console.log(r.checks.map(c => c.text).join(' / '));
