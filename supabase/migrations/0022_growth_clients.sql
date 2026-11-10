-- Six more fictional managers, bringing the active book to twelve clients. They hold real, listed growth names:
-- SMCI, AVGO, IREN, OKLO, IONQ, RGTI, QBTS, SNDK, CRWV, SOFI, TSLA, HOOD and GOOG. Quantities are illustrative; current
-- values are those quantities at each stock's 2026-11-09 close. They join the demonstration import (demo-book-v1),
-- so a workbook re-import keeps them, exactly like the rest of the demonstration book.
create temporary table growth_book(manager text, account text, fund text, symbol text, direction text, quantity numeric, cur numeric, ini numeric, spread numeric, margin numeric);
insert into growth_book values
 ('Vantage Quantum Partners','VQ110','Vantage Quantum Computing','IONQ','Long',300000,10600000,8400000,70,45),
 ('Vantage Quantum Partners','VQ110','Vantage Quantum Computing','RGTI','Long',600000,7790000,6100000,85,55),
 ('Vantage Quantum Partners','VQ110','Vantage Quantum Computing','QBTS','Long',650000,7460000,5900000,85,55),
 ('Ironclad Compute Capital','IC210','Ironclad AI Infrastructure','SMCI','Long',350000,10010000,11800000,60,40),
 ('Ironclad Compute Capital','IC210','Ironclad AI Infrastructure','CRWV','Long',200000,9800000,10400000,75,50),
 ('Ironclad Compute Capital','IC210','Ironclad AI Infrastructure','IREN','Long',450000,9630000,8700000,80,50),
 ('Fairhaven Fintech Fund','FF310','Fairhaven Digital Finance','SOFI','Long',600000,10050000,9200000,45,30),
 ('Fairhaven Fintech Fund','FF310','Fairhaven Digital Finance','HOOD','Long',120000,10000000,7600000,50,35),
 ('Sterling Peak Growth','SG410','Sterling Peak Mega-Cap Growth','GOOG','Long',45000,12870000,10900000,25,20),
 ('Sterling Peak Growth','SG410','Sterling Peak Mega-Cap Growth','AVGO','Long',35000,11180000,9800000,30,25),
 ('Sterling Peak Growth','SG420','Sterling Peak Long/Short','TSLA','Short',25000,9450000,9900000,55,40),
 ('Tidewater Energy Innovation','TE510','Tidewater Next-Generation Power','OKLO','Long',400000,10740000,9600000,80,50),
 ('Tidewater Energy Innovation','TE520','Tidewater Power Hedge','CRWV','Short',80000,3920000,4300000,75,50),
 ('Granite Arch Capital','GA610','Granite Arch Technology Long/Short','SNDK','Long',12000,10640000,8100000,55,35),
 ('Granite Arch Capital','GA610','Granite Arch Technology Long/Short','TSLA','Long',20000,7560000,7000000,40,30),
 ('Granite Arch Capital','GA620','Granite Arch Hedge','IONQ','Short',150000,5300000,4700000,80,50);

insert into live_clients(id,name) select distinct app.uid('live:client:'||manager),manager from growth_book on conflict do nothing;
insert into live_accounts(id,client_id,external_id,name,currency,valuation_date,import_id)
 select distinct app.uid('live:account:'||account),app.uid('live:client:'||manager),account,fund,'USD','2026-11-09'::date,app.uid('live:import:demo-book-v1') from growth_book
 where exists(select 1 from live_imports where id=app.uid('live:import:demo-book-v1')) on conflict do nothing;
insert into live_holdings(id,account_id,symbol,direction,quantity,current_value,initial_value,spread,margin,source_row,import_id)
 select app.uid('live:holding:'||account||':'||symbol||':'||direction),app.uid('live:account:'||account),symbol,direction,quantity,cur,ini,spread,margin,(row_number() over())::int+100,app.uid('live:import:demo-book-v1') from growth_book
 where exists(select 1 from live_accounts where id=app.uid('live:account:'||account)) on conflict do nothing;

-- The pilot salesperson covers all six; the second salesperson shares three of them, as with the original book.
insert into live_coverage(profile_id,client_id)
 select p.id,app.uid('live:client:'||g.manager) from (select distinct manager from growth_book) g, profiles p
 where p.id=app.uid('live:sales-1')
    or (p.id=app.uid('live:sales-2') and g.manager in('Sterling Peak Growth','Tidewater Energy Innovation','Granite Arch Capital'))
on conflict do nothing;

-- A salesperson who narrowed the brief to chosen clients also sees the new clients they cover; an empty choice
-- already means "everyone", so it is left alone.
update live_preferences l set focus_clients=l.focus_clients||array(
  select v.client_id from live_coverage v where v.profile_id=l.profile_id
   and v.client_id in(select app.uid('live:client:'||manager) from growth_book)
   and not v.client_id=any(l.focus_clients))
 where cardinality(l.focus_clients)>0;
drop table growth_book;
