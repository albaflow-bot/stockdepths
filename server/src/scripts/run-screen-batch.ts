/**
 * 발굴 일배치 진입점 (cron/스케줄러가 호출 — SPEC §3.3-Δ2). 매일 장마감 후 1회:
 * 전종목 스캔 → 카테고리 선별 → LLM oneshot 1회 코멘트 → 불변 스냅샷 저장.
 *
 * Usage: npm run batch:screen                 # 오늘(UTC), US (하드코딩 유니버스)
 *        npm run batch:screen -- --market KR  # 한국(코스피/코스닥)
 *        npm run batch:screen -- 2026-06-24 --market US
 *        npm run batch:screen -- --market US --from-master 50  # security_master 전종목 슬라이스(N=50)
 *
 * --from-master [N]: 하드코딩 유니버스 대신 security_master(delisted=0)의 code 로 스캔.
 *   US 면 NASDAQ+NYSE, KR 이면 KOSPI+KOSDAQ 를 합친다. N 미지정 시 거래소당 기본 200.
 *
 * LLM 키가 없어도 *중단되지 않는다* — 결정론 신호로 폴백한다(후보 선정은 LLM 무관).
 * 데이터 소스 한계(전종목 마스터/시총)는 결정 대기 D-3 (specs/decision-queue.md).
 */

import { runScreenBatch } from "../screener/screenRunner.js";
import { makeAdapterScanSource } from "../screener/adapterScan.js";
import { makeSnapshotScanSource } from "../screener/snapshotScan.js";
import { makeScreenCommenter } from "../screener/commenter.js";
import { thresholdsFor } from "../screener/config.js";
import type { ExchangeMarket, MarketGroup } from "../screener/types.js";
import type { ScreenPersistence } from "../screener/screenStore.js";
import type { SymbolScanInput } from "../screener/screenMetrics.js";
import type { ScreenedSymbol } from "../screener/screenMetrics.js";
import { createScreenStore, storageMode } from "../storage/index.js";
import { readSupabaseConfig } from "../storage/supabaseRest.js";
import { getMarketRegistry, KrMarketAdapter } from "../market/index.js";
import type { Market, MarketSourceAdapter } from "../market/index.js";
import { resolveUsUniverse, US_UNIVERSE_NAMES } from "../config/universe.js";
import { resolveKrUniverse, KR_UNIVERSE_NAMES } from "../config/krUniverse.js";

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 거래소당 --from-master 슬라이스의 기본 상한 (인자 없이 --from-master 만 준 경우). */
const DEFAULT_FROM_MASTER_LIMIT = 200;

interface ParsedArgs {
  date: string;
  market: Market;
  /** --from-master 가 주어지면 거래소당 코드 상한(N). 미지정이면 null(=하드코딩 유니버스). */
  fromMaster: number | null;
  /** --from-snapshot: 적재된 daily_screen 스냅샷을 candle 재수집 없이 스크리닝. */
  fromSnapshot: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  let date = todayUtc();
  let market = (process.env["MARKET"] as Market) || "US";
  let fromMaster: number | null = null;
  let fromSnapshot = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--market") {
      market = (argv[++i] || "US").toUpperCase() as Market;
    } else if (a === "--from-snapshot") {
      fromSnapshot = true;
    } else if (a === "--from-master") {
      // 선택적 숫자 인자: 다음 토큰이 정수면 소비, 아니면 기본값.
      const next = argv[i + 1];
      if (next != null && /^\d+$/.test(next)) {
        fromMaster = Number(next);
        i++;
      } else {
        fromMaster = DEFAULT_FROM_MASTER_LIMIT;
      }
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(a)) {
      date = a;
    }
  }
  return { date, market: market === "KR" ? "KR" : "US", fromMaster, fromSnapshot };
}

interface ScanConfig {
  adapter: MarketSourceAdapter;
  symbols: string[];
  names: Record<string, string>;
  exchange: ExchangeMarket;
  group: MarketGroup;
}

/** 시장 그룹에 속한 거래소 목록 — --from-master 가 합쳐서 스캔할 대상. */
function exchangesFor(group: MarketGroup): ExchangeMarket[] {
  if (group === "KR") return ["KOSPI", "KOSDAQ"];
  return ["NASDAQ", "NYSE"];
}

/** 어댑터를 (필요 시 등록 후) 해결하고 시장 그룹을 반환. 두 경로(하드코딩/마스터) 공용. */
function resolveAdapter(market: Market): { adapter: MarketSourceAdapter; group: MarketGroup } {
  const registry = getMarketRegistry();
  if (market === "KR") {
    if (!registry.get("KR")) registry.register(new KrMarketAdapter());
    return { adapter: registry.require("KR"), group: "KR" };
  }
  return { adapter: registry.require("US"), group: "US" };
}

function resolveScanConfig(market: Market): ScanConfig {
  const { adapter, group } = resolveAdapter(market);
  if (group === "KR") {
    return { adapter, symbols: resolveKrUniverse(), names: KR_UNIVERSE_NAMES, exchange: "KOSPI", group };
  }
  return { adapter, symbols: resolveUsUniverse(), names: US_UNIVERSE_NAMES, exchange: "NASDAQ", group };
}

