-- Morning Brief build spec: feeds, QC, delivery, preference history, sector performance, LLM cache.
-- Also swaps real-company names in the equity universe for fictional ones (placeholder prices must never
-- be attached to real issuers). Ids are derived from the ORIGINAL symbol, so existing positions stay valid.
-- After this runs the app re-seeds the synthetic world once (firm_settings.world_version) so that CRM notes
-- and calendar titles pick up the new names.

alter table public.firm_settings add column if not exists world_version int not null default 1;

-- ---------------------------------------------------------------- fictional equity universe
update public.instruments i set symbol = m.sym, name = m.nm
from (values
  ('AAPL','ORBD','Orbis Devices'),         ('MSFT','NOVA','Nova Systems'),          ('ORCL','PLYT','Palytek'),
  ('CRM','CLDL','Cloudline Software'),     ('ADBE','ARCD','Arcadia Data'),
  ('NVDA','VSIL','Vector Silicon'),        ('AVGO','KSSL','Kessler Semi'),          ('AMD','HLXM','Helix Micro'),
  ('MU','QNTM','Quanta Memory'),           ('TSM','MRDF','Meridian Foundry ADR'),
  ('JPM','RDGB','Ridgeline Bancorp'),      ('GS','WCRW','Whitcombe and Rowe'),      ('MS','HTST','Hartwell Stanton'),
  ('BAC','CNFD','Continental Federal'),    ('C','PNCZ','Pinnacle Citizens'),        ('BLK','FNMT','Fenmore Trust'),
  ('LLY','VLTX','Valtrix Pharma'),         ('UNH','MHGP','Meridian Health Group'),  ('JNJ','CRWH','Carrow Health'),
  ('MRK','BRWL','Brightwell Labs'),        ('PFE','NRVN','Norvane Therapeutics'),
  ('XOM','GRPT','Granite Petroleum'),      ('CVX','LRKE','Larkspur Energy'),        ('COP','IRBR','Ironbridge Resources'),
  ('SLB','TDWL','Tidewell Services'),
  ('CAT','STNM','Stonehaven Machinery'),   ('GE','AWRS','Aerowright Systems'),      ('BA','SKYF','Skyforge Aerospace'),
  ('UNP','MPRL','Midland Pacific Rail'),   ('HON','CLDI','Calder Industrial'),
  ('AMZN','LRCH','Larchmont Retail'),      ('TSLA','VLTM','Voltara Motors'),        ('HD','HMSD','Homestead Supply'),
  ('NKE','STRD','Stride Athletics'),
  ('PG','EVWL','Everwell Brands'),         ('KO','CLSB','Clearspring Beverage'),    ('WMT','GRFM','Greenfield Markets'),
  ('COST','BLKW','Bulkway Wholesale'),
  ('NEE','BRGP','Brightgrid Power'),       ('DUK','TGUT','Tallgrass Utilities'),
  ('GOOGL','PTHF','Pathfinder Interactive'), ('META','LNKW','Linkwell Social'),     ('DIS','STLS','Starlight Studios')
) as m(old, sym, nm)
where i.symbol = m.old;

-- additions: Dow, silver, one more financial (earnings sample) and a Real estate sector (spec sector list)
insert into public.instruments (id, symbol, name, asset_class, sector, region, currency, unit, decimals, meta)
select app.uid('i:' || symbol), symbol, name, asset_class, sector, region, currency, unit, decimals,
       jsonb_build_object('base', base, 'vol', vol, 'beta', beta, 'sload', sload)
