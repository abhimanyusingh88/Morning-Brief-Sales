/**
 * Every external dependency of the morning run, as a named connector. In this proof of concept each one is a
 * simulator behind the same interface a vendor adapter would implement; the Operations pages show each of them
 * (status, rows, latency, freshness against its SLA) exactly as they would be monitored in production.
 */
export type FeedCategory = "market" | "reference" | "news" | "calendar" | "corporate" | "client" | "compliance" | "delivery";

export interface FeedDef {
  key: string;
  name: string;
  category: FeedCategory;
  /** generic label; never a real vendor */
  vendor: string;
  transport: "REST" | "WebSocket" | "SFTP drop" | "Read replica" | "SMTP";
  endpoint: string;
  description: string;
  cadence: string;
  /** feed must have delivered by this ET time or its sections are withheld (the QC window opens 05:30) */
  slaTime: string;
  /** brief sections that depend on this feed */
  sections: string[];
  /** how stale (minutes before 04:00) the newest record may be and still count as fresh */
  maxAgeMin: number;
}

export const FEEDS: FeedDef[] = [
  { key: "mkt_snapshot", name: "Pre-market snapshot", category: "market", vendor: "Simulated market-data vendor", transport: "WebSocket", endpoint: "wss://premarket.feeds.sim/v3/stream",
    description: "Indices, volatility, metals, crude, Treasury yields, credit spreads and single-stock pre-market prints.", cadence: "Streaming from 04:00 ET", slaTime: "05:15", sections: ["snapshot", "chart", "movers", "catalysts"], maxAgeMin: 90 },
  { key: "idx_history", name: "Index daily-close history", category: "market", vendor: "Simulated market-data vendor", transport: "REST", endpoint: "https://history.feeds.sim/v2/bars?interval=1d",
    description: "Daily closes for the benchmark index; the last ten sessions drive the chart.", cadence: "Daily 04:00 ET", slaTime: "05:15", sections: ["chart"], maxAgeMin: 1440 },
  { key: "sector_perf", name: "Sector index performance", category: "market", vendor: "Simulated index provider", transport: "REST", endpoint: "https://sectors.feeds.sim/v1/performance",
    description: "Eleven sector indices (GICS-style), session change in percent.", cadence: "Daily 04:00 ET", slaTime: "05:15", sections: ["sector_lead_lag", "catalysts"], maxAgeMin: 120 },
  { key: "equity_ref", name: "Equity reference and classification", category: "reference", vendor: "Simulated reference-data vendor", transport: "SFTP drop", endpoint: "sftp://ref.feeds.sim/classification/latest.csv",
    description: "Sector, industry and product classification for every ticker, so each price move can be tagged.", cadence: "Daily 03:30 ET", slaTime: "04:30", sections: ["movers", "earnings", "news"], maxAgeMin: 1440 },
  { key: "futures_rates", name: "Futures, positioning and breadth", category: "market", vendor: "Simulated market-data vendor", transport: "REST", endpoint: "https://derivs.feeds.sim/v2/overnight",
    description: "Overnight index futures, breadth and volatility/positioning indicators used by the macro narrative.", cadence: "Daily 04:00 ET", slaTime: "05:15", sections: ["catalysts"], maxAgeMin: 120 },
  { key: "earnings_cal", name: "Earnings calendar", category: "calendar", vendor: "Simulated calendar vendor", transport: "REST", endpoint: "https://calendar.feeds.sim/v2/earnings?range=week",
    description: "Companies reporting this week with day and timing (before open / after close).", cadence: "Daily 04:00 ET", slaTime: "05:15", sections: ["earnings"], maxAgeMin: 1440 },
  { key: "econ_cal", name: "Economic calendar", category: "calendar", vendor: "Simulated calendar vendor", transport: "REST", endpoint: "https://calendar.feeds.sim/v2/economic?range=day",
    description: "Scheduled data releases with consensus estimate and prior value.", cadence: "Daily 04:00 ET", slaTime: "05:15", sections: ["macro_fed"], maxAgeMin: 1440 },
  { key: "fed_cal", name: "Fed calendar and rate-path odds", category: "calendar", vendor: "Simulated public-calendar scraper", transport: "REST", endpoint: "https://policy.feeds.sim/v1/calendar",
    description: "Speakers today, the next data point ahead of a key release, next policy meeting and market-implied odds.", cadence: "Daily 04:00 ET", slaTime: "05:15", sections: ["macro_fed", "catalysts"], maxAgeMin: 1440 },
  { key: "news_agg", name: "News aggregation", category: "news", vendor: "Simulated news aggregator", transport: "WebSocket", endpoint: "wss://news.feeds.sim/v2/stream?tags=sector,ticker,product",
    description: "Overnight headlines with sector, ticker and product tags attached by the aggregator.", cadence: "Streaming from 20:00 ET", slaTime: "05:15", sections: ["news", "catalysts"], maxAgeMin: 360 },
  { key: "corp_actions", name: "Corporate actions", category: "corporate", vendor: "Simulated corporate-actions vendor", transport: "REST", endpoint: "https://corpactions.feeds.sim/v1/declarations",
    description: "New dividend declarations with amount and prior amount.", cadence: "Daily 04:00 ET", slaTime: "05:15", sections: ["dividends"], maxAgeMin: 1440 },
  { key: "index_cal", name: "Index rebalance calendar", category: "corporate", vendor: "Simulated index provider", transport: "REST", endpoint: "https://indexcal.feeds.sim/v1/events",
    description: "Reconstitution and rebalance dates for equity benchmarks.", cadence: "Daily 04:00 ET", slaTime: "05:15", sections: ["index_rebalance"], maxAgeMin: 1440 },
  { key: "crm_book", name: "CRM and trade positions", category: "client", vendor: "Firm CRM (simulated)", transport: "Read replica", endpoint: "postgres://crm-replica.internal.sim/book?role=readonly",
    description: "Coverage, positions, tickets and interaction history. Read through each salesperson's own permissions.", cadence: "Nightly 02:00 ET + intraday", slaTime: "04:45", sections: ["earnings", "cards"], maxAgeMin: 600 },
  { key: "restricted", name: "Restricted list and entitlements", category: "compliance", vendor: "Compliance system (simulated)", transport: "REST", endpoint: "https://compliance.internal.sim/v1/restricted",
    description: "Information-barrier list. Anything on it is withheld from every sales surface and every model prompt.", cadence: "Every 15 min", slaTime: "04:45", sections: ["all"], maxAgeMin: 60 },
  { key: "email_relay", name: "Outbound email relay", category: "delivery", vendor: "Mail relay (simulated)", transport: "SMTP", endpoint: "smtp://relay.internal.sim:587",
    description: "Delivers the email digest to each salesperson at their chosen send time. Nothing is ever sent to a client.", cadence: "On demand", slaTime: "06:00", sections: ["delivery"], maxAgeMin: 60 },
];

export const FEED_BY_KEY = new Map(FEEDS.map((f) => [f.key, f]));

/** Which feeds a section needs. A section whose required feeds are not healthy is withheld, never shown stale. */
export const SECTION_FEEDS: Record<string, { required: string[]; label: string }> = {
  snapshot: { required: ["mkt_snapshot"], label: "Markets snapshot" },
  chart: { required: ["idx_history", "mkt_snapshot"], label: "S&P 500 chart" },
  catalysts: { required: ["mkt_snapshot", "futures_rates"], label: "Catalysts" },
  sector_lead_lag: { required: ["sector_perf"], label: "Sector leaders and laggards" },
  movers: { required: ["mkt_snapshot", "equity_ref"], label: "Movers in your sectors" },
  earnings: { required: ["earnings_cal", "equity_ref"], label: "Earnings this week" },
  news: { required: ["news_agg"], label: "Breaking news" },
  macro_fed: { required: ["econ_cal", "fed_cal"], label: "Macro and economic releases" },
  dividends: { required: ["corp_actions"], label: "Dividend announcements" },
  index_rebalance: { required: ["index_cal"], label: "Index rebalance" },
};
