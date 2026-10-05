import type { Q } from "../db/types";

/** Published call lists visible to this person. Desk heads use their team, under RLS. */
export async function agentBriefs(q: Q, meId: string) {
  const [person] = await q<{ role: string }>("select role from profiles where id = $1", [meId]);
  const desk = person?.role === "desk_head";
  const briefs = await q<{ id: string; business_date: string }>(
    `select id, business_date::text from briefs
      where status = 'published' and ($2::boolean or profile_id = $1)
      order by business_date desc, generated_at desc`, [meId, desk]);
  const date = briefs[0]?.business_date;
  return { desk, ids: briefs.filter((brief) => brief.business_date === date).map((brief) => brief.id) };
}

export async function agentCalls(q: Q, ids: string[], desk: boolean, limit: number, clientId: string | null = null) {
  if (!ids.length) return [];
  return q<{ id: string; brief_id: string; client_id: string; name: string; urgency: string; why_template: string; talking_points: { template: string }[] }>(
    `select * from (
       select distinct on (cc.client_id) cc.id, cc.brief_id, cc.client_id, cc.rank, cc.score, cc.urgency,
              cl.name, cc.why_template, cc.talking_points
         from call_cards cc join clients cl on cl.id = cc.client_id
        where cc.brief_id = any($1::uuid[]) and cc.status in ('new','snoozed')
          and ($4::uuid is null or cc.client_id = $4)
        order by cc.client_id, cc.score desc, cc.rank, cc.id
     ) calls order by case when $2::boolean then score end desc, rank, client_id limit $3`,
    [ids, desk, limit, clientId]);
}