from (values
  ('DJI',  'US Blue Chip Index',         'index','Index','US','USD','pct',2, 46800::numeric, 0.75, 0.95, 0.0),
  ('XAG',  'Silver Spot',                'commodity','Metals','US','USD','pct',2, 46.5, 1.60, 0.10, 0.0),
  ('KORF', 'KOR Financial',              'equity','Financials','US','USD','pct',2, 62, 1.50, 1.10, 0.8),
  ('PKVR', 'Parkview Realty Trust',      'equity','Real estate','US','USD','pct',2, 118, 1.30, 0.80, 0.9),
  ('HRBP', 'Harborpoint Properties',     'equity','Real estate','US','USD','pct',2, 84, 1.40, 0.85, 0.9),
  ('SMLR', 'Summit Logistics REIT',      'equity','Real estate','US','USD','pct',2, 132, 1.20, 0.75, 0.9),
  ('EGRS', 'Evergreen Residential',      'equity','Real estate','US','USD','pct',2, 71, 1.25, 0.70, 0.9),
  ('CRLN', 'Crestline Office Trust',     'equity','Real estate','US','USD','pct',2, 39, 1.70, 0.95, 0.9),
  ('MDBS', 'Meadowbrook Storage',        'equity','Real estate','US','USD','pct',2, 156, 1.10, 0.65, 0.9)
) as t(symbol, name, asset_class, sector, region, currency, unit, decimals, base, vol, beta, sload)
on conflict (symbol) do nothing;

-- the seed function picks two names for the information-barrier example by symbol; follow the rename
do $$
declare def text;
begin
  def := pg_get_functiondef('app.seed_world(date)'::regprocedure);
  def := replace(def, $q$i.symbol in ('MU','UNP')$q$, $q$i.symbol in ('QNTM','MPRL')$q$);
  execute def;
end $$;

-- ---------------------------------------------------------------- columns on existing tables
alter table public.events add column if not exists products text[] not null default '{}';
alter table public.events add column if not exists feed_key text;

alter table public.brief_sections drop constraint if exists brief_sections_kind_check;
alter table public.brief_sections add constraint brief_sections_kind_check check (kind in (
  'overnight','macro','calendar','book','flow','risks',
  'snapshot','chart','catalysts','sector_lead_lag','movers','earnings','news','macro_fed','dividends','index_rebalance'));
alter table public.brief_sections add column if not exists data jsonb not null default '{}';
alter table public.brief_sections add column if not exists status text not null default 'ok' check (status in ('ok','unavailable'));
alter table public.brief_sections add column if not exists note text;

alter table public.brief_facts add column if not exists feed_key text;
alter table public.briefs add column if not exists qc_status text not null default 'pending' check (qc_status in ('pending','passed','flagged'));
alter table public.briefs add column if not exists data_status jsonb not null default '{}';

-- ---------------------------------------------------------------- feed registry and per-run feed health
create table if not exists public.feeds (
  key         text primary key,
  name        text not null,
  category    text not null check (category in ('market','reference','news','calendar','corporate','client','compliance','delivery')),
  vendor      text not null,
  description text not null,
  cadence     text not null,
  sla_time    time not null,
  sections    text[] not null default '{}',
  position    int not null default 0,
  simulated   boolean not null default true
);

create table if not exists public.feed_runs (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null references public.pipeline_runs(id) on delete cascade,
  feed_key    text not null references public.feeds(key),
  status      text not null check (status in ('running','ok','delayed','down')),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  rows        int not null default 0,
  latency_ms  int,
  as_of       timestamptz,
  detail      jsonb not null default '{}',
  sample      jsonb not null default '[]',
  log         text[] not null default '{}'
);
create index if not exists feed_runs_run on public.feed_runs (run_id);
create index if not exists feed_runs_feed on public.feed_runs (feed_key, started_at desc);

-- ---------------------------------------------------------------- sector index performance (GICS-style)
create table if not exists public.sector_perf (
  business_date date not null,
  sector        text not null,
  chg           numeric not null,          -- percent
  as_of         timestamptz not null,
  source        text not null,
  primary key (business_date, sector)
);

-- ---------------------------------------------------------------- preferences history (changes apply next business day)
create table if not exists public.brief_preferences (
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  effective_from date not null,
  sectors        text[] not null default '{}',
  products       text[] not null default '{}',
  include        jsonb  not null default '{}',
  delivery       text   not null default 'both' check (delivery in ('dashboard','email','both')),
  send_time      time   not null default '06:30',
  updated_at     timestamptz not null default now(),
  primary key (profile_id, effective_from)
);

-- ---------------------------------------------------------------- narrative inputs (futures, positioning, rate-path odds)
create table if not exists public.market_extras (
  business_date date not null,
  key           text not null,
  label         text not null,
  value         numeric,
  text_value    text,
  unit          text not null check (unit in ('pct','bp','level','text','count','date')),
  as_of         timestamptz not null,
  source        text not null,
  feed_key      text not null references public.feeds(key),
  primary key (business_date, key)
);

