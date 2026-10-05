import type { Tone } from "@/components/ui/status";
import type { FeedUiStatus } from "./model";

export const FEED_STATUS: Record<FeedUiStatus, { tone: Tone; label: string }> = {
  queued: { tone: "idle", label: "Queued" }, connecting: { tone: "run", label: "Connecting" }, ok: { tone: "ok", label: "OK" },
  delayed: { tone: "warn", label: "Delayed" }, down: { tone: "bad", label: "Down" }, none: { tone: "idle", label: "No record" },
};
