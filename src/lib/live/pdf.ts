import { PDFDocument, PDFName, PDFString, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import type { Filters, Report, Story } from './types';
import { briefSelection, filterStories, formatMetric, metricChange } from './presentation';
import { THEMES, themeOf } from './classify';
import { displayDay, stamp } from './time';
// Formal, print-ready brief: US Letter portrait, built-in PDF fonts (Times for reading, Helvetica for data),
// ruled tables with right-aligned figures, and clickable source links instead of raw URLs.
const C = {
  navy: rgb(0.09, 0.17, 0.24),
  ink: rgb(0.13, 0.21, 0.28),
  ink2: rgb(0.26, 0.36, 0.44),
  muted: rgb(0.42, 0.49, 0.56),
  line: rgb(0.86, 0.89, 0.92),
  zebra: rgb(0.965, 0.973, 0.98),
  brand: rgb(0.03, 0.43, 0.47),
  up: rgb(0.04, 0.44, 0.29),
  down: rgb(0.78, 0.21, 0.18),
  white: rgb(1, 1, 1),
  callout: rgb(0.92, 0.965, 0.97),
};
const W = 612,
  H = 792,
  M = 48,
  CW = W - M * 2,
  TOP = H - 58,
  BOTTOM = 56;
type Fonts = { sans: PDFFont; bold: PDFFont; serif: PDFFont; serifBold: PDFFont; serifItalic: PDFFont };
type Col = { label: string; width: number; align?: 'left' | 'right'; color?: (v: string) => RGB };
const time = (at: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }).format(
    new Date(at),
  );
