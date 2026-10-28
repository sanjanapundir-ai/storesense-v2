// /api/ask — the AI part of "Ask StoreSense", for questions the fixed rules can't match. The browser sends the
// question plus a plain-text copy of the engine's results (js/ai-context.js); Claude answers from that text only.
// The API key stays on the server (ANTHROPIC_API_KEY in Vercel). Without a key the assistant runs on rules alone.
// GET /api/ask → { enabled }   POST /api/ask { question, context, history? } → { answer } | { error }
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-opus-5-5';
const MAX_QUESTION = 600;
const MAX_CONTEXT = 200_000; // characters; the 200-applicant sample is about 45k
const MAX_HISTORY = 6;
const PER_MINUTE = 8; // per visitor, per server instance: the site is public, so keep spend bounded

const INSTRUCTIONS = `You are the assistant inside StoreSense, a franchise expansion tool for a retail brand opening franchise stores in India. An expansion manager is asking about the applicant file they loaded.

Answer only from the DATA block: applicants, territories, stores, rules and file notes. Every number, name and ID you give must come from that data or be worked out from it; say how you worked it out when you calculate. If the data can't answer the question, say what is missing in one sentence instead of guessing. Never invent applicants, pins, money or dates.

Decisions in the data are suggestions made by fixed rules; a person makes the final call. You explain, compare, count and advise; you never change a decision. If the user gives new information about an applicant (money, space, experience, pin), tell them to state it as a fact, for example "APP-012 can now invest 40 lakh", so the rules can re-run.

Write for a busy manager: lead with the answer, then the few facts that support it. Use applicant IDs (APP-012) and territory IDs (TER-03) so they become links. Short paragraphs or a short list; no headings, no tables, no markdown other than **bold** and "- " list items. Money is in ₹ lakh (₹35L). Keep it under about 180 words unless a list needs more.

If the question has nothing to do with StoreSense, franchising or this file, say in one sentence that you only answer questions about the loaded file.`;

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
const hits = new Map();

function limited(ip) {
  const now = Date.now(), recent = (hits.get(ip) || []).filter(t => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > PER_MINUTE;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') return res.status(200).json({ enabled: !!anthropic, model: anthropic ? MODEL : null });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  if (!anthropic) return res.status(503).json({ error: 'The AI assistant is not switched on (no API key on the server).' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const question = String(body.question || '').trim();
  const context = String(body.context || '');
  if (!question) return res.status(400).json({ error: 'Empty question.' });
  if (question.length > MAX_QUESTION) return res.status(400).json({ error: 'The question is too long.' });
  if (!context || context.length > MAX_CONTEXT) return res.status(400).json({ error: 'The file is too large for the AI assistant.' });
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  if (limited(ip)) return res.status(429).json({ error: 'Too many questions in a minute. Try again shortly.' });

  // Earlier turns of this chat, as plain text, so follow-ups ("and in Mysuru?") make sense.
  const history = (Array.isArray(body.history) ? body.history : []).slice(-MAX_HISTORY)
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string' && m.text.trim())
    .map(m => ({ role: m.role, content: m.text.slice(0, 2000) }));
  while (history.length && history[0].role !== 'user') history.shift();

  try {
    const msg = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [
        { type: 'text', text: INSTRUCTIONS },
        // The data block is identical for every question about the same file, so it is cached.
        { type: 'text', text: `DATA\n${context}`, cache_control: { type: 'ephemeral' } },
      ],
      messages: [...history, { role: 'user', content: question }],
    });
    if (msg.stop_reason === 'refusal') return res.status(200).json({ answer: "I can't help with that one. Ask me about the applicants, territories, stores or rules in your file.", refused: true });
    const answer = msg.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (!answer) return res.status(502).json({ error: 'The AI returned an empty answer.' });
    return res.status(200).json({ answer, model: msg.model, truncated: msg.stop_reason === 'max_tokens' });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'The AI is busy. Try again in a moment.' });
    if (err instanceof Anthropic.AuthenticationError) return res.status(503).json({ error: 'The AI key on the server is not valid.' });
    if (err instanceof Anthropic.APIError) return res.status(502).json({ error: `The AI service returned an error (${err.status}).` });
    return res.status(502).json({ error: 'Could not reach the AI service.' });
  }
}
