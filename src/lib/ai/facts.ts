/**
 * Facts are the only way a number reaches the screen. Models write {{key}}; code substitutes `display`.
 * Every fact carries where it came from and when, which is what the UI shows on hover.
 */
export interface Fact {
  key: string;
  label: string;
  /** raw value, kept for audit/sorting; never shown by a model */
  value: number | null;
  /** exactly what is substituted into text */
  display: string;
  unit: "pct" | "bp" | "usd" | "level" | "days" | "count" | "text" | "time";
  source: string;
  asOf: string; // ISO
  /** the connector this value came from, so a figure can be traced back to a feed run */
  feedKey?: string;
  /** plain-words descriptor for a writer (direction, size). Never contains digits. Not stored. */
  hint?: string;
}

export const TOKEN_RE = /\{\{([A-Za-z0-9_.:\-]+)\}\}/g;

export class FactBook {
  private m = new Map<string, Fact>();

  add(f: Fact): string {
    if (!/^[A-Za-z0-9_.:\-]+$/.test(f.key)) throw new Error(`Bad fact key: ${f.key}`);
    this.m.set(f.key, f);
    return `{{${f.key}}}`;
  }
  has = (k: string) => this.m.has(k);
  get = (k: string) => this.m.get(k);
  keys = () => [...this.m.keys()];
  all = () => [...this.m.values()];

  /** Replace every {{key}} with its display. Unknown keys throw: callers must validate first. */
  render(text: string): string {
    return text.replace(TOKEN_RE, (_, k: string) => {
      const f = this.m.get(k);
      if (!f) throw new Error(`Unknown fact token: ${k}`);
      return f.display;
    });
  }
}

export const tok = (key: string) => `{{${key}}}`;
