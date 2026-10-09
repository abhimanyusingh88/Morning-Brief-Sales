-- Additive live product schema. Demo history is retained but never read by live pages.
create table public.live_imports (
 id uuid primary key default gen_random_uuid(), file_hash text not null unique,
 filename text not null, imported_at timestamptz not null default now(),
 issues jsonb not null default '[]', row_count int not null check(row_count >= 0)
);
create table public.live_clients (
 id uuid primary key, name text not null unique, active boolean not null default true
);
create table public.live_coverage (
 profile_id uuid not null references profiles(id), client_id uuid not null references live_clients(id),
 primary key(profile_id,client_id)
);
create table public.live_accounts (
 id uuid primary key, client_id uuid not null references live_clients(id),
 external_id text not null unique, name text not null, active boolean not null default true, currency text,
 valuation_date date, import_id uuid not null references live_imports(id)
);
create table public.live_holdings (
 id uuid primary key, account_id uuid not null references live_accounts(id),
 active boolean not null default true, symbol text not null check(symbol ~ '^[A-Z0-9.\-]{1,15}$'),
 direction text not null check(direction in ('Long','Short')),
 quantity numeric not null, current_value numeric not null, initial_value numeric not null,
 spread numeric not null, margin numeric not null, source_row int not null,
 import_id uuid not null references live_imports(id), unique(account_id,symbol,direction)
);
create table public.live_preferences (
 profile_id uuid primary key references profiles(id), sectors text[] not null default '{}',
 symbols text[] not null default '{}', timezone text not null default 'America/New_York',
 updated_at timestamptz not null default now()
);
create table public.live_observations (
 id uuid primary key default gen_random_uuid(), metric text not null,
 value numeric not null, previous numeric, unit text not null,
 observed_date date not null, observed_at timestamptz,
 fetched_at timestamptz not null default now(), source text not null,
 source_url text not null, cadence text not null check(cadence in ('daily','delayed')),
 unique(metric,observed_date,source)
);
create table public.live_articles (
 id uuid primary key, url text not null unique, title text not null,
 publisher text not null, published_at timestamptz not null, event_date date not null,
 discovered_at timestamptz not null default now(), verified_at timestamptz not null,
 symbols text[] not null default '{}', topics text[] not null default '{}',
 excerpt text not null, summary_template text, evidence_hash text not null,
 status text not null default 'verified' check(status in ('verified','withdrawn')),
 verification text not null
);
create index on live_articles(event_date,status);
create table public.live_source_checks (
 source_key text primary key, checked_at timestamptz not null,
 succeeded boolean not null, accepted int not null default 0, detail text not null
);
create table public.live_reports (
 id uuid primary key default gen_random_uuid(), profile_id uuid not null references profiles(id),
 scope_client uuid references live_clients(id), input_client_ids uuid[] not null,
 business_date date not null, cutoff timestamptz not null, coverage_hash text not null,
 fingerprint text not null, payload jsonb not null, created_at timestamptz not null default now(),
 unique(profile_id,fingerprint)
);
create index on live_reports(profile_id,business_date,created_at desc);
create table public.live_jobs (
 id uuid primary key default gen_random_uuid(), kind text not null check(kind in ('market','news','publish')),
 job_key text not null unique, payload jsonb not null default '{}',
 status text not null default 'queued' check(status in ('queued','running','done','failed')),
 attempts int not null default 0, available_at timestamptz not null default now(),
 lease_until timestamptz, lease_token uuid, error_code text, created_at timestamptz not null default now(),
 finished_at timestamptz
);
create index on live_jobs(status,available_at);
create table public.live_exports (
 id uuid primary key default gen_random_uuid(), profile_id uuid not null references profiles(id),
 report_id uuid not null references live_reports(id), filters jsonb not null,
 exported_at timestamptz not null default now()
);

alter table live_imports enable row level security;
alter table live_clients enable row level security;
alter table live_coverage enable row level security;
alter table live_accounts enable row level security;
alter table live_holdings enable row level security;
alter table live_preferences enable row level security;
alter table live_observations enable row level security;
alter table live_articles enable row level security;
alter table live_source_checks enable row level security;
alter table live_reports enable row level security;
alter table live_jobs enable row level security;
alter table live_exports enable row level security;

grant select on live_clients,live_coverage,live_accounts,live_holdings,live_observations,live_articles,live_source_checks,live_reports to authenticated;
grant select,insert,update on live_preferences to authenticated;
grant select,insert on live_exports to authenticated;
create policy live_coverage_read on live_coverage for select to authenticated using(profile_id=app.me());
create policy live_clients_read on live_clients for select to authenticated using(
 active and exists(select 1 from live_coverage c where c.client_id=id and c.profile_id=app.me())
);
create policy live_accounts_read on live_accounts for select to authenticated using(
 active and exists(select 1 from live_clients c where c.id=client_id)
);
create policy live_holdings_read on live_holdings for select to authenticated using(
 active and exists(select 1 from live_accounts a where a.id=account_id)
);
create policy live_preferences_rw on live_preferences for all to authenticated using(profile_id=app.me()) with check(profile_id=app.me());
create policy live_observations_read on live_observations for select to authenticated using(true);
create policy live_articles_read on live_articles for select to authenticated using(status='verified');
create policy live_source_checks_read on live_source_checks for select to authenticated using(true);
create policy live_reports_read on live_reports for select to authenticated using(
 profile_id=app.me() and not exists(
  select 1 from unnest(input_client_ids) cid where not exists(select 1 from live_clients c where c.id=cid)
 ) and not exists(
  select 1 from jsonb_array_elements(payload->'articles') a
  where not exists(select 1 from live_articles e where e.id=(a->>'id')::uuid and e.status='verified' and e.evidence_hash=a->>'evidenceHash')
 )
);
create policy live_exports_read on live_exports for select to authenticated using(profile_id=app.me());
create policy live_exports_insert on live_exports for insert to authenticated with check(
 profile_id=app.me() and exists(select 1 from live_reports r where r.id=report_id and r.profile_id=app.me())
);
