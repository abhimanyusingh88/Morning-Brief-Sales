-- Morning Brief: core schema
-- Conventions: uuid pks, timestamptz, text + check constraints (no enums, easier to evolve).

create schema if not exists app;

-- ---------------------------------------------------------------- helpers
create or replace function app.uid(seed text) returns uuid
language sql immutable parallel safe as $$ select md5(seed)::uuid $$;

-- ---------------------------------------------------------------- firm
create table public.firm_settings (
  id            boolean primary key default true check (id),
  firm_name     text not null,
  short_name    text not null,
  timezone      text not null default 'America/New_York',
  business_date date not null,
  market_mode   text not null default 'simulated' check (market_mode in ('simulated','live')),
  publish_time  time not null default '06:30',
  updated_at    timestamptz not null default now()
);

create table public.desks (
  id     uuid primary key,
  code   text not null unique,
  name   text not null,
  region text not null
);

create table public.profiles (
  id           uuid primary key,
  auth_user_id uuid unique,
  email        text not null unique,
  full_name    text not null,
  initials     text not null,
  title        text not null,
  role         text not null check (role in ('sales','desk_head','compliance','admin')),
  desk_id      uuid references public.desks(id),
  region       text not null default 'New York',
  timezone     text not null default 'America/New_York',
  avatar_hue   int  not null default 210,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);
create index on public.profiles (desk_id);

