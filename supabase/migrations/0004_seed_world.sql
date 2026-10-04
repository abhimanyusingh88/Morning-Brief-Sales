-- Synthetic firm generator. Deterministic (hash-based), re-runnable for any as-of date.
-- All people, clients and notes are fictional. Prices/levels are simulator placeholders.

create or replace function app.next_bday(d date) returns date
language sql immutable as $$
  select case extract(isodow from d + 1)::int when 6 then d + 3 when 7 then d + 2 else d + 1 end
$$;

create or replace function app.seed_world(p_asof date) returns jsonb
language plpgsql security definer set search_path = public, app as $f$
declare
  prefixes text[] := array['Aldergate','Brackenridge','Corvane','Dunmere','Eastwick','Fenwood','Garrowby','Halsted','Ingleby','Jessamine','Kestrel Point','Larchmont','Marlowe','Northfield','Oakhaven','Pemberton','Quillan','Ravenscar','Stillwater','Thornbury','Underhill','Valemont','Wexcombe','Yarrow','Zephyr Hill','Ashcombe','Bellrose','Calloway','Draycott','Elmstead','Foxhollow','Gresham Hall','Hawksworth','Ironbridge','Juniper Lane','Kingsmere','Lowell Crest','Merriden','Norcross','Orrington','Penhallow','Redfern','Sandringham','Tennant','Ullswater','Vantage Row','Whitlock','Yewdale','Ardmore','Blackthorn','Carrow','Denholm','Evesham','Fairmont Bay','Glenrock','Harcourt','Isleworth','Kelvedon','Lyndhurst','Montclair Road','Newhaven','Oldcastle','Prestwick','Rosedale','Silverbrook','Tarrington','Upland','Westerleigh','Winterbourne','Ashbourne'];
  sfx_hf  text[] := array['Capital Management','Partners LP','Global Macro','Advisors','Opportunity Fund'];
  sfx_am  text[] := array['Asset Management','Investment Partners','Investors','Wealth Partners','Fiduciary Group'];
  sfx_pn  text[] := array['Pension Fund','Retirement System','Teachers Retirement Fund','Employees Retirement Plan','Public Pension Trust'];
  sfx_in  text[] := array['Life & Annuity','Mutual Insurance','Reinsurance','Assurance','Insurance Group'];
  sfx_bk  text[] := array['Bank Treasury','Trust & Savings','Bancorp','Private Bank','Financial Treasury'];
  sfx_co  text[] := array['Industries Treasury','Corporate Treasury','Holdings Treasury'];
  firsts  text[] := array['James','Olivia','Michael','Sophia','David','Emma','Robert','Ava','William','Isabella','Richard','Mia','Thomas','Charlotte','Joseph','Amelia','Christopher','Harper','Daniel','Evelyn','Matthew','Abigail','Anthony','Emily','Mark','Ella','Steven','Grace','Paul','Chloe','Andrew','Victoria','Kenneth','Lily','Joshua','Hannah','Kevin','Zoe','Brian','Nora','George','Leah','Edward','Naomi','Ronald','Claire','Timothy','Priya','Arjun','Wei','Hiroshi','Yuki','Lars','Ingrid','Marco','Giulia','Pierre','Camille','Omar','Fatima'];
  lasts   text[] := array['Whitmore','Calderon','Hargrove','Nakamura','Ellison','Brandt','Okonkwo','Castellano','Merrick','Lindgren','Ashworth','Delacroix','Pennington','Varga','Holloway','Sinclair','Kowalski','Fitzgerald','Moreau','Yamamoto','Abernathy','Sandoval','Thackeray','Rosenthal','Gallagher','Ivanov','Prescott','Mehta','Larsen','Bellamy','Osei','Fairbanks','Lombardi','Hartwell','Chaudhry','Winslow','Pryor','Navarro','Eriksen','Durand','Kimura','Banerjee','Whitaker','Quinlan','Schaefer','Montrose','Abbott','Reyes','Tran','Novak'];
  mandates_hf text[] := array['Global macro, discretionary','Long/short equity, market neutral bias','Credit relative value','Multi-strategy, rates and FX overlay','Event-driven, concentrated book'];
  mandates_am text[] := array['Core fixed income, benchmark aware','Large-cap growth equity','Global balanced, liability aware','Dividend and quality equity','Sector-focused long-only'];
  mandates_pn text[] := array['Liability-driven investing, long duration','Diversified, strategic asset allocation','Core plus fixed income with credit sleeve'];
  mandates_in text[] := array['Asset-liability matching, investment grade','Long-dated credit and private placements','Short-duration liquidity portfolio'];
  mandates_bk text[] := array['Treasury and liquidity management','Securities book, HQLA focus','Balance-sheet hedging program'];
  mandates_co text[] := array['Cash and short-term investment policy','Pension de-risking and rate hedging'];
  titles_inv text[] := array['Chief Investment Officer','Head of Trading','Portfolio Manager','Senior Portfolio Manager','Head of Fixed Income','Head of Equities','Director of Trading','Trader','Investment Analyst'];
  titles_trs text[] := array['Treasurer','Deputy Treasurer','Head of Investments','Chief Investment Officer','Portfolio Manager','Head of Trading'];
  cities_us text[] := array['New York','Boston','Chicago','San Francisco','Greenwich','Houston','Philadelphia','Minneapolis'];
  countries_o text[] := array['United Kingdom','Germany','Switzerland','Netherlands','Japan','Singapore','Canada','Australia','France'];
  tags_rcs text[] := array['duration','curve','ig_credit','hy_credit','inflation','central_banks','rates_vol','new_issue','liability_hedging','Financials','Technology','Energy','Utilities','Healthcare'];
  tags_eqs text[] := array['Technology','Semiconductors','Financials','Healthcare','Energy','Industrials','Consumer Discretionary','Consumer Staples','Utilities','Communication Services','ai_capex','earnings','small_cap','buybacks','volatility'];
  rep record;
  k int := 0;
  i int;
  n_clients int;
  last_day date;
  prev_day date;
  nxt date;
