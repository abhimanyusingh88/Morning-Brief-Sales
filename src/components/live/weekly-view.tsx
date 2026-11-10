import Link from 'next/link';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Sparkline } from '@/components/ui/chart';
import { ClientBars, WeekLines } from '@/components/live/weekly-charts';
import { Figures } from '@/components/ui/figures';
import { EmptyState } from '@/components/ui/states';
import { cn } from '@/lib/cn';
import { fmtPct, fmtUsd, type ClientMove, type WeeklyBook } from '@/lib/live/weekly';
import { stamp } from '@/lib/live/time';

const shortDay = (d: string) =>
  new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const tone = (v: number) => (v > 0 ? 'text-up' : v < 0 ? 'text-down' : 'text-ink');
const pathPoints = (c: { path: { pct: number }[] }) => c.path.map((p, i) => ({ t: i, v: p.pct }));

function Stat({ label, value, sub, className }: { label: string; value: string; sub?: string; className?: string }) {
  return (
    <Card>
      <CardBody className="py-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
        <p className={cn('num mt-1 text-[22px] font-semibold tracking-tight', className)}>{value}</p>
        {sub ? <p className="mt-0.5 text-xs text-muted">{sub}</p> : null}
      </CardBody>
    </Card>
  );
}

function MoverList({ title, clients, up }: { title: string; clients: ClientMove[]; up: boolean }) {
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Icon size={16} className={up ? 'text-up' : 'text-down'} /> {title}
          </span>
        }
        sub={up ? 'Clients whose book gained most this week' : 'Clients whose book lost most this week'}
      />
      {clients.length ? (
        <ul className="divide-y divide-line">
          {clients.map((c, i) => {
            const lead = up ? c.positions[0] : c.positions.at(-1)!;
            return (
              <li key={c.clientId} className="flex items-center gap-4 px-5 py-3.5">
                <span className="num w-5 shrink-0 text-sm font-semibold text-muted">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{c.name}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {up ? 'Led by ' : 'Hit by '}
                    <span className="mono font-semibold text-ink-2">
                      {lead.symbol}
                    </span> {lead.direction.toLowerCase()}{' '}
                    <span className={cn('num font-semibold', tone(lead.positionPct))}>{fmtPct(lead.positionPct)}</span>
                  </p>
                </div>
                <Sparkline points={pathPoints(c)} previousClose={0} width={88} height={28} />
                <div className="w-24 shrink-0 text-right">
                  <p className={cn('num text-sm font-semibold', tone(c.pct))}>{fmtPct(c.pct)}</p>
                  <p className={cn('num text-xs', tone(c.pnl))}>{fmtUsd(c.pnl)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          title={up ? 'No client gained this week' : 'No client lost this week'}
          body="Every priced client book moved the other way over the five sessions."
        />
      )}
    </Card>
  );
}

const TH = 'px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted';
function ClientTable({ clients }: { clients: ClientMove[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-xs">
        <caption className="sr-only">
          Weekly move for each client, from recorded quantities and public daily closes.
        </caption>
        <thead className="bg-sunken/60">
          <tr>
            <th scope="col" className={TH + ' text-left'}>
              Client
            </th>
            <th scope="col" className={TH + ' text-left'}>
              Trend
            </th>
            <th scope="col" className={TH + ' text-right'}>
              Week move
            </th>
            <th scope="col" className={TH + ' text-right'}>
              P&amp;L (USD)
            </th>
            <th scope="col" className={TH + ' text-right'}>
              Gross exposure
            </th>
            <th scope="col" className={TH + ' text-left'}>
              Best position
            </th>
            <th scope="col" className={TH + ' text-left'}>
              Worst position
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {clients.map((c) => {
            const best = c.positions[0],
              worst = c.positions.at(-1)!;
            return (
              <tr key={c.clientId} className="hover:bg-sunken/40">
                <td className="px-3 py-2.5">
                  <Link href={'/brief?client=' + c.clientId} className="font-semibold text-ink hover:underline">
                    {c.name}
                  </Link>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {c.positions.length} priced positions
                    {c.unpriced.length ? ' · no price: ' + c.unpriced.join(', ') : ''}
                  </p>
                </td>
                <td className="px-3">
                  <Sparkline points={pathPoints(c)} previousClose={0} width={80} height={24} />
                </td>
                <td className={cn('num px-3 text-right font-semibold', tone(c.pct))}>{fmtPct(c.pct)}</td>
                <td className={cn('num px-3 text-right', tone(c.pnl))}>{fmtUsd(c.pnl)}</td>
                <td className="num px-3 text-right text-ink-2">{fmtUsd(c.exposure, false)}</td>
                <td className="px-3">
                  <span className="mono font-semibold">{best.symbol}</span>{' '}
                  <span className={cn('num', tone(best.positionPct))}>{fmtPct(best.positionPct)}</span>
                </td>
                <td className="px-3">
                  <span className="mono font-semibold">{worst.symbol}</span>{' '}
                  <span className={cn('num', tone(worst.positionPct))}>{fmtPct(worst.positionPct)}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PositionTable({ book }: { book: WeeklyBook }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-xs">
        <caption className="sr-only">Each position&apos;s weekly price move and profit or loss.</caption>
        <thead className="bg-sunken/60">
          <tr>
            <th scope="col" className={TH + ' text-left'}>
              Client / fund
            </th>
            <th scope="col" className={TH + ' text-left'}>
              Stock
            </th>
            <th scope="col" className={TH + ' text-left'}>
              Position
            </th>
            <th scope="col" className={TH + ' text-right'}>
              Quantity
            </th>
            <th scope="col" className={TH + ' text-right'}>
              {shortDay(book.from)} close
            </th>
            <th scope="col" className={TH + ' text-right'}>
              Latest
            </th>
            <th scope="col" className={TH + ' text-right'}>
              Stock move
            </th>
            <th scope="col" className={TH + ' text-right'}>
              P&amp;L (USD)
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {book.positions.map((p) => (
            <tr key={p.holdingId} className="hover:bg-sunken/40">
              <td className="px-3 py-2.5">
                <p className="font-semibold text-ink">{p.client}</p>
                <p className="mt-0.5 max-w-[260px] text-[11px] text-muted">{p.fund}</p>
              </td>
              <td className="mono px-3 font-semibold">{p.symbol}</td>
              <td className="px-3">
                <Badge tone={p.direction === 'Long' ? 'up' : 'down'}>{p.direction}</Badge>
              </td>
              <td className="num px-3 text-right">{p.quantity.toLocaleString('en-US')}</td>
              <td className="num px-3 text-right">{p.base.toFixed(2)}</td>
              <td className="num px-3 text-right">{p.last.toFixed(2)}</td>
              <td className={cn('num px-3 text-right font-semibold', tone(p.pricePct))}>{fmtPct(p.pricePct)}</td>
              <td className={cn('num px-3 text-right font-semibold', tone(p.pnl))}>{fmtUsd(p.pnl)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function WeeklyView({ book, assigned }: { book: WeeklyBook; assigned: number }) {
  if (!book.clients.length)
    return (
      <Card>
        <EmptyState
          title="No weekly prices yet"
          body={
            book.unpriced.length
              ? 'Daily closes could not be loaded for ' + book.unpriced.join(', ') + '. Try again in a few minutes.'
              : 'No clients are in your book yet. Clients appear here once they are assigned to you.'
          }
        />
      </Card>
    );
  const lines = [
    { label: 'Whole book', path: book.total.path },
    ...(book.up[0] ? [{ label: book.up[0].name, path: book.up[0].path }] : []),
    ...(book.down[0] ? [{ label: book.down[0].name, path: book.down[0].path }] : []),
  ];
  const gained = book.clients.filter((c) => c.pct > 0).length;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Book move"
          value={fmtPct(book.total.pct)}
          className={tone(book.total.pct)}
          sub={shortDay(book.from) + ' → ' + shortDay(book.to)}
        />
        <Stat
          label="Book P&L"
          value={fmtUsd(book.total.pnl)}
          className={tone(book.total.pnl)}
          sub={'on ' + fmtUsd(book.total.exposure, false) + ' gross'}
        />
        <Stat
          label="Clients up / down"
          value={gained + ' / ' + (book.clients.length - gained)}
          sub={
            book.clients.length +
            ' clients priced' +
            (assigned > book.clients.length ? ' of ' + assigned + ' assigned' : '')
          }
        />
        <Stat
          label="Top mover"
          value={book.clients[0] ? fmtPct(book.clients[0].pct) : '—'}
          className={book.clients[0] ? tone(book.clients[0].pct) : undefined}
          sub={book.clients[0]?.name}
        />
      </div>

      <Card>
        <CardHeader
          title="This week in your book"
          sub="Written from the figures below; every number is computed from public closes."
        />
        <CardBody className="space-y-2 text-[13.5px] leading-relaxed text-ink-2">
          {book.narrative.map((l) => (
            <p key={l}>
              <Figures text={l} />
            </p>
          ))}
        </CardBody>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Weekly move by client"
            sub="Five-session change in each client's book, percent of gross exposure"
          />
          <CardBody className="text-ink">
            <ClientBars
              clients={book.clients.map((c) => ({
                clientId: c.clientId,
                name: c.name,
                pct: c.pct,
                pnl: c.pnl,
                exposure: c.exposure,
              }))}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Through the week" sub="Cumulative move at each session close" />
          <CardBody className="text-ink">
            <WeekLines dates={book.dates} lines={lines} />
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <MoverList title="Top movers up" clients={book.up} up />
        <MoverList title="Top movers down" clients={book.down} up={false} />
      </div>

      <Card>
        <CardHeader title="All clients" sub="Sorted by weekly move. Open a client to see its brief." />
        <ClientTable clients={book.clients} />
      </Card>

      <Card>
        <CardHeader
          title="Positions"
          sub="Recorded quantities × public daily closes. Shorts gain when the stock falls."
        />
        <PositionTable book={book} />
      </Card>

      <p className="text-xs leading-relaxed text-muted">
        Prices: Yahoo Finance daily closes, delayed{book.asOf ? ' · latest price ' + stamp(book.asOf) : ''}. Quantities
        and directions are as recorded in the client database. The week runs from the {shortDay(book.from)} close to the
        latest {shortDay(book.to)} price.
      </p>
    </div>
  );
}
