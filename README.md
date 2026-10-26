# StoreSense

Franchise partner acquisition, geo-selection and onboarding engine (AI x Ops Hackathon, Case 1).

**Live:** https://storesense-gold.vercel.app — no login. It opens with sample data; upload the judges' workbook (or any franchise file) to run it on real data.

## What it does

- **Reads any file.** Excel or CSV, sheets in any order with any reasonable names. Columns are recognised from many wordings ("Budget (INR)", "Postal codes", "Outlet Code"…), and values are cleaned: ₹25,00,000, 2.5 Cr, "30-40 lakh", "ASAP", "Q1 2027", pin ranges and prefixes like `110*`. "How we read your file" on Home shows every assumption made.
- **Decides with fixed rules, never AI.** Eight steps in a fixed order: info check → one store per pin code → partner score → money floor → territory match by pin → ready to fund (money, payback, experience, households) → spots by combined score → approved or approved with conditions. The same file always gives the same answer.
- **Works anywhere in India.** Every 6-digit pin resolves to its state. About 100 cities have known centres, and pins can be made exact from OpenStreetMap.
- **Explains everything.** Each applicant has a step-by-step decision path, money and payback breakdown, location checks, timeline and onboarding milestones.

## Pages

| Page | What's there |
|---|---|
| Home | Welcome and Google-style search (people, pins, cities, territories or a question), enquiry form scored live, every applicant as an animated dot, funnel, today's actions, rules panel with presets and a "who changed" list, insights |
| To-do | Ready to call / Keep warm / Not now, clickable filters, side drawer with one-click messages in the applicant's language |
| Territories | Spots, winners, waitlists, empty pins, co-investor pairs |
| Map | 3D map of India (MapLibre + OpenFreeMap, no key) with store towers, catchment rings and a demand heat layer, plus a Google Maps panel that follows your clicks |
| Openings | Drag-and-drop onboarding board |
| Ask | Rules-only assistant: explains decisions, does the maths, compares people, runs "what if" without saving, navigates, and keeps notes |
| Rules | Every rule, weight and cost assumption |
| Log | Every search, question, enquiry and change |

The assistant is also on every page (the **Ask** button), and every number, ID, pin and label links to the data behind it. Every view has its own address, so the browser's Back button works and links can be shared.

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

Enquiries, notes, ticks and the activity log are saved in each viewer's own browser only.
