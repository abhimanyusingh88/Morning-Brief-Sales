-- Market-wide desk note (public evidence and market observations only; no client records).
create table public.live_desk_notes (
 id uuid primary key default gen_random_uuid(),
 business_date date not null,
 fingerprint text not null,
 payload jsonb not null,
 created_at timestamptz not null default now()
);
create index on live_desk_notes(business_date,created_at desc);
alter table live_desk_notes enable row level security;
grant select on live_desk_notes to authenticated;
create policy live_desk_notes_read on live_desk_notes for select to authenticated using(true);

-- Demonstration client book: fictional investment managers holding real, listed instruments.
-- Values are illustrative USD figures, clearly separated from the supplied workbook by import hash.
insert into profiles(id,auth_user_id,email,full_name,initials,title,role,region,timezone,avatar_hue,is_active) values
 (app.uid('live:sales-1'),app.uid('live:sales-1'),'sales1@pilot.invalid','Aisha Rahman','AR','Equity sales','sales','New York','America/New_York',190,true),
 (app.uid('live:sales-2'),app.uid('live:sales-2'),'sales2@pilot.invalid','Daniel Morgan','DM','Equity sales','sales','New York','America/New_York',220,true)
on conflict do nothing;
insert into live_preferences(profile_id) select id from profiles where id in(app.uid('live:sales-1'),app.uid('live:sales-2')) on conflict do nothing;
insert into live_imports(id,file_hash,filename,row_count,issues) values
 (app.uid('live:import:demo-book-v1'),'demo-book-v1','Demonstration client book',27,'[{"row":0,"message":"Fictional managers with real listed instruments. Values are illustrative USD as of the valuation date."}]')
on conflict(file_hash) do nothing;

create temporary table demo_book(manager text, owner text, account text, fund text, symbol text, direction text, quantity numeric, cur numeric, ini numeric, spread numeric, margin numeric);
insert into demo_book values
 ('Meridian Ridge Capital','sales-1','MR101','Meridian Ridge Global Technology','MSFT','Long',42000,21500000,17800000,35,25),
 ('Meridian Ridge Capital','sales-1','MR101','Meridian Ridge Global Technology','AAPL','Long',65000,16200000,14100000,30,25),
 ('Meridian Ridge Capital','sales-1','MR101','Meridian Ridge Global Technology','AVGO','Long',48000,15900000,11300000,40,30),
 ('Meridian Ridge Capital','sales-1','MR202','Meridian Ridge Long/Short','AMD','Short',55000,9100000,8600000,55,40),
 ('Halcyon Bay Partners','sales-1','HB110','Halcyon Bay Energy Transition','XOM','Long',120000,13800000,12900000,25,20),
 ('Halcyon Bay Partners','sales-1','HB110','Halcyon Bay Energy Transition','CVX','Long',70000,10700000,10100000,25,20),
 ('Halcyon Bay Partners','sales-1','HB220','Halcyon Bay Opportunistic','OXY','Short',90000,4100000,4500000,60,35),
 ('Northgate Macro Fund','sales-1','NG300','Northgate Global Macro','GLD','Long',60000,22400000,18600000,15,10),
 ('Northgate Macro Fund','sales-1','NG300','Northgate Global Macro','TLT','Long',150000,13300000,13900000,15,10),
 ('Copperline Asset Management','sales-1','CL410','Copperline Financials','JPM','Long',52000,15600000,12400000,20,20),
 ('Copperline Asset Management','sales-1','CL410','Copperline Financials','GS','Long',18000,12900000,9800000,25,20),
 ('Copperline Asset Management','sales-1','CL410','Copperline Financials','WFC','Short',80000,6400000,6100000,45,30),
 ('Silverpine Investments','sales-2','SP510','Silverpine Internet Leaders','META','Long',21000,15100000,11900000,30,25),
 ('Silverpine Investments','sales-2','SP510','Silverpine Internet Leaders','GOOGL','Long',60000,14700000,10800000,30,25),
 ('Silverpine Investments','sales-2','SP520','Silverpine Media Hedge','NFLX','Short',9000,10500000,9700000,55,40),
 ('Atlas Harbor Capital','sales-2','AH620','Atlas Harbor Aerospace & Defense','LMT','Long',22000,11600000,10200000,25,20),
 ('Atlas Harbor Capital','sales-2','AH620','Atlas Harbor Aerospace & Defense','RTX','Long',75000,11900000,9300000,25,20),
 ('Atlas Harbor Capital','sales-2','AH620','Atlas Harbor Aerospace & Defense','NOC','Long',15000,8800000,7600000,25,20),
 ('Bluewater Health Partners','sales-2','BW730','Bluewater Healthcare Innovation','LLY','Long',14000,11300000,10600000,35,25),
 ('Bluewater Health Partners','sales-2','BW730','Bluewater Healthcare Innovation','NVO','Short',85000,5300000,6900000,50,35),
 ('Bluewater Health Partners','sales-2','BW730','Bluewater Healthcare Innovation','PFE','Short',210000,5400000,5800000,40,30),
 ('Kestrel Digital Assets','sales-2','KD840','Kestrel Digital Asset Equities','COIN','Long',30000,9600000,7200000,80,50),
 ('Kestrel Digital Assets','sales-2','KD840','Kestrel Digital Asset Equities','MSTR','Long',25000,8700000,8100000,95,60),
 ('Kestrel Digital Assets','sales-2','KD850','Kestrel Bitcoin Core','IBIT','Long',180000,11200000,8900000,20,15),
 ('Orion Consumer Fund','sales-2','OC950','Orion Consumer Staples & Retail','WMT','Long',120000,12400000,10100000,20,15),
 ('Orion Consumer Fund','sales-2','OC950','Orion Consumer Staples & Retail','COST','Long',11000,10300000,9000000,20,15),
 ('Orion Consumer Fund','sales-2','OC960','Orion Consumer Discretionary','NKE','Short',95000,6900000,7400000,45,30);

insert into live_clients(id,name) select distinct app.uid('live:client:'||manager),manager from demo_book on conflict do nothing;
insert into live_coverage(profile_id,client_id) select distinct app.uid('live:'||owner),app.uid('live:client:'||manager) from demo_book
 where exists(select 1 from profiles p where p.id=app.uid('live:'||owner)) on conflict do nothing;
insert into live_accounts(id,client_id,external_id,name,currency,valuation_date,import_id)
 select distinct app.uid('live:account:'||account),app.uid('live:client:'||manager),account,fund,'USD','2026-10-08'::date,app.uid('live:import:demo-book-v1') from demo_book on conflict do nothing;
insert into live_holdings(id,account_id,symbol,direction,quantity,current_value,initial_value,spread,margin,source_row,import_id)
 select app.uid('live:holding:'||account||':'||symbol||':'||direction),app.uid('live:account:'||account),symbol,direction,quantity,cur,ini,spread,margin,(row_number() over())::int+1,app.uid('live:import:demo-book-v1') from demo_book on conflict do nothing;
drop table demo_book;
