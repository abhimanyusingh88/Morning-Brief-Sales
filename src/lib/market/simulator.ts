import { rngFor } from "../util/rng";
import { etInstant } from "../util/time";
import { defaultScenarios, scenarioByKey, type Override } from "./scenarios";
import type { InstrumentRef, MarketDataProvider, Quote } from "./types";

function matches(o: Override, i: InstrumentRef): boolean {
  if (o.symbols) return o.symbols.includes(i.symbol);
  if (o.assetClass && o.assetClass !== i.assetClass) return false;
  if (o.sector) return o.sector === i.sector;
  return !!o.assetClass;
}

/** Natural overnight noise in native units (percent, bp or points). */
function baseMove(i: InstrumentRef, r: ReturnType<typeof rngFor>, mkt: number): number {
  const z = (k: number) => k * mkt + Math.sqrt(1 - k * k) * r.normal();
  switch (i.assetClass) {
    case "equity":
    case "index":
      return i.vol * 0.35 * z(0.55);
    case "fx":
    case "commodity":
      return i.vol * 0.4 * z(0.2);
    case "rates":
      return i.vol * 0.35 * r.normal();
    case "credit":
      return i.vol * 0.4 * z(-0.3);
    case "vol":
      return i.vol * 0.4 * z(-0.5);
  }
}

export class SimulatedProvider implements MarketDataProvider {
  readonly name = "sim-premarket";
  readonly simulated = true;

  async quotes(businessDate: string, instruments: InstrumentRef[], opts?: { scenarios?: string[] }): Promise<Quote[]> {
    const keys = opts?.scenarios?.length ? opts.scenarios : defaultScenarios(businessDate);
    const overrides = keys.flatMap((k) => scenarioByKey(k)?.overrides ?? []);
    const day = rngFor("mkt:" + businessDate);
    const mkt = day.normal();
    const asOf = etInstant(businessDate, 4, 0, 12); // pre-market snapshot taken as the 04:00 ET ingestion starts

    return instruments.map((i) => {
      const r = rngFor(`q:${businessDate}:${i.symbol}`);
      let chg = baseMove(i, r, mkt);
      for (const o of overrides) {
        if (matches(o, i)) chg = o.chg + (o.spread ?? 0) * (r.next() * 2 - 1);
      }
      let last: number;
      if (i.unit === "pct") last = i.prevClose * (1 + chg / 100);
      else if (i.assetClass === "rates") last = i.prevClose + chg / 100; // chg in bp, level in percent
      else last = i.prevClose + chg; // spreads in bp, vol in points
      return { instrumentId: i.id, symbol: i.symbol, last, prevClose: i.prevClose, chg, unit: i.unit, asOf, source: this.name };
    });
  }
}
