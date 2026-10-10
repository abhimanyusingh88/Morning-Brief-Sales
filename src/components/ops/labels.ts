import type { Tone } from '@/components/ui/status';

export const CATEGORY_LABEL: Record<string, string> = {
  market: 'Market data',
  reference: 'Reference data',
  news: 'News',
  calendar: 'Calendars',
  corporate: 'Corporate events',
  client: 'Client data',
  compliance: 'Compliance',
  delivery: 'Delivery',
};

export const FEED_STATUS: Record<string, { tone: Tone; label: string }> = {
  ok: { tone: 'ok', label: 'Healthy' },
  delayed: { tone: 'warn', label: 'Delayed' },
  down: { tone: 'bad', label: 'Down' },
  running: { tone: 'run', label: 'Running' },
};

export const DELIVERY_STATUS: Record<string, { tone: Tone; label: string }> = {
  delivered: { tone: 'ok', label: 'Delivered' },
  simulated: { tone: 'ok', label: 'Simulated' },
  scheduled: { tone: 'idle', label: 'Scheduled' },
  failed: { tone: 'bad', label: 'Failed' },
};

export const DELIVERY_SETTING: Record<string, string> = {
  dashboard: 'Dashboard only',
  email: 'Email digest',
  both: 'Both',
};

/** Short column headers for the QC matrix. The full label always comes from the stored check and is shown on hover and in the review drawer. */
export const CHECK_SHORT: Record<string, string> = {
  traceable: 'Traceable',
  no_free_numbers: 'No free numbers',
  information_barrier: 'Info barrier',
  setup_honoured: 'Setup honoured',
  universal_identical: 'Universal identical',
  stale_withheld: 'Stale withheld',
  units: 'Units',
  no_empty_sections: 'No empty sections',
};
