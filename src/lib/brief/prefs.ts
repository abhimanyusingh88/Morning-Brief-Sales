import { z } from 'zod';
import type { Db } from '../db/types';
import { nextBusinessDay } from '../util/time';
import {
  ALL_PRODUCTS,
  DEFAULT_INCLUDE,
  INCLUDE_TOGGLES,
  SPEC_SECTORS,
  defaultPrefs,
  type BriefPrefs,
  type IncludeKey,
  type SpecSector,
} from './spec';

export const PrefsInput = z.object({
  sectors: z.array(z.enum(SPEC_SECTORS)).min(1, 'Choose at least one sector'),
  products: z.array(z.string().refine((p) => ALL_PRODUCTS.includes(p), 'Unknown product')).max(ALL_PRODUCTS.length),
  include: z.record(z.string(), z.boolean()),
  delivery: z.enum(['dashboard', 'email', 'both']),
  sendTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});
export type PrefsInput = z.infer<typeof PrefsInput>;

const normaliseInclude = (raw: unknown): Record<IncludeKey, boolean> => {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return Object.fromEntries(
    INCLUDE_TOGGLES.map((t) => [t.key, typeof r[t.key] === 'boolean' ? r[t.key] : DEFAULT_INCLUDE[t.key]]),
  ) as Record<IncludeKey, boolean>;
};

const rowToPrefs = (r: Record<string, unknown>): BriefPrefs => ({
  sectors: (r.sectors as string[]).filter((s): s is SpecSector => (SPEC_SECTORS as readonly string[]).includes(s)),
  products: (r.products as string[]).filter((p) => ALL_PRODUCTS.includes(p)),
  include: normaliseInclude(r.include),
  delivery: r.delivery as BriefPrefs['delivery'],
  sendTime: String(r.send_time).slice(0, 5),
  effectiveFrom: String(r.effective_from).slice(0, 10),
});

/** Pipeline: the setup in force for each profile on a business date. Nothing saved yet means the desk default. */
export async function loadAllPrefs(db: Db, date: string, profileIds: string[]): Promise<Map<string, BriefPrefs>> {
  const rows = await db.asService((q) =>
    q(
      `select distinct on (profile_id) profile_id, effective_from::text, sectors, products, include, delivery, to_char(send_time, 'HH24:MI') send_time
       from brief_preferences where effective_from <= $1::date and profile_id = any($2::uuid[]) order by profile_id, effective_from desc`,
      [date, profileIds],
    ),
  );
  const desks = new Map(
    (
      await db.asService((q) =>
        q<{ id: string; code: string | null }>(
          `select p.id, d.code from profiles p left join desks d on d.id = p.desk_id where p.id = any($1::uuid[])`,
          [profileIds],
        ),
      )
    ).map((r) => [r.id, r.code]),
  );
  const saved = new Map(rows.map((r) => [String(r.profile_id), rowToPrefs(r)]));
  return new Map(
    profileIds.map((id) => [
      id,
      saved.get(id) ?? { ...defaultPrefs(id, desks.get(id) ?? null), effectiveFrom: 'default' },
    ]),
  );
}

export interface PrefsView {
  current: BriefPrefs;
  pending: BriefPrefs | null;
  businessDate: string;
  isDefault: boolean;
}

/** App: read as the person. */
export async function getPrefsView(db: Db, profileId: string): Promise<PrefsView> {
  return db.asUser(profileId, async (q) => {
    const bd = (await q<{ d: string }>(`select business_date::text d from firm_settings limit 1`))[0].d;
    const rows = await q(
      `select effective_from::text, sectors, products, include, delivery, to_char(send_time, 'HH24:MI') send_time from brief_preferences where profile_id = $1 order by effective_from desc`,
      [profileId],
    );
    const live = rows.find((r) => String(r.effective_from) <= bd);
    const pend = rows.find((r) => String(r.effective_from) > bd);
    const desk =
      (
        await q<{ code: string | null }>(
          `select d.code from profiles p left join desks d on d.id = p.desk_id where p.id = $1`,
          [profileId],
        )
      )[0]?.code ?? null;
    return {
      current: live ? rowToPrefs(live) : { ...defaultPrefs(profileId, desk), effectiveFrom: 'default' },
      pending: pend ? rowToPrefs(pend) : null,
      businessDate: bd,
      isDefault: !live,
    };
  });
}

/** Changes take effect the next business day; no same-day regeneration (spec section 6). */
export async function savePrefs(db: Db, profileId: string, input: PrefsInput): Promise<{ effectiveFrom: string }> {
  return db.asUser(profileId, async (q) => {
    const bd = (await q<{ d: string }>(`select business_date::text d from firm_settings limit 1`))[0].d;
    const effectiveFrom = nextBusinessDay(bd);
    const include = normaliseInclude(input.include);
    await q(
      `insert into brief_preferences (profile_id, effective_from, sectors, products, include, delivery, send_time, updated_at)
       values ($1, $2::date, $3::text[], $4::text[], $5::jsonb, $6, $7::time, now())
       on conflict (profile_id, effective_from) do update set sectors = excluded.sectors, products = excluded.products, include = excluded.include, delivery = excluded.delivery, send_time = excluded.send_time, updated_at = now()`,
      [
        profileId,
        effectiveFrom,
        input.sectors,
        input.products,
        JSON.stringify(include),
        input.delivery,
        input.sendTime,
      ],
    );
    await q(
      `insert into audit_log (actor_id, action, object_type, object_id, detail) values ($1, 'brief_preferences.update', 'profile', $2::text, $3::jsonb)`,
      [
        profileId,
        profileId,
        JSON.stringify({ effectiveFrom, sectors: input.sectors, products: input.products, delivery: input.delivery }),
      ],
    );
    return { effectiveFrom };
  });
}
