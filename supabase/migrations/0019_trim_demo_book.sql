-- Trim the demonstration book to seven fictional managers, so the desk shows ten clients with the three from the
-- supplied workbook. Archived the same reversible way as an import: published history keeps its references.
create temporary table trimmed as
 select id from live_clients where id in(app.uid('live:client:Kestrel Digital Assets'),app.uid('live:client:Orion Consumer Fund'));
update live_holdings set active=false where account_id in(select a.id from live_accounts a where a.client_id in(select id from trimmed));
update live_accounts set active=false where client_id in(select id from trimmed);
update live_clients set active=false where id in(select id from trimmed);
delete from live_coverage where client_id in(select id from trimmed);
drop table trimmed;
