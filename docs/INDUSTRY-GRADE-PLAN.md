# Morning Brief: industry-grade upgrade plan

Prepared October 9, 2026. Target: a sales-desk product a firm like Cantor Fitzgerald would put in front of its
salespeople. Each morning it should produce a desk-quality brief like the *Outsourced Trading Morning Brief*
(reference screenshots, 9 Oct 2026). It should also answer trader questions like a senior sales analyst would.

The CLAUDE.md rules still apply. The LLM never writes numbers. Every value carries a source and timestamp.
Every read of user data runs through `db.asUser`. Humans send everything.

---

## 0. Where we are today

| Area | Today | Gap |
| --- | --- | --- |
| Market snapshot | Correct, live quotes | Keep. Add the reference strip: Euro equities, Brent, Gold, Bitcoin, UST 10y in bp |
| News | `src/lib/live/feeds.ts` reads 19 RSS feeds (CNBC, BBC, Fed) and filters by keyword | Too few sources and stories. No clustering, no ranking, no macro calendar, no "since the close" window |
| Brief layout | Card list in `components/live/*` | The output should be an editorial brief: key events, wrap, regions, rates, credit, eco data, headlines, chart |
| Chat | `lib/live/assistant.ts` makes a single Responses call with a long system string | No intent routing, tools, retrieval, persona or edge-case handling, which is why answers come out vague |
| Client filter | Dropdown exists | Holdings union drives relevance only through keywords. There is no exposure mapping (sector, supplier, competitor, factor) |
| Typography | Inter + JetBrains Mono | Looks generic. No serif display face and an inconsistent spacing scale |
| Charts | `components/brief/spx-chart.tsx` is synthetic | No real intraday charts |

---

## 1. Design system and UI polish (week 1)

**Fonts.** Anthropic uses **Styrene B** (Commercial Type) for UI text and **Tiempos** (Klim) for serif text. Both are
commercial fonts and need a paid web licence. Plan:
- If the budget allows, license *Styrene B* and *Tiempos Text/Headline* and self-host them under `public/fonts` with `next/font/local`.
- Otherwise use free fonts with the same feel. **Inter Tight** or **Geist** stand in for Styrene, and **Source Serif 4** for Tiempos. Keep **JetBrains Mono** for tickers.
- Set the tokens in `globals.css` (`--font-sans`, `--font-serif`, `--font-mono`) so the swap is a one-line change.

**Grid and rhythm.**
- Use a 4 px spacing scale, a 12-column layout with a 1200 px max content width, and a fixed 240 px sidebar.
- Set a type scale of 12 / 13 / 14 / 16 / 20 / 28 / 36 with 1.45 body line height.
- Every number gets `font-variant-numeric: tabular-nums` and is right-aligned (already in the definition of done). Colour moves with the semantic tokens `--up` and `--down`. Rule 4 sets the units: bp for yields and indices, % for stocks.
- Audit every screen against `src/components/ui`. Remove ad-hoc Tailwind and add the missing primitives: `DataTable`, `Section`, `Stat`, `Sparkline`, `Tabs`, `Skeleton`.
- Dense desk mode and comfortable mode toggle. Light and dark themes are both tested.
- Visual regression: extend `npm run shots` (Playwright) to snapshot every screen in 3 states × 2 themes × 2 widths.

**Brief page layout** (mirrors the Cantor email):
1. Header band: brand, title, date, data cutoff and "as of" time.
2. **Key events today**: 5–7 bullets, each with tickers and moves.
3. **Snapshot strip**: S&P, Dow, Nasdaq, Russell, Euro Stoxx, Brent, Gold, BTC, UST 10y.
4. **Market wrap**: 3–4 paragraphs.
5. **Overnight chart**: ES / NQ futures, real intraday data (section 4).
6. Asia · Europe · European bonds · US rates · Credit · FX/Commodities.
7. **Economic data (ET)** table: time, release, est., prior.
8. **Headlines since the close**: 20–30 stories grouped by theme (AI/Tech, Energy/Oil, Geopolitics/War, Rates/Fed, Earnings, M&A, Regulation, Crypto). Each story has a "Your clients" badge where it touches the holdings union.
9. **Client impact panel**: per client and account, which stories touch which position, with Long/Short direction shown.