-- ---------------------------------------------------------------- agent threads: richer history
alter table public.chat_threads add column if not exists updated_at timestamptz not null default now();
alter table public.chat_threads add column if not exists client_id uuid references public.clients(id) on delete set null;
alter table public.chat_messages add column if not exists meta jsonb not null default '{}';

-- ---------------------------------------------------------------- QC and delivery
create table if not exists public.qc_reviews (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid references public.pipeline_runs(id) on delete cascade,
  brief_id    uuid references public.briefs(id) on delete cascade,
  profile_id  uuid references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('automated','spot_check')),
  status      text not null check (status in ('passed','flagged','pending')),
  checks      jsonb not null default '[]',
  reviewer    text,
  notes       text,
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz
);
create index if not exists qc_reviews_run on public.qc_reviews (run_id);

create table if not exists public.deliveries (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid references public.pipeline_runs(id) on delete cascade,
  brief_id      uuid references public.briefs(id) on delete cascade,
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  channel       text not null check (channel in ('dashboard','email')),
  status        text not null check (status in ('scheduled','delivered','simulated','failed')),
  scheduled_for timestamptz,
  delivered_at  timestamptz,
  to_address    text,
  subject       text,
  html          text,
  detail        jsonb not null default '{}'
);
create index if not exists deliveries_run on public.deliveries (run_id);
create index if not exists deliveries_profile on public.deliveries (profile_id, scheduled_for desc);

-- ---------------------------------------------------------------- model output cache (service only)
-- Reruns of an unchanged morning replay stored model output instead of paying for and waiting on it again.
create table if not exists public.llm_cache (
  hash              text primary key,
  model             text not null,
  response          text not null,
  prompt_tokens     int,
  completion_tokens int,
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------- row-level security
do $$
declare t text;
begin
  foreach t in array array['feeds','feed_runs','sector_perf','market_extras','brief_preferences','qc_reviews','deliveries','llm_cache'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

drop policy if exists read_all on public.feeds;
create policy read_all on public.feeds for select to authenticated using (true);
drop policy if exists read_all on public.market_extras;
create policy read_all on public.market_extras for select to authenticated using (true);
drop policy if exists read_all on public.sector_perf;
create policy read_all on public.sector_perf for select to authenticated using (true);

-- feed health is operational data: ops roles only (sales never see connectors)
drop policy if exists ops_read on public.feed_runs;
create policy ops_read on public.feed_runs for select to authenticated
  using (app.my_role() in ('desk_head','compliance','admin'));

drop policy if exists prefs_read on public.brief_preferences;
create policy prefs_read on public.brief_preferences for select to authenticated using (app.sees_profile(profile_id));
drop policy if exists prefs_ins on public.brief_preferences;
create policy prefs_ins on public.brief_preferences for insert to authenticated with check (profile_id = app.me());
drop policy if exists prefs_upd on public.brief_preferences;
create policy prefs_upd on public.brief_preferences for update to authenticated using (profile_id = app.me()) with check (profile_id = app.me());

drop policy if exists qc_read on public.qc_reviews;
create policy qc_read on public.qc_reviews for select to authenticated
  using (app.my_role() in ('desk_head','compliance','admin') and (profile_id is null or app.sees_profile(profile_id)));
drop policy if exists qc_upd on public.qc_reviews;
create policy qc_upd on public.qc_reviews for update to authenticated
  using (app.my_role() in ('compliance','admin')) with check (app.my_role() in ('compliance','admin'));

drop policy if exists deliveries_read on public.deliveries;
create policy deliveries_read on public.deliveries for select to authenticated using (app.sees_profile(profile_id));
-- llm_cache: RLS on, no policy => invisible to signed-in users

grant select, insert, update on public.feeds, public.feed_runs, public.sector_perf, public.market_extras, public.brief_preferences, public.qc_reviews, public.deliveries to authenticated;
grant all on public.feeds, public.feed_runs, public.sector_perf, public.market_extras, public.brief_preferences, public.qc_reviews, public.deliveries, public.llm_cache to service_role;
