import type { Db } from '../db/types';
import { uid } from '../util/id';
import { makeReport } from './reports';
import { businessDate, displayDay, stamp } from './time';
import { briefSelection, formatMetric, metricChange, filterStories } from './presentation';
import { THEMES, themeOf } from './classify';
import { renderPdf } from './pdf';
import { getCalendar, getMovers, getSeries, OVERNIGHT, type Series, type Calendar } from './intraday';
import { EMPTY_FILTERS, type Report, type Story } from './types';
// Internal distribution of the morning brief to the desk. This never addresses a client: recipients
// come only from BRIEF_RECIPIENTS, and the content is the salesperson's own brief.
export const DESK_PROFILE = uid('live:sales-1');
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const NAVY = '#172b3e',
  UP = '#0b704b',
  DOWN = '#c8352f',
  MUTED = '#52677c',
  LINE = '#dfe6ed';
const color = (v: number | null | undefined) => (v == null ? MUTED : v > 0 ? UP : v < 0 ? DOWN : MUTED);
const pct = (v: number | null) => (v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(2) + '%');
const time = (at: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }).format(
    new Date(at),
  );
export function recipients(): string[] {
  return (process.env.BRIEF_RECIPIENTS ?? '')
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(s))
    .slice(0, 20);
}
/** Real intraday data rendered as a static PNG by QuickChart, because mail clients do not render SVG. */
export function chartUrl(s: Series): string | null {
  if (s.points.length < 3) return null;
  const step = Math.max(1, Math.ceil(s.points.length / 90));
  const pts = s.points.filter((_, i) => i % step === 0);
  const up = s.previousClose == null || s.last >= s.previousClose;
  const cfg = {
    type: 'line',
    data: {
      labels: pts.map((p) => time(new Date(p.t).toISOString())),
      datasets: [
        {
          data: pts.map((p) => +p.v.toFixed(2)),
          borderColor: up ? '#3ddc97' : '#ff6b6b',
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
        },
        ...(s.previousClose
          ? [
              {
                data: pts.map(() => s.previousClose),
                borderColor: '#e8a33d',
                borderDash: [4, 4],
                borderWidth: 1,
                pointRadius: 0,
                fill: false,
              },
            ]
          : []),
      ],
    },
    options: {
      legend: { display: false },
      scales: {
        xAxes: [{ ticks: { fontColor: '#9fb3c8', maxTicksLimit: 6 }, gridLines: { display: false } }],
        yAxes: [{ position: 'right', ticks: { fontColor: '#9fb3c8' }, gridLines: { color: 'rgba(255,255,255,0.07)' } }],
      },
    },
  };
  return 'https://quickchart.io/chart?w=640&h=240&bkg=%230b1520&c=' + encodeURIComponent(JSON.stringify(cfg));
}
const STRIP = ['SPX', 'DJI', 'NDX', 'RUT', 'SX5E', 'UST10Y', 'BRENT', 'GOLD', 'BTC', 'VIX'];
const SHORT: Record<string, string> = {
  SPX: 'S&amp;P 500',
  DJI: 'Dow',
  NDX: 'Nasdaq 100',
  RUT: 'Russell 2000',
  SX5E: 'Euro Stoxx',
  UST10Y: 'UST 10Y',
  BRENT: 'Brent',
  GOLD: 'Gold',
  BTC: 'Bitcoin',
  VIX: 'VIX',
};
const h2 = (t: string) =>
  '<tr><td style="padding:22px 0 6px;border-bottom:2px solid ' +
  NAVY +
  ';font:700 12px/1 Arial,sans-serif;letter-spacing:1.5px;text-transform:uppercase;color:' +
  NAVY +
  '">' +
  t +
  '</td></tr>';
