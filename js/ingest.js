// ingest.js — turns any uploaded file(s) into { sheetName: rows[][] } for parseWorkbook, so every format gets the
// same reading and cleaning. Spreadsheets (xlsx, xls, xlsm, xlsb, ods, numbers, html, xml) go through SheetJS;
// delimited text (csv, tsv, txt; comma, tab, semicolon or pipe) by delimiter detection; JSON as rows of objects;
// Markdown pipe tables; Word .docx tables from the document XML; PDF tables from the text layout (pdf.js, loaded
// only when a PDF is uploaded). Several files are merged, and a sheet with several tables stacked one under the
// other is split. Images and other non-table files are refused with a clear reason.
// SheetJS is passed in (the page's global XLSX, or the npm package in Node tests).

import { headerKind, isHelpSheet } from './parse.js';

export const ACCEPTED_FORMATS = 'Excel (.xlsx, .xls, .xlsm, .xlsb), OpenDocument (.ods), Numbers, CSV, TSV, TXT, JSON, Markdown, HTML, Word (.docx) and PDF';
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38';

const SPREADSHEET = /\.(xlsx|xlsm|xlsb|xls|xltx|xltm|ods|fods|numbers|ots|xml|html?|dbf|sylk|slk|prn|dif)$/i;
const DELIMITED = /\.(csv|tsv|tab|txt|psv|dat|text)$/i;
const IMAGE = /\.(png|jpe?g|gif|bmp|webp|heic|heif|tiff?|svg)$/i;
const NO_TABLE = /\.(pptx?|key|zip|rar|7z|mp4|mov|mp3|wav|exe|dmg)$/i;

const baseName = n => n.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '') || 'Sheet';
const ext = n => (n.match(/\.([^.]+)$/)?.[1] ?? '').toLowerCase();
const blankRow = r => !r || r.every(c => c === null || c === undefined || String(c).trim() === '');

function decodeText(data) {
  const b = new Uint8Array(data);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b);
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b);
  return new TextDecoder('utf-8').decode(b).replace(/^﻿/, '');
}
function looksLikeText(data) {
  const b = new Uint8Array(data.slice(0, 4096));
  if (b[0] === 0xff && b[1] === 0xfe) return true;
  let odd = 0;
  for (const x of b) if (x < 9) odd++;
  return odd < b.length * 0.01;
}
const isZip = data => { const b = new Uint8Array(data.slice(0, 2)); return b[0] === 0x50 && b[1] === 0x4b; };
const isPdf = data => new TextDecoder().decode(new Uint8Array(data.slice(0, 5))) === '%PDF-';

// ---------- delimited text ----------
function splitLine(line, d) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (c === d && !q) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map(s => s.trim());
}
export function detectDelimiter(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 20);
  let best = ',', bestScore = 0;
  for (const d of [',', '\t', ';', '|']) {
    const counts = lines.map(l => splitLine(l, d).length).filter(c => c > 1);
    if (!counts.length) continue;
    const mode = [...counts].sort((a, b) => counts.filter(x => x === b).length - counts.filter(x => x === a).length)[0];
    const score = counts.filter(c => c === mode).length * mode;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}
