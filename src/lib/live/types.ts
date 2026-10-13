export type Metric = {
  key: string;
  label: string;
  group: string;
  unit: string;
  value: number | null;
  previous: number | null;
  observedDate: string | null;
  observedAt: string | null;
  fetchedAt: string | null;
  source: string | null;
  url: string | null;
  cadence: 'daily' | 'delayed';
  note: string;
};
export type Holding = {
  id: string;
  clientId: string;
  client: string;
  accountId: string;
  account: string;
  fund: string;
  symbol: string;
  direction: 'Long' | 'Short';
  quantity: string;
  currentValue: string;
  initialValue: string;
  spread: string;
  margin: string;
  currency: string | null;
  valuationDate: string | null;
};
export type Article = {
  id: string;
  url: string;
  title: string;
  publisher: string;
  publishedAt: string;
  eventDate: string;
  verifiedAt: string;
  evidenceHash: string;
  symbols: string[];
  topics: string[];
  excerpt: string;
  summaryTemplate: string | null;
  verification: string;
};
export type Story = Article & {
  matches: { clientId: string; client: string; symbol: string; direction: string; reason: string }[];
  reason: string;
  category: 'company' | 'industry' | 'macro';
  score: number;
  importance?: number;
  relatedSources?: { id: string; title: string; url: string; publisher: string; publishedAt: string }[];
};
export type Client = { id: string; name: string; accounts: number; holdings: number; symbols: string[] };
export type Preferences = { sectors: string[]; symbols: string[]; timezone: string };
/** Brief setup display choices. They narrow what is shown, never what is published; an empty list shows everything. */
export type Focus = { clients: string[]; topics: string[]; symbols: string[] };
export const NO_FOCUS: Focus = { clients: [], topics: [], symbols: [] };
export type Report = {
  id: string;
  profileId: string;
  salesperson: string;
  clientId: string | null;
  clientName: string;
  businessDate: string;
  cutoff: string;
  coverageHash: string;
  holdings: Holding[];
  metrics: Metric[];
  articles: Story[];
  sources: { key: string; at: string; ok: boolean; accepted: number; detail: string }[];
  preferences: Preferences;
  coverage: string[];
  desk?: DeskNote | null;
  archived?: boolean;
};
export type DeskNote = {
  generatedAt: string;
  method: 'model' | 'template';
  keyEvents: { text: string; storyIds: string[] }[];
  wrap: string[];
  sections: { title: string; text: string; storyIds: string[] }[];
  /** Sources the note cites that are not among this person's stories. Looked up when the brief is read, never stored. */
  cited?: Citation[];
};
export type Citation = { id: string; title: string; url: string; publisher: string; publishedAt: string };
export type Filters = { q: string; topic: string; symbol: string };
export const EMPTY_FILTERS: Filters = { q: '', topic: '', symbol: '' };
export const METRICS = [
  ['SPX', 'S&P 500', 'Equities', 'index'],
  ['NDX', 'Nasdaq 100', 'Equities', 'index'],
  ['RUT', 'Russell 2000', 'Equities', 'index'],
  ['DJI', 'Dow', 'Equities', 'index'],
  ['UST10Y', '10Y Treasury par yield', 'Rates & credit', 'yield'],
  ['UST2Y', '2Y Treasury par yield', 'Rates & credit', 'yield'],
  ['SX5E', 'Euro Stoxx 50', 'Equities', 'index'],
  ['VIX', 'VIX', 'Risk & commodities', 'level'],
  ['BRENT', 'Brent crude futures', 'Risk & commodities', 'USD/barrel'],
  ['BTC', 'Bitcoin', 'Risk & commodities', 'USD'],
  ['GOLD', 'Gold', 'Risk & commodities', 'USD/oz'],
  ['SILVER', 'Silver', 'Risk & commodities', 'USD/oz'],
  ['WTI', 'WTI spot crude', 'Risk & commodities', 'USD/barrel'],
] as const;
export const TOPICS = [
  'Markets',
  'Rates',
  'Credit',
  'Geopolitics',
  'Oil',
  'Energy',
  'Commodities',
  'AI',
  'Semiconductors',
  'Cloud',
  'Earnings',
  'Deals',
  'Launches',
  'Regulation',
  'Trade',
  'Banks',
  'Defense',
  'Healthcare',
  'Consumer',
  'Retail',
  'Automotive',
  'Telecom',
  'Media',
  'Crypto',
] as const;
