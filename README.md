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

Migrations `0001`–`0004` are already applied to the *Morning Brief* project and seeded. With `DATABASE_URL` set:

```bash
npm run brief        # run the morning pipeline against that database
npm run dev
```

### Commands

`npm run typecheck` · `npm run lint` · `npm test` · `npm run db:local` · `npm run db:reset` · `npm run brief` · `npm run dev`

## What is simulated

Prices, earnings dates, the macro calendar and every headline are **placeholders** from a market simulator (headlines are flagged `simulated`). Briefs are stamped 06:30 ET on the business date (`DEMO_BUSINESS_DATE` overrides it). A live market-data adapter is required before showing this as real.
