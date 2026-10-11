-- Brief setup: a salesperson chooses which of their clients, topics and stocks the brief shows. The published brief
-- still covers the whole book; these only narrow what is displayed. An empty list means "show everything".
alter table live_preferences
 add column if not exists focus_clients uuid[] not null default '{}',
 add column if not exists focus_topics text[] not null default '{}',
 add column if not exists focus_symbols text[] not null default '{}';

-- Smaller demonstration book: six clients, at most three holdings each. The three workbook clients are untouched.
-- Retired the reversible way (no rows deleted, coverage kept) so past briefs stay readable as published (0020).
create temporary table retired as
 select id from live_clients where id in(
  app.uid('live:client:Atlas Harbor Capital'),app.uid('live:client:Bluewater Health Partners'),
  app.uid('live:client:Northgate Macro Fund'),app.uid('live:client:Silverpine Investments'));
update live_holdings set active=false where account_id in(select a.id from live_accounts a where a.client_id in(select id from retired));
update live_accounts set active=false where client_id in(select id from retired);
update live_clients set active=false where id in(select id from retired);
drop table retired;

-- Any remaining client keeps its three largest active positions by current value.
update live_holdings set active=false where id in(
 select id from(
  select h.id,row_number() over(partition by a.client_id order by h.current_value desc,h.symbol) n
  from live_holdings h join live_accounts a on a.id=h.account_id join live_clients c on c.id=a.client_id
  where h.active and a.active and c.active
 ) ranked where n>3);
update live_accounts a set active=false
 where a.active and not exists(select 1 from live_holdings h where h.account_id=a.id and h.active);
