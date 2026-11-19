import { ArrowDownRight, ArrowRight, ArrowUpRight, ChevronDown, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import { cn } from '@/lib/cn';
import {
  GROUPS,
  WEEK,
  money,
  pct,
  plainNote,
  weekday,
  type EtfBook,
  type EtfNote,
  type FlowLine,
  type GroupLines,
  type GroupView,
} from '@/lib/live/etf';
import { stamp } from '@/lib/live/time';
import { CopyNote, ShiftChart } from './etf-charts';

const short = (d: string) =>
  new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const dayShort = (d: string) =>
  new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
// Colour follows the effect on net exposure, not the sign of the flow: redeeming an inverse fund is long-ward.
const effectTone = (v: number) => (v > 0 ? 'text-up' : v < 0 ? 'text-down' : 'text-ink');
const moveTone = (v: number | null | undefined) =>
  v == null ? 'text-muted' : v > 0 ? 'text-up' : v < 0 ? 'text-down' : 'text-ink';
const MONEY = /([+−-]?\$\d[\d,.]*[BMK]?)/g;

/** Prose with dollar figures set in tabular bold; colour is carried by the line's own effect marker. */
function Money({ text, light = false }: { text: string; light?: boolean }) {
  return (
    <>
      {text.split(MONEY).map((p, i) =>
        i % 2 ? (
          <span key={i} className={cn('num whitespace-nowrap font-semibold', light ? 'text-white' : 'text-ink')}>
            {p}
          </span>
        ) : (
          p
        ),
      )}
    </>
  );
}

function Line({ line }: { line: FlowLine }) {
  const long = line.effect === 'long';
  const rest = line.text.slice(line.text.indexOf('→') + 1).trim();
  return (
    <li className="flex gap-3 py-1.5">
      <span
        className={cn('mt-[10px] h-2 w-2 shrink-0 rounded-full', long ? 'bg-up' : 'bg-down')}
        aria-label={long ? 'toward long exposure' : 'toward short exposure'}
      />
      <p className="min-w-0 text-[15px] leading-7 text-ink-2">
        <span className="mono font-semibold text-ink">{line.ticker}</span>{' '}
        <span className={cn('num font-semibold', long ? 'text-up' : 'text-down')}>
          {line.text.split(':')[1].split('→')[0].trim()}
        </span>{' '}
        <ArrowRight size={12} className="inline align-[-1px] text-muted" /> <Money text={rest} />
      </p>
    </li>
  );
}

function FlowBlock({ title, groups }: { title: string; groups: GroupLines[] }) {
  const any = groups.some((g) => g.lines.length);
  return (
    <div>
      <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">{title}</p>
      {any ? (
        <div className="mt-2 space-y-3">
          {groups
            .filter((g) => g.lines.length)
            .map((g) => (
              <div key={g.key}>
                <p className="text-[14px] font-semibold text-ink">{g.label}</p>
                <ul>
                  {g.lines.map((l) => (
                    <Line key={l.ticker} line={l} />
                  ))}
                </ul>
                {g.combined ? (
                  <p
                    className={cn(
                      'mt-2 rounded-md px-3 py-2 text-[14px] font-medium',
                      g.combined.net >= 0 ? 'bg-up-50 text-up' : 'bg-down-50 text-down',
                    )}
                  >
                    {g.combined.text}
                  </p>
                ) : null}
              </div>
            ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">No issuer flows reported for this period yet.</p>
      )}
    </div>
  );
}

function GroupCard({
  week,
  latest,
  move,
}: {
  week: GroupView;
  latest: GroupView;
  move: { day: number | null; week: number | null };
}) {
  const total = Math.abs(week.bull.exposure) + Math.abs(week.bear.exposure) || 1;
  const bullW = (Math.abs(week.bull.exposure) / total) * 100;
  const Icon = week.net > 0 ? ArrowUpRight : week.net < 0 ? ArrowDownRight : ArrowRight;
  return (
    <Card className="overflow-hidden">
      <div className={cn('h-1', week.net > 0 ? 'bg-up' : week.net < 0 ? 'bg-down' : 'bg-line')} />
      <CardBody className="space-y-3 py-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{week.label}</p>
            <p className="mt-0.5 text-[11px] text-muted">{WEEK}-session net shift</p>
          </div>
          {!week.complete ? <Badge tone="amber">Partial</Badge> : null}
        </div>
        <p className={cn('num flex items-center gap-1 text-[26px] font-semibold tracking-tight', effectTone(week.net))}>
          <Icon size={22} />
          {money(Math.abs(week.net), false)}
          <span className="ml-1 text-[13px] font-medium">
            {week.net > 0 ? 'toward long' : week.net < 0 ? 'toward short' : 'flat'}
          </span>
        </p>
        <div>
          <div className="flex h-2 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
            <div className={week.bull.exposure >= 0 ? 'bg-up' : 'bg-down'} style={{ width: bullW + '%' }} />
            <div
              className={week.bear.exposure <= 0 ? 'bg-down' : 'bg-up'}
              style={{ width: 100 - bullW + '%', opacity: 0.85 }}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-[11.5px]">
            <span className="text-muted">
              Long funds{' '}
              <span className={cn('num font-semibold', effectTone(week.bull.exposure))}>
                {money(week.bull.exposure)}
              </span>
            </span>
            <span className="text-muted">
              Inverse funds{' '}
              <span className={cn('num font-semibold', effectTone(week.bear.exposure))}>
                {money(week.bear.exposure)}
              </span>
            </span>
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-2 border-t border-line pt-3 text-[11.5px]">
          <div>
            <dt className="text-muted">Latest session</dt>
            <dd className={cn('num mt-0.5 font-semibold', effectTone(latest.net))}>{money(latest.net)}</dd>
          </div>
          <div>
            <dt className="text-muted">Index day</dt>
            <dd className={cn('num mt-0.5 font-semibold', moveTone(move.day))}>
              {move.day == null ? '—' : pct(move.day)}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Index {WEEK}d</dt>
            <dd className={cn('num mt-0.5 font-semibold', moveTone(move.week))}>
              {move.week == null ? '—' : pct(move.week)}
            </dd>
          </div>
        </dl>
      </CardBody>
    </Card>
  );
}

function VolCard({ book }: { book: EtfBook }) {
  const v = book.vol;
  if (!v)
    return (
      <Card className="h-full w-full">
        <CardHeader title="Volatility" />
        <EmptyState
          title="Volatility unavailable"
          body="VIX and S&P 500 closes could not be loaded. Try again shortly."
        />
      </Card>
    );
  const vixChg = v.vixPrev ? (v.vixNow / v.vixPrev - 1) * 100 : null;
  const narrowed =
    v.premiumNow != null && v.premiumPrev != null ? Math.abs(v.premiumNow) < Math.abs(v.premiumPrev) : null;
  return (
    <Card className="flex h-full w-full flex-col">
      <CardHeader title="Volatility" sub={'VIX versus 21-day realized on the S&P 500 · ' + stamp(v.vixAt)} />
      <CardBody className="grid flex-1 grid-cols-2 content-center gap-x-6 gap-y-8">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">VIX</p>
          <p className="num mt-1 text-[28px] font-semibold text-ink">{v.vixNow.toFixed(2)}</p>
          {/* A rising VIX is risk-off, so it takes the "down" colour. */}
          <p
            className={cn(
              'num text-xs font-semibold',
              vixChg == null ? 'text-muted' : vixChg > 0 ? 'text-down' : 'text-up',
            )}
          >
            {vixChg == null ? '' : pct(vixChg)}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Prior close</p>
          <p className="num mt-1 text-[28px] font-semibold text-ink">{v.vixPrev?.toFixed(2) ?? '—'}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">21d realized</p>
          <p className="num mt-1 text-[28px] font-semibold text-ink">
            {v.rvNow == null ? '—' : v.rvNow.toFixed(1) + '%'}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Implied − realized</p>
          <p className="num mt-1 text-[28px] font-semibold text-ink">
            {v.premiumNow == null ? '—' : v.premiumNow.toFixed(1)}
          </p>
          {v.premiumPrev != null ? (
            <p className={cn('text-xs', narrowed ? 'text-up' : 'text-down')}>
              {narrowed ? 'narrowed' : 'widened'} from{' '}
              <span className="num font-semibold">{v.premiumPrev.toFixed(1)}</span> pts
            </p>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}

const TH = 'px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted';
function FundTable({ book }: { book: EtfBook }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-xs">
        <caption className="sr-only">Creations and redemptions by fund, from issuer files.</caption>
        <thead className="bg-sunken/60">
          <tr>
            <th scope="col" className={TH + ' text-left'}>
              Fund
            </th>
            <th scope="col" className={TH + ' text-left'}>
              Leverage
            </th>
            <th scope="col" className={TH + ' text-right'}>
              {dayShort(book.latest)} flow
            </th>
            <th scope="col" className={TH + ' text-right'}>
              {dayShort(book.latest)} exposure
            </th>
            <th scope="col" className={TH + ' text-right'}>
              {WEEK}-session flow
            </th>
            <th scope="col" className={TH + ' text-right'}>
              {WEEK}-session exposure
            </th>
            <th scope="col" className={TH + ' text-right'}>
              AUM
            </th>
            <th scope="col" className={TH + ' text-right'}>
              Shares out
            </th>
            <th scope="col" className={TH + ' text-right'}>
              NAV
            </th>
            <th scope="col" className={TH + ' text-left'}>
              Source
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {(['semis', 'ndx', 'spx'] as const).map((k) => (
            <FundRows key={k} book={book} group={k} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
function FundRows({ book, group }: { book: EtfBook; group: keyof typeof GROUPS }) {
  const funds = book.funds.filter((f) => f.group === group);
  return (
    <>
      <tr className="bg-sunken/30">
        <td colSpan={10} className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-2">
          {GROUPS[group].label}
        </td>
      </tr>
      {funds.map((f) => (
        <tr key={f.ticker} className="hover:bg-sunken/40">
          <td className="px-3 py-2.5">
            <p className="mono font-semibold text-ink">{f.ticker}</p>
            <p className="mt-0.5 max-w-[240px] text-[11px] text-muted">{f.name}</p>
          </td>
          <td className="px-3">
            <Badge tone={f.leverage > 0 ? 'up' : 'down'}>
              {f.leverage > 0 ? '+' : '−'}
              {Math.abs(f.leverage)}× {f.leverage > 0 ? 'long' : 'inverse'}
            </Badge>
          </td>
          <td
            className={cn('num px-3 text-right font-semibold', f.latest ? effectTone(f.latest.exposure) : 'text-muted')}
          >
            {f.latest ? money(f.latest.flow) : '—'}
          </td>
          <td className={cn('num px-3 text-right', f.latest ? effectTone(f.latest.exposure) : 'text-muted')}>
            {f.latest ? money(f.latest.exposure) : '—'}
          </td>
          <td className={cn('num px-3 text-right font-semibold', f.week ? effectTone(f.week.exposure) : 'text-muted')}>
            {f.week ? money(f.week.flow) : '—'}
            {f.week && f.week.sessions < WEEK ? (
              <span className="ml-1 text-[10px] font-normal text-amber">({f.week.sessions}d)</span>
            ) : null}
          </td>
          <td className={cn('num px-3 text-right', f.week ? effectTone(f.week.exposure) : 'text-muted')}>
            {f.week ? money(f.week.exposure) : '—'}
          </td>
          <td className="num px-3 text-right text-ink-2">{f.aum == null ? '—' : money(f.aum, false)}</td>
          <td className="num px-3 text-right text-ink-2">
            {f.shares == null ? '—' : Math.round(f.shares).toLocaleString('en-US')}
          </td>
          <td className="num px-3 text-right text-ink-2">{f.nav == null ? '—' : f.nav.toFixed(2)}</td>
          <td className="px-3 text-[11px]">
            <a
              href={f.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-brand hover:underline"
            >
              {f.issuer} <ExternalLink size={11} />
            </a>
            <p className="text-muted">{f.asOf ? 'as of ' + short(f.asOf) : 'no data yet'}</p>
          </td>
        </tr>
      ))}
    </>
  );
}

export function EtfView({
  book,
  note,
  latest,
  week,
}: {
  book: EtfBook;
  note: EtfNote;
  latest: GroupLines[];
  week: GroupLines[];
}) {
  const copyText = plainNote(book, note, latest, week);
  const move = (k: string) => {
    const i = book.indices.find((x) => x.symbol === GROUPS[k as keyof typeof GROUPS].index);
    return { day: i?.day ?? null, week: i?.week ?? null };
  };
  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="space-y-4 bg-navy px-5 pb-5 pt-4 text-white">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-[12.5px] text-white/75">
              <span className="h-2 w-2 rounded-full bg-[#3ddc97]" aria-hidden="true" />
              <span className="font-semibold text-white">Leveraged ETF commentary — {weekday(book.latest)}</span>
              <span className="hidden sm:inline">· CR/RD through the {short(book.latest)} close</span>
            </div>
            <CopyNote text={copyText} />
          </div>
          <p className="max-w-5xl text-[19px] font-semibold leading-snug tracking-tight sm:text-[21px]">
            <Money text={note.headline} light />
          </p>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {book.groups.week.map((g) => (
              <div key={g.key} className="rounded-lg bg-white/[0.07] px-3 py-2.5">
                <dt className="text-[11px] font-medium text-white/65">
                  {g.label} · {WEEK}d
                </dt>
                <dd
                  className={cn(
                    'num mt-0.5 text-[17px] font-semibold',
                    Math.abs(g.net) < 0.5e6 ? 'text-white/80' : g.net > 0 ? 'text-[#3ddc97]' : 'text-[#ff8a80]',
                  )}
                >
                  {Math.abs(g.net) < 0.5e6 ? 'Flat' : money(g.net)}
                  <span className="ml-1 text-[11px] font-medium text-white/60">
                    {Math.abs(g.net) < 0.5e6 ? '' : g.net > 0 ? 'to long' : 'to short'}
                  </span>
                </dd>
              </div>
            ))}
            <div className="rounded-lg bg-white/[0.07] px-3 py-2.5">
              <dt className="text-[11px] font-medium text-white/65">VIX · premium</dt>
              <dd className="num mt-0.5 text-[17px] font-semibold text-white">
                {book.vol ? book.vol.vixNow.toFixed(2) : '—'}
                {book.vol?.premiumNow != null && book.vol.premiumPrev != null ? (
                  <span
                    className={cn(
                      'ml-1.5 text-[11px] font-medium',
                      Math.abs(book.vol.premiumNow) < Math.abs(book.vol.premiumPrev)
                        ? 'text-[#3ddc97]'
                        : 'text-[#ff8a80]',
                    )}
                  >
                    {Math.abs(book.vol.premiumNow) < Math.abs(book.vol.premiumPrev) ? 'narrowing' : 'widening'}
                  </span>
                ) : null}
              </dd>
            </div>
          </dl>
          <p className="text-[11px] text-white/55">
            {note.method === 'model' ? 'Desk-written from issuer figures' : 'Computed from issuer figures'} · green adds
            long or removes short exposure, red the reverse
          </p>
        </div>
        {/* The note itself, set like a printed page: one narrow column, read top to bottom in one pass. */}
        <CardBody className="bg-sunken/60 px-3 py-6 sm:px-6 sm:py-10">
          <article className="mx-auto max-w-[700px] rounded-md border border-line bg-surface px-6 py-8 shadow-card sm:px-12 sm:py-12">
            <header className="border-b border-line pb-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Leveraged ETF color</p>
              <h2 className="mt-1 text-[22px] font-semibold tracking-tight text-ink">{weekday(book.latest)}</h2>
              <p className="mt-1 text-xs text-muted">
                CR/RD through the {short(book.latest)} close ·{' '}
                {note.method === 'model' ? 'desk-written from issuer figures' : 'computed from issuer figures'}
              </p>
            </header>
            <div className="space-y-7 pt-6 text-[15px] leading-7 text-ink-2">
              <p className="text-ink">
                <span className="font-semibold">Bottom line: </span>
                <Money text={note.bottomLine} />
              </p>
              {note.volatility ? (
                <p className="border-l-2 border-line pl-4">
                  <Money text={note.volatility} />
                </p>
              ) : null}
              <FlowBlock title={dayShort(book.latest) + ' ' + short(book.latest) + ' CR/RD'} groups={latest} />
              <FlowBlock
                title={'Past ' + WEEK + ' sessions CR/RD (' + short(book.weekFrom) + '–' + short(book.latest) + ')'}
                groups={week}
              />
              {note.interpretation.length ? (
                <div className="space-y-4 border-t border-line pt-6">
                  {note.interpretation.map((p) => (
                    <p key={p}>
                      <Money text={p} />
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          </article>
        </CardBody>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {(['semis', 'ndx', 'spx'] as const).map((k) => (
          <GroupCard
            key={k}
            week={book.groups.week.find((g) => g.key === k)!}
            latest={book.groups.latest.find((g) => g.key === k)!}
            move={move(k)}
          />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader
            title="Net exposure shift by session"
            sub="Σ flow × leverage per group; above zero is toward long"
          />
          <CardBody className="text-ink">
            <ShiftChart rows={book.daily} />
          </CardBody>
        </Card>
        <div className="flex xl:col-span-2">
          <VolCard book={book} />
        </div>
      </div>

      <details className="group rounded-xl border border-line bg-surface shadow-card [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
          <span>
            <span className="block text-[15px] font-semibold text-ink">Fund detail and sources</span>
            <span className="block text-xs text-muted">
              Every fund&apos;s flow, exposure, AUM, shares and NAV, with links to the issuer files
            </span>
          </span>
          <ChevronDown size={18} className="shrink-0 text-muted transition-transform group-open:rotate-180" />
        </summary>
        <Card className="rounded-none border-0 border-t shadow-none">
          <CardHeader
            title="Fund detail"
            sub="Flow = change in shares outstanding × NAV. Target exposure = flow × daily leverage (negative for inverse funds)."
          />
          <FundTable book={book} />
        </Card>

        <div className="space-y-1 border-t border-line px-5 py-4 text-xs leading-relaxed text-muted">
          <p>
            Sources: ProShares daily NAV and shares-outstanding files (USD, SSG, TQQQ, SQQQ, QLD, UPRO, SPXU); Direxion
            daily holdings files for SOXL and SOXS, valued at each session&apos;s closing price; VIX, S&amp;P 500,
            Nasdaq-100 and PHLX Semiconductor closes from Yahoo Finance (delayed).
          </p>
          <p>
            Direxion publishes only the current share count, so SOXL and SOXS flows are built from daily snapshots
            stored by this app; a session appears once the snapshot before it was taken. Figures are computed from the
            issuers&apos; own files and can differ slightly from terminal-reported CR/RD because of timing and rounding.
          </p>
        </div>
      </details>
    </div>
  );
}
