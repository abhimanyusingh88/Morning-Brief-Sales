-- Internal delivery log for the emailed morning brief (to the salesperson/desk, never to clients).
create table public.live_email_sends (
 business_date date not null,
 recipient text not null,
 status text not null default 'sending' check(status in ('sending','sent','failed')),
 provider_id text,
 detail text,
 created_at timestamptz not null default now(),
 primary key(business_date,recipient)
);
alter table live_email_sends enable row level security;

-- Sign-in is disabled: the single demo desk profile covers every active client so the brief is the whole book.
insert into live_coverage(profile_id,client_id)
 select app.uid('live:sales-1'),c.id from live_clients c
 where c.active and exists(select 1 from profiles p where p.id=app.uid('live:sales-1'))
on conflict do nothing;
