/**
 * 시세 인제스트 어댑터 (SPEC §3.3-Δ2 step 1·2 의 *주입식* 데이터 소스).
 *
 * 기존 per-market 어댑터(무료·지연시세)로 후보 유니버스의 일봉을 받아 SymbolScanInput[]
 * 으로 변환한다. runScreenBatch 의 masterSource 로 그대로 넘긴다.
 *
 * ⚠ 데이터 소스 한계(결정 대기 D-3): 현재 무료 어댑터는 (a) *전종목* 마스터와 (b)
 * 발행주식수(시가총액)·관리종목 플래그를 제공하지 않는다. 따라서 이 기본 소스는
 *  - 유니버스 = 설정된 후보 종목(전 상장종목 ✗ — 거래소 공개 마스터 확정 시 교체),
 *  - marketCap = 주입된 capBySymbol 이 있을 때만(없으면 대형주 배제는 그 종목에 비활성).
 * 이 한계는 specs/decision-queue.md D-3 에 노출되어 있으며, 거래소 마스터/시총 피드가
 * 확정되면 이 모듈만 교체하면 된다(파이프라인 엔진은 불변).
 */

import type { ExchangeMarket, SecurityMasterRecord } from "./types.js";
import type { SymbolScanInput } from "./screenMetrics.js";
import type { MarketSourceAdapter } from "../market/types.js";

export interface AdapterScanOptions {
  adapter: MarketSourceAdapter;
  /** 스캔할 심볼 목록 (후보 유니버스). */
  symbols: string[];
  /** symbol → 표시명. KR 은 한글명, US 는 영문명. */
  names?: Record<string, string>;
  /** 이 배치 종목의 거래소 라벨 (예: 'NASDAQ' | 'KOSPI'). */
  exchange: ExchangeMarket;
  /** symbol → 시가총액(있으면 대형주 배제에 사용). */
  capBySymbol?: Record<string, number>;
  /** 일봉 lookback 연수. 기본 1 (RVOL20/RSI14/52주 계산에 충분). */
  years?: number;
  /** 진행 로그 싱크(테스트 주입). 기본 console.warn. */
  warn?: (msg: string) => void;
}

/** KR 거래소면 한글명을 name_ko 에, 아니면 name_en 에 매핑. */
function toMaster(exchange: ExchangeMarket, code: string, name: string | undefined): SecurityMasterRecord {
  const isKr = exchange === "KOSPI" || exchange === "KOSDAQ";
  return {
    market: exchange,
    code,
    name_ko: isKr ? (name ?? null) : null,
    name_en: isKr ? null : (name ?? null),
    is_etf: false,
    delisted: false,
  };
}

/**
 * 유니버스 각 심볼의 일봉을 받아 SymbolScanInput[] 로 변환. 한 종목 실패는 전체를
 * 막지 않고 건너뛴다(resilient — 빈/오류 응답 graceful).
 */
export function makeAdapterScanSource(opts: AdapterScanOptions): () => Promise<SymbolScanInput[]> {
  const warn = opts.warn ?? ((m: string) => console.warn(m));
  const years = opts.years ?? 1;
  return async () => {
    const out: SymbolScanInput[] = [];
    for (const raw of opts.symbols) {
      const code = raw.trim().toUpperCase();
      if (!code) continue;
      try {
        const series = await opts.adapter.getHistory(code, { years });
        if (!series.candles.length) {
          warn(`[screen] ${code}: 빈 시세 — 건너뜀`);
          continue;
        }
        out.push({
          master: toMaster(opts.exchange, code, opts.names?.[code]),
          series,
          sharesOutstanding:
            opts.capBySymbol?.[code] != null && series.candles.length
              ? opts.capBySymbol[code]! / (series.candles[series.candles.length - 1]!.close || 1)
              : undefined,
        });
      } catch (err) {
        warn(`[screen] ${code}: 시세 실패 (${(err as Error).message}) — 건너뜀`);
      }
    }
    return out;
  };
}
