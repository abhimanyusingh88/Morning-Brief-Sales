import * as React from 'react';

// A figure: optional sign, digits with separators/decimals, optional unit. Currency prefix allowed. A sign attached to
// a preceding digit or letter is a hyphen ("2026-10-09", "S-1"), not a minus.
const FIGURE = /((?:(?<![\w.])[+\-−])?\$?\d[\d,]*(?:\.\d+)?\s?(?:%|bp|bps|pts?|[KMBT]\b|x\b)?)/g;
const UP =
  /\b(up|higher|rose|risen|rises|rising|gain|gained|gains|added|adds|climbed|climbs|rallied|rallies|jumped|jumps|surged|surges|advanced|advances|beat|beats|increase[sd]?)\s+(?:by\s+|of\s+|to\s+)?$/i;
const DOWN =
  /\b(down|lower|fell|fallen|falls|falling|loss|decline|drop|declined|declines|dropped|drops|lost|loses|slipped|slips|slid|slides|eased|eases|sank|sinks|tumbled|tumbles|retreated|missed|misses|decrease[sd]?|off)\s+(?:by\s+|of\s+|to\s+)?$/i;

/** Tone of a figure from its own sign, or from the direction word immediately before it. */
export function figureTone(figure: string, before: string): 'up' | 'down' | 'neutral' {
  const f = figure.trim();
  if (/^[+]/.test(f)) return 'up';
  if (/^[-−]/.test(f)) return 'down';
  // Levels ("at 7,808") stay neutral; only moves with a unit take the direction word's colour.
  if (!/(%|bp|bps|pts?)$/.test(f)) return 'neutral';
  if (UP.test(before)) return 'up';
  if (DOWN.test(before)) return 'down';
  return 'neutral';
}

/** Renders prose with every figure set in tabular numerals; moves are green (up) or red (down). */
export function Figures({ text }: { text: string }) {
  const parts = text.split(FIGURE);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return part;
        if (!/\d/.test(part)) return part;
        const before = parts
          .slice(Math.max(0, i - 1), i)
          .join('')
          .slice(-40);
        // Years and the numbers inside instrument names are words, not figures.
        if (
          /^(19|20)\d{2}$/.test(part.trim()) ||
          /(S&P|Nasdaq|Russell|Stoxx|FTSE|Nikkei|DAX|CAC)\s$/i.test(before) ||
          /[-–A-Za-z]$/.test(before)
        )
          return part;
        const tone = figureTone(part, before);
        const cls = tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : 'text-ink';
        return (
          <span key={i} className={'num whitespace-nowrap font-semibold ' + cls}>
            {part}
          </span>
        );
      })}
    </>
  );
}