create table public.preferences (
  profile_id    uuid primary key references public.profiles(id) on delete cascade,
  brief_time    time not null default '06:30',
  max_cards     int  not null default 8 check (max_cards between 3 and 20),
  tone          text not null default 'concise' check (tone in ('concise','detailed')),
  include_macro boolean not null default true,
  focus_tags    text[] not null default '{}',
  channels      text[] not null default '{app,email}',
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------- clients
create table public.clients (
  id                uuid primary key,
  name              text not null,
  short_name        text not null,
  segment           text not null check (segment in ('hedge_fund','asset_manager','pension','insurer','bank','corporate')),
  region            text not null,
  country           text not null,
  tier              smallint not null check (tier between 1 and 3),
  aum_usd_mn        numeric not null,
  relationship_since date not null,
  mandate           text not null,
  risk_appetite     text not null check (risk_appetite in ('conservative','moderate','aggressive')),
  status            text not null default 'active' check (status in ('active','dormant','prospect')),
  created_at        timestamptz not null default now()
);
create index on public.clients (segment);

create table public.contacts (
  id         uuid primary key,
  client_id  uuid not null references public.clients(id) on delete cascade,
  full_name  text not null,
  title      text not null,
  email      text not null,
  phone      text not null,
  is_primary boolean not null default false,
  timezone   text not null default 'America/New_York'
);
create index on public.contacts (client_id);

create table public.coverage (
  client_id  uuid not null references public.clients(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role       text not null default 'primary' check (role in ('primary','secondary')),
  primary key (client_id, profile_id)
);
create index on public.coverage (profile_id);

create table public.client_interests (
  client_id uuid not null references public.clients(id) on delete cascade,
  tag       text not null,
  weight    numeric not null default 1,
  primary key (client_id, tag)
);

-- ---------------------------------------------------------------- market
create table public.instruments (
  id          uuid primary key,
  symbol      text not null unique,
  name        text not null,
  asset_class text not null check (asset_class in ('equity','rates','credit','fx','commodity','index','vol')),
  sector      text,
  region      text not null default 'US',
  currency    text not null default 'USD',
  unit        text not null check (unit in ('pct','bp','level')),   -- how a daily move is expressed
  decimals    int  not null default 2,
  meta        jsonb not null default '{}'
);
create index on public.instruments (asset_class);
create index on public.instruments (sector);

create table public.market_bars (
  instrument_id uuid not null references public.instruments(id) on delete cascade,
  d             date not null,
  close         numeric not null,
  volume        bigint,
  source        text not null default 'sim',
  primary key (instrument_id, d)
);

create table public.market_quotes (
  instrument_id uuid primary key references public.instruments(id) on delete cascade,
  as_of         timestamptz not null,
  last          numeric not null,
  prev_close    numeric not null,
  chg           numeric not null,     -- percent for unit=pct, basis points for unit=bp
  source        text not null
);

create table public.positions (
  client_id     uuid not null references public.clients(id) on delete cascade,
  instrument_id uuid not null references public.instruments(id) on delete cascade,
  notional_usd  numeric not null,
  quantity      numeric not null,
  avg_cost      numeric not null,
  as_of         date not null,
  primary key (client_id, instrument_id)
);
create index on public.positions (instrument_id);

create table public.trades (
  id            uuid primary key,
  client_id     uuid not null references public.clients(id) on delete cascade,
  instrument_id uuid not null references public.instruments(id),
  profile_id    uuid references public.profiles(id),
  side          text not null check (side in ('buy','sell')),
  quantity      numeric not null,
  price         numeric not null,
  notional_usd  numeric not null,
  traded_at     timestamptz not null
);
create index on public.trades (client_id, traded_at desc);
create index on public.trades (instrument_id);

-- ---------------------------------------------------------------- CRM
create table public.interactions (
  id          uuid primary key,
  client_id   uuid not null references public.clients(id) on delete cascade,
  contact_id  uuid references public.contacts(id) on delete set null,
  profile_id  uuid references public.profiles(id),
  kind        text not null check (kind in ('call','email','meeting','chat')),
  occurred_at timestamptz not null,
  subject     text not null,
  note        text not null,
  sentiment   smallint not null default 0 check (sentiment between -1 and 1),
  outcome     text
);
create index on public.interactions (client_id, occurred_at desc);

create table public.followups (
  id         uuid primary key,
  client_id  uuid not null references public.clients(id) on delete cascade,
  profile_id uuid not null references public.profiles(id),
  due_on     date not null,
  text       text not null,
  status     text not null default 'open' check (status in ('open','done')),
  created_at timestamptz not null default now()
);
create index on public.followups (profile_id, status, due_on);

-- ---------------------------------------------------------------- events & signals
create table public.events (
  id            uuid primary key,
  business_date date not null,
  kind          text not null check (kind in ('earnings','macro','news','rating','flow','research','corporate_action')),
  title         text not null,
  summary       text not null,
  occurred_at   timestamptz not null,
  instrument_id uuid references public.instruments(id),
  sector        text,
  tags          text[] not null default '{}',
  severity      smallint not null default 1 check (severity between 1 and 3),
  entitlement   text not null default 'public' check (entitlement in ('public','restricted_ib')),
  simulated     boolean not null default true,
  source_label  text not null,
  payload       jsonb not null default '{}'
);
create index on public.events (business_date);
create index on public.events (instrument_id);

create table public.signals (
  id            uuid primary key default gen_random_uuid(),
  business_date date not null,
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  client_id     uuid not null references public.clients(id) on delete cascade,
  event_id      uuid references public.events(id) on delete set null,
  kind          text not null,
  score         numeric not null,
  factors       jsonb not null default '{}',
  created_at    timestamptz not null default now()
);
create index on public.signals (business_date, profile_id);

-- ---------------------------------------------------------------- pipeline
create table public.pipeline_runs (
  id            uuid primary key default gen_random_uuid(),
  business_date date not null,
  trigger       text not null default 'schedule' check (trigger in ('schedule','manual','demo')),
  scope         text not null default 'all',
  status        text not null default 'running' check (status in ('running','succeeded','failed')),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  summary       jsonb not null default '{}'
);

create table public.pipeline_steps (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null references public.pipeline_runs(id) on delete cascade,
  seq         int  not null,
  key         text not null,
  label       text not null,
  status      text not null default 'pending' check (status in ('pending','running','succeeded','failed','skipped')),
  started_at  timestamptz,
  finished_at timestamptz,
  rows_in     int,
  rows_out    int,
  detail      jsonb not null default '{}',
  log         text[] not null default '{}'
);
create index on public.pipeline_steps (run_id, seq);

-- ---------------------------------------------------------------- briefs
create table public.briefs (
  id            uuid primary key default gen_random_uuid(),
  business_date date not null,
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  run_id        uuid references public.pipeline_runs(id) on delete set null,
  status        text not null default 'draft' check (status in ('draft','published')),
  headline      text,
  version       int not null default 1,
  generated_at  timestamptz not null default now(),
  published_at  timestamptz,
  unique (business_date, profile_id)
);

create table public.brief_facts (
  brief_id uuid not null references public.briefs(id) on delete cascade,
  key      text not null,
  label    text not null,
  value    numeric,
  display  text not null,
  unit     text,
  source   text not null,
  as_of    timestamptz not null,
  primary key (brief_id, key)
);

create table public.brief_sections (
  id            uuid primary key default gen_random_uuid(),
  brief_id      uuid not null references public.briefs(id) on delete cascade,
  kind          text not null check (kind in ('overnight','macro','calendar','book','flow','risks')),
  position      int not null,
  title         text not null,
  body_template text not null,
  body_rendered text not null,
  fact_keys     text[] not null default '{}',
  generator     text not null default 'template'
);
create index on public.brief_sections (brief_id, position);

create table public.call_cards (
  id             uuid primary key default gen_random_uuid(),
  brief_id       uuid not null references public.briefs(id) on delete cascade,
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  client_id      uuid not null references public.clients(id) on delete cascade,
  contact_id     uuid references public.contacts(id),
  event_id       uuid references public.events(id) on delete set null,
  rank           int not null,
  score          numeric not null,
  urgency        text not null check (urgency in ('now','today','this_week')),
  headline       text not null,
  why_template   text not null,
  why_rendered   text not null,
  talking_points jsonb not null default '[]',   -- [{template, rendered}]
  watch_outs     jsonb not null default '[]',
  fact_keys      text[] not null default '{}',
  factors        jsonb not null default '{}',
  generator      text not null default 'template',
  status         text not null default 'new' check (status in ('new','done','snoozed','dismissed')),
  acted_at       timestamptz,
  unique (brief_id, client_id)
);
create index on public.call_cards (profile_id, status);

create table public.generation_records (
  id                uuid primary key default gen_random_uuid(),
  brief_id          uuid references public.briefs(id) on delete cascade,
  profile_id        uuid references public.profiles(id) on delete cascade,
  target            text not null,           -- 'section:overnight', 'card:<client>', 'chat'
  provider          text not null,
  model             text not null,
  status            text not null check (status in ('accepted','repaired','fallback','failed')),
  attempts          int not null default 1,
  prompt_tokens     int,
  completion_tokens int,
  latency_ms        int,
  validation        jsonb not null default '{}',
  created_at        timestamptz not null default now()
);
create index on public.generation_records (brief_id);

-- ---------------------------------------------------------------- chat & audit
create table public.chat_threads (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title      text not null default 'New conversation',
  created_at timestamptz not null default now()
);
create index on public.chat_threads (profile_id, created_at desc);

create table public.chat_messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.chat_threads(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role       text not null check (role in ('user','assistant')),
  content    text not null,
  citations  jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index on public.chat_messages (thread_id, created_at);

create table public.audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor_id    uuid,
  action      text not null,
  object_type text,
  object_id   text,
  detail      jsonb not null default '{}'
);
create index on public.audit_log (at desc);