---

## 2. News and intelligence engine (weeks 1–3)

Goal: 150–400 candidate items per morning, reduced to 20–30 ranked, de-duplicated, client-relevant stories.

**2.1 Sources** (`src/lib/live/sources/*`, one adapter per provider, all returning a single `Evidence` type)

| Tier | Source | Use |
| --- | --- | --- |
| Primary wire (paid, recommended) | Benzinga Pro / Dow Jones Newswires / Reuters via LSEG | Real-time, licensed headlines. This is what desks actually use |
| Mid-tier API | Polygon.io news, Finnhub, Marketaux, Tiingo | Ticker-tagged news with publish time |
| Public RSS (existing + expanded) | CNBC, BBC, Reuters business, FT/WSJ headlines, Bloomberg markets RSS, MarketWatch, Yahoo Finance per-ticker | Breadth |
| Primary documents | SEC EDGAR (8-K, 6-K, 13D/G, S-1), Fed, ECB, BoE, Treasury, OPEC, EIA, BLS, BEA | Ground truth for macro and corporate events |
| Calendars | Econ calendar API (Trading Economics / Finnhub), earnings calendar (Polygon/Finnhub) | Fills the Economic Data table and the "before the open" bullets |
| AI web search | OpenAI Responses `web_search` tool | Gap-fill only. Every hit is then fetched and verified against its original publisher (rule 6) |

**2.2 Processing pipeline** (`src/lib/live/intel/`)
1. **Ingest** on a schedule: every 5 min from 04:00 to 09:30 ET, then every 15 min. The window is "since prior US close".
2. **Normalize and dedupe**: canonical URL plus SimHash of the title. **Cluster** with embeddings (`text-embedding-3-large`) so that one event equals one story with N sources.
3. **Entity extraction**: tickers, companies, sectors, countries, commodities, central banks. Use a structured-output LLM call, checked against a symbol master (provider reference data).
4. **Exposure graph** (new table `exposure_edges`): links each holding to its sector, peers, key suppliers and customers, index membership, factor, and commodity sensitivity. Example: NVDA links to TSMC, AMD, hyperscaler capex, export controls, SOX, and the AI theme. The graph is seeded from provider data and curated, not invented by the LLM at runtime.
5. **Scoring**: `score = market_impact × recency × source_tier × client_relevance × novelty`.
   - *market_impact* comes from an LLM classifier (enum: high / medium / low) plus the observed price reaction of the tagged instruments.
   - *client_relevance* is graph distance from the holdings union of the selected client filter.
   - Always include the top macro and geopolitical stories (war, oil, Fed, big AI announcements) even with no direct holding match. These form the "market moving" lane.
6. **Select** 20–30 stories with diversity caps per theme. Persist each one with its `evidence_hash`, `source` and `as_of`.

**2.3 Brief writing.** Each section is written by the LLM as templated prose with `{{fact_id}}` tokens. Facts come from quotes, calendars and evidence. The output must pass `validator.ts`. If a section fails twice it falls back to the deterministic template. All writing runs per salesperson under `asUser`.

**2.4 Quality bar.** Build a golden set of 20 historical mornings with desk-written briefs and score each run on:
- recall of key events,
- false-relevance rate,
- validator pass rate,
- source freshness.

Run it in CI as `npm run eval:brief`.

---

## 3. Senior sales-analyst assistant: harness layer (weeks 2–4)

Replace the single call in `lib/live/assistant.ts` with a harness in `src/lib/ai/harness/`.

