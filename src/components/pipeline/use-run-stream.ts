"use client";
import * as React from "react";
import { initialView, reduce, type PipelineEvent, type RunView, type StepDef } from "./model";

const TYPES = ["run", "step", "feed", "log", "done"] as const;

/**
 * Follows one run over server-sent events. Every (re)connection replays the run from its start (from memory while it
 * is live, rebuilt from the database otherwise), so the same hook shows a live run, a finished one and a reload mid-run.
 */
export function useRunStream(runId: string | null, defs: readonly StepDef[], hooks: { onStart?: () => void; onDone?: () => void }) {
  const [view, dispatch] = React.useReducer(reduce, undefined, () => initialView(runId, defs));
  // refs, so a re-render with new (but equal) props never tears down a live connection
  const hooksRef = React.useRef(hooks);
  const defsRef = React.useRef(defs);
  React.useEffect(() => { hooksRef.current = hooks; defsRef.current = defs; });
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    if (!runId) return;
    let es: EventSource | null = null;
    let finished = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let announced = false;

    const open = () => {
      es = new EventSource(`/api/pipeline/runs/${runId}/stream`);
      es.onopen = () => { failures = 0; dispatch({ type: "conn", conn: "live" }); };
      es.onerror = () => {
        if (finished) return;
        if (es?.readyState === EventSource.CLOSED) {
          // the browser gave up (for instance the server refused): try again a few times, then say so
          es.close();
          if (++failures > 4) { dispatch({ type: "conn", conn: "failed" }); return; }
          dispatch({ type: "conn", conn: "reconnecting" });
          timer = setTimeout(open, 1200 * failures);
        } else dispatch({ type: "conn", conn: "reconnecting" });
      };
      const onMsg = (e: MessageEvent) => {
        const ev = JSON.parse(e.data) as PipelineEvent;
        failures = 0;
        dispatch({ type: "event", ev, now: Date.now(), defs: defsRef.current });
        if (ev.type === "run" && ev.steps.length && !announced) { announced = true; hooksRef.current.onStart?.(); }
        if (ev.type === "done") { finished = true; es?.close(); hooksRef.current.onDone?.(); }
      };
      for (const t of TYPES) es.addEventListener(t, onMsg as EventListener);
    };
    open();
    return () => { finished = true; clearTimeout(timer); es?.close(); };
  }, [runId, attempt]);

  const retry = React.useCallback(() => { dispatch({ type: "conn", conn: "connecting" }); setAttempt((a) => a + 1); }, []);
  // a different run starts from a blank view (the component is keyed by run id, so this only guards a null id)
  const out: RunView = runId ? view : initialView(null, defs);
  return { view: out, retry };
}
