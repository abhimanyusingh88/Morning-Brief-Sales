import { expect, it } from "vitest";
import { initialView, reduce, skeleton, stageViews, type StepDef } from "../src/components/pipeline/model";

it("replays historical results in the correct workflow stages without changing stored results", () => {
  const defs: StepDef[] = [["ingest", "Ingest", 1, "04:00"], ["deliver", "Deliver", 5, "06:30"]];
  const steps = skeleton(defs).map((step) => ({ ...step, stage: 1, simAt: "04:00", status: "succeeded" as const, rowsOut: 12, log: ["Completed"] }));
  const view = reduce(initialView("run", defs), { type: "event", now: 0, defs, ev: { type: "run", runId: "run", businessDate: "2026-10-05", status: "succeeded", steps } });
  expect(view.steps[1]).toMatchObject({ stage: 5, simAt: "06:30", rowsOut: 12, log: ["Completed"] });
  expect(steps[1]).toMatchObject({ stage: 1, simAt: "04:00" });
  expect(stageViews([{ n: 5, name: "Delivery", simAt: "06:30", detail: "" }], view.steps)[0]).toMatchObject({ done: 1, total: 1, status: "done" });
  const updated = reduce(view, { type: "event", now: 1, defs, ev: { type: "step", runId: "run", step: { ...steps[1], rowsOut: 14 } } });
  expect(updated.steps[1]).toMatchObject({ stage: 5, simAt: "06:30", rowsOut: 14 });
});
