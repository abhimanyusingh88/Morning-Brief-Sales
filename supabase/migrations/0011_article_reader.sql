create table public.live_article_readers (
 article_id uuid not null references live_articles(id), evidence_hash text not null,
 lease_token uuid, lease_until timestamptz, payload jsonb, updated_at timestamptz not null default now(),
 primary key(article_id,evidence_hash)
);
alter table live_article_readers enable row level security;
grant select on live_article_readers to authenticated;
create policy live_reader_read on live_article_readers for select to authenticated using(
 exists(select 1 from live_articles a where a.id=article_id and a.status='verified' and a.evidence_hash=live_article_readers.evidence_hash)
);
