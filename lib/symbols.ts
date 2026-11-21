export type SymbolInfo = {
  symbol: "BTCUSDT" | "ETHUSDT" | "SOLUSDT";
  baseCoin: "BTC" | "ETH" | "SOL";
  /** 필요 증거금 표시 소수 자릿수 (Bybit 화면과 같다) */
  marginDecimals: 2 | 3;
};

export const SYMBOLS: readonly SymbolInfo[] = [
  { symbol: "BTCUSDT", baseCoin: "BTC", marginDecimals: 2 },
  { symbol: "ETHUSDT", baseCoin: "ETH", marginDecimals: 2 },
  { symbol: "SOLUSDT", baseCoin: "SOL", marginDecimals: 3 },
];
