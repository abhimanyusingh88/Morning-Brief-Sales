-- Deterministic helpers, firm, desks, people and the instrument universe.
-- NOTE: base levels in instruments.meta are PLACEHOLDERS for the simulator.
-- They are replaced by a licensed market-data adapter before any live use.

create or replace function app.rnd(k text) returns double precision
language sql immutable parallel safe as $$
  select ((('x' || substr(md5(k), 1, 7))::bit(28)::int)::double precision + 0.5) / 268435456.0
$$;

-- standard normal via Box-Muller on two independent hash streams
create or replace function app.rnorm(k text) returns double precision
language sql immutable parallel safe as $$
  select sqrt(-2.0 * ln(app.rnd(k || '#a'))) * cos(2.0 * pi() * app.rnd(k || '#b'))
$$;

create or replace function app.pick(arr text[], k text) returns text
language sql immutable parallel safe as $$
  select arr[1 + floor(app.rnd(k) * array_length(arr, 1))::int]
$$;

insert into public.firm_settings (id, firm_name, short_name, business_date)
values (true, 'Northgate Capital Markets', 'Northgate', '2026-10-05');

insert into public.desks (id, code, name, region) values
  (app.uid('desk:rcs'), 'RCS', 'Rates & Credit Sales', 'New York'),
  (app.uid('desk:eqs'), 'EQS', 'Equity Sales',          'New York');

insert into public.profiles (id, auth_user_id, email, full_name, initials, title, role, desk_id, avatar_hue) values
  -- Rates & Credit Sales
  (app.uid('p:delaney'),  app.uid('p:delaney'),  'marcus.delaney@northgate.example',  'Marcus Delaney',  'MD', 'Managing Director, Head of Rates & Credit Sales', 'desk_head', app.uid('desk:rcs'), 212),
  (app.uid('p:raman'),    app.uid('p:raman'),    'priya.raman@northgate.example',     'Priya Raman',     'PR', 'Director, Institutional Sales',    'sales', app.uid('desk:rcs'), 262),
  (app.uid('p:okafor'),   app.uid('p:okafor'),   'daniel.okafor@northgate.example',   'Daniel Okafor',   'DO', 'Director, Institutional Sales',    'sales', app.uid('desk:rcs'), 24),
  (app.uid('p:marchetti'),app.uid('p:marchetti'),'elena.marchetti@northgate.example', 'Elena Marchetti', 'EM', 'Vice President, Sales',            'sales', app.uid('desk:rcs'), 330),
  (app.uid('p:whitfield'),app.uid('p:whitfield'),'jordan.whitfield@northgate.example','Jordan Whitfield','JW', 'Vice President, Sales',            'sales', app.uid('desk:rcs'), 152),
  (app.uid('p:alvarez'),  app.uid('p:alvarez'),  'sofia.alvarez@northgate.example',   'Sofia Alvarez',   'SA', 'Vice President, Sales',            'sales', app.uid('desk:rcs'), 188),
  (app.uid('p:hartmann'), app.uid('p:hartmann'), 'lukas.hartmann@northgate.example',  'Lukas Hartmann',  'LH', 'Associate, Sales',                 'sales', app.uid('desk:rcs'), 44),
  -- Equity Sales
  (app.uid('p:kessler'),  app.uid('p:kessler'),  'rachel.kessler@northgate.example',  'Rachel Kessler',  'RK', 'Managing Director, Head of Equity Sales', 'desk_head', app.uid('desk:eqs'), 292),
  (app.uid('p:beaumont'), app.uid('p:beaumont'), 'tomas.beaumont@northgate.example',  'Tomás Beaumont',  'TB', 'Director, Institutional Sales',    'sales', app.uid('desk:eqs'), 8),
  (app.uid('p:rahman'),   app.uid('p:rahman'),   'aisha.rahman@northgate.example',    'Aisha Rahman',    'AR', 'Director, Institutional Sales',    'sales', app.uid('desk:eqs'), 172),
  (app.uid('p:cho'),      app.uid('p:cho'),      'nathan.cho@northgate.example',      'Nathan Cho',      'NC', 'Vice President, Sales',            'sales', app.uid('desk:eqs'), 236),
  (app.uid('p:fontaine'), app.uid('p:fontaine'), 'isabelle.fontaine@northgate.example','Isabelle Fontaine','IF', 'Vice President, Sales',           'sales', app.uid('desk:eqs'), 340),
  (app.uid('p:lindqvist'),app.uid('p:lindqvist'),'victor.lindqvist@northgate.example', 'Victor Lindqvist','VL', 'Vice President, Sales',            'sales', app.uid('desk:eqs'), 96),
  (app.uid('p:tanaka'),   app.uid('p:tanaka'),   'mei.tanaka@northgate.example',      'Mei Tanaka',      'MT', 'Associate, Sales',                 'sales', app.uid('desk:eqs'), 204),
  -- Control functions
  (app.uid('p:overton'),  app.uid('p:overton'),  'helen.overton@northgate.example',   'Helen Overton',   'HO', 'Chief Compliance Officer',         'compliance', null, 40),
  (app.uid('p:whitaker'), app.uid('p:whitaker'), 'sam.whitaker@northgate.example',    'Sam Whitaker',    'SW', 'Head of Sales Technology',         'admin', null, 120);

