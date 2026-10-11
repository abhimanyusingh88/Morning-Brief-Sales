import type { Db } from '../db/types';
import { uid } from '../util/id';
import { makeReport } from './reports';
import { businessDate, displayDay, stamp } from './time';
import { renderPdf } from './pdf';
import { EMPTY_FILTERS, type Report } from './types';
// Internal distribution of the morning brief to the desk. This never addresses a client: recipients
// come only from BRIEF_RECIPIENTS, and the content is the salesperson's own brief.
export const DESK_PROFILE = uid('live:sales-1');
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const NAVY = '#172b3e',
  BRAND = '#086d77',
  INK = '#213547',
  MUTED = '#52677c',
  LINE = '#dfe6ed',
  PAGE = '#edf2f6';
export function recipients(): string[] {
  return (process.env.BRIEF_RECIPIENTS ?? '')
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(s))
    .slice(0, 20);
}
export const pdfName = (date: string) => 'morning-brief-' + date + '.pdf';
/**
 * A short cover note. The brief itself travels as the attached PDF, so the message only says what is attached and
 * where to find the live version. Tables and inline styles only: mail clients ignore stylesheets.
 */
export function renderEmail(report: Report, appUrl: string | null): { subject: string; html: string; text: string } {
  const day = displayDay(report.businessDate),
    file = pdfName(report.businessDate),
    prepared = stamp(report.cutoff);
  const contents = ['Key events', 'Markets snapshot', 'Market wrap', 'Headlines since the close'];
  const html =
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Morning Brief</title></head>' +
    '<body style="margin:0;padding:0;background:' +
    PAGE +
    '">' +
    // Preview line shown beside the subject in most inboxes.
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0">Your morning brief for ' +
    esc(day) +
    ' is attached as a PDF.</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' +
    PAGE +
    '"><tr><td align="center" style="padding:32px 16px">' +
    '<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid ' +
    LINE +
    ';border-radius:12px;overflow:hidden">' +
    '<tr><td style="background:' +
    NAVY +
    ';padding:28px 32px">' +
    '<div style="font:700 11px/1 Arial,sans-serif;letter-spacing:2px;text-transform:uppercase;color:#8fd3da">Sales &amp; Trading</div>' +
    '<div style="font:600 26px/1.25 Georgia,serif;color:#ffffff;padding-top:10px">Morning Brief</div>' +
    '<div style="font:14px/1.4 Arial,sans-serif;color:#c8d6e3;padding-top:6px">' +
    esc(day) +
    '</div></td></tr>' +
    '<tr><td style="padding:28px 32px 8px;font:15px/1.65 Arial,sans-serif;color:' +
    INK +
    '">' +
    '<p style="margin:0 0 14px">Good morning,</p>' +
    '<p style="margin:0 0 14px">Your morning brief for <strong>' +
    esc(day) +
    '</strong> is ready. The complete brief is <strong>attached to this email as a PDF</strong>, so you can read it offline or share it with the desk.</p>' +
    '</td></tr>' +
    '<tr><td style="padding:8px 32px 0">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ' +
    LINE +
    ';border-left:4px solid ' +
    BRAND +
    ';border-radius:8px;background:#f7fafc"><tr><td style="padding:16px 18px">' +
    '<div style="font:700 10px/1 Arial,sans-serif;letter-spacing:1.5px;text-transform:uppercase;color:' +
    MUTED +
    '">Attached</div>' +
    '<div style="font:600 15px/1.4 Arial,sans-serif;color:' +
    NAVY +
    ';padding-top:8px">' +
    esc(file) +
    '</div>' +
    '<div style="font:13px/1.5 Arial,sans-serif;color:' +
    MUTED +
    ';padding-top:2px">Prepared for ' +
    esc(report.salesperson) +
    ' · ' +
    esc(report.clientName) +
    ' · ' +
    esc(prepared) +
    '</div></td></tr></table></td></tr>' +
    '<tr><td style="padding:22px 32px 0">' +
    '<div style="font:700 10px/1 Arial,sans-serif;letter-spacing:1.5px;text-transform:uppercase;color:' +
    MUTED +
    ';padding-bottom:6px">Inside the PDF</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' +
    contents
      .map(
        (c) =>
          '<tr><td width="18" valign="top" style="padding:5px 0;font:14px/1.5 Arial,sans-serif;color:' +
          BRAND +
          '">&bull;</td><td style="padding:5px 0;font:14px/1.5 Arial,sans-serif;color:' +
          INK +
          '">' +
          c +
          '</td></tr>',
      )
      .join('') +
    '</table></td></tr>' +
    (appUrl
      ? '<tr><td style="padding:24px 32px 0"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:' +
        BRAND +
        ';border-radius:8px"><a href="' +
        esc(appUrl) +
        '/brief" style="display:inline-block;padding:12px 22px;font:600 14px/1 Arial,sans-serif;color:#ffffff;text-decoration:none">Open the live brief</a></td></tr></table>' +
        '<div style="font:12px/1.5 Arial,sans-serif;color:' +
        MUTED +
        ';padding-top:10px">The live brief keeps updating through the day with new headlines and prices.</div></td></tr>'
      : '') +
    '<tr><td style="padding:26px 32px 0"><div style="border-top:1px solid ' +
    LINE +
    ';font-size:0;line-height:0">&nbsp;</div></td></tr>' +
    '<tr><td style="padding:16px 32px 28px;font:11px/1.6 Arial,sans-serif;color:' +
    MUTED +
    '">For internal sales use only. Not investment advice. News connections indicate possible relevance, not the cause or direction of a price move. If the attachment is missing, open the live brief and download the PDF from there.</td></tr>' +
    '</table></td></tr></table></body></html>';
  const text = [
    'Sales & Trading Morning Brief — ' + day,
    '',
    'Good morning,',
    '',
    'Your morning brief for ' +
      day +
      ' is ready. The complete brief is attached to this email as a PDF (' +
      file +
      ').',
    '',
    'Inside the PDF:',
    ...contents.map((c) => '- ' + c),
    '',
    ...(appUrl ? ['Open the live brief: ' + appUrl + '/brief', ''] : []),
    'Prepared for ' + report.salesperson + ' · ' + report.clientName + ' · ' + prepared,
    'For internal sales use only. Not investment advice.',
  ].join('\n');
  return { subject: 'Morning Brief — ' + day + ' (PDF attached)', html, text };
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
  const report = { ...(await makeReport(db, DESK_PROFILE, null, now)), id: 'email-' + date };
  // The brief travels as the PDF; the message is only a cover note. Without the PDF there is nothing to send.
  const pdf = Buffer.from(await renderPdf(report, EMPTY_FILTERS)).toString('base64');
  const message: Mail = {
    ...renderEmail(report, process.env.APP_URL ?? null),
    attachments: [{ filename: pdfName(date), content: pdf }],
  };
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
