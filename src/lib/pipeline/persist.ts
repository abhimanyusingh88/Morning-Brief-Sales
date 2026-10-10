import type { Db, Q } from '../db/types';
import type { WriteRecord } from '../ai/llm-writer';
import type { BriefText, CardText } from '../ai/templates';
import type { Prepared } from '../ai/prepare';
import { sectionPosition, type BuiltSection, type FeedHealth } from '../brief/build';
import { etInstant } from '../util/time';

export interface CardOut {
  ctx: Prepared['cards'][number];
  text: CardText;
  generator: string;
  record: WriteRecord | null;
}
export interface ProfileOut {
  prep: Prepared;
  cards: CardOut[];
  /** the call-list brief (book, flow, risks) */
  brief: BriefText;
  briefGen: Record<string, string>;
  briefRecord: WriteRecord | null;
  /** the specification's sections, in page order */
  spec: BuiltSection[];
}

/** Generated before the 06:30 publish, spread across the QC window so the audit trail reads like a real morning. */
export const generatedAt = (businessDate: string, profileId: string) =>
  new Date(etInstant(businessDate, 5, 0).getTime() + (parseInt(profileId.slice(4, 8), 16) % 1740) * 1000).toISOString();

/** Dashboard publish time: the person's own send time on the business date, with a few seconds of spread. */
export function publishedAt(businessDate: string, profileId: string, sendTime = '06:30'): string {
  const [hh, mm] = sendTime.split(':').map(Number);
  const jitter = parseInt(profileId.slice(0, 4), 16) % 90;
  return new Date(etInstant(businessDate, hh, mm).getTime() + jitter * 1000).toISOString();
}

const tokensOf = (s: string) => [...s.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1]);

