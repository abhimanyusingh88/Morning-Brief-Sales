"use client";
import * as React from "react";

/** Re-renders on an interval while `active`, so only the component that calls it updates. */
export function useNow(active: boolean, every = 120) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(t);
  }, [active, every]);
  return now;
}
