import { uid } from '../util/id';
import type { Q } from '../db/types';
import { getMarketProvider } from '../market';
import type { InstrumentRef } from '../market/types';
import { defaultScenarios, scenarioByKey } from '../market/scenarios';

export async function loadInstrumentRefs(q: Q): Promise<InstrumentRef[]> {
  const rows =
    await q(`select i.id, i.symbol, i.name, i.asset_class, i.sector, i.unit, i.decimals, (i.meta->>'vol')::float8 vol,
      (select close from market_bars b where b.instrument_id = i.id order by d desc limit 1) prev_close
    from instruments i`);
  return rows.map((r) => ({
    id: String(r.id),
    symbol: String(r.symbol),
    name: String(r.name),
    assetClass: r.asset_class as InstrumentRef['assetClass'],
    sector: (r.sector as string) ?? null,
    unit: r.unit as InstrumentRef['unit'],
    decimals: Number(r.decimals),
    prevClose: Number(r.prev_close),
    vol: Number(r.vol),
  }));
}

/** Pull the premarket tape and overwrite today's quotes. Returns the rows written. */
export async function ingestMarket(q: Q, businessDate: string, scenarios: string[]) {
  const provider = getMarketProvider();
  const refs = await loadInstrumentRefs(q);
  const quotes = await provider.quotes(businessDate, refs, { scenarios });
  await q(
    `insert into market_quotes (instrument_id, as_of, last, prev_close, chg, source)
     select (x->>'id')::uuid, (x->>'asOf')::timestamptz, (x->>'last')::numeric, (x->>'prev')::numeric, (x->>'chg')::numeric, x->>'source'
     from jsonb_array_elements($1::jsonb) x
     on conflict (instrument_id) do update set as_of = excluded.as_of, last = excluded.last, prev_close = excluded.prev_close, chg = excluded.chg, source = excluded.source`,
    [
      JSON.stringify(
        quotes.map((x) => ({
          id: x.instrumentId,
          asOf: x.asOf.toISOString(),
          last: x.last,
          prev: x.prevClose,
          chg: x.chg,
          source: x.source,
        })),
      ),
    ],
  );
  const moved = quotes
    .map((x) => ({ x, r: refs.find((r) => r.id === x.instrumentId)! }))
    .filter(({ x, r }) => Math.abs(x.chg) / r.vol >= 1)
    .sort((a, b) => Math.abs(b.x.chg) / b.r.vol - Math.abs(a.x.chg) / a.r.vol);
  return {
    provider: provider.name,
    rows: quotes.length,
    movers: moved.slice(0, 6).map(({ x }) => x.symbol),
    moverCount: moved.length,
  };
}

/** Narrative events for the day's storyline. Deterministic ids, so a rerun replaces rather than duplicates. */
export async function ingestNews(q: Q, businessDate: string, scenarios: string[]) {
  await q(
    `delete from events where business_date = $1 and source_label = 'Simulated newswire' and kind in ('news','macro','flow')`,
    [businessDate],
  );
  const rows: Record<string, unknown>[] = [];
  for (const key of scenarios.length ? scenarios : defaultScenarios(businessDate)) {
    const sc = scenarioByKey(key);
    if (!sc) continue;
    sc.events.forEach((e, idx) => {
      const hh = String(e.hour).padStart(2, '0');
      const mm = String((idx * 17 + 5) % 60).padStart(2, '0');
      rows.push({
        id: uid(`news:${businessDate}:${key}:${idx}`),
        kind: e.kind,
        title: e.title,
        summary: e.summary,
        at: `${businessDate}T${hh}:${mm}:00-04:00`,
        sector: e.sector ?? null,
        tags: e.tags,
        severity: e.severity,
      });
    });
  }
  if (rows.length) {
    await q(
      `insert into events (id, business_date, kind, title, summary, occurred_at, sector, tags, severity, entitlement, simulated, source_label)
       select (x->>'id')::uuid, $2::date, x->>'kind', x->>'title', x->>'summary', (x->>'at')::timestamptz, nullif(x->>'sector',''),
              array(select jsonb_array_elements_text(x->'tags')), (x->>'severity')::smallint, 'public', true, 'Simulated newswire'
       from jsonb_array_elements($1::jsonb) x`,
      [JSON.stringify(rows), businessDate],
    );
  }
  return { events: rows.length, scenarios };
}
