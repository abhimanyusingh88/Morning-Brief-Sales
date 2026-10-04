import { beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers/testdb";
import { ingestMarket, ingestNews } from "../src/lib/pipeline/ingest";
import { loadSnapshot } from "../src/lib/pipeline/snapshot";
import { buildCandidates, selectCards } from "../src/lib/pipeline/rank";
import { defaultScenarios } from "../src/lib/market/scenarios";
import { prepareProfile, type Prepared } from "../src/lib/ai/prepare";
import { templateBrief, templateCard } from "../src/lib/ai/templates";
import { validateText } from "../src/lib/ai/validator";
import type { Snapshot } from "../src/lib/pipeline/types";

const D = "2026-10-05";
let snap: Snapshot;
let prepared: Prepared[] = [];
let names = new Map<string, string>();

beforeAll(async () => {
  const db = await testDb();
  snap = await db.asService(async (q) => {
    const sc = defaultScenarios(D);
    await ingestMarket(q, D, sc);
    await ingestNews(q, D, sc);
    return loadSnapshot(q, D);
  });
  const profs = await db.asService((q) => q<{ id: string; full_name: string; role: string }>("select id, full_name, role from profiles where role in ('sales','desk_head')"));
  names = new Map(profs.map((p) => [p.id, p.full_name.split(" ")[0]]));
  const sel = selectCards(snap, buildCandidates(snap));
  for (const [profileId, picks] of sel) {
    if (!names.has(profileId)) continue;
    prepared.push(await prepareProfile({ db, snap, profileId, firstName: names.get(profileId)!, picks }));
  }
}, 120_000);

describe("template writer", () => {
  it("prepares contexts for every salesperson with cards", () => {
    expect(prepared.length).toBeGreaterThanOrEqual(12);
    for (const p of prepared) expect(p.cards.length).toBeGreaterThan(0);
  });

  it("every template card passes the validator, with no digits outside tokens", () => {
    for (const p of prepared) {
      const allowed = new Set(p.facts.keys());
      for (const c of p.cards) {
        const t = templateCard(c);
        for (const s of [t.headline, t.why, ...t.talkingPoints, ...t.watchOuts]) {
          const r = validateText(s, { allowedKeys: allowed, forbiddenTerms: p.forbidden });
          expect(r.errors, s).toEqual([]);
        }
        expect(t.talkingPoints.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("every template brief section passes the validator", () => {
    for (const p of prepared) {
      const allowed = new Set(p.facts.keys());
      const b = templateBrief(p.brief);
      expect(b.sections.length).toBeGreaterThanOrEqual(4);
      for (const s of [b.headline, ...b.sections.map((x) => x.body)]) {
        const r = validateText(s, { allowedKeys: allowed, forbiddenTerms: p.forbidden });
        expect(r.errors, s).toEqual([]);
      }
    }
  });

  it("renders to readable text with the right units", () => {
    const p = prepared.find((x) => x.cards.some((c) => c.kind === "move" && c.movers[0]?.assetClass === "rates"))!;
    const c = p.cards.find((x) => x.kind === "move" && x.movers[0]?.assetClass === "rates")!;
    const t = templateCard(c);
    const out = p.facts.render(t.headline);
    expect(out).toMatch(/bp/);
    expect(out).not.toMatch(/\{\{/);
    const eq = prepared.flatMap((x) => x.cards).find((x) => x.movers[0]?.assetClass === "equity" && x.kind === "move");
    if (eq) expect(prepared.find((x) => x.cards.includes(eq))!.facts.render(templateCard(eq).headline)).toMatch(/%/);
  });

  it("never mentions a restricted-list name", () => {
    for (const p of prepared) {
      const all = [...p.cards.flatMap((c) => { const t = templateCard(c); return [t.headline, t.why, ...t.talkingPoints, ...t.watchOuts]; }), ...templateBrief(p.brief).sections.map((s) => s.body)]
        .map((s) => p.facts.render(s)).join(" ");
      for (const term of p.forbidden) expect(new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(all), term).toBe(false);
    }
  });

  it("every fact carries a source and a timestamp", () => {
    for (const p of prepared) for (const f of p.facts.all()) {
      expect(f.source.length).toBeGreaterThan(0);
      expect(Number.isNaN(Date.parse(f.asOf))).toBe(false);
    }
  });
});
