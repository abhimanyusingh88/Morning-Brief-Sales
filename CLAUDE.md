# Morning Brief — engineering rules

Product: a per-salesperson AI desk agent for a trading firm. Every morning it ranks "who to call",
explains why now, and drafts what to say, using only that salesperson's own book.
This repo is the proof-of-concept build: real pipeline, real database, synthetic firm data.

## Non-negotiable rules
1. **The LLM never produces numbers.** Models write prose containing `{{fact_id}}` tokens. Code
   substitutes the formatted value. `src/lib/ai/validator.ts` rejects any digit outside a token.
   Never bypass it, never loosen it to make a test pass.
2. **Every query on user data runs under row-level security.** Use `db.asUser(profileId, ...)`.
   `db.asService()` is for the pipeline and admin routes only. Never pass client data to a model
   that was read through `asService`.
3. **Every value carries source and timestamp** (`market_quotes.source/as_of`, fact `source/as_of`).
4. **Units are fixed per instrument type.** Stock, sector and commodity moves are percent. Yields and credit spreads are basis points. Equity *index* moves in the markets snapshot are basis points, as the Build Specification (3.1) and the sample brief show; VIX is level plus percent. Never mix units within an instrument type.
5. **The agent drafts; the human sends.** No code path sends anything to a client.
6. **No real publisher names, no Bloomberg marks, no real people.** Simulated headlines are marked
   `simulated = true` and carry a generic source label.
7. Secrets only in env vars. Never commit `.env*` (except `.env.example`). Never log keys.

## Layout
- `supabase/migrations/` — SQL, applied in order. Test locally with `npm run db:local` (embedded Postgres).
- `src/lib/db` — `Db` interface: postgres.js in production, PGlite when `DEV_DB=pglite`.
- `src/lib/market` — provider interface + simulator. `src/lib/pipeline` — steps and orchestrator.
- `src/lib/ai` — facts, writer (template + LLM), validator, gateway, chat tools.
- `src/components/ui` — design-system primitives. Screens must use these, not ad-hoc styles.

## Commands
`npm run typecheck` · `npm run lint` · `npm test` · `npm run db:local` · `npm run dev`

## Definition of done for any change
Typecheck, lint and tests green; new endpoint has a test; new screen has loading, empty and error
states; numbers are right-aligned tabular; nothing hard-codes a persona's data.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
