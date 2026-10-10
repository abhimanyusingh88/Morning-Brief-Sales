import type { Db } from '../db/types';
import type { FactBook } from '../ai/facts';
import { renderDigest } from '../brief/digest';
import type { BuiltSection } from '../brief/build';
import type { BriefPrefs } from '../brief/spec';
import { publishedAt } from './persist';

export interface DeliveryItem {
  briefId: string;
  profileId: string;
  name: string;
  email: string;
  prefs: BriefPrefs;
  facts: FactBook;
  sections: BuiltSection[];
  oneLine: string;
  businessDate: string;
  generatedAt: string;
}

const dateLabel = (businessDate: string, sendTime: string) =>
  `${new Date(`${businessDate}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })} · ${sendTime} ET`;

/**
 * Dashboard publish and email digest. The relay is simulated: an email is rendered and stored for preview, addressed only to
 * the salesperson, and marked 'simulated'. If the relay is down the dashboard still goes out and the email is marked failed.
 */
export async function deliver(
  db: Db,
  runId: string,
  items: DeliveryItem[],
  relayOk: boolean,
  log: (l: string) => void,
) {
  let dashboard = 0,
    email = 0,
    failed = 0;
  for (const it of items) {
    const at = publishedAt(it.businessDate, it.profileId, it.prefs.sendTime);
    const rows: {
      channel: string;
      status: string;
      delivered: string | null;
      to: string | null;
      subject: string | null;
      html: string | null;
      detail: Record<string, unknown>;
    }[] = [];
    if (it.prefs.delivery !== 'email')
      rows.push({
        channel: 'dashboard',
        status: 'delivered',
        delivered: at,
        to: null,
        subject: null,
        html: null,
        detail: { url: '/brief' },
      });
    if (it.prefs.delivery !== 'dashboard') {
      if (!relayOk)
        rows.push({
          channel: 'email',
          status: 'failed',
          delivered: null,
          to: it.email,
          subject: null,
          html: null,
          detail: { error: 'relay unavailable (SMTP 421); will retry at the next window' },
        });
      else {
        const facts = Object.fromEntries(it.facts.all().map((f) => [f.key, { display: f.display, unit: f.unit }]));
        const d = renderDigest({
          name: it.name,
          date: it.businessDate,
          dateLabel: dateLabel(it.businessDate, it.prefs.sendTime),
          sectors: it.prefs.sectors,
          products: it.prefs.products,
          oneLine: it.oneLine,
          sections: it.sections,
          facts,
          generatedAt: `Generated ${new Date(it.generatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET`,
        });
        rows.push({
          channel: 'email',
          status: 'simulated',
          delivered: at,
          to: it.email,
          subject: d.subject,
          html: d.html,
          detail: { bytes: d.html.length, relay: 'relay.internal.sim', recipients: 1, text: d.text.slice(0, 4000) },
        });
      }
    }
    await db.asService(async (q) => {
      await q(`delete from deliveries where brief_id = $1`, [it.briefId]);
      await q(
        `insert into deliveries (run_id, brief_id, profile_id, channel, status, scheduled_for, delivered_at, to_address, subject, html, detail)
         select $1, $2, $3, x->>'channel', x->>'status', $4::timestamptz, nullif(x->>'delivered','')::timestamptz, x->>'to', x->>'subject', x->>'html', x->'detail' from jsonb_array_elements($5::jsonb) x`,
        [runId, it.briefId, it.profileId, at, JSON.stringify(rows)],
      );
    });
    for (const r of rows) {
      if (r.channel === 'dashboard') dashboard++;
      else if (r.status === 'failed') failed++;
      else email++;
    }
  }
  log(
    `${dashboard} dashboard briefs published; ${email} email digests rendered and queued on the simulated relay${failed ? `; ${failed} email${failed > 1 ? 's' : ''} failed (relay down)` : ''}`,
  );
  return { dashboard, email, failed };
}
