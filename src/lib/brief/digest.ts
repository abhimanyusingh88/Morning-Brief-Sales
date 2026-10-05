/**
 * Email digest renderer (spec section 5, delivery). Produces the HTML a salesperson would receive at their send time.
 * In this proof of concept it is stored and previewed, never sent: the relay is a simulator and only ever addresses the
 * salesperson themselves. No code path addresses a client.
 */
import type { BuiltSection } from "./build";

export interface FactLite { display: string; unit?: string }
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const TOKEN = /\{\{([A-Za-z0-9_.:\-]+)\}\}/g;
export const renderPlain = (tpl: string, facts: Record<string, FactLite>) => tpl.replace(TOKEN, (_, k: string) => facts[k]?.display ?? "—");

const C = { ink: "#1b1a17", muted: "#6f6a5f", line: "#e4dfd2", bg: "#f5f3ee", up: "#1f7a46", down: "#b3342b", gold: "#9a6b12", panel: "#ffffff", callout: "#f0e2bf" };
const toneColor = (t?: string) => (t === "up" ? C.up : t === "down" ? C.down : C.ink);
const h = (title: string) => `<tr><td style="padding:22px 0 6px;font:600 13px Georgia,serif;color:${C.ink};border-bottom:1px solid ${C.line}">${esc(title)}</td></tr>`;

export interface DigestInput {
  name: string;
  date: string;
  dateLabel: string;
  sectors: string[];
  products: string[];
  oneLine: string;
  sections: BuiltSection[];
  facts: Record<string, FactLite>;
  generatedAt: string;
}

export function renderDigest(i: DigestInput): { subject: string; html: string; text: string } {
  const f = (k: string) => esc(i.facts[k]?.display ?? "—");
  const body: string[] = [];
  const text: string[] = [`Morning brief — ${i.dateLabel}`, i.oneLine, ""];

  for (const s of i.sections) {
    body.push(h(s.title));
    if (s.status === "unavailable") { body.push(`<tr><td style="padding:8px 0;font:13px Arial;color:${C.muted}"><em>${esc(s.note ?? "Data temporarily unavailable.")}</em></td></tr>`); text.push(`${s.title}: ${s.note}`); continue; }
    const d = s.data as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    let inner = "";
    switch (s.kind) {
      case "snapshot": {
        const tiles = d.tiles as { label: string; level: string; sub: string; tone: string }[];
        const rows: string[] = [];
        for (let r = 0; r < tiles.length; r += 4) {
          rows.push(`<tr>${tiles.slice(r, r + 4).map((t) => `<td width="25%" style="padding:8px;border:1px solid ${C.line};background:${C.panel};vertical-align:top"><div style="font:10px Arial;color:${C.muted}">${esc(t.label)}</div><div style="font:600 17px Arial;color:${C.ink}">${f(t.level)}</div><div style="font:11px Arial;color:${toneColor(t.tone)}">${f(t.sub)}</div></td>`).join("")}</tr>`);
        }
        inner = `<table width="100%" cellspacing="0" cellpadding="0" style="margin-top:8px">${rows.join("")}</table>`;
        break;
      }
      case "chart":
        inner = `<div style="padding:10px;border:1px solid ${C.line};background:${C.panel};margin-top:8px;font:13px Arial;color:${C.ink}"><b style="font-size:20px">${f(d.nowKey)}</b> <span style="color:${toneColor(d.tone)}">${f(d.chgKey)} today</span><br><span style="color:${C.muted}">Ten-session range ${f(d.loKey)} to ${f(d.hiKey)}. Open the dashboard for the chart.</span></div>`;
        break;
      case "catalysts":
        inner = (d.paragraphs as { body: string }[]).map((p) => `<p style="font:14px/1.6 Arial;color:${C.ink};margin:10px 0">${esc(renderPlain(p.body, i.facts))}</p>`).join("");
        break;
      default:
        inner = `<div style="font:13.5px/1.6 Arial;color:${C.ink};padding-top:6px">${s.template.split("\n").filter(Boolean).map((l) => `<div style="padding:5px 0;border-bottom:1px solid ${C.line}">${esc(renderPlain(l, i.facts))}</div>`).join("")}</div>`;
    }
    body.push(`<tr><td>${inner}</td></tr>`);
    text.push(`${s.title}`, s.kind === "catalysts" ? (d.paragraphs as { body: string }[]).map((p) => renderPlain(p.body, i.facts)).join("\n\n") : renderPlain(s.template, i.facts), "");
  }

  const html = `<!doctype html><html><body style="margin:0;background:${C.bg}"><table width="100%" cellspacing="0" cellpadding="0" style="background:${C.bg}"><tr><td align="center" style="padding:20px">
<table width="640" cellspacing="0" cellpadding="0" style="background:${C.bg};font-family:Arial,sans-serif">
<tr><td style="font:italic 700 28px Georgia,serif;color:${C.ink};padding-bottom:4px;border-bottom:2px solid ${C.ink}">Morning brief <span style="float:right;font:12px 'Courier New',monospace;font-style:normal;font-weight:400;color:${C.muted}">${esc(i.dateLabel)}</span></td></tr>
<tr><td style="padding:10px 0;font:12.5px Arial;color:${C.muted}">Built for your coverage — <b style="color:${C.ink}">${esc(i.sectors.join(" and "))}</b>, ${esc(i.products.join(", ").toLowerCase())}.</td></tr>
<tr><td style="padding:12px 14px;background:${C.callout};border:1px solid #e3d29d"><div style="font:10px 'Courier New',monospace;color:${C.gold};text-transform:uppercase;letter-spacing:.06em">Today in one line</div><div style="font:15px/1.5 Arial;color:${C.ink};padding-top:4px">${esc(renderPlain(i.oneLine, i.facts))}</div></td></tr>
${body.join("\n")}
<tr><td style="padding:22px 0 0;font:11.5px Arial;color:${C.muted}">${esc(i.generatedAt)} from simulated market, news and calendar feeds, filtered to your saved sectors and products. Figures are inserted by code and traceable to source in the dashboard. Demo workspace: all data is synthetic.</td></tr>
</table></td></tr></table></body></html>`;
  return { subject: `Morning brief — ${i.dateLabel}`, html, text: text.join("\n") };
}
