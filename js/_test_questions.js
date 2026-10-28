// Question bank for Ask: phrasings a judge or an expansion manager might use. Prints every question that gets
// the "I couldn't match that" answer, plus any that crash. Run: node js/_test_questions.js [--show]
import { sampleSheets } from './sample.js';
import { parseWorkbook } from './parse.js';
import { run } from './engine.js';
import { ask } from './ask.js';

const data = parseWorkbook(sampleSheets(), { today: '2026-10-26' });
const settings = { asOf: '2026-10-26' };
const result = run(data, settings);
const ctx = () => ({ data, settings, result, rerun: (d, s) => run(d, s) });
const hold = result.apps.find(a => a.decision === 'hold')?.id || 'APP-007';
const wait = result.apps.find(a => a.decision === 'waitlist')?.id || 'APP-010';
const yes = result.apps.find(a => a.decision === 'approved')?.id || 'APP-002';
const no = result.apps.find(a => a.decision === 'declined')?.id || 'APP-015';
const ter = result.territories[0]?.id || 'TER-01';
const name = result.apps.find(a => a.id === yes)?.name || 'Meera Shetty';

export const QUESTIONS = [
  // about one applicant
  `Why is ${hold} on hold?`, `why ${hold} hold`, `Why was ${no} declined?`, `Why is ${wait} waitlisted and not approved?`, `Why did ${yes} get approved?`,
  `What should we tell ${hold}?`, `What does ${hold} need to send us?`, `What would make ${no} approvable?`, `How can ${wait} get a spot?`,
  `What is ${yes}'s payback?`, `How much money does ${yes} have?`, `How much is ${no} short?`, `What's the partner score of ${yes}?`, `Where does ${yes} want to open?`,
  `When can ${yes} open?`, `Is ${yes} ready to open?`, `Tell me about ${name}`, `Who is ${name}?`, `${name} details`, `What language does ${yes} speak?`,
  `Does ${yes} have retail experience?`, `Is ${hold} in a good location?`, `How far is ${yes} from our nearest store?`, `Next steps for ${yes}`, `Draft a message to ${hold}`,
  `What are the risks with ${yes}?`, `Should we approve ${wait}?`, `Is ${no} a good partner?`, `${yes} vs ${wait}`, `Who is better, ${yes} or ${wait}?`,
  // new information
  `${hold} has now found a ground-floor space`, `${no} can now invest 60 lakh`, `${wait} has 8 years of retail experience now`, `${hold} found a shop in a mall`, `What if ${no} had 80 lakh?`,
  // lists and counts
  'Who is on hold?', 'Who is waitlisted in Mysuru?', 'List all approved applicants', 'Show me everyone declined', 'How many applicants are there?', 'How many are approved?',
  'How many in Bengaluru?', 'Who applied from Tumakuru?', 'Who has no space yet?', 'Who has zero experience?', 'Which applicants own their shop?', 'Who wants to open before Diwali?',
  'Who speaks Kannada?', 'Who has more than 50 lakh?', 'Applicants with conditions', 'Who needs a co-investor?', 'Show applicants with missing information', 'Which applicants have duplicate pins?',
  // territories and places
  `Tell me about ${ter}`, `Who won ${ter}?`, `How many slots in ${ter}?`, 'Which territories need leads?', 'Which territory has the most applicants?', 'Which city has the most empty spots?',
  'Where should we open next?', 'Which areas are underserved?', 'Where is demand highest?', 'What pins are free in Mysuru?', 'Is 560034 taken?', 'Can we open in 570009?', 'Is there a store in Mangaluru?',
  'Which territories are full?', 'High priority territories', 'Show Mysuru on the map', 'What about Davanagere?', 'Any stores in Hubli?',
  // numbers
  'Average investment', 'Median experience', 'Highest partner score', 'Lowest payback', 'Total money committed by approved partners', 'Top 5 partners', 'Best 3 applicants in Bengaluru',
  'What is the average payback?', 'Average investment in Tier 1', 'How much do approved partners invest in total?', 'What percentage are approved?', 'Approval rate', 'How many people were rejected and why?',
  // rules and definitions
  'What is payback?', 'What does waitlist mean?', 'How is the partner score calculated?', 'How is the location score worked out?', 'What is the 2 km rule?', 'Why only one store per pin code?',
  'What is the minimum investment?', 'How much money do you need for a Tier 1 store?', 'What is a co-investor pair?', 'What is ADKAR?', 'What is cannibalisation?', 'What happens after approval?',
  'How long does it take to open a store?', 'What are the onboarding steps?', 'Who decides, the AI or a person?', 'Is this AI?', 'How does StoreSense decide?', 'Can I change the rules?',
  'What if the minimum Tier 1 investment is 50 lakh?', 'What if we required 3 years of experience?', 'What if the radius was 3 km?', 'Make it stricter',
  // operations and summary
  'What should I do today?', 'Give me a summary', 'Summarise the batch', 'Overview please', 'Any problems with the data?', 'How did you read my file?', 'What assumptions did you make?',
  'Which applications need my decision?', 'Traffic insights', 'Which site will be busiest?', 'Will any new store hurt our existing stores?', 'Export to HubSpot', 'How do I upload a file?',
  // vague, casual, typos, mixed language
  'hi', 'thanks', 'who should i call first', 'any good leads?', 'whats happening', 'is everything ok', 'who r the top guys', 'shw me holds', 'aproved ppl in mysore', 'kitne log approved hai',
  'bangalore mein kitne applicants hai', 'how r things in tumkur', 'best partner?', 'worst applicant', 'riskiest approval', 'cheapest store to open', 'most experienced applicant', 'youngest store',
  // off topic / open ended
  'What is the capital of Karnataka?', 'Write a poem', 'How do franchises work?', 'What makes a good franchise partner?', 'How can we get more applicants in Tumakuru?', 'Why is Mysuru a good market?',
  'What should our rollout plan be?', 'What are the biggest risks in this batch?', 'Explain this dashboard', 'What can you do?',
];

const show = process.argv.includes('--show');
let unknown = [], crashed = [];
for (const q of QUESTIONS) {
  try {
    const o = ask(q, ctx());
    const text = String(o.html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (o.unknown) unknown.push(q);
    if (show) console.log(`${o.unknown ? '??' : 'ok'} ${q}\n    ${text.slice(0, 220)}`);
  } catch (e) { crashed.push(`${q} → ${e.message}`); }
}
console.log(`\n${QUESTIONS.length} questions · ${QUESTIONS.length - unknown.length - crashed.length} answered · ${unknown.length} not understood · ${crashed.length} crashed`);
if (unknown.length) console.log('\nNot understood:\n  ' + unknown.join('\n  '));
if (crashed.length) console.log('\nCrashed:\n  ' + crashed.join('\n  '));
