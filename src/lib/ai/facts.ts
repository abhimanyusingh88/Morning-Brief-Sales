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
  /**
   * Map text the model copied verbatim from a fact's display (e.g. "+5.58%" or a full headline) back to that
   * fact's token. Only exact matches of supplied facts are mapped, longest first, never inside an existing
   * token; anything else still fails the validator. This recovers faithful answers without admitting new numbers.
   */
  tokenize(text: string): string {
    const facts = this.all().filter((f) => /\p{N}/u.test(f.display) && f.display.length >= 2).sort((a, b) => b.display.length - a.display.length);
    return text.split(/(\{\{[A-Za-z0-9_.:\-]+\}\})/g).map((part, i) => {
      if (i % 2) return part;
      let out = part;
      for (const f of facts) {
        if (!out.includes(f.display)) continue;
        const esc = f.display.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        // Boundaries keep "5.2" from matching inside "15.25".
        out = out.replace(new RegExp(`(?<![\\p{N}.])${esc}(?![\\p{N}])`, "gu"), `{{${f.key}}}`);
      }
      return out;
    }).join("");
  }

  render(text: string): string {
    return text.replace(TOKEN_RE, (_, k: string) => {
      const f = this.m.get(k);
      if (!f) throw new Error(`Unknown fact token: ${k}`);
      return f.display;
    });
  }
}

export const tok = (key: string) => `{{${key}}}`;
