import * as React from "react";
import { Card, CardHeader } from "@/components/ui/card";
import type { FactView } from "@/components/ui/fact";
import { etStamp, groupByFeed } from "./lib";

/** Every figure in the brief, grouped by the feed it came from: value, source, as-of. Names and headlines are not figures and are left out. */
export function AuditTable({ keys, facts, version, generatedAt }: { keys: string[]; facts: Record<string, FactView>; version: number; generatedAt: string }) {
  const groups = groupByFeed(keys, facts);
  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  return (
    <Card className="overflow-hidden print:break-before-page">
      <CardHeader title="Sources and timestamps" sub={`${total} figures · every one was inserted by code from the source below; the writer only places it.`} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-[12.5px]">
          <thead className="text-left text-muted">
            <tr className="border-b border-line">
              <th scope="col" className="px-5 py-2 font-medium">Figure</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Value</th>
              <th scope="col" className="px-3 py-2 font-medium">Source</th>
              <th scope="col" className="px-5 py-2 font-medium">As of</th>
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g.feedKey} className="divide-y divide-line">
              <tr className="bg-sunken/60">
                <th scope="colgroup" colSpan={4} className="px-5 py-1.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                  {g.feedName} <span className="num ml-1 font-normal normal-case tracking-normal text-subtle">{g.rows.length} {g.rows.length === 1 ? "figure" : "figures"}</span>
                </th>
              </tr>
              {g.rows.map((f) => (
                <tr key={f.key}>
                  <td className="px-5 py-2 text-ink-2">{f.label}</td>
                  <td className="num px-3 py-2 text-right font-semibold text-ink">{f.display}</td>
                  <td className="px-3 py-2 text-muted">{f.source}</td>
                  <td className="num whitespace-nowrap px-5 py-2 text-muted">{etStamp(f.asOf)}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      <p className="border-t border-line px-5 py-3 text-[11.5px] text-muted">Version {version} · generated {etStamp(generatedAt)}</p>
    </Card>
  );
}