/** Write one salesperson's brief as a draft. It becomes visible only when the publish step flips it. */
export async function persistDraft(
  db: Db,
  runId: string,
  businessDate: string,
  po: ProfileOut,
  health: FeedHealth,
): Promise<{ briefId: string; cards: number }> {
  const { prep } = po;
  const fb = prep.facts;
  return db.asService(async (q: Q) => {
    const existing = await q<{ id: string; status: string }>(
      `select id, status from briefs where business_date = $1 and profile_id = $2`,
      [businessDate, prep.profileId],
    );
    const prior = existing[0]
      ? await q<{ client_id: string; status: string; acted_at: string | null }>(
          `select client_id, status, acted_at from call_cards where brief_id = $1`,
          [existing[0].id],
        )
      : [];
    const keep = new Map(prior.map((p) => [p.client_id, p]));
    const status = Object.fromEntries(po.spec.map((s) => [s.kind, s.status]));

    const b = (
      await q<{ id: string }>(
        `insert into briefs (business_date, profile_id, run_id, status, headline, version, generated_at, published_at, qc_status, data_status)
       values ($1, $2, $3, 'draft', $4, 1, $5::timestamptz, null, 'pending', $6::jsonb)
       on conflict (business_date, profile_id) do update
         set run_id = excluded.run_id, headline = excluded.headline, version = briefs.version + 1, generated_at = excluded.generated_at,
             qc_status = 'pending', data_status = excluded.data_status
       returning id`,
        [
          businessDate,
          prep.profileId,
          runId,
          fb.render(po.brief.headline),
          generatedAt(businessDate, prep.profileId),
          JSON.stringify({ sections: status, feeds: health }),
        ],
      )
    )[0].id;

    await q(`delete from brief_sections where brief_id = $1`, [b]);
    await q(`delete from brief_facts where brief_id = $1`, [b]);
    await q(`delete from call_cards where brief_id = $1`, [b]);
    await q(`delete from generation_records where brief_id = $1`, [b]);

    await q(
      `insert into brief_facts (brief_id, key, label, value, display, unit, source, as_of, feed_key)
       select $1, x->>'key', x->>'label', nullif(x->>'value','')::numeric, x->>'display', x->>'unit', x->>'source', (x->>'asOf')::timestamptz, nullif(x->>'feedKey','') from jsonb_array_elements($2::jsonb) x`,
      [
        b,
        JSON.stringify(
          fb.all().map((f) => ({
            key: f.key,
            label: f.label,
            value: f.value == null ? '' : String(f.value),
            display: f.display,
            unit: f.unit,
            source: f.source,
            asOf: f.asOf,
            feedKey: f.feedKey ?? '',
          })),
        ),
      ],
    );

    const rows = [
      ...po.spec.map((s) => ({
        kind: s.kind,
        position: sectionPosition(s.kind),
        title: s.title,
        tpl: s.template,
        rendered: s.template ? fb.render(s.template) : '',
        keys: [...new Set(tokensOf(s.template))],
        gen: s.generator,
        data: s.data,
        status: s.status,
        note: s.note ?? null,
      })),
      ...po.brief.sections.map((s, i) => ({
        kind: s.kind,
        position: 60 + i,
        title: s.title,
        tpl: s.body,
        rendered: fb.render(s.body),
        keys: [...new Set(tokensOf(s.body))],
        gen: po.briefGen[s.kind] ?? 'template',
        data: {},
        status: 'ok' as const,
        note: null,
      })),
    ];
    await q(
      `insert into brief_sections (brief_id, kind, position, title, body_template, body_rendered, fact_keys, generator, data, status, note)
       select $1, x->>'kind', (x->>'position')::int, x->>'title', x->>'tpl', x->>'rendered', array(select jsonb_array_elements_text(x->'keys')), x->>'gen', coalesce(x->'data','{}'::jsonb), x->>'status', x->>'note'
         from jsonb_array_elements($2::jsonb) x`,
      [b, JSON.stringify(rows)],
    );

    const cards = po.cards.map((c) => {
      const pair = (arr: string[]) => arr.map((t) => ({ template: t, rendered: fb.render(t) }));
      const old = keep.get(c.ctx.clientId);
      return {
        client: c.ctx.clientId,
        contact: c.ctx.contactId,
        event: c.ctx.eventId,
        rank: c.ctx.rank,
        urgency: c.ctx.urgency,
        score: prep.cardScore.get(c.ctx.clientId) ?? 0,
        headline: fb.render(c.text.headline),
        whyT: c.text.why,
        whyR: fb.render(c.text.why),
        tp: pair(c.text.talkingPoints),
        wo: pair(c.text.watchOuts),
        keys: c.ctx.keys,
        factors: prep.cardFactors.get(c.ctx.clientId) ?? {},
        gen: c.generator,
        status: old?.status ?? 'new',
        acted: old?.acted_at ?? null,
      };
    });
    if (cards.length)
      await q(
        `insert into call_cards (brief_id, profile_id, client_id, contact_id, event_id, rank, score, urgency, headline, why_template, why_rendered, talking_points, watch_outs, fact_keys, factors, generator, status, acted_at)
       select $1, $2, (x->>'client')::uuid, nullif(x->>'contact','')::uuid, nullif(x->>'event','')::uuid, (x->>'rank')::int, (x->>'score')::numeric, x->>'urgency', x->>'headline', x->>'whyT', x->>'whyR',
              x->'tp', x->'wo', array(select jsonb_array_elements_text(x->'keys')), x->'factors', x->>'gen', x->>'status', nullif(x->>'acted','')::timestamptz
         from jsonb_array_elements($3::jsonb) x`,
        [b, prep.profileId, JSON.stringify(cards)],
      );

    const recs = [
      ...(po.briefRecord ? [po.briefRecord] : []),
      ...po.cards.flatMap((c) => (c.record ? [c.record] : [])),
    ];
    if (recs.length)
      await q(
        `insert into generation_records (brief_id, profile_id, target, provider, model, status, attempts, prompt_tokens, completion_tokens, latency_ms, validation)
       select $1, $2, x->>'target', x->>'provider', x->>'model', x->>'status', (x->>'attempts')::int, (x->>'promptTokens')::int, (x->>'completionTokens')::int, (x->>'latencyMs')::int, x->'validation' from jsonb_array_elements($3::jsonb) x`,
        [b, prep.profileId, JSON.stringify(recs)],
      );
    return { briefId: b, cards: cards.length };
  });
}
