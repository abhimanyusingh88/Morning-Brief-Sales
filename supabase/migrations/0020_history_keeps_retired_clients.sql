-- Brief history survives a book change. Retiring a client (0019, or a workbook re-import) hid every past brief that
-- had included it, because the read policy needs each input client to be visible. A past day's brief now stays
-- readable, exactly as published, when a client it covered was later retired. Access that was revoked while the
-- client is still active stays revoked, and today's brief keeps the strict check.
insert into live_coverage(profile_id,client_id)
 select p.id,c.id from profiles p, live_clients c
 where p.id in(app.uid('live:sales-1'),app.uid('live:sales-2'))
  and c.id in(app.uid('live:client:Kestrel Digital Assets'),app.uid('live:client:Orion Consumer Fund'))
on conflict do nothing;

create or replace function app.client_retired(cid uuid) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists(select 1 from public.live_clients c join public.live_coverage v on v.client_id=c.id
   where c.id=cid and not c.active and v.profile_id=app.me())
$$;
grant execute on function app.client_retired(uuid) to authenticated, service_role;

drop policy if exists live_reports_read on live_reports;
create policy live_reports_read on live_reports for select to authenticated using(
 profile_id=app.me() and not exists(
  select 1 from unnest(input_client_ids) cid where not exists(select 1 from live_clients c where c.id=cid)
   and not (business_date<(now() at time zone 'America/New_York')::date and app.client_retired(cid))
 ) and not exists(
  select 1 from jsonb_array_elements(payload->'articles') a
  where not exists(select 1 from live_articles e where e.id=(a->>'id')::uuid and e.status='verified'
   and (e.evidence_hash=a->>'evidenceHash' or business_date<(now() at time zone 'America/New_York')::date))
 )
);
