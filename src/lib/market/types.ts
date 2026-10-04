export type MoveUnit = "pct" | "bp" | "level";

export interface InstrumentRef {
  id: string;
  symbol: string;
  name: string;
  assetClass: "equity" | "rates" | "credit" | "fx" | "commodity" | "index" | "vol";
  sector: string | null;
  unit: MoveUnit;
  decimals: number;
  /** last settled close (what the quote is measured against) */
  prevClose: number;
  vol: number;
}

export interface Quote {
  instrumentId: string;
  symbol: string;
  last: number;
  prevClose: number;
  /** percent for unit=pct, basis points for unit=bp (yields and spreads), points for unit=level */
  chg: number;
  unit: MoveUnit;
  asOf: Date;
  source: string;
}

export interface MarketDataProvider {
  readonly name: string;
  readonly simulated: boolean;
  quotes(businessDate: string, instruments: InstrumentRef[], opts?: { scenarios?: string[] }): Promise<Quote[]>;
}
