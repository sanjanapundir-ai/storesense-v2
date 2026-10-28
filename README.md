# StoreSense

Franchise partner acquisition, geo-selection and onboarding engine (AI x Ops Hackathon, Case 1).

**Live:** https://storesense-gold.vercel.app — no login. It opens with sample data; upload the judges' workbook (or any franchise file) to run it on real data.

## What it does

- **Reads any file.** Excel (.xlsx, .xls, .xlsm, .xlsb), OpenDocument (.ods), Numbers, CSV/TSV/TXT, JSON, Markdown, HTML, Word (.docx) tables and PDF tables, one file or several at once (e.g. applicants + territories). Sheets in any order with any reasonable names; tables stacked in one sheet are split. Incomplete data still runs: a bare list of names, rows with no header line (columns are guessed from their values), blank or junk cells, missing territories or stores. Anyone missing key details is put on hold with the exact question to ask. Columns are recognised from many wordings ("Budget (INR)", "Postal codes", "Outlet Code"…), and values are cleaned: ₹25,00,000, 2.5 Cr, "30-40 lakh", "ASAP", "Q1 2027", pin ranges and prefixes like `110*`. "How we read your file" on Home shows every assumption made.
- **Suggests with fixed rules, never AI. A person decides.** Eight steps in a fixed order: info check → one store per pin code → partner score → money floor → territory match by pin → ready to fund (money, payback, experience, households) → spots by combined score → suggest approve or approve with conditions. The same file always gives the same suggestion.
- **Human final decision.** Every profile has a "Your decision" panel: accept the suggestion or pick another outcome (a reason is required when you go against it), with your name and date. Messages, onboarding, and the HubSpot export use only the decision a person recorded. To-do filters by "Awaiting you / Decided", with a confirmed bulk accept.
- **Traffic insights.** Estimated visitors and buyers a day for every suggested site, break-even traffic and cushion, our stores that could lose visitors, and totals per territory, on Home, on each profile and in the assistant.
- **Works anywhere in India.** Every 6-digit pin resolves to its state. About 100 cities have known centres, and pins can be made exact from OpenStreetMap.
- **Explains everything.** Each applicant has a step-by-step decision path, money and payback breakdown, location checks, timeline and onboarding milestones.

## Pages

| Page | What's there |
|---|---|
| Home | Welcome and Google-style search (people, pins, cities, territories or a question), enquiry form scored live, every applicant as an animated dot, funnel, today's actions, rules panel with presets and a "who changed" list, insights |
| To-do | Suggested yes / Keep warm / Suggested no, awaiting-you filter, bulk accept, clickable filters, side drawer with one-click messages in the applicant's language |
| Territories | Spots, winners, waitlists, empty pins, co-investor pairs |
| Map | 3D map of India (MapLibre + OpenFreeMap, no key) with store towers, catchment rings and a demand heat layer, plus a Google Maps panel that follows your clicks; an **Orders heatmap** for Bengaluru (today's traffic, leaks and a new-store simulation from simulated order data in `data/`) |
| Openings | Drag-and-drop onboarding board |
| Ask | Rules-only assistant: explains decisions, does the maths, compares people, runs "what if" without saving, navigates, and keeps notes |
| Rules | Every rule, weight and cost assumption |
| Log | Every search, question, enquiry and change |

The assistant understands typos, chat shorthand, Hinglish and old city names, and answers from the file: any applicant, lists by any detail, pins and cities, rules, summaries, risks and the rollout plan. Questions the rules can't match go to Claude (api/ask.js) with a compact copy of the results, so open questions still get an answer built only from your data; it is labelled as an AI answer and never changes a decision. Set ANTHROPIC_API_KEY in Vercel to switch that on; without it the assistant runs on rules alone.

The assistant is also a side panel on every page (the **Ask** button or Alt+A). On wide screens it docks on the right, like a browser's assistant sidebar, and the page shrinks to make room. You can drag its edge to resize it. It knows which page or person you're looking at, so "why is this person on hold?" works on a profile. It has three tabs: **Chat**; **Transcripts**, where every conversation is recorded word for word with times and pages and can be searched, continued, copied or downloaded; and **Notes**, which holds your own notes, answers you saved with "Add to notes", a line for every answer, and insights, and every number, ID, pin and label links to the data behind it. Every view has its own address, so the browser's Back button works and links can be shared.

## Run locally

```bash
python3 -m http.server 5178
```

Open http://localhost:5178. No build step.

## Code

- `js/parse.js` — workbook reader and value cleaning, with an import report
- `js/engine.js` — the rulebook (pure, deterministic)
- `js/ask.js` — the assistant (pattern-based, answers only from data and rules)
- `js/geo.js` — India pin codes, cities and states, optional OpenStreetMap lookup
- `js/map3d.js` — 3D map
- `js/flow.js` — Home's applicant flow animation
- `js/app.js` — the interface
- `js/_test*.js` — `node js/_test.js "Why is APP-007 on hold?"` and friends

Decisions, chat transcripts, enquiries, notes, ticks and the activity log are saved in each viewer's own browser only.
