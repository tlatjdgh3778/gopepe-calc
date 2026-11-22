export type SymbolInfo = {
  symbol: "BTCUSDT" | "ETHUSDT" | "SOLUSDT";
  baseCoin: "BTC" | "ETH" | "SOL";
  /** 필요 증거금 표시 소수 자릿수 (Bybit 화면과 같다) */
  marginDecimals: 2 | 3;
  /** 최대 레버리지(배) */
  maxLeverage: number;
  /** 가격 틱 */
  tickSize: number;
  /** 가격 표시 소수 자릿수 */
  priceScale: number;
  /** 수량 단위(기초 코인) */
  qtyStep: number;
  /** 최소 주문 수량(기초 코인) */
  minOrderQty: number;
  /** 유지증거금률 첫 단계. `mmr`은 소수(0.0033 = 0.33%), `riskLimitValue`는 USDT다. */
  maintenanceTier: { mmr: number; riskLimitValue: number };
};

/**
 * 심볼 정보 기준일(YYYY-MM-DD). Bybit 공개 API v5(category `linear`)
 * `/v5/market/instruments-info`·`/v5/market/risk-limit`을 이날 조회했다.
 */
export const SYMBOLS_AS_OF = "2026-11-22";

export const SYMBOLS: readonly SymbolInfo[] = [
  {
    symbol: "BTCUSDT",
    baseCoin: "BTC",
    marginDecimals: 2,
    maxLeverage: 150,
    tickSize: 0.1,
    priceScale: 2,
    qtyStep: 0.001,
    minOrderQty: 0.001,
    maintenanceTier: { mmr: 0.0033, riskLimitValue: 300000 },
  },
  {
    symbol: "ETHUSDT",
    baseCoin: "ETH",
    marginDecimals: 2,
    maxLeverage: 150,
    tickSize: 0.01,
    priceScale: 2,
    qtyStep: 0.01,
    minOrderQty: 0.01,
    maintenanceTier: { mmr: 0.0033, riskLimitValue: 300000 },
  },
  {
    symbol: "SOLUSDT",
    baseCoin: "SOL",
    marginDecimals: 3,
    maxLeverage: 100,
    tickSize: 0.01,
    priceScale: 3,
    qtyStep: 0.1,
    minOrderQty: 0.1,
    maintenanceTier: { mmr: 0.005, riskLimitValue: 50000 },
  },
];