const num = (s: string) => {
  const n = Number(s);
  return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : s;
};
export async function renderPdf(report: Report, filters: Filters): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle('Sales & Trading Morning Brief - ' + report.clientName + ' - ' + report.businessDate);
  doc.setAuthor('Morning Brief');
  doc.setSubject('Market brief from verified sources and client holdings');
  doc.setCreationDate(new Date(report.cutoff));
  const f: Fonts = {
    sans: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    serif: await doc.embedFont(StandardFonts.TimesRoman),
    serifBold: await doc.embedFont(StandardFonts.TimesRomanBold),
    serifItalic: await doc.embedFont(StandardFonts.TimesRomanItalic),
  };
  // WinAnsi only: normalise common typography and drop anything the standard fonts cannot encode.
  const clean = (t: string) =>
    Array.from(
      t
        .replace(/[\t\r\n]+/g, ' ')
        .replace(/[‐-‒]/g, '-')
        .replace(/ /g, ' '),
    )
      .map((c) => {
        try {
          f.sans.encodeText(c);
          return c;
        } catch {
          return '';
        }
      })
      .join('')
      .trim();
  let page!: PDFPage,
    y = 0;
  const text = (t: string, x: number, at: number, size: number, font: PDFFont, color: RGB = C.ink) =>
    page.drawText(clean(t), { x, y: at, size, font, color });
  const width = (t: string, size: number, font: PDFFont) => font.widthOfTextAtSize(clean(t), size);
  const fit = (t: string, max: number, size: number, font: PDFFont) => {
    let s = clean(t);
    if (font.widthOfTextAtSize(s, size) <= max) return s;
    while (s.length > 1 && font.widthOfTextAtSize(s + '...', size) > max) s = s.slice(0, -1);
    return s.trimEnd() + '...';
  };
  const wrap = (t: string, max: number, size: number, font: PDFFont): string[] => {
    const out: string[] = [];
    let line = '';
    for (const w of clean(t).split(/\s+/).filter(Boolean)) {
      const next = line ? line + ' ' + w : w;
      if (font.widthOfTextAtSize(next, size) <= max) line = next;
      else {
        if (line) out.push(line);
        line = font.widthOfTextAtSize(w, size) <= max ? w : fit(w, max, size, font);
      }
    }
    if (line) out.push(line);
    return out;
  };
  const link = (url: string, x: number, at: number, w: number, h: number) => {
    try {
      const u = new URL(url);
      if (!['https:', 'http:'].includes(u.protocol)) return;
      const annot = doc.context.register(
        doc.context.obj({
          Type: 'Annot',
          Subtype: 'Link',
          Rect: [x, at - 2, x + w, at + h],
          Border: [0, 0, 0],
          A: { Type: 'Action', S: 'URI', URI: PDFString.of(u.href) },
        }),
      );
      page.node.addAnnot(annot);
    } catch {}
  };
  const newPage = () => {
    page = doc.addPage([W, H]);
    page.drawLine({ start: { x: M, y: H - 40 }, end: { x: W - M, y: H - 40 }, thickness: 0.6, color: C.line });
    text('SALES & TRADING MORNING BRIEF', M, H - 33, 7.5, f.bold, C.navy);
    const r = report.clientName + '  |  ' + displayDay(report.businessDate);
    text(r, W - M - width(r, 7.5, f.sans), H - 33, 7.5, f.sans, C.muted);
    y = TOP;
  };
  const room = (h: number) => {
    if (y - h < BOTTOM) newPage();
  };
  const heading = (t: string) => {
    room(40);
    y -= 14;
    text(t.toUpperCase(), M, y, 9.5, f.bold, C.navy);
    y -= 6;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1.4, color: C.navy });
    y -= 14;
  };
  const para = (t: string, size: number, font: PDFFont, color: RGB = C.ink, lead = 1.45, indent = 0) => {
    for (const l of wrap(t, CW - indent, size, font)) {
      room(size * lead);
      text(l, M + indent, y, size, font, color);
      y -= size * lead;
    }
  };
  const table = (cols: Col[], rows: string[][], size = 8.5) => {
    const total = cols.reduce((n, c) => n + c.width, 0),
      scale = CW / total,
      ws = cols.map((c) => c.width * scale),
      rowH = size + 9;
    const head = () => {
      page.drawRectangle({ x: M, y: y - rowH + size + 1, width: CW, height: rowH, color: C.navy });
      let x = M;
      cols.forEach((c, i) => {
        const t = fit(c.label.toUpperCase(), ws[i] - 10, 7, f.bold);
        text(t, c.align === 'right' ? x + ws[i] - 6 - width(t, 7, f.bold) : x + 6, y, 7, f.bold, C.white);
        x += ws[i];
      });
      y -= rowH;
    };
    room(rowH * 3);
    head();
    rows.forEach((r, ri) => {
      if (y - rowH < BOTTOM) {
        newPage();
        head();
      }
      if (ri % 2) page.drawRectangle({ x: M, y: y - rowH + size + 1, width: CW, height: rowH, color: C.zebra });
      let x = M;
      cols.forEach((c, i) => {
        const font = i === 0 ? f.bold : f.sans,
          t = fit(r[i] ?? '', ws[i] - 10, size, font);
        text(
          t,
          c.align === 'right' ? x + ws[i] - 6 - width(t, size, font) : x + 6,
          y,
          size,
          font,
          c.color?.(r[i] ?? '') ?? C.ink,
        );
        x += ws[i];
      });
      page.drawLine({
        start: { x: M, y: y - rowH + size + 1 },
        end: { x: W - M, y: y - rowH + size + 1 },
        thickness: 0.4,
        color: C.line,
      });
      y -= rowH;
    });
    y -= 6;
  };
  const signed = (v: string) => (v.startsWith('+') ? C.up : v.startsWith('-') ? C.down : C.ink);
  // ---------------- page one masthead
  page = doc.addPage([W, H]);
  page.drawRectangle({ x: 0, y: H - 112, width: W, height: 112, color: C.navy });
  text('SALES & TRADING', M, H - 44, 8, f.bold, rgb(0.65, 0.78, 0.85));
  text('Morning Brief', M, H - 74, 26, f.serifBold, C.white);
  text(report.clientName + '  |  Prepared for ' + report.salesperson, M, H - 94, 9.5, f.sans, rgb(0.8, 0.87, 0.91));
  const d = displayDay(report.businessDate),
    cut = 'Data cutoff ' + stamp(report.cutoff);
  text(d, W - M - width(d, 11, f.bold), H - 70, 11, f.bold, C.white);
  text(cut, W - M - width(cut, 8.5, f.sans), H - 86, 8.5, f.sans, rgb(0.8, 0.87, 0.91));
  y = H - 140;
  const scope = [
    filters.q ? 'Search "' + filters.q + '"' : null,
    filters.topic ? 'Topic ' + filters.topic : null,
    filters.symbol ? 'Stock ' + filters.symbol : null,
  ]
    .filter(Boolean)
    .join('  |  ');
  if (scope) {
    text('Filtered view: ' + scope, M, y, 8.5, f.sans, C.muted);
    y -= 16;
  }
  // ---------------- key events
  const stories = briefSelection(filterStories(report, filters)),
    events = report.desk?.keyEvents?.length
      ? report.desk.keyEvents.map((e) => e.text)
      : stories.slice(0, 6).map((a) => a.title + ' (' + a.publisher + ')');
  if (events.length) {
    const lines = events.map((e) => {
      const m = /^([^:]{2,30}):\s([\s\S]+)$/.exec(e);
      return m ? { label: m[1] + ':', body: m[2] } : { label: '', body: e };
    });
    const bodyW = CW - 36;
    const blocks = lines.map((l) => wrap((l.label ? l.label + ' ' : '') + l.body, bodyW, 10, f.serif));
    const h = 28 + blocks.reduce((n, b) => n + b.length * 14 + 4, 0);
    room(h);
    page.drawRectangle({ x: M, y: y - h + 10, width: CW, height: h, color: C.callout });
    page.drawRectangle({ x: M, y: y - h + 10, width: 3, height: h, color: C.brand });
    text('KEY EVENTS TODAY', M + 16, y - 6, 8.5, f.bold, C.navy);
    y -= 24;
    lines.forEach((l, i) => {
      page.drawCircle({ x: M + 20, y: y + 3, size: 1.6, color: C.navy });
      blocks[i].forEach((row, j) => {
        let x = M + 30;
        if (j === 0 && l.label && row.startsWith(clean(l.label))) {
          text(l.label, x, y, 10, f.serifBold);
          x += width(l.label, 10, f.serifBold) + 3.5;
          text(row.slice(clean(l.label).length).trim(), x, y, 10, f.serif);
        } else text(row, x, y, 10, f.serif);
        y -= 14;
      });
      y -= 4;
    });
    y -= 14;
  }
  // ---------------- markets
  heading('Markets snapshot');
  table(
    [
      { label: 'Instrument', width: 150 },
      { label: 'Level', width: 90, align: 'right' },
      { label: 'Change', width: 80, align: 'right', color: signed },
      { label: 'Observed', width: 120 },
      { label: 'Source', width: 150 },
    ],
    report.metrics.map((m) => {
      const c = metricChange(m);
      return [
        m.label,
        formatMetric(m),
        c?.label ?? '-',
        m.observedAt ? stamp(m.observedAt) : (m.observedDate ?? 'Unavailable'),
        m.source?.replace(' public quote (delayed)', ' (delayed)') ?? '-',
      ];
    }),
  );
  text(
    'Index and yield changes in basis points versus the prior close; commodities and crypto in percent.',
    M,
    y,
    7.5,
    f.sans,
    C.muted,
  );
  y -= 10;
  if (report.desk?.wrap?.length) {
    heading('Market wrap');
    report.desk.wrap.forEach((p, i) => {
      para(p, 10.5, i === 0 ? f.serifBold : f.serif, C.ink, 1.5);
      y -= 6;
    });
  }
  for (const s of report.desk?.sections ?? []) {
    room(40);
    y -= 4;
    text(s.title, M, y, 10, f.bold, C.brand);
    y -= 14;
    para(s.text, 10, f.serif, C.ink2, 1.45);
    y -= 4;
  }
  // ---------------- client book
  heading('Client book');
  table(
    [
      { label: 'Client', width: 150 },
      { label: 'Account', width: 56 },
      { label: 'Stock', width: 48 },
      { label: 'Position', width: 52 },
      { label: 'Quantity', width: 70, align: 'right' },
      { label: 'Current value', width: 88, align: 'right' },
      { label: 'Spread', width: 48, align: 'right' },
      { label: 'Margin', width: 48, align: 'right' },
    ],
    report.holdings
      .map((h) => [
        h.client,
        h.account,
        h.symbol,
        h.direction,
        num(h.quantity),
        num(h.currentValue),
        num(h.spread),
        num(h.margin),
      ])
      .map((r) => r),
    8,
  );
  text(
    'Values as recorded in the client book' +
      (report.holdings.some((h) => h.currency)
        ? ' (' + [...new Set(report.holdings.map((h) => h.currency).filter(Boolean))].join(', ') + ')'
        : '; currency and units not supplied') +
      '. No P&L is inferred.',
    M,
    y,
    7.5,
    f.sans,
    C.muted,
  );
  y -= 10;
  // ---------------- headlines
  heading('Headlines since the close');
  if (!stories.length) para('No verified stories match this view.', 10, f.serifItalic, C.muted);
  const groups = THEMES.map((t) => ({
    t,
    items: stories
      .filter((a) => themeOf(a.topics).key === t.key)
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)),
  })).filter((g) => g.items.length);
  const story = (a: Story) => {
    const title = wrap(a.title, CW, 11.5, f.serifBold),
      body = a.excerpt && a.excerpt !== a.title ? wrap(a.excerpt, CW, 9.5, f.serif).slice(0, 3) : [];
    const h = 14 + title.length * 14 + body.length * 12.5 + 24;
    room(h);
    const meta = (
      a.publisher +
      '  |  ' +
      time(a.publishedAt) +
      ' ET  |  ' +
      (a.category === 'company' ? 'Direct' : a.category === 'industry' ? 'Read-across' : 'Market')
    ).toUpperCase();
    text(meta, M, y, 7, f.bold, C.muted);
    const src = 'Source';
    const sx = W - M - width(src, 7.5, f.bold);
    text(src, sx, y, 7.5, f.bold, C.brand);
    link(a.url, sx, y, width(src, 7.5, f.bold), 8);
    y -= 13;
    for (const l of title) {
      text(l, M, y, 11.5, f.serifBold);
      y -= 14;
    }
    for (const l of body) {
      text(l, M, y + 1, 9.5, f.serif, C.ink2);
      y -= 12.5;
    }
    const tick = [...new Set(a.matches.map((m) => m.symbol + ' ' + (m.direction === 'Long' ? 'L' : 'S')))]
      .slice(0, 8)
      .join('   ');
    y -= 2;
    if (tick) {
      text(tick, M, y, 8, f.bold, C.brand);
      text(
        fit(a.reason, CW - width(tick, 8, f.bold) - 14, 7.5, f.sans),
        M + width(tick, 8, f.bold) + 14,
        y,
        7.5,
        f.sans,
        C.muted,
      );
    } else text(fit(a.reason, CW, 7.5, f.sans), M, y, 7.5, f.sans, C.muted);
    y -= 10;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.4, color: C.line });
    y -= 12;
  };
  for (const g of groups) {
    room(70);
    page.drawRectangle({ x: M, y: y - 5, width: CW, height: 17, color: C.zebra });
    text(g.t.label.toUpperCase(), M + 6, y, 8, f.bold, C.navy);
    const n = g.items.length + (g.items.length === 1 ? ' story' : ' stories');
    text(n, W - M - 6 - width(n, 7.5, f.sans), y, 7.5, f.sans, C.muted);
    y -= 20;
    g.items.forEach(story);
  }
  // ---------------- sources appendix
  heading('Data sources');
  table(
    [
      { label: 'Instrument', width: 140 },
      { label: 'Provider', width: 170 },
      { label: 'Retrieved', width: 110 },
      { label: 'Cadence', width: 70 },
    ],
    report.metrics.map((m) => [
      m.label,
      m.source ?? 'Unavailable',
      m.fetchedAt ? stamp(m.fetchedAt) : '-',
      m.cadence === 'daily' ? 'Daily' : 'Delayed',
    ]),
    8,
  );
  para(
    'News connections indicate possible relevance; they do not establish the cause or direction of a price move. Review the original evidence before acting. For internal sales use; not investment advice.',
    8,
    f.sans,
    C.muted,
    1.4,
  );
  // ---------------- footer on every page
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    page = p;
    p.drawLine({ start: { x: M, y: 38 }, end: { x: W - M, y: 38 }, thickness: 0.5, color: C.line });
    text(
      'Internal  |  Brief ' + report.id.slice(0, 8) + '  |  Prepared ' + stamp(report.cutoff),
      M,
      26,
      7,
      f.sans,
      C.muted,
    );
    const pg = 'Page ' + (i + 1) + ' of ' + pages.length;
    text(pg, W - M - width(pg, 7, f.sans), 26, 7, f.sans, C.muted);
  });
  void PDFName;
  return doc.save();
}