begin
  select max(d) into last_day from (select d::date d from generate_series(p_asof - 6, p_asof, '1 day') d where extract(isodow from d) < 6) x;
  last_day := coalesce(last_day, p_asof);

  truncate public.clients, public.events, public.market_bars, public.market_quotes, public.briefs,
           public.pipeline_runs, public.chat_threads, public.audit_log, public.signals cascade;

  create temp table _days on commit drop as
    select d::date as d, row_number() over (order by d)::int as n
    from generate_series(p_asof - 190, p_asof, '1 day') d where extract(isodow from d) < 6;

  -- ------------------------------------------------------------ market history
  create temp table _mk on commit drop as
    select d, n, app.rnorm('m:' || d) m, app.rnorm('r:' || d) rf, app.rnorm('c:' || d) cf from _days;
  create temp table _sec on commit drop as
    select s.sector, d.d, app.rnorm('s:' || s.sector || d.d) f
    from (select distinct sector from public.instruments) s cross join _days d;

  insert into public.market_bars (instrument_id, d, close, volume, source)
  select id, d, close, volume, 'sim'
  from (
    select id, d, asset_class, base,
      case
        when asset_class in ('equity','index','fx','commodity','vol') then base * exp(cum - last_value(cum) over w + 0.022 * app.rnorm('end:' || id))
        when asset_class = 'rates'  then base + (cum - last_value(cum) over w) + 0.07 * app.rnorm('end:' || id)
        else greatest(12, base * (1 + 0.07 * app.rnorm('end:' || id)) + (cum - last_value(cum) over w))
      end as close,
      case when asset_class = 'equity' then (4000000 * (0.5 + app.rnd('v:' || id || d)) * greatest(1, 200 / base))::bigint end as volume
    from (
      select id, d, n, asset_class, base,
        sum(step) over (partition by id order by n) as cum
      from (
        select i.id, k.d, k.n, i.asset_class,
          (i.meta->>'base')::double precision as base,
          case
            when i.asset_class in ('equity','index','fx','commodity','vol') then
              (i.meta->>'vol')::double precision / 100.0 * (
                av.a * sign((i.meta->>'beta')::double precision) * k.m
                + bv.b * coalesce(sc.f, 0)
                + cv.c * app.rnorm('i:' || i.id || k.d))
            when i.asset_class = 'rates' then
              (i.meta->>'vol')::double precision / 100.0 *
                ((case i.symbol when 'UST2Y' then 0.8 when 'UST5Y' then 0.9 when 'UST10Y' then 1.0 when 'UST30Y' then 0.95 else 0.55 end) * k.rf
                 + 0.55 * app.rnorm('i:' || i.id || k.d))
            else
              (i.meta->>'vol')::double precision * (-0.5 * k.m + 0.55 * k.cf + 0.55 * app.rnorm('i:' || i.id || k.d))
          end as step
        from public.instruments i
        cross join _mk k
        left join _sec sc on sc.sector = i.sector and sc.d = k.d
        cross join lateral (
          select case i.asset_class when 'index' then 0.93 when 'vol' then 0.9 when 'fx' then 0.2 when 'commodity' then 0.3
                   when 'equity' then least(0.7, 0.35 + 0.3 * abs((i.meta->>'beta')::double precision)) else 0.3 end as a
        ) av
        cross join lateral (
          select case when (i.meta->>'sload')::double precision > 0 then sqrt(1 - av.a * av.a) * 0.7 else 0 end as b
        ) bv
        cross join lateral (select sqrt(greatest(0.05, 1 - av.a * av.a - bv.b * bv.b)) as c) cv
      ) s
    ) t
    window w as (partition by id order by n rows between unbounded preceding and unbounded following)
  ) z;

  insert into public.market_quotes (instrument_id, as_of, last, prev_close, chg, source)
  select i.id,
         ((p_asof + time '16:00') at time zone 'America/New_York'),
         b1.close, b0.close,
         case i.asset_class
           when 'rates'  then (b1.close - b0.close) * 100
           when 'credit' then (b1.close - b0.close)
           when 'vol'    then (b1.close - b0.close)
           else (b1.close / b0.close - 1) * 100 end,
         'sim-eod'
  from public.instruments i
  join lateral (select close, d from public.market_bars where instrument_id = i.id order by d desc limit 1) b1 on true
  join lateral (select close from public.market_bars where instrument_id = i.id and d < b1.d order by d desc limit 1) b0 on true;

  -- ------------------------------------------------------------ clients
  create temp table _ints (client_id uuid, tag text) on commit drop;
  for rep in
    select p.id, p.full_name, d.code
    from public.profiles p join public.desks d on d.id = p.desk_id
    where p.role = 'sales' order by p.full_name
  loop
    n_clients := 18;
    for i in 1..n_clients loop
      k := k + 1;
      declare
        u double precision := app.rnd('seg:' || k);
        seg text;
        cid uuid := app.uid('client:' || k);
        pfx text := prefixes[1 + ((k * 7) % array_length(prefixes, 1))];
        sidx int := (k / array_length(prefixes, 1));
        sfx text; mand text; aum numeric; tier int; ctry text; reg text; city text;
        since date; dormant boolean; risk text; nm text;
        nct int; j int; fn text; ln text; ttl text; tags text[]; dom text;
      begin
        if rep.code = 'RCS' then
          seg := case when u < 0.25 then 'pension' when u < 0.50 then 'insurer' when u < 0.72 then 'asset_manager' when u < 0.88 then 'bank' when u < 0.96 then 'hedge_fund' else 'corporate' end;
        else
          seg := case when u < 0.42 then 'hedge_fund' when u < 0.88 then 'asset_manager' when u < 0.95 then 'pension' else 'bank' end;
        end if;
        sfx := case seg
          when 'hedge_fund' then sfx_hf[1 + sidx % 5] when 'asset_manager' then sfx_am[1 + sidx % 5]
          when 'pension' then sfx_pn[1 + sidx % 5] when 'insurer' then sfx_in[1 + sidx % 5]
          when 'bank' then sfx_bk[1 + sidx % 5] else sfx_co[1 + sidx % 3] end;
        mand := case seg
          when 'hedge_fund' then app.pick(mandates_hf, 'md' || k) when 'asset_manager' then app.pick(mandates_am, 'md' || k)
          when 'pension' then app.pick(mandates_pn, 'md' || k) when 'insurer' then app.pick(mandates_in, 'md' || k)
          when 'bank' then app.pick(mandates_bk, 'md' || k) else app.pick(mandates_co, 'md' || k) end;
        aum := exp(ln(1500) + 1.3 * app.rnorm('aum:' || k)) * case seg when 'hedge_fund' then 0.45 when 'pension' then 3 when 'insurer' then 2.2 else 1 end;
        aum := round(least(450000, greatest(150, aum)));
        tier := case when aum >= 6000 then 1 when aum >= 1200 then 2 else 3 end;
        u := app.rnd('geo:' || k);
        if u < 0.72 then ctry := 'United States'; reg := 'Americas'; city := app.pick(cities_us, 'city' || k);
        elsif u < 0.80 then ctry := 'Canada'; reg := 'Americas'; city := 'Toronto';
        else ctry := app.pick(countries_o, 'ctry' || k); reg := case when ctry in ('Japan','Singapore','Australia') then 'APAC' else 'EMEA' end; city := ctry; end if;
        since := p_asof - (400 + floor(app.rnd('since:' || k) * 3800))::int;
        dormant := app.rnd('dorm:' || k) < 0.06;
        risk := case when seg = 'hedge_fund' then 'aggressive' when seg in ('pension','insurer','bank','corporate') then 'conservative' else 'moderate' end;
        nm := pfx || ' ' || sfx;

        insert into public.clients (id, name, short_name, segment, region, country, tier, aum_usd_mn, relationship_since, mandate, risk_appetite, status)
        values (cid, nm, pfx || ' ' || split_part(sfx, ' ', 1), seg, reg, ctry, tier, aum, since, mand, risk, case when dormant then 'dormant' else 'active' end);

        insert into public.coverage values (cid, rep.id, 'primary');
        if app.rnd('sec:' || k) < 0.2 then
          insert into public.coverage
          select cid, p2.id, 'secondary' from public.profiles p2
          join public.desks d2 on d2.id = p2.desk_id
          where p2.role = 'sales' and d2.code = rep.code and p2.id <> rep.id
          order by app.rnd('secp:' || k || p2.id) limit 1;
        end if;

        dom := lower(regexp_replace(pfx, '[^A-Za-z]', '', 'g')) || '.com';
        nct := 2 + (case when app.rnd('nct:' || k) > 0.55 then 1 else 0 end);
        for j in 1..nct loop
          fn := app.pick(firsts, 'fn' || k || j); ln := app.pick(lasts, 'ln' || k || j);
          ttl := case when seg in ('pension','insurer','bank','corporate') then app.pick(titles_trs, 'tt' || k || j) else app.pick(titles_inv, 'tt' || k || j) end;
          if j = 1 and ttl in ('Trader','Investment Analyst') then ttl := 'Portfolio Manager'; end if;
          insert into public.contacts (id, client_id, full_name, title, email, phone, is_primary, timezone)
          values (app.uid('contact:' || k || ':' || j), cid, fn || ' ' || ln, ttl,
                  lower(left(fn,1) || '.' || regexp_replace(ln, '[^A-Za-z]', '', 'g')) || '@' || dom,
                  '+1 212 555 01' || lpad(((k * 7 + j * 13) % 100)::text, 2, '0'), j = 1,
                  case reg when 'EMEA' then 'Europe/London' when 'APAC' then 'Asia/Tokyo' else 'America/New_York' end);
        end loop;

        tags := case when rep.code = 'RCS' then tags_rcs else tags_eqs end;
        insert into _ints
        select cid, tag from unnest(tags) tag order by app.rnd('int:' || k || tag) limit 3 + (k % 2);
      end;
    end loop;
  end loop;

  insert into public.client_interests select client_id, tag, 1 + app.rnd('w:' || client_id || tag) from _ints;

  -- ------------------------------------------------------------ positions
  insert into public.positions (client_id, instrument_id, notional_usd, quantity, avg_cost, as_of)
  select c.id, p.instrument_id,
         p.notional, 
         case when i.asset_class = 'equity' then round(p.notional / q.last) else p.notional end,
         case when i.asset_class = 'equity' then round((q.last * (1 + 0.14 * least(1.5, greatest(-1.5, app.rnorm('ac:' || c.id || i.id)))))::numeric, 2)
              when i.asset_class = 'rates' then round((q.last + 0.25 * app.rnorm('ac:' || c.id || i.id))::numeric, 3)
              else round((q.last + 6 * app.rnorm('ac:' || c.id || i.id))::numeric, 1) end,
         p_asof
  from public.clients c
  join public.coverage cv on cv.client_id = c.id and cv.role = 'primary'
  join public.profiles pr on pr.id = cv.profile_id
  join public.desks d on d.id = pr.desk_id
  cross join lateral (
    select t.instrument_id,
           round((c.aum_usd_mn * 1e6 * (case when d.code = 'RCS' then 0.06 + 0.16 * app.rnd('bk:' || c.id) else 0.03 + 0.10 * app.rnd('bk:' || c.id) end)
                  * t.w / sum(t.w) over ()) / 1e5) * 1e5 as notional
    from (
      select i2.id as instrument_id, 0.3 + app.rnd('w:' || c.id || i2.id) as w,
             row_number() over (order by (app.rnd('pick:' || c.id || i2.id) + case when exists (select 1 from public.client_interests ci where ci.client_id = c.id and ci.tag = i2.sector) then 0.55 else 0 end) desc) as rk
      from public.instruments i2
      where (d.code = 'RCS' and i2.asset_class in ('rates','credit'))
         or (d.code = 'EQS' and i2.asset_class = 'equity')
    ) t
    where t.rk <= (case when d.code = 'RCS' then 5 else 6 end) + floor(app.rnd('np:' || c.id) * 5)
  ) p
  join public.instruments i on i.id = p.instrument_id
  join public.market_quotes q on q.instrument_id = i.id
  where p.notional > 0;

  -- ------------------------------------------------------------ trades (90 days)
  insert into public.trades (id, client_id, instrument_id, profile_id, side, quantity, price, notional_usd, traded_at)
  select app.uid('trade:' || x.client_id || x.instrument_id || g), x.client_id, x.instrument_id, cv.profile_id,
         case when app.rnd('side:' || x.client_id || x.instrument_id || g) < 0.58 then 'buy' else 'sell' end,
         round(x.quantity * (0.04 + 0.22 * app.rnd('tq:' || x.client_id || x.instrument_id || g))),
         b.close,
         case when i.asset_class = 'equity' then round(x.quantity * (0.04 + 0.22 * app.rnd('tq:' || x.client_id || x.instrument_id || g)) * b.close)
              else round(x.quantity * (0.04 + 0.22 * app.rnd('tq:' || x.client_id || x.instrument_id || g))) end,
         ((b.d + time '09:30' + (app.rnd('tt:' || x.client_id || x.instrument_id || g) * interval '6 hours')) at time zone 'America/New_York')
  from public.positions x
  join public.instruments i on i.id = x.instrument_id
  join public.coverage cv on cv.client_id = x.client_id and cv.role = 'primary'
  cross join generate_series(1, 3) g
  join _days dd on dd.n = (select max(n) from _days) - floor(app.rnd('td:' || x.client_id || x.instrument_id || g) * 85)::int
  join public.market_bars b on b.instrument_id = x.instrument_id and b.d = dd.d
  where app.rnd('tn:' || x.client_id || x.instrument_id || g) < 0.5;

  -- ------------------------------------------------------------ CRM history
  create temp table _notes (desk text, kind text, subj text, body text) on commit drop;
  insert into _notes values
   ('RCS','call','Curve and duration check-in','Walked through the front end after the latest data. Client leaning to add duration via {inst} if levels back up; wants to see numbers before committee.'),
   ('RCS','call','Liability hedging','Reviewed liability-hedging needs. Contact asked for color on {inst} and how supply gets absorbed. Agreed to revisit after the next auction.'),
   ('RCS','call','Credit risk trim','Client trimming {sector} credit exposure; asked about relative value versus {inst}. Wants two-way prices, no urgency.'),
   ('RCS','call','Market tone','Quick check-in on market tone. Not active this week given quarter-end budget constraints. Keep warm.'),
   ('RCS','call','Hedge into central bank meeting','Discussed cost of hedging into the policy meeting. Interested in {inst} as a hedge; will come back with size.'),
   ('RCS','email','Levels and positioning note','Sent levels and a short note on positioning in {inst}. Client acknowledged, no immediate action.'),
   ('RCS','email','Auction preview','Shared auction preview and supply expectations. Contact replied asking about demand from real-money accounts.'),
   ('RCS','email','Credit new issue','Passed along new-issue color in {sector}. Client wants spread levels versus secondary before deciding.'),
   ('RCS','meeting','Quarterly review','Quarterly review with CIO and head of trading. Mandate unchanged; appetite for {sector} credit remains selective. Action: follow up with relative-value ideas.'),
   ('RCS','meeting','Portfolio strategy session','Walked through portfolio strategy and risk limits. Client open to extending duration on {inst} over the next quarter.'),
   ('RCS','chat','Quick price check','Asked for an indication on {inst}. Provided levels; client did not trade.'),
   ('EQS','call','Sector positioning','Discussed {sector} positioning heading into earnings. Client holds a sizeable overweight and asked for color on {inst}.'),
   ('EQS','call','Idea follow-up','Followed up on the {inst} idea. Contact likes the setup but wants a better entry; will revisit on weakness.'),
   ('EQS','call','Flow color','Gave flow color on {sector}. Client has been a net seller into strength and is cautious on valuation.'),
   ('EQS','call','Risk reduction','Client reducing gross exposure; asked about liquidity in {inst}. Agreed to work an order if the tape cooperates.'),
   ('EQS','call','Catch-up','Catch-up call. Not much activity this week; interested in hearing about {sector} catalysts next month.'),
   ('EQS','email','Earnings preview','Sent earnings preview on {inst}. Client asked for consensus drivers and what the options market is implying.'),
   ('EQS','email','Research note','Forwarded the sector note on {sector}. Contact acknowledged and flagged it for the PM.'),
   ('EQS','email','Axe and inventory','Shared current axes in {sector}. Client replied that they are looking at {inst} but need to clear a compliance check first.'),
   ('EQS','meeting','Quarterly review','Quarterly review with the PM team. Focus on {sector} and capacity constraints. Action: send a short list of ideas ahead of next meeting.'),
   ('EQS','meeting','Portfolio walk-through','Walked through current book and thematic exposure. Client wants more on {inst} and peers.'),
   ('EQS','chat','Quick color','Asked for color on {inst} into the open. Provided; client did not trade.');

  insert into public.interactions (id, client_id, contact_id, profile_id, kind, occurred_at, subject, note, sentiment, outcome)
  select app.uid('int:' || c.id || g), c.id, ct.id, cv.profile_id, nt.kind,
         ((p_asof - dys + time '08:30' + (app.rnd('ih:' || c.id || g) * interval '8 hours')) at time zone 'America/New_York'),
         nt.subj,
         replace(replace(nt.body, '{inst}', coalesce(ph.name, 'the position')), '{sector}', coalesce(ph.sector, 'the sector')),
         case when app.rnd('sn:' || c.id || g) < 0.15 then -1 when app.rnd('sn:' || c.id || g) < 0.65 then 0 else 1 end,
         case when app.rnd('oc:' || c.id || g) < 0.3 then 'Follow-up agreed' when app.rnd('oc:' || c.id || g) < 0.5 then 'Traded' else 'No action' end
  from public.clients c
  join public.coverage cv on cv.client_id = c.id and cv.role = 'primary'
  join public.profiles pr on pr.id = cv.profile_id
  join public.desks d on d.id = pr.desk_id
  cross join generate_series(1, 12) g
  cross join lateral (select (floor(power(app.rnd('dy:' || c.id || g), 1.7) * 140)::int + (case when c.status = 'dormant' then 62 else 0 end)) as dys0) dd0
  cross join lateral (select dd0.dys0 as dys) dd
  cross join lateral (select ct0.id from public.contacts ct0 where ct0.client_id = c.id order by app.rnd('ct:' || c.id || g || ct0.id) limit 1) ct
  cross join lateral (select n0.* from _notes n0 where n0.desk = d.code order by app.rnd('nt:' || c.id || g || n0.subj) limit 1) nt
  left join lateral (
    select i.name, i.sector from public.positions p join public.instruments i on i.id = p.instrument_id
    where p.client_id = c.id order by app.rnd('ph:' || c.id || g || i.id) limit 1) ph on true
  where g <= 3 + floor(app.rnd('ni:' || c.id) * 8);

  insert into public.followups (id, client_id, profile_id, due_on, text, status)
  select app.uid('fu:' || c.id), c.id, cv.profile_id,
         p_asof + (floor(app.rnd('fd:' || c.id) * 8) - 3)::int,
         (array['Send levels and recent flow on ' || coalesce(ph.name, 'the book'),
                'Follow up on ' || coalesce(ph.sector, 'sector') || ' idea',
                'Schedule quarterly review',
                'Share earnings preview for ' || coalesce(ph.name, 'holdings')])[1 + floor(app.rnd('ft:' || c.id) * 4)::int],
         'open'
  from public.clients c
  join public.coverage cv on cv.client_id = c.id and cv.role = 'primary'
  left join lateral (select i.name, i.sector from public.positions p join public.instruments i on i.id = p.instrument_id where p.client_id = c.id order by app.rnd('fph:' || c.id || i.id) limit 1) ph on true
  where app.rnd('fu:' || c.id) < 0.22;

  -- ------------------------------------------------------------ event history + upcoming calendar
  create temp table _titles (sector text, title text) on commit drop;
  insert into _titles values
   ('Technology','Software names mixed as buyers wait for next round of guidance'),
   ('Technology','Large-cap tech consolidates after extended run'),
   ('Technology','Enterprise spending commentary supports cloud names'),
   ('Semiconductors','Chip stocks firm on supply-chain commentary'),
   ('Semiconductors','Semiconductor names slip as export-rule chatter resurfaces'),
   ('Semiconductors','Memory pricing check-ins keep sector bid'),
   ('Financials','Banks drift as curve flattens'),
   ('Financials','Financials bid on steeper curve and trading-revenue expectations'),
   ('Financials','Regional lenders lag as funding-cost worries linger'),
   ('Healthcare','Healthcare rotates higher as defensives find a bid'),
   ('Healthcare','Managed care under pressure on utilization commentary'),
   ('Energy','Energy names track crude lower'),
   ('Energy','Oil services firm on capex expectations'),
   ('Industrials','Industrials mixed as order-book data come in light'),
   ('Industrials','Aerospace names bid on delivery-rate expectations'),
   ('Consumer Discretionary','Retail names cautious ahead of holiday guidance'),
   ('Consumer Discretionary','Auto sector volatile on demand signals'),
   ('Consumer Staples','Staples hold up as investors seek defensives'),
   ('Utilities','Utilities lag as yields back up'),
   ('Utilities','Utilities bid on power-demand narrative'),
   ('Communication Services','Internet platforms consolidate into earnings'),
   ('Communication Services','Media names slip on advertising commentary');

  insert into public.events (id, business_date, kind, title, summary, occurred_at, sector, tags, severity, entitlement, simulated, source_label)
  select app.uid('ev:' || d.d || g), d.d, 'news', t.title,
         'Sector commentary from the simulated news feed. Moves are indicative and not attributed to a specific publisher.',
         ((d.d + time '07:00' + (app.rnd('evt:' || d.d || g) * interval '9 hours')) at time zone 'America/New_York'),
         t.sector, array[t.sector], 1 + (case when app.rnd('evs:' || d.d || g) > 0.8 then 1 else 0 end),
         'public', true, 'Simulated newswire'
  from _days d cross join generate_series(1, 2) g
  cross join lateral (
    select sector, title from _titles
    order by app.rnd('evtl:' || d.d || g || title) limit 1) t
  where d.d >= p_asof - 60 and app.rnd('evp:' || d.d || g) < 0.6;

  -- earnings history and upcoming (placeholder calendar)
  insert into public.events (id, business_date, kind, title, summary, occurred_at, instrument_id, sector, tags, severity, entitlement, simulated, source_label)
  select app.uid('earn:' || i.id || o.off), dt.d, 'earnings',
         i.name || ' reports quarterly results',
         case when dt.d <= p_asof then 'Quarterly results published; guidance and margin trajectory were the focus.' else 'Scheduled quarterly results. Consensus drivers and positioning to be reviewed before the release.' end,
         ((dt.d + case when app.rnd('et:' || i.id) < 0.5 then time '16:15' else time '06:30' end) at time zone 'America/New_York'),
         i.id, i.sector, array[i.symbol, i.sector, 'earnings'], 2, 'public', true, 'Simulated calendar'
  from public.instruments i
  cross join lateral (select (floor(app.rnd('eo:' || i.id) * 44) - 22)::int as off) o
  cross join lateral (
    select (p_asof + o.off)::date + (case extract(isodow from (p_asof + o.off)::date)::int when 6 then 2 when 7 then 1 else 0 end) as d) dt
  where i.asset_class = 'equity' and app.rnd('ep:' || i.id) < 0.8 and dt.d <> app.next_bday(p_asof);

  -- macro calendar (placeholder dates; replaced by a live calendar feed)
  insert into public.events (id, business_date, kind, title, summary, occurred_at, tags, severity, entitlement, simulated, source_label)
  select app.uid('macro:' || m.title || m.off), dd.d, 'macro', m.title, m.summ,
         ((dd.d + m.tm) at time zone 'America/New_York'), m.tags, m.sev, 'public', true, 'Simulated calendar'
  from (values
    (-10, 'Manufacturing PMI', 'Monthly survey of purchasing managers. Direction of new orders watched for growth signal.', time '10:00', array['growth','rates']::text[], 1),
    (-6,  'JOLTS job openings', 'Labor-market turnover data. Watched for softening in hiring demand.', time '10:00', array['labor','rates'], 1),
    (-3,  'Nonfarm payrolls', 'Monthly employment report. Headline payrolls, unemployment rate and wage growth drive rate expectations.', time '08:30', array['labor','rates','central_banks'], 3),
    (-1,  'Services PMI', 'Monthly survey of services activity. Prices-paid component watched for inflation signal.', time '10:00', array['growth','inflation'], 1),
    (2,   'Treasury auction: 10-year note', 'Supply event. Demand metrics (bid-to-cover, indirect take-up) shape duration appetite.', time '13:00', array['supply','duration','rates'], 2),
    (3,   'Consumer price index', 'Monthly inflation report. Core services and shelter components in focus.', time '08:30', array['inflation','rates','central_banks'], 3),
    (4,   'Treasury auction: 30-year bond', 'Supply event for long-end duration buyers.', time '13:00', array['supply','duration','rates'], 2),
    (5,   'Producer price index', 'Wholesale inflation measure; feeds into core PCE estimates.', time '08:30', array['inflation'], 1),
    (7,   'Central bank minutes', 'Minutes of the latest policy meeting. Watched for balance-sheet and path language.', time '14:00', array['central_banks','rates'], 2),
    (9,   'Retail sales', 'Monthly consumer spending data.', time '08:30', array['growth'], 2)
  ) as m(off, title, summ, tm, tags, sev)
  cross join lateral (select (p_asof + m.off)::date + (case extract(isodow from (p_asof + m.off)::date)::int when 6 then 2 when 7 then 1 else 0 end) as d) dd;

  -- information-barrier example: restricted deal-flow item, invisible to sales
  insert into public.events (id, business_date, kind, title, summary, occurred_at, instrument_id, sector, tags, severity, entitlement, simulated, source_label)
  select app.uid('ib:' || i.symbol), p_asof, 'corporate_action', 'Restricted: advisory mandate on ' || i.name,
         'Wall-crossed information. Visible to Compliance only; must never reach sales surfaces or model prompts.',
         ((p_asof + time '09:15') at time zone 'America/New_York'), i.id, i.sector, array[i.symbol,'restricted'], 3, 'restricted_ib', true, 'Internal'
  from public.instruments i where i.symbol in ('MU','UNP');

  nxt := app.next_bday(p_asof);
  update public.firm_settings set business_date = nxt, updated_at = now();

  return jsonb_build_object(
    'as_of', p_asof, 'business_date', nxt,
    'clients', (select count(*) from public.clients),
    'contacts', (select count(*) from public.contacts),
    'positions', (select count(*) from public.positions),
    'trades', (select count(*) from public.trades),
    'interactions', (select count(*) from public.interactions),
    'followups', (select count(*) from public.followups),
    'events', (select count(*) from public.events),
    'bars', (select count(*) from public.market_bars));
end;
$f$;

revoke all on function app.seed_world(date) from public, anon, authenticated;
grant execute on function app.seed_world(date) to service_role;