export function delimitedRows(text) {
  const d = detectDelimiter(text);
  const lines = [];
  let buf = '';
  for (const raw of text.split(/\r?\n/)) {
    buf = buf ? `${buf}\n${raw}` : raw;
    if ((buf.match(/"/g) || []).length % 2 === 0) { lines.push(buf); buf = ''; }
  }
  if (buf) lines.push(buf);
  return lines.map(l => splitLine(l, d));
}

// ---------- markdown ----------
function markdownRows(text) {
  const isRow = l => /^\s*\|.*\|\s*$/.test(l);
  const all = text.split(/\r?\n/);
  if (all.filter(isRow).length < 2) return null;
  const rows = [];
  for (const l of all) {
    if (!isRow(l)) { if (rows.length && rows[rows.length - 1].length) rows.push([]); continue; }
    const cells = l.trim().slice(1, -1).split('|').map(c => c.trim());
    if (cells.every(c => /^:?-{2,}:?$/.test(c))) continue;
    rows.push(cells);
  }
  return rows;
}

// ---------- JSON ----------
function jsonSheets(text, name) {
  const data = JSON.parse(text);
  const cell = v => (v === null || v === undefined ? '' : typeof v === 'number' ? v : Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v));
  const fromList = list => {
    const objs = list.filter(x => x && typeof x === 'object' && !Array.isArray(x));
    if (objs.length) {
      const head = [];
      for (const o of objs) for (const k of Object.keys(o)) if (!head.includes(k)) head.push(k);
      return [head, ...objs.map(o => head.map(h => cell(o[h])))];
    }
    const arrays = list.filter(Array.isArray);
    return arrays.length ? arrays.map(r => r.map(cell)) : null;
  };
  if (Array.isArray(data)) { const rows = fromList(data); return rows ? [{ name, rows }] : []; }
  if (data && typeof data === 'object') {
    return Object.entries(data).filter(([, v]) => Array.isArray(v)).map(([k, v]) => ({ name: k, rows: fromList(v) })).filter(t => t.rows);
  }
  return [];
}

// ---------- Word (.docx) ----------
const xmlText = s => s.replace(/<w:tab\/>/g, ' ').replace(/<w:br\/>/g, ' ').replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/\s+/g, ' ').trim();
function docxSheets(data, name, XLSX) {
  const zip = XLSX.CFB.read(new Uint8Array(data), { type: 'array' });
  const entry = XLSX.CFB.find(zip, 'word/document.xml') || XLSX.CFB.find(zip, '/word/document.xml');
  if (!entry?.content) throw new Error(`"${name}" is a zip file but not a Word document.`);
  const xml = new TextDecoder('utf-8').decode(entry.content);
  const tables = [];
  let n = 0;
  for (const m of xml.matchAll(/<w:tbl>([\s\S]*?)<\/w:tbl>/g)) {
    n++;
    const rows = [...m[1].matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)].map(tr => [...tr[0].matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map(tc => xmlText(tc[1])));
    if (rows.length) tables.push({ name: `${baseName(name)} table ${n}`, rows });
  }
  if (tables.length) return tables;
  // No tables: read paragraphs as delimited lines (a list typed into Word with tabs or commas).
  const paras = [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map(p => xmlText(p[0].replace(/<w:tab\/>/g, '\u0001')).replace(/\u0001/g, '\t'));
  return [{ name: baseName(name), rows: delimitedRows(paras.join('\n')) }];
}

// ---------- PDF ----------
let pdfjsLib = null;
async function loadPdfjs() {
  if (pdfjsLib) return pdfjsLib;
  pdfjsLib = await import(/* @vite-ignore */ `${PDFJS}/pdf.min.mjs`);
  pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.mjs`;
  return pdfjsLib;
}
/** PDF text → rows: items on one line are grouped by height on the page; a wide gap starts a new cell. */
async function pdfSheets(data, name) {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) }).promise;
  const rows = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const items = (await page.getTextContent()).items
      .filter(it => it.str && it.str.trim())
      .map(it => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: Math.abs(it.transform[3]) || 10 }))
      .sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    for (const it of items) {
      const line = lines.find(l => Math.abs(l[0].y - it.y) <= Math.max(2, it.h * 0.4));
      if (line) line.push(it); else lines.push([it]);
    }
    for (const line of lines) {
      line.sort((a, b) => a.x - b.x);
      const cells = [];
      let prevEnd = -Infinity;
      for (const it of line) {
        const gap = it.x - prevEnd;
        // Some PDFs put a whole row in one text run with wide spaces between columns.
        const [first, ...more] = it.str.split(/\s{2,}|\t/);
        if (cells.length && gap < it.h * 0.9) cells[cells.length - 1] += (gap > it.h * 0.15 ? ' ' : '') + first;
        else cells.push(first);
        cells.push(...more);
        prevEnd = it.x + it.w;
      }
      rows.push(cells.map(c => c.trim()));
    }
    rows.push([]);
  }
  return [{ name: baseName(name), rows }];
}

// ---------- one file ----------
async function tablesOf(file, XLSX) {
  const { name, data } = file;
  if (!data.byteLength) throw new Error(`"${name}" is empty.`);
  if (IMAGE.test(name)) throw new Error(`"${name}" is an image. Pictures of tables can't be read reliably; please upload ${ACCEPTED_FORMATS}.`);
  if (NO_TABLE.test(name)) throw new Error(`"${name}" is a .${ext(name)} file, which doesn't hold a table. Please upload ${ACCEPTED_FORMATS}.`);
  if (isPdf(data) || /\.pdf$/i.test(name)) return { tables: await pdfSheets(data, name), note: `"${name}" was read from the PDF's text; check a few applicants against the PDF.` };
  if (/\.docx$/i.test(name) || (isZip(data) && /\.(docm|dotx)$/i.test(name))) return { tables: docxSheets(data, name, XLSX), note: `"${name}" was read from the Word document's tables.` };
  if (/\.doc$/i.test(name)) throw new Error(`"${name}" is an old Word .doc file. Save it as .docx or PDF and upload again.`);

  const textual = !isZip(data) && looksLikeText(data);
  const body = textual ? decodeText(data) : '';
  if (textual && (/\.json$/i.test(name) || /^\s*[[{]/.test(body))) {
    try {
      const tables = jsonSheets(body, baseName(name));
      if (tables.length) return { tables };
    } catch { if (/\.json$/i.test(name)) throw new Error(`"${name}" is not valid JSON.`); }
  }
  if (textual && (DELIMITED.test(name) || /\.(md|markdown)$/i.test(name) || !SPREADSHEET.test(name)) && !/^\s*</.test(body)) {
    return { tables: [{ name: baseName(name), rows: markdownRows(body) || delimitedRows(body) }] };
  }
  let wb;
  try { wb = XLSX.read(data, { type: 'array' }); }
  catch { throw new Error(`"${name}" could not be read. Please upload ${ACCEPTED_FORMATS}.`); }
  return {
    tables: wb.SheetNames.map(s => ({
      name: wb.SheetNames.length === 1 && /^sheet\d*$/i.test(s) ? baseName(name) : s,
      rows: XLSX.utils.sheet_to_json(wb.Sheets[s], { header: 1, raw: true, defval: '' }),
    })),
  };
}

/** A sheet holding several tables one under the other is split at each header row of a new kind. */
function splitStacked(t) {
  if (isHelpSheet(t.name)) return [t];
  const starts = [];
  t.rows.forEach((row, i) => {
    const kind = headerKind(row);
    if (kind && !starts.some(s => s.kind === kind)) starts.push({ at: i, kind });
  });
  if (starts.length < 2) return [t];
  const label = { applications: 'Applications', territories: 'Territories', stores: 'Existing stores' };
  return starts.map((s, j) => {
    let end = j + 1 < starts.length ? starts[j + 1].at : t.rows.length;
    // Drop blank and one-cell title lines that sit just before the next table.
    while (end > s.at + 1 && (t.rows[end - 1] || []).filter(c => String(c ?? '').trim()).length <= 1) end--;
    return { name: `${label[s.kind]} (${t.name})`, rows: t.rows.slice(s.at, end) };
  });
}

/**
 * files: [{ name, data: ArrayBuffer }] → { sheets: { name: rows[][] }, notes: string[], label }
 * Throws an Error with a plain message when nothing readable is found.
 */
export async function filesToSheets(files, XLSX) {
  if (!files.length) throw new Error('No file selected.');
  const sheets = {};
  const notes = [];
  for (const f of files) {
    const { tables, note } = await tablesOf(f, XLSX);
    if (note) notes.push(note);
    for (const t of tables.flatMap(splitStacked)) {
      if (t.rows.every(blankRow)) continue;
      let n = t.name, i = 2;
      while (sheets[n]) n = `${t.name} (${i++})`;
      sheets[n] = t.rows;
    }
  }
  if (!Object.keys(sheets).length) throw new Error(`No table was found in ${files.map(f => `"${f.name}"`).join(', ')}.`);
  const label = files.length <= 2 ? files.map(f => f.name).join(' + ') : `${files[0].name} + ${files.length - 1} more files`;
  return { sheets, notes, label };
}
