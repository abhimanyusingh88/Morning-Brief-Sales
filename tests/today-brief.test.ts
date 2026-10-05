import { describe, expect, it } from "vitest";
import { barWidths, groupBy, groupTiles, LEFT_KINDS, magnitude, RIGHT_KINDS, scopeOf } from "../src/components/today-brief/lib";
import { SECTION_ORDER } from "../src/lib/brief/build";

describe("today's brief dashboard helpers", () => {
  it("groups benchmark tiles in desk order and keeps unknown tiles", () => {
    const tiles = ["VIX", "SPX", "UST10Y", "NDX", "ZZZ"].map((symbol) => ({ symbol }));
    expect(groupTiles(tiles)).toEqual([
      { title: "Equities", tiles: [{ symbol: "SPX" }, { symbol: "NDX" }] },
      { title: "Rates & credit", tiles: [{ symbol: "UST10Y" }] },
      { title: "Risk & commodities", tiles: [{ symbol: "VIX" }] },
      { title: "Other", tiles: [{ symbol: "ZZZ" }] },
    ]);
  });

  it("reads signed magnitudes from printed figures, including the typographic minus", () => {
    expect(magnitude("+1.24%")).toBe(1.24);
    expect(magnitude("−0.8%")).toBe(-0.8);
    expect(magnitude("-12 bp")).toBe(-12);
    expect(magnitude(undefined)).toBe(0);
    expect(magnitude("n/a")).toBe(0);
  });

  it("sizes bars against the largest absolute move", () => {
    expect(barWidths([2, -1, 0.5])).toEqual([100, 50, 25]);
    expect(barWidths([0, 0])).toEqual([0, 0]);
  });

  it("groups by key in first-seen order", () => {
    expect(groupBy(["MON:a", "TUE:b", "MON:c"], (x) => x.split(":")[0]).map((g) => [g.key, g.items.length])).toEqual([["MON", 2], ["TUE", 1]]);
  });

  it("places every spec section except the snapshot in exactly one column", () => {
    const placed = [...LEFT_KINDS, ...RIGHT_KINDS];
    expect(new Set(placed).size).toBe(placed.length);
    expect(SECTION_ORDER.filter((k) => k !== "snapshot" && !placed.includes(k as never))).toEqual([]);
    expect(scopeOf("movers")).toBe("personal");
    expect(scopeOf("snapshot")).toBe("market");
  });
});
