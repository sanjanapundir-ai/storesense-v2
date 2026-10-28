// Any-format upload: the sample data written as CSV, TSV, semicolon text, JSON, Markdown, Word and one stacked
// CSV must give exactly the same suggestions as the original sheets.
// Run: NODE_PATH=<a folder with the xlsx package> node js/_test_ingest.js   (SheetJS is a CDN script in the app)
import { createRequire } from 'node:module';
import { sampleSheets } from './sample.js';
import { parseWorkbook } from './parse.js';
import { run } from './engine.js';
import { filesToSheets, detectDelimiter } from './ingest.js';

const XLSX = createRequire(import.meta.url)('xlsx');
const settings = { asOf: '2026-10-26' };
const today = { today: '2026-10-26' };
const sample = sampleSheets();
const outcome = sheets => run(parseWorkbook(sheets, today), settings).apps.map(a => `${a.id} ${a.decision} ${a.sub} ${a.combined}`).join('\n');
const baseline = outcome(sample);

const enc = s => new TextEncoder().encode(s).buffer;
const csv = (rows, d = ',') => rows.map(r => r.map(c => { const s = String(c ?? ''); return s.includes(d) || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s; }).join(d)).join('\n');
const A = sample.Applications, T = sample.Territories;

let failed = 0;
const check = async (label, files, expectSame = true) => {
  try {
    const { sheets, notes } = await filesToSheets(files, XLSX);
    const got = outcome(sheets);
    const ok = expectSame ? got === baseline : got.length > 0;
    if (!ok) failed++;
    console.log(ok ? 'ok  ' : 'FAIL', label, '·', Object.keys(sheets).join(', '), notes.length ? `· ${notes[0]}` : '');
  } catch (e) { failed++; console.log('FAIL', label, e.message); }
};
const expectError = async (label, files, re) => {
  try { await filesToSheets(files, XLSX); failed++; console.log('FAIL', label, 'no error'); }
  catch (e) { const ok = re.test(e.message); if (!ok) failed++; console.log(ok ? 'ok  ' : 'FAIL', label, '·', e.message.slice(0, 80)); }
};

const asObjects = rows => rows.slice(1).map(r => Object.fromEntries(rows[0].map((h, i) => [h, r[i]])));
const md = rows => [`| ${rows[0].join(' | ')} |`, `|${rows[0].map(() => '---').join('|')}|`, ...rows.slice(1).map(r => `| ${r.map(c => String(c ?? '').replace(/\|/g, '/')).join(' | ')} |`)].join('\n');
const docx = tables => {
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const tbl = rows => `<w:tbl>${rows.map(r => `<w:tr>${r.map(c => `<w:tc><w:p><w:r><w:t>${esc(c)}</w:t></w:r></w:p></w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`;
  const zip = XLSX.CFB.utils.cfb_new({ fileType: 'zip' });
  XLSX.CFB.utils.cfb_add(zip, 'word/document.xml', new TextEncoder().encode(`<w:document><w:body>${tables.map(tbl).join('')}</w:body></w:document>`));
  return new Uint8Array(XLSX.CFB.write(zip, { type: 'array', fileType: 'zip' })).buffer;
};
const xlsx = () => { const wb = XLSX.utils.book_new(); for (const [n, r] of Object.entries(sample)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(r), n); return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }); };
const ods = () => { const wb = XLSX.utils.book_new(); for (const [n, r] of Object.entries(sample)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(r), n); return XLSX.write(wb, { type: 'array', bookType: 'ods' }); };

console.log('delimiters', [',', '\t', ';', '|'].every(d => detectDelimiter(`a${d}b${d}c\n1${d}2${d}3`) === d) ? 'ok' : 'FAIL');
await check('Excel .xlsx', [{ name: 'data.xlsx', data: xlsx() }]);
await check('OpenDocument .ods', [{ name: 'data.ods', data: ods() }]);
await check('two CSV files', [{ name: 'applications.csv', data: enc(csv(A)) }, { name: 'territories.csv', data: enc(csv(T)) }]);
await check('semicolon .txt + tab .tsv', [{ name: 'apps.txt', data: enc(csv(A, ';')) }, { name: 'terr.tsv', data: enc(csv(T, '\t')) }]);
await check('one CSV, tables stacked', [{ name: 'all.csv', data: enc(`Applications\n${csv(A)}\n\nTerritories\n${csv(T)}`) }]);
await check('JSON', [{ name: 'export.json', data: enc(JSON.stringify({ Applications: asObjects(A), Territories: asObjects(T) })) }]);
await check('Markdown', [{ name: 'notes.md', data: enc(`# Applications\n\n${md(A)}\n\n# Territories\n\n${md(T)}\n`) }]);
await check('Word .docx', [{ name: 'applicants.docx', data: docx([A, T]) }]);
await expectError('image refused', [{ name: 'scan.jpeg', data: enc('x') }], /image/);
await expectError('empty refused', [{ name: 'empty.csv', data: new ArrayBuffer(0) }], /empty/);
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