**3.1 Pipeline per question**
1. **Guard**: detect prompt injection in sources, out-of-scope requests (personal advice, other salespeople's clients, sending to clients), and empty-data days.
2. **Intent router** (small, fast model, structured output): `market_move_explain | client_impact | talking_points | compare | calendar | quote_lookup | definition | draft_note | out_of_scope`.
3. **Planner and tools** (Responses API function calling, max 6 steps). Every tool runs under `asUser`:
   - `get_quotes(symbols)`, `get_intraday(symbol, range)`
   - `search_evidence(query, since)` (vector + keyword over today's stories)
   - `get_client_book(clientId?)`, `get_exposure(symbol)`
   - `get_calendar(date)`, `get_earnings(symbols)`
   - `fetch_article(id)`, which uses the existing `article-reader.ts`
4. **Composer**: the senior sales-analyst persona. It works lead-first: the answer goes in the first line, followed by 3–5 supporting bullets, client angle (Long/Short aware), what to watch, and sources. The tone is desk shorthand, not chatbot.
5. **Verifier**: runs the numeric validator and checks that every claim cites a story ID or fact ID. If no data supports an answer, the reply says so explicitly ("No verified print yet for X; last seen …") instead of guessing.

**3.2 Edge cases to cover with tests**
- Market closed or holiday.
- Pre-market with stale quotes.
- Ticker not covered.
- Ambiguous names ("Apple" the company vs. AAPL vs. Apple Hospitality).
- A client the user doesn't own.
- Conflicting sources.
- Story older than today.
- Requests for buy/sell advice or a price target.
- A request to email the client (draft only, rule 5).
- Unknown workbook units.
- Non-English input.
- Very long threads (summarise memory).
- Provider outage, where the reply degrades with a notice and never fabricates.

**3.3 Evaluation.** 150 scripted Q&A cases (`tests/assistant.eval.ts`) graded by rubric:
- factual grounding,
- citation,
- refusal correctness,
- tone,
- latency under 6 s at p95.

Responses are streamed over SSE (reuse `lib/agent/sse.ts`).

---

## 4. Real charts (week 3)

- **Data**: intraday OHLC from Polygon.io / Finnhub / Twelve Data (futures ES/NQ via CME data vendor or proxy SPY/QQQ until licensed). Bars are stored with `source` and `as_of`.
- **Rendering**: TradingView **Lightweight Charts** (Apache-2.0) for the web.
  - Charts: overnight futures, per-holding sparklines, Brent/Gold/10y mini-charts.
  - PDF export: render the same chart server-side to PNG with Playwright and embed it via `pdf-lib`.
- Embedding third-party TradingView widgets is acceptable for UI only. They cannot go in the PDF because the data isn't ours to timestamp.
- Replace the synthetic `components/brief/spx-chart.tsx`.

---

## 5. Client filtering (week 2)

- Brief filter: **All my clients** (union) → one client → one account. Changing the filter re-ranks stories, recomputes the client-impact panel, and recomputes key-event ordering without a refetch (the scoring is cached).
- Each story shows *why* it matched, for example "NVDA · supplier TSMC · AI capex theme".
- Saved salesperson focus themes act as extra weights.
- The PDF export stays bound to the exact version, filter, and cutoff, as the existing implementation does.

---

## 6. Platform and operations

- Scheduling: QStash cron for ingest and brief generation. The brief is regenerated incrementally when a high-impact story lands.
- New tables (migration `0013+`): `evidence_clusters`, `entities`, `exposure_edges`, `intraday_bars`, `econ_calendar`, `assistant_traces`, `eval_runs`.
- Observability: trace every assistant turn and pipeline step (latency, tokens, tool calls, validator rejections) on a QC page.
- Cost controls: prompt caching, a cheap model for routing and classification, and the strong model for composing only.
- Security: per-provider keys in env vars, row-level security on all new tables, audit log on exports.

---

## 7. Phasing and acceptance

| Phase | Weeks | Done when |
| --- | --- | --- |
| 1. Design system + brief layout | 1–2 | All screens on primitives, new fonts, Playwright snapshots green, brief matches reference section order |
| 2. News engine | 1–3 | ≥150 candidates/morning, 20–30 published, golden-set recall ≥ 85%, 0 validator bypasses |
| 3. Assistant harness | 2–4 | 150-case eval ≥ 90% pass, every edge case above has a test |
| 4. Real charts + PDF | 3 | Overnight chart and sparklines from real bars, rendered in the PDF |
| 5. Hardening | 4–5 | Load test, provider-outage drills, typecheck, lint and tests green |

## 8. Decisions needed from the business

1. Font licensing: Styrene + Tiempos (paid) vs. the free equivalents.
2. News vendor budget: a licensed wire (Benzinga / Dow Jones / LSEG) vs. API tier only.
3. Futures data licence for the ES/NQ overnight chart.
4. Confirmation of workbook units and currency, which unlocks exposure-weighted relevance.