insert into public.preferences (profile_id)
select id from public.profiles;

-- ---------------------------------------------------------------- instrument universe
-- meta: base level, daily vol (pct for 'pct', bp for 'bp'), beta to market, loading on sector factor
insert into public.instruments (id, symbol, name, asset_class, sector, region, currency, unit, decimals, meta)
select app.uid('i:' || symbol), symbol, name, asset_class, sector, region, currency, unit, decimals,
       jsonb_build_object('base', base, 'vol', vol, 'beta', beta, 'sload', sload)
from (values
  -- indices / vol / fx / commodities (unit pct unless stated)
  ('SPX',   'US Large Cap Index',        'index','Index','US','USD','pct',2, 6750::numeric, 0.85, 1.00, 0.0),
  ('NDX',   'US Tech Growth Index',      'index','Index','US','USD','pct',2, 24800, 1.15, 1.25, 0.0),
  ('RTY',   'US Small Cap Index',        'index','Index','US','USD','pct',2, 2480,  1.20, 1.15, 0.0),
  ('VIX',   'US Equity Volatility',      'vol',  'Index','US','USD','level',2, 16.4, 0.90, -4.0, 0.0),
  ('DXY',   'US Dollar Index',           'fx',   'FX',   'US','USD','pct',2, 98.7,  0.35, -0.10, 0.0),
  ('EURUSD','Euro / US Dollar',          'fx',   'FX',   'EU','USD','pct',4, 1.1640, 0.38, 0.10, 0.0),
  ('USDJPY','US Dollar / Japanese Yen',  'fx',   'FX',   'JP','JPY','pct',2, 148.2, 0.55, 0.20, 0.0),
  ('GBPUSD','Sterling / US Dollar',      'fx',   'FX',   'UK','USD','pct',4, 1.3380, 0.42, 0.10, 0.0),
  ('WTI',   'WTI Crude Front Month',     'commodity','Energy','US','USD','pct',2, 62.4, 1.80, 0.30, 0.0),
  ('XAU',   'Gold Spot',                 'commodity','Metals','US','USD','pct',2, 3820, 0.85, -0.05, 0.0),
  -- government rates: level in percent yield, move in bp
  ('UST2Y', 'US Treasury 2Y',            'rates','Government','US','USD','bp',3, 3.58, 4.5, 0.0, 0.0),
  ('UST5Y', 'US Treasury 5Y',            'rates','Government','US','USD','bp',3, 3.72, 5.2, 0.0, 0.0),
  ('UST10Y','US Treasury 10Y',           'rates','Government','US','USD','bp',3, 4.08, 5.6, 0.0, 0.0),
  ('UST30Y','US Treasury 30Y',           'rates','Government','US','USD','bp',3, 4.68, 5.8, 0.0, 0.0),
  ('BUND10Y','German Bund 10Y',          'rates','Government','EU','EUR','bp',3, 2.62, 4.2, 0.0, 0.0),
  ('GILT10Y','UK Gilt 10Y',              'rates','Government','UK','GBP','bp',3, 4.48, 5.5, 0.0, 0.0),
  ('JGB10Y','Japan Government Bond 10Y', 'rates','Government','JP','JPY','bp',3, 1.72, 3.2, 0.0, 0.0),
  -- credit spreads in bp
  ('CDXIG', 'CDX North America IG',      'credit','Index Credit','US','USD','bp',1, 54.0, 1.1, 0.0, 0.0),
  ('CDXHY', 'CDX North America HY',      'credit','Index Credit','US','USD','bp',1, 328.0, 6.5, 0.0, 0.0),
  ('ITXMAIN','iTraxx Europe Main',       'credit','Index Credit','EU','EUR','bp',1, 57.0, 1.2, 0.0, 0.0),
  ('IG.FIN','US IG Financials OAS',      'credit','Financials','US','USD','bp',1, 84.0, 1.3, 0.0, 0.0),
  ('IG.TECH','US IG Technology OAS',     'credit','Technology','US','USD','bp',1, 69.0, 1.2, 0.0, 0.0),
  ('IG.ENRG','US IG Energy OAS',         'credit','Energy','US','USD','bp',1, 94.0, 1.5, 0.0, 0.0),
  ('IG.UTIL','US IG Utilities OAS',      'credit','Utilities','US','USD','bp',1, 91.0, 1.3, 0.0, 0.0),
  ('IG.HLTH','US IG Healthcare OAS',     'credit','Healthcare','US','USD','bp',1, 74.0, 1.2, 0.0, 0.0),
  ('HY.ENRG','US HY Energy OAS',         'credit','Energy','US','USD','bp',1, 382.0, 7.0, 0.0, 0.0),
  -- equities
  ('AAPL','Apple Inc.','equity','Technology','US','USD','pct',2, 232, 1.45, 1.10, 0.8),
  ('MSFT','Microsoft Corp.','equity','Technology','US','USD','pct',2, 515, 1.35, 1.05, 0.8),
  ('ORCL','Oracle Corp.','equity','Technology','US','USD','pct',2, 238, 1.90, 1.15, 0.8),
  ('CRM', 'Salesforce Inc.','equity','Technology','US','USD','pct',2, 268, 1.80, 1.15, 0.8),
  ('ADBE','Adobe Inc.','equity','Technology','US','USD','pct',2, 372, 1.80, 1.10, 0.8),
  ('NVDA','NVIDIA Corp.','equity','Semiconductors','US','USD','pct',2, 184, 2.60, 1.45, 0.9),
  ('AVGO','Broadcom Inc.','equity','Semiconductors','US','USD','pct',2, 338, 2.40, 1.35, 0.9),
  ('AMD', 'Advanced Micro Devices','equity','Semiconductors','US','USD','pct',2, 158, 2.90, 1.50, 0.9),
  ('MU',  'Micron Technology','equity','Semiconductors','US','USD','pct',2, 128, 2.80, 1.50, 0.9),
  ('TSM', 'Taiwan Semiconductor ADR','equity','Semiconductors','TW','USD','pct',2, 276, 2.30, 1.30, 0.9),
  ('JPM', 'JPMorgan Chase & Co.','equity','Financials','US','USD','pct',2, 298, 1.30, 1.05, 0.8),
  ('GS',  'Goldman Sachs Group','equity','Financials','US','USD','pct',2, 715, 1.60, 1.20, 0.8),
  ('MS',  'Morgan Stanley','equity','Financials','US','USD','pct',2, 148, 1.60, 1.20, 0.8),
  ('BAC', 'Bank of America','equity','Financials','US','USD','pct',2, 51, 1.50, 1.15, 0.8),
  ('C',   'Citigroup Inc.','equity','Financials','US','USD','pct',2, 97, 1.70, 1.25, 0.8),
  ('BLK', 'BlackRock Inc.','equity','Financials','US','USD','pct',2, 1090, 1.40, 1.10, 0.8),
  ('LLY', 'Eli Lilly & Co.','equity','Healthcare','US','USD','pct',2, 790, 1.90, 0.60, 0.8),
  ('UNH', 'UnitedHealth Group','equity','Healthcare','US','USD','pct',2, 325, 1.70, 0.60, 0.8),
  ('JNJ', 'Johnson & Johnson','equity','Healthcare','US','USD','pct',2, 172, 0.95, 0.40, 0.8),
  ('MRK', 'Merck & Co.','equity','Healthcare','US','USD','pct',2, 84, 1.20, 0.45, 0.8),
  ('PFE', 'Pfizer Inc.','equity','Healthcare','US','USD','pct',2, 26, 1.20, 0.45, 0.8),
  ('XOM', 'Exxon Mobil','equity','Energy','US','USD','pct',2, 109, 1.30, 0.70, 0.9),
  ('CVX', 'Chevron Corp.','equity','Energy','US','USD','pct',2, 153, 1.30, 0.70, 0.9),
  ('COP', 'ConocoPhillips','equity','Energy','US','USD','pct',2, 94, 1.60, 0.85, 0.9),
  ('SLB', 'Schlumberger Ltd.','equity','Energy','US','USD','pct',2, 36, 2.00, 1.00, 0.9),
  ('CAT', 'Caterpillar Inc.','equity','Industrials','US','USD','pct',2, 475, 1.60, 1.15, 0.8),
  ('GE',  'GE Aerospace','equity','Industrials','US','USD','pct',2, 288, 1.50, 1.10, 0.8),
  ('BA',  'Boeing Co.','equity','Industrials','US','USD','pct',2, 218, 2.00, 1.30, 0.8),
  ('UNP', 'Union Pacific','equity','Industrials','US','USD','pct',2, 228, 1.20, 0.90, 0.8),
  ('HON', 'Honeywell International','equity','Industrials','US','USD','pct',2, 208, 1.20, 0.95, 0.8),
  ('AMZN','Amazon.com Inc.','equity','Consumer Discretionary','US','USD','pct',2, 218, 1.70, 1.20, 0.7),
  ('TSLA','Tesla Inc.','equity','Consumer Discretionary','US','USD','pct',2, 425, 3.20, 1.60, 0.7),
  ('HD',  'Home Depot','equity','Consumer Discretionary','US','USD','pct',2, 378, 1.20, 1.00, 0.7),
  ('NKE', 'Nike Inc.','equity','Consumer Discretionary','US','USD','pct',2, 69, 1.80, 1.00, 0.7),
  ('PG',  'Procter & Gamble','equity','Consumer Staples','US','USD','pct',2, 153, 0.90, 0.40, 0.8),
  ('KO',  'Coca-Cola Co.','equity','Consumer Staples','US','USD','pct',2, 67, 0.85, 0.35, 0.8),
  ('WMT', 'Walmart Inc.','equity','Consumer Staples','US','USD','pct',2, 99, 1.00, 0.45, 0.8),
  ('COST','Costco Wholesale','equity','Consumer Staples','US','USD','pct',2, 895, 1.10, 0.60, 0.8),
  ('NEE', 'NextEra Energy','equity','Utilities','US','USD','pct',2, 79, 1.30, 0.55, 0.9),
  ('DUK', 'Duke Energy','equity','Utilities','US','USD','pct',2, 124, 0.95, 0.40, 0.9),
  ('GOOGL','Alphabet Inc.','equity','Communication Services','US','USD','pct',2, 243, 1.55, 1.10, 0.8),
  ('META','Meta Platforms','equity','Communication Services','US','USD','pct',2, 715, 2.00, 1.25, 0.8),
  ('DIS', 'Walt Disney Co.','equity','Communication Services','US','USD','pct',2, 108, 1.60, 1.05, 0.8)
) as t(symbol, name, asset_class, sector, region, currency, unit, decimals, base, vol, beta, sload);
