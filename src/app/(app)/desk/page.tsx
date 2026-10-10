import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import { PageHeader } from '@/components/ui/page-header';
import { getMe } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import { formatUsd } from '@/lib/market/format';
import { SEGMENT_LABEL } from '@/lib/format';

export const metadata = { title: 'Desk overview' };
export const dynamic = 'force-dynamic';

const GROUP_LABEL = (g: string) =>
  g === 'rates'
    ? 'Rates sell-off'
    : g.startsWith('sector:')
      ? g.slice(7)
      : g.startsWith('credit:')
        ? `Credit: ${g.slice(7)}`
        : g.startsWith('macro:')
          ? 'Scheduled release'
          : g.startsWith('earnings:')
            ? 'Earnings'
            : g === 'followup'
              ? 'Follow-ups due'
              : g === 'reactivation'
                ? 'Gone quiet'
                : g;

export default async function Desk() {
  const me = await getMe();
  if (!me) redirect('/login');
  if (me.role !== 'desk_head' && me.role !== 'admin') redirect('/');
  const db = await getDb();
  const { reps, themes, quiet } = await db.asUser(me.id, async (q) => {
    const latest = `(select id from briefs b where b.profile_id = p.id order by b.business_date desc limit 1)`;
    const reps = await q(
      `select p.id, p.full_name, p.title, p.initials, p.avatar_hue,
              (select count(*)::int from coverage v where v.profile_id = p.id) clients,
              (select coalesce(sum(pos.notional_usd), 0) from positions pos join coverage v on v.client_id = pos.client_id where v.profile_id = p.id) book,
              (select count(*)::int from call_cards c where c.brief_id = ${latest}) cards,
              (select count(*)::int from call_cards c where c.brief_id = ${latest} and c.urgency = 'now') now_n,
              (select count(*)::int from call_cards c where c.brief_id = ${latest} and c.status = 'done') done_n
         from profiles p where p.role = 'sales' and ($1::uuid is null or p.desk_id = $1) order by p.full_name`,
      [me.deskId],
    );
    const themes = await q(
      `select c.factors->>'group' g, count(*)::int n, count(*) filter (where c.urgency = 'now')::int now_n
         from call_cards c join briefs b on b.id = c.brief_id
        where b.business_date = (select max(business_date) from briefs) group by 1 order by n desc limit 6`,
    );
    const quiet = await q(
      `select cl.id, cl.name, cl.segment, p.full_name rep, (current_date - (max(i.occurred_at) at time zone 'America/New_York')::date) gap
         from clients cl join coverage v on v.client_id = cl.id and v.role = 'primary' join profiles p on p.id = v.profile_id
         left join interactions i on i.client_id = cl.id
        where cl.tier = 1 and ($1::uuid is null or p.desk_id = $1) group by cl.id, cl.name, cl.segment, p.full_name
       having (current_date - (max(i.occurred_at) at time zone 'America/New_York')::date) > 30 order by gap desc limit 6`,
      [me.deskId],
    );
    return { reps, themes, quiet };
  });
  const totalCards = reps.reduce((a, r) => a + Number(r.cards), 0);
  const totalDone = reps.reduce((a, r) => a + Number(r.done_n), 0);
  const maxTheme = Math.max(1, ...themes.map((t) => Number(t.n)));
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Desk"
        title={`${me.deskName ?? 'Firm'} overview`}
        description="Coverage, call progress and the stories shaping your team's morning."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Salespeople', String(reps.length)],
          ['Calls on lists', String(totalCards)],
          ['Marked as called', String(totalDone)],
          ['Completion', totalCards ? `${Math.round((totalDone / totalCards) * 100)}%` : '—'],
        ].map(([k, v]) => (
          <Card key={k} className="px-4 py-3.5">
            <p className="text-[12px] text-muted">{k}</p>
            <p className="num mt-1 text-[24px] font-semibold tracking-[-0.02em]">{v}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="overflow-hidden">
          <CardHeader title="Team" sub="Latest brief for each person" />
          {reps.length ? (
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full min-w-[600px] text-[13px]">
                <thead className="bg-bg text-left text-[12px] text-muted">
                  <tr>
                    <th className="px-5 py-2 font-medium">Salesperson</th>
                    <th className="px-3 py-2 text-right font-medium">Clients</th>
                    <th className="px-3 py-2 text-right font-medium">Book</th>
                    <th className="px-3 py-2 text-right font-medium">Calls</th>
                    <th className="px-3 py-2 text-right font-medium">Now</th>
                    <th className="px-5 py-2 text-right font-medium">Done</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {reps.map((r) => (
                    <tr key={String(r.id)} className="hover:bg-sunken/60">
                      <td className="px-5 py-2.5">
                        <span className="flex items-center gap-2.5">
                          <Avatar initials={String(r.initials)} hue={Number(r.avatar_hue)} size={28} />
                          <span>
                            <span className="block font-semibold">{String(r.full_name)}</span>
                            <span className="block text-[12px] text-muted">{String(r.title)}</span>
                          </span>
                        </span>
                      </td>
                      <td className="num px-3 py-2.5 text-right">{Number(r.clients)}</td>
                      <td className="num px-3 py-2.5 text-right text-ink-2">{formatUsd(Number(r.book))}</td>
                      <td className="num px-3 py-2.5 text-right">{Number(r.cards)}</td>
                      <td className="num px-3 py-2.5 text-right">
                        {Number(r.now_n) ? (
                          <Badge tone="amber">{Number(r.now_n)}</Badge>
                        ) : (
                          <span className="text-subtle">0</span>
                        )}
                      </td>
                      <td className="num px-5 py-2.5 text-right">
                        {Number(r.done_n)}/{Number(r.cards)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No salespeople on this desk" />
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="What the desk is talking about" sub="Calls grouped by story" />
            <ul className="space-y-3 px-5 py-4">
              {themes.map((t) => (
                <li key={String(t.g)}>
                  <div className="flex justify-between text-[13px]">
                    <span className="font-medium">{GROUP_LABEL(String(t.g))}</span>
                    <span className="num text-muted">
                      {Number(t.n)} {Number(t.n) === 1 ? 'call' : 'calls'}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-sunken">
                    <div
                      className="h-1.5 rounded-full bg-brand"
                      style={{ width: `${(Number(t.n) / maxTheme) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
              {!themes.length ? <li className="text-[13px] text-muted">No briefs yet.</li> : null}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Top-tier clients gone quiet" sub="No contact in over a month" />
            {quiet.length ? (
              <ul className="divide-y divide-line">
                {quiet.map((c) => (
                  <li key={String(c.id)} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[13px]">
                    <span className="min-w-0">
                      <Link href={`/clients/${c.id}`} className="block truncate font-semibold hover:text-brand-600">
                        {String(c.name)}
                      </Link>
                      <span className="text-[12px] text-muted">
                        {SEGMENT_LABEL[String(c.segment)]} · {String(c.rep)}
                      </span>
                    </span>
                    <span className="num shrink-0 font-semibold text-amber">{Number(c.gap)} d</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No gaps" body="Every top-tier client has been contacted recently." />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
