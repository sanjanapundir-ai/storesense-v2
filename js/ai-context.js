// ai-context.js — a compact, plain-text copy of the engine's results for the AI assistant. The AI answers only from
// this text, so it can't invent applicants or numbers, and it never changes a decision. Phone numbers and emails
// are left out. The same file gives the same text, so the server can cache it between questions.
import { lakh } from './engine.js';

const cut = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const num = v => (v == null || !isFinite(v) ? '-' : Math.round(v * 10) / 10);

export function buildAiContext(res, data, human = {}) {
  const c = res.cfg;
  const lines = [];
  const asOf = res.asOf || c.asOf, day = asOf instanceof Date ? `${asOf.getFullYear()}-${String(asOf.getMonth() + 1).padStart(2, '0')}-${String(asOf.getDate()).padStart(2, '0')}` : String(asOf || '').slice(0, 10);
  lines.push(`AS OF ${day}. ${res.apps.length} applicants, ${res.territories.length} territories, ${res.stores.length} existing stores.`);
  lines.push(`RULES: money floor Tier1 ₹${c.minInvest[1]}L, Tier2 ₹${c.minInvest[2]}L, Tier3 ₹${c.minInvest[3]}L; min experience ${c.minExp} yr; partner score bar ${c.partnerBar}; payback limit ${c.maxPayback} months; space between stores ${c.overlapKm} km (same for every territory); demographic floor ${c.minDemographic}; funding tolerance ${c.fundTolerance}. One store per pin code. Combined score = 60% partner + 40% location.`);
  lines.push('DECISIONS are suggestions from fixed rules: approved, conditional (approve with conditions), hold (missing or contradictory info), waitlist, declined. A person records the final decision.');
  lines.push('\nSTORES (id | city | pin | opened)');
  for (const s of res.stores) lines.push(`${s.id} | ${s.city} | ${s.pin} | ${s.opened ?? '-'}`);
  lines.push('\nTERRITORIES (id | city | tier | priority | slots | open | winners | waitlist | free pins | needs leads)');
  for (const t of res.territories) lines.push(`${t.id} | ${t.city} | T${t.tier ?? '-'} | ${t.priority} | ${t.slots} | ${Math.max(0, t.open)} | ${t.winners.map(w => w.id).join(' ') || '-'} | ${t.waitlist.map(w => w.id).join(' ') || '-'} | ${t.pinsFree.slice(0, 12).join(' ') || '-'} | ${t.needsLeads ? 'yes' : 'no'}`);
  lines.push('\nAPPLICANTS (id | name | city | pin | tier | invest | needed | short by | exp yrs | business | space | floor | sqft | launch months | language | decision | reason code | headline | partner | location | combined | payback months | territory | nearest store km | conditions | open issues | notes | final decision by a person)');
  for (const a of res.apps) {
    const hd = human[a.id];
    lines.push([
      a.id, cut(a.name, 30), a.cityName || a.city || '-', a.assignedPin || a.pin || '-', a.tier ? `T${a.tier}` : '-', lakh(a.invest), lakh(a.needed), a.gap > 0 ? lakh(a.gap) : '-',
      num(a.exp), cut(a.business, 40) || '-', a.spaceStd || '-', a.floorStd || '-', num(a.sizeUsed), num(a.launchUsed), a.lang || '-',
      a.decision, a.sub || '-', cut(a.headline, 110), num(a.partner), num(a.site), num(a.combined), isFinite(a.payback) ? Math.round(a.payback) : 'never',
      a.territory?.id || 'none', a.nearest ? `${a.nearest.store.id} ${num(a.nearest.km)}` : '-',
      cut((a.conditions || []).map(x => x.text).join('; '), 120) || '-', cut((a.issues || []).filter(i => i.level === 'block').map(i => i.text).join('; '), 100) || '-',
      cut(a.notes, 60) || '-', hd ? hd.d : '-',
    ].join(' | '));
  }
  const rep = data?.report;
  if (rep?.assumptions?.length) lines.push(`\nFILE NOTES: ${rep.assumptions.slice(0, 10).map(x => cut(x, 160)).join(' / ')}`);
  return lines.join('\n');
}