export function renderEmail(
  report: Report,
  market: { overnight: Series[]; movers: Series[]; calendar: Calendar | null },
  appUrl: string | null,
): { subject: string; html: string; text: string } {
  const stories = briefSelection(filterStories(report, EMPTY_FILTERS));
  const desk = report.desk;
  const events = desk?.keyEvents?.length
    ? desk.keyEvents.map((e) => e.text)
    : stories.slice(0, 6).map((a) => a.title + ' — ' + a.publisher);
  const strip = STRIP.map((k) => report.metrics.find((m) => m.key === k))
    .filter((m) => m && m.value !== null)
    .map((m) => {
      const c = metricChange(m!);
      return (
        '<td align="center" style="padding:8px 4px;border-right:1px solid ' +
        LINE +
        '"><div style="font:600 10px Arial;color:' +
        MUTED +
        ';text-transform:uppercase">' +
        SHORT[m!.key] +
        '</div><div style="font:700 14px Arial;color:' +
        color(c?.value) +
        ';padding-top:3px">' +
        (c ? esc(c.label) : '—') +
        '</div><div style="font:11px Arial;color:#425b70">' +
        esc(formatMetric(m!)) +
        '</div></td>'
      );
    })
    .join('');
  const bullet = (html: string) =>
    '<tr><td style="padding:4px 0 4px 14px;font:14px/1.55 Arial,sans-serif;color:#213547">&bull;&nbsp; ' +
    html +
    '</td></tr>';
  const label = (t: string) => {
    const m = /^([^:]{2,30}):\s([\s\S]+)$/.exec(t);
    return m ? '<b>' + esc(m[1]) + ':</b> ' + esc(m[2]) : esc(t);
  };
  const book = report.holdings
    .map((h) => ({
      h,
      s: market.movers.find((m) => m.symbol === h.symbol),
      n: stories.filter((a) => a.matches.some((m) => m.symbol === h.symbol)).length,
    }))
    .sort((a, b) => Math.abs(b.s?.changePct ?? 0) - Math.abs(a.s?.changePct ?? 0));
  const th = (t: string, r = false) =>
    '<th align="' +
    (r ? 'right' : 'left') +
    '" style="padding:6px 8px;font:700 10px Arial;color:' +
    MUTED +
    ';text-transform:uppercase;background:#edf2f6">' +
    t +
    '</th>';
  const td = (t: string, r = false, c = '#213547') =>
    '<td align="' +
    (r ? 'right' : 'left') +
    '" style="padding:6px 8px;font:12px Arial;color:' +
    c +
    ';border-bottom:1px solid ' +
    LINE +
    '">' +
    t +
    '</td>';
  const headline = (a: Story) =>
    '<tr><td style="padding:8px 0;border-bottom:1px solid ' +
    LINE +
    '"><a href="' +
    esc(a.url) +
    '" style="font:700 14px/1.4 Arial;color:#213547;text-decoration:none">' +
    esc(a.title) +
    '</a>' +
    (a.excerpt && a.excerpt !== a.title
      ? '<div style="font:13px/1.5 Arial;color:#425b70;padding-top:3px">' + esc(a.excerpt.slice(0, 260)) + '</div>'
      : '') +
    '<div style="font:11px Arial;color:' +
    MUTED +
    ';padding-top:4px">' +
    esc(a.publisher) +
    ' · ' +
    time(a.publishedAt) +
    ' ET' +
    (a.matches.length
      ? ' · <b style="color:#086d77">' +
        esc([...new Set(a.matches.map((m) => m.symbol + ' ' + m.direction))].slice(0, 5).join(', ')) +
        '</b>'
      : '') +
    '</div></td></tr>';
  const groups = THEMES.map((t) => ({
    t,
    items: stories.filter((a) => themeOf(a.topics).key === t.key).slice(0, 7),
  })).filter((g) => g.items.length);
  const charts = market.overnight.map((s) => ({ s, url: chartUrl(s) })).filter((x) => x.url);
  const html =
    '<!doctype html><html><body style="margin:0;background:#f5f7fa"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa"><tr><td align="center" style="padding:16px 8px"><table width="680" cellpadding="0" cellspacing="0" style="max-width:680px;width:100%;background:#fff;border:1px solid ' +
    LINE +
    '">' +
    '<tr><td style="background:' +
    NAVY +
    ';padding:16px 22px"><table width="100%"><tr><td style="font:700 20px Georgia,serif;color:#fff">Sales &amp; Trading Morning Brief</td><td align="right" style="font:12px Arial;color:#cfd9e3">' +
    esc(displayDay(report.businessDate)) +
    '</td></tr></table></td></tr>' +
    '<tr><td style="padding:4px 22px 22px"><table width="100%" cellpadding="0" cellspacing="0">' +
    '<tr><td style="padding:16px 0 0"><table width="100%" style="background:#f5f7fa;border-left:4px solid #086d77"><tr><td style="padding:12px 14px"><div style="font:700 12px Arial;letter-spacing:1.5px;color:' +
    NAVY +
    ';text-transform:uppercase;padding-bottom:6px">Key events today</div><table width="100%">' +
    events.map((e) => bullet(label(e))).join('') +
    '</table></td></tr></table></td></tr>' +
    (strip
      ? '<tr><td style="padding-top:14px"><table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ' +
        LINE +
        '"><tr>' +
        strip +
        '</tr></table><div style="font:10px Arial;color:' +
        MUTED +
        ';padding-top:4px">Index and yield moves in bp vs prior close; commodities and crypto in %.</div></td></tr>'
      : '') +
    h2('Market wrap') +
    (desk?.wrap?.length
      ? desk.wrap
          .map(
            (p, i) =>
              '<tr><td style="padding:8px 0 0;font:' +
              (i === 0 ? '600 ' : '') +
              '15px/1.65 Georgia,serif;color:#213547">' +
              esc(p) +
              '</td></tr>',
          )
          .join('')
      : '<tr><td style="padding:8px 0;font:13px Arial;color:' +
        MUTED +
        '">The wrap is prepared after the first source refresh.</td></tr>') +
    charts
      .map(
        ({ s, url }) =>
          h2(
            'Overnight · ' +
              esc(s.label) +
              ' <span style="color:' +
              color(s.changePct) +
              '">' +
              pct(s.changePct) +
              '</span>',
          ) +
          '<tr><td style="padding-top:8px"><img src="' +
          esc(url!) +
          '" width="636" style="width:100%;max-width:636px;display:block;border-radius:6px" alt="' +
          esc(s.label) +
          ' intraday chart"><div style="font:10px Arial;color:' +
          MUTED +
          ';padding-top:3px">' +
          esc(s.source) +
          ' · last ' +
          esc(stamp(s.at)) +
          '</div></td></tr>',
      )
      .join('') +
    (desk?.sections?.length
      ? desk.sections
          .map(
            (s) =>
              h2(esc(s.title)) +
              '<tr><td style="padding-top:8px;font:14px/1.6 Georgia,serif;color:#425b70">' +
              esc(s.text) +
              '</td></tr>',
          )
          .join('')
      : '') +
    (market.calendar?.events.length
      ? h2('Economic data (ET)') +
        '<tr><td style="padding-top:6px"><table width="100%" cellpadding="0" cellspacing="0"><tr>' +
        th('Time') +
        th('Release') +
        th('Est.', true) +
        th('Prior', true) +
        '</tr>' +
        market.calendar.events
          .map(
            (e) =>
              '<tr>' +
              td(time(e.time)) +
              td(esc(e.country + ' · ' + e.title)) +
              td(esc(e.forecast || '—'), true) +
              td(esc(e.previous || '—'), true) +
              '</tr>',
          )
          .join('') +
        '</table></td></tr>'
      : '') +
    (book.length
      ? h2('Client book') +
        '<tr><td style="padding-top:6px"><table width="100%" cellpadding="0" cellspacing="0"><tr>' +
        th('Client') +
        th('Stock') +
        th('Pos.') +
        th('Last', true) +
        th('Day', true) +
        th('Stories', true) +
        '</tr>' +
        book
          .map(
            ({ h, s, n }) =>
              '<tr>' +
              td(esc(h.client)) +
              td('<b>' + esc(h.symbol) + '</b>') +
              td(h.direction, false, h.direction === 'Long' ? UP : DOWN) +
              td(s ? s.last.toFixed(2) : '—', true) +
              td(pct(s?.changePct ?? null), true, color(s?.changePct)) +
              td(String(n), true) +
              '</tr>',
          )
          .join('') +
        '</table></td></tr>'
      : '') +
    h2('Headlines since the close') +
    groups
      .map(
        (g) =>
          '<tr><td style="padding:12px 0 2px;font:italic 700 13px Arial;color:#086d77">' +
          esc(g.t.label) +
          '</td></tr>' +
          g.items.map(headline).join(''),
      )
      .join('') +
    '<tr><td style="padding:18px 0 0;font:10px/1.5 Arial;color:' +
    MUTED +
    '">' +
    esc(report.clientName) +
    ' · prepared ' +
    esc(stamp(report.cutoff)) +
    (appUrl ? ' · <a href="' + esc(appUrl) + '/brief" style="color:#086d77">Open the live brief</a>' : '') +
    '<br>For internal sales use only. Sourced headlines link to the original publisher; news connections indicate possible relevance, not the cause or direction of a price move. Not investment advice.</td></tr>' +
    '</table></td></tr></table></td></tr></table></body></html>';
  const text = [
    'Sales & Trading Morning Brief — ' + displayDay(report.businessDate),
    '',
    'KEY EVENTS',
    ...events.map((e) => '- ' + e),
    '',
    'MARKET WRAP',
    ...(desk?.wrap ?? []),
    '',
    'HEADLINES',
    ...stories.map((a) => '- ' + a.title + ' (' + a.publisher + ') ' + a.url),
  ].join('\n');
  return {
    subject:
      'Morning Brief — ' +
      displayDay(report.businessDate) +
      (events[0] ? ' | ' + events[0].replace(/^[^:]{2,30}:\s/, '').slice(0, 80) : ''),
    html,
    text,
  };
}
type Mail = { subject: string; html: string; text: string; attachments?: { filename: string; content: string }[] };
async function sendViaResend(to: string, mail: Mail, key: string): Promise<string> {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    signal: AbortSignal.timeout(20000),
    headers: {
      Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL,
      to: [to],
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      attachments: mail.attachments,
    }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('RESEND_' + r.status + (body?.name ? '_' + String(body.name).toUpperCase() : ''));
  return String(body.id ?? '');
}
const sendAt = () => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(process.env.BRIEF_SEND_AT ?? '09:30');
  return m ? Number(m[1]) * 60 + Number(m[2]) : 570;
};
export function dueToSend(now: Date): boolean {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  if (['Sat', 'Sun'].includes(get('weekday'))) return false;
  const minutes = Number(get('hour')) * 60 + Number(get('minute'));
  return minutes >= sendAt() && minutes < sendAt() + 180;
}
/** Sends today's brief once per recipient. `force` re-sends on demand (manual button), still logged. */
export async function sendMorningBrief(
  db: Db,
  opts: { now?: Date; force?: boolean } = {},
): Promise<{ sent: string[]; skipped: string; failed: string[] }> {
  const now = opts.now ?? new Date(),
    date = businessDate(now),
    to = recipients();
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL || !to.length)
    return { sent: [], failed: [], skipped: 'EMAIL_NOT_CONFIGURED' };
  if (!opts.force && !dueToSend(now)) return { sent: [], failed: [], skipped: 'NOT_DUE' };
  const pending = opts.force
    ? to
    : (
        await Promise.all(
          to.map(async (r) =>
            (
              await db.asService((q) =>
                q(
                  "insert into live_email_sends(business_date,recipient) values($1,$2) on conflict(business_date,recipient) do update set status='sending',created_at=now() where live_email_sends.status='failed' or (live_email_sends.status='sending' and live_email_sends.created_at<now()-interval '15 minutes') returning recipient",
                  [date, r],
                ),
              )
            ).length
              ? r
              : null,
          ),
        )
      ).filter((x): x is string => !!x);
  if (!pending.length) return { sent: [], failed: [], skipped: 'ALREADY_SENT' };
  const report = await makeReport(db, DESK_PROFILE, null, now);
  const [overnight, movers, calendar] = await Promise.all([
    Promise.all(OVERNIGHT.map((o) => getSeries(o.symbol, o.label, '1d', '5m'))),
    getMovers(report.coverage),
    getCalendar(now, db),
  ]);
  const mail = renderEmail(
    { ...report, id: 'email-' + date },
    { overnight: overnight.filter((s): s is Series => !!s), movers, calendar },
    process.env.APP_URL ?? null,
  );
  // The same brief as a downloadable PDF, for reading offline or forwarding internally.
  const pdf = Buffer.from(await renderPdf({ ...report, id: 'email-' + date }, EMPTY_FILTERS)).toString('base64');
  const message: Mail = { ...mail, attachments: [{ filename: 'morning-brief-' + date + '.pdf', content: pdf }] };
  const sent: string[] = [],
    failed: string[] = [];
  for (const r of pending) {
    try {
      const id = await sendViaResend(r, message, 'brief-' + date + '-' + r + (opts.force ? '-' + now.getTime() : ''));
      sent.push(r);
      await db.asService((q) =>
        q(
          "insert into live_email_sends(business_date,recipient,status,provider_id) values($1,$2,'sent',$3) on conflict(business_date,recipient) do update set status='sent',provider_id=excluded.provider_id,detail=null",
          [date, r, id],
        ),
      );
    } catch (e) {
      failed.push(r);
      await db.asService((q) =>
        q(
          "insert into live_email_sends(business_date,recipient,status,detail) values($1,$2,'failed',$3) on conflict(business_date,recipient) do update set status='failed',detail=excluded.detail",
          [date, r, e instanceof Error ? e.message.slice(0, 120) : 'SEND_FAILED'],
        ),
      );
    }
  }
  return { sent, failed, skipped: '' };
}
