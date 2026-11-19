-- Leveraged ETF commentary. Public issuer data only (no client records): each fund's shares outstanding and NAV per
-- session, exactly as the issuer published it, and the day's written commentary built from those figures.
create table public.live_etf_shares (
 ticker text not null check(ticker ~ '^[A-Z]{1,6}$'),
 as_of date not null,
 shares numeric not null check(shares >= 0),
 nav numeric not null check(nav > 0),
 source text not null,
 source_url text not null,
 fetched_at timestamptz not null default now(),
 primary key(ticker,as_of)
);
create index on live_etf_shares(as_of desc);
alter table live_etf_shares enable row level security;
grant select on live_etf_shares to authenticated;
create policy live_etf_shares_read on live_etf_shares for select to authenticated using(true);

create table public.live_etf_notes (
 id uuid primary key default gen_random_uuid(),
 business_date date not null,
 fingerprint text not null,
 payload jsonb not null,
 created_at timestamptz not null default now()
);
create index on live_etf_notes(business_date,created_at desc);
alter table live_etf_notes enable row level security;
grant select on live_etf_notes to authenticated;
create policy live_etf_notes_read on live_etf_notes for select to authenticated using(true);
