import { SimulatedProvider } from './simulator';
import type { MarketDataProvider } from './types';
export * from './types';
export * from './format';

export function getMarketProvider(): MarketDataProvider {
  const which = process.env.MARKET_DATA_PROVIDER || 'simulated';
  if (which === 'simulated') return new SimulatedProvider();
  throw new Error(
    `Market data provider "${which}" is not configured. Implement MarketDataProvider and register it here.`,
  );
}
