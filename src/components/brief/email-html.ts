/** Presentation copy only: the stored digest and delivery records remain unchanged. */
export function emailPreviewHtml(html: string): string {
  const styles = `<style>
    * { box-sizing: border-box; font-family: "Segoe UI", Arial, sans-serif !important; }
    body { font-size: 14px; line-height: 1.65; -webkit-font-smoothing: antialiased; font-variant-numeric: tabular-nums; }
    body > table > tbody > tr > td { padding: 28px 24px !important; }
    body > table > tbody > tr > td > table { width: 100% !important; max-width: 680px; }
    body > table > tbody > tr > td > table > tbody > tr:first-child > td { font-style: normal !important; font-size: 28px !important; letter-spacing: -0.025em; padding-bottom: 12px !important; }
    td[style*="Georgia"] { font-size: 15px !important; line-height: 1.5; }
    p { line-height: 1.75 !important; margin: 12px 0 !important; }
    table table table td { line-height: 1.5; padding: 10px !important; }
    @media (max-width: 480px) {
      body > table > tbody > tr > td { padding: 20px 16px !important; }
      body > table > tbody > tr > td > table > tbody > tr:first-child > td > span { display: block; float: none !important; margin-top: 6px; }
      table table table, table table table tbody { display: block; width: 100%; }
      table table table tbody { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      table table table tr { display: contents; }
      table table table td { width: auto !important; min-width: 0; }
    }
  </style>`;
  return html.replaceAll('Demo workspace:', 'Workspace data:').replace(/<body\b/i, `${styles}<body`);
}
