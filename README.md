# Morning Brief

A private market-intelligence workspace for salespeople. Current US-day publisher reporting is matched to database-backed client holdings, with client, stock, topic and search filters, in-dashboard reading, potential-effects analysis, a floating assistant and version-bound PDF exports.

Live screens use the supplied anonymized workbook and verified public evidence. They do not use the legacy simulator. Today, call-list and operations workflows are retired.

## Local use

Requires Node 22+. Set server configuration in .env or .env.local; see .env.example. Do not print or share the contents of those files.

PowerShell:

    npm install
    npm run clients:import -- "C:\Users\Mridul\Downloads\Sample Data.xlsx"
    npm run live:refresh -- --feeds-only
    npm run live:refresh -- --market-only
    npm run dev

The import is idempotent and preserves original workbook values. It maps three clients and five holdings to two salespeople. Currency, valuation date and financial field units are not inferred; imported values do not become calculated exposure or P&L.

Local sign-in offers active imported salespeople. Production requires configured Supabase authentication with mapped user identities or a private pilot access code of at least sixteen characters. Production never exposes an open persona picker.

## News, reading and summaries

Collection checks nineteen original publisher feeds covering business, technology, finance, energy, the economy, investing, earnings, politics and relevant world regions. Admission requires a trusted publisher, an explicitly zoned publication date within the current US day, a safe original URL and a material company or market topic. Sponsored, future-dated and clearly unrelated items are excluded. Similar event headlines are grouped with additional source attribution.

Client selection changes the authorized book first. Stock filters also narrow the holdings shown in news effects. Effects show conditional business or market channels and supporting evidence to check; they do not assert a verified price reaction or calculate returns. There is no automatic sending or trading.

Headlines open an accessible dashboard modal. Original article text is displayed only for sources with confirmed full-text redistribution rights configured in NEWS_FULL_TEXT_HOSTS. Configuration is an assertion of existing rights, not a license. These sources must also pass the independent network allowlist, original-document date checks and supported article-body extraction. Complete supported text is not silently clipped to a short briefing. An unavailable or unsupported source remains clearly labeled as an excerpt. Previously cached expanded briefings are preserved and explicitly distinguished from complete original reporting.

Summarize opens a labeled bullet-point panel above the reading content. It covers the text available in that reader, with main developments, material facts, timing, context, reported implications and caveats. An excerpt cannot support a complete-article summary and the UI says so. Summary generation is on demand, validated and shared in a source/evidence cache; opening an article does not make an AI call. A summary is an aid to reading, not a guarantee that no detail can be missed.

Full original publisher articles remain a rollout dependency: connect an authorized full-text source. Public availability of a website or RSS feed is insufficient permission to redistribute its complete articles in a commercial product. A licensed provider API may require its own adapter; the existing full-text reader supports authorized original HTML.

## Market freshness

Every snapshot retains its observation date and source link. Cash-index quotes before the regular US session can legitimately be the previous close. Treasury par yields and the configured Cboe VIX source are daily observations; they are not live intraday feeds. Commodity futures are delayed public quotes and retain their own observation times. Fetch time never replaces observation time.

If a source fails, the last verified value is retained with its real date. There is no synthetic replacement.

## Background execution and deployment

Recurring work uses QStash HTTP delivery and a durable Postgres queue, not an in-process node-cron loop. Jobs have unique scheduling keys, leases, bounded concurrency, retry backoff and stale-lease recovery. Market/public-feed scheduling uses five-minute slots. AI discovery is eligible on a separate interval, only if feed coverage is sparse, and under a daily call cap. Model discovery receives public security names only, never client positions.

Set APP_URL to the actual deployed HTTPS origin, configure both QStash signing keys, then run:

    npm run schedule:setup

Until that command succeeds for a deployed origin, production autonomous refreshing is not active. A local one-shot refresh is not a scheduler. Vercel Hobby's daily cron cannot provide this cadence, and commercial hosting needs an eligible plan.

## Assistant and privacy

The floating assistant uses the selected report, client and news filters. Simple holdings and briefing requests use deterministic source-backed answers. Complex requests may use OpenAI under a per-person usage cap; failures return an honest source-backed fallback. No paid model probes run through the health check.

Every private-data read uses row-level security. Reports, chat, search, article detail and PDF export recheck ownership and current coverage. Report evidence changes and revoked client assignments invalidate old authorized views.

Models write numerical fact tokens. Code substitutes original expressions only after validation; model-generated unsupported figures are rejected.

## Commands and verification

    npm run typecheck
    npm run lint
    npm test
    npm run build
    npm run demo:check

Useful bounded refresh modes:

    npm run live:refresh -- --publish-only
    npm run live:refresh -- --feeds-only
    npm run live:refresh -- --market-only

These three modes make no OpenAI calls. Tests use fixtures and do not spend paid model tokens. PDF exports use the selected immutable report and the same client/news filters; they contain report content, not separately opened article-reader content or chat conversations.

Legacy simulator code remains for historical regression tests. Do not use legacy pipeline scripts for live product data.
