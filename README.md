# Morning Brief

A per-salesperson AI desk agent for a trading firm. Each morning it ranks **who to call**, explains **why now**, and drafts **what to say** — using only that salesperson's own book. This repo is the proof-of-concept build: a real pipeline, a real Postgres database with row-level security, and **synthetic** firm data (the app says so in the sidebar).

> Models write prose containing `{{fact_id}}` tokens; code substitutes the numbers. A validator rejects any digit outside a token. The agent drafts — a human sends. See `CLAUDE.md` for the engineering rules.

## Run it locally

Requires Node 22+.

```bash
npm install
cp .env.example .env.local     # then fill in the values below
npm run dev                    # http://localhost:3000
```

Pick a persona on the login screen (sales, desk head, compliance, admin). Try **Aisha Rahman** first.

### Environment variables (`.env.local`)

| Variable | Needed? | Notes |
|---|---|---|
| `DATABASE_URL` | for Supabase | Supabase → Connect → **Transaction pooler** string, with the DB password. Leave empty to use the embedded database in `.data/`. |
| `OPENAI_API_KEY` | optional | Empty → the built-in template writer is used. Set → an LLM writes the prose, every output is validated, and any field that fails falls back to the template. |
| `OPENAI_MODEL` | optional | Default `gpt-6-luna`. Check **Pipeline → health** (or `/api/health`) to confirm the key can see the model. |
| `SESSION_SECRET` | yes for non-dev | 32+ random chars, e.g. `openssl rand -hex 32`. |
| `DEMO_CONTROL_PIN` | optional | 6-digit PIN for the admin Demo control page. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | optional | Not required by the current screens. |

With **no** variables at all the app still runs end to end: it boots an embedded Postgres, seeds the synthetic firm, and runs the pipeline on first load.

### Against Supabase

Migrations are applied automatically (in order, under an advisory lock) when the app starts against Supabase; the synthetic world is seeded once and re-seeded when its version changes. With `DATABASE_URL` set:

```bash
npm run brief        # run the morning pipeline against that database
npm run dev
```

### Commands

`npm run typecheck` · `npm run lint` · `npm test` · `npm run db:local` · `npm run db:reset` · `npm run brief` · `npm run dev`

## The screens

| Who | Screen | What it shows |
|---|---|---|
| Salesperson | Today, Morning brief, Call list, Clients | The ranked calls, the spec-style brief (snapshot, S&P 500 chart, Catalysts, sections), client 360 |
| Salesperson | Agent | Chat with threads and history; step trace, sources behind every figure, drafts you copy or open in your own mail app (never sent) |
| Salesperson | Brief setup | Sectors, products, what to include, delivery and send time; applies from the next business day |
| Desk head, admin, compliance | Morning run | The whole morning in time-lapse (about 90 s): live simulated ET clock, 5 stages and 17 steps, feed map, logs, outage / QC-hold / model controls, results, history |
| Operations | Data feeds | 14 simulated connectors: health against SLA, rows, latency, payload sample, dependent sections, what the firm provides to go live |
| Operations | QC review | 8 automated checks per brief plus a simulated spot-check; hold or release a brief |
| Operations | Deliveries | Dashboard and email-digest deliveries with an isolated email preview; held briefs |

Salespeople never see the operations screens in real life; the demo shows them so the whole pipeline is transparent. See `docs/DEMO.md` for a 2-minute walkthrough.

## What is simulated

Prices, earnings dates, the macro calendar and every headline are **placeholders** from a market simulator (headlines are flagged `simulated`). Briefs are stamped 06:30 ET on the business date (`DEMO_BUSINESS_DATE` overrides it). A live market-data adapter is required before showing this as real.

Also placeholders: company names are fictional and may collide with real ones; index labels (S&P 500, Nasdaq 100, Russell 2000, Dow) are applied to synthetic data; the email relay is simulated and nothing is ever sent to a client; Fed dates and speakers are invented. With no model key configured the template writer produces all prose; with one, results are cached (`llm_cache`) so a rerun is instant.