/**
 * --from-master 경로: 그룹의 각 거래소에서 security_master(delisted=0) 코드를 limit 만큼
 * 받아, 거래소별 어댑터 스캔 소스를 만든 뒤 결과를 합친다(각 종목은 자기 거래소 라벨 유지).
 * names 는 마스터 기반 표시명이 없으므로 빈 맵(어댑터는 이름 없이 동작).
 */
async function buildMasterScanSource(
  adapter: MarketSourceAdapter,
  group: MarketGroup,
  store: ScreenPersistence,
  limit: number,
): Promise<{ source: () => Promise<SymbolScanInput[]>; total: number }> {
  const exchanges = exchangesFor(group);
  const perExchange = await Promise.all(
    exchanges.map(async (exchange) => {
      const symbols = await store.listMasterCodes(exchange, { limit });
      return { exchange, symbols };
    }),
  );
  const sources = perExchange
    .filter((e) => e.symbols.length > 0)
    .map((e) => makeAdapterScanSource({ adapter, symbols: e.symbols, exchange: e.exchange }));
  const total = perExchange.reduce((n, e) => n + e.symbols.length, 0);
  const source = async (): Promise<SymbolScanInput[]> => {
    const batches = await Promise.all(sources.map((s) => s()));
    return batches.flat();
  };
  return { source, total };
}

async function main(): Promise<void> {
  const { date, market, fromMaster, fromSnapshot } = parseArgs(process.argv.slice(2));
  const store = createScreenStore();

  // 스냅샷 경로: 적재된 daily_screen 을 candle 재수집 없이 스크리닝(전종목 즉시).
  if (fromSnapshot) {
    const cfg = readSupabaseConfig();
    if (!cfg) throw new Error("--from-snapshot 은 Supabase 설정(SUPABASE_URL/KEY)이 필요합니다.");
    const group: MarketGroup = market === "KR" ? "KR" : "US";
    const screenedSource: () => Promise<ScreenedSymbol[]> = makeSnapshotScanSource({ cfg, group, asof: date });
    console.log(`[screen] market=${market} asof=${date} storage=${storageMode()} (from-snapshot)`);
    const { artifact } = await runScreenBatch({
      market: group,
      asof: date,
      generatedAt: new Date().toISOString(),
      screenedSource,
      thresholds: thresholdsFor(group),
      persistence: store,
      commenter: makeScreenCommenter(),
    });
    const { scanned, afterNoiseFilter, largeCapsExcluded, candidates } = artifact.stats;
    console.log(
      `[screen] 완료: 스캔 ${scanned} · 필터통과 ${afterNoiseFilter} · 대형주배제 ${largeCapsExcluded} · 후보 ${candidates}`,
    );
    for (const [cat, items] of Object.entries(artifact.categories)) {
      if (items.length) console.log(`  ${cat}: ${items.map((i) => i.code).join(", ")}`);
    }
    return;
  }

  let masterSource: () => Promise<SymbolScanInput[]>;
  let group: MarketGroup;
  let universeSize: number;

  if (fromMaster != null) {
    const resolved = resolveAdapter(market);
    group = resolved.group;
    const built = await buildMasterScanSource(resolved.adapter, group, store, fromMaster);
    masterSource = built.source;
    universeSize = built.total;
    console.log(
      `[screen] market=${market} asof=${date} storage=${storageMode()} ` +
        `universe=${universeSize} (from-master, 거래소당<=${fromMaster})`,
    );
  } else {
    const cfg = resolveScanConfig(market);
    group = cfg.group;
    universeSize = cfg.symbols.length;
    masterSource = makeAdapterScanSource({
      adapter: cfg.adapter,
      symbols: cfg.symbols,
      names: cfg.names,
      exchange: cfg.exchange,
    });
    console.log(`[screen] market=${market} asof=${date} storage=${storageMode()} universe=${universeSize}`);
  }

  const { artifact } = await runScreenBatch({
    market: group,
    asof: date,
    generatedAt: new Date().toISOString(),
    masterSource,
    thresholds: thresholdsFor(group),
    persistence: store,
    commenter: makeScreenCommenter(), // LLM 있으면 한 줄, 없으면 결정론 폴백
  });

  const { scanned, afterNoiseFilter, largeCapsExcluded, candidates } = artifact.stats;
  console.log(
    `[screen] 완료: 스캔 ${scanned} · 필터통과 ${afterNoiseFilter} · 대형주배제 ${largeCapsExcluded} · 후보 ${candidates}`,
  );
  for (const [cat, items] of Object.entries(artifact.categories)) {
    if (items.length) console.log(`  ${cat}: ${items.map((i) => i.code).join(", ")}`);
  }
}

main().catch((err) => {
  console.error("[screen] 배치 실패:", err);
  process.exitCode = 1;
});
