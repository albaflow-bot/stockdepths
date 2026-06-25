/**
 * 스크리너 영속화 (SPEC §3.3-Δ2 step 1·2·7). 디스크 기본 백엔드(로컬·테스트):
 *  - security_master / daily_screen / weekly_series 를 `.bindesk/screener/*.json` 에
 *    upsert (task 2 의 InMemorySecuritySearchStore 가 그대로 읽어 검색 → 배치/검색 정합).
 *  - daily_screen 은 (market,code,asof) 키라 *과거 asof 가 보존되는 append-only 스냅샷*
 *    → 사후 검증(적중률)의 immutable 근거 (learnings 정합).
 *  - 일자별 카테고리 후보+신호는 candidates-<market>-<asof>.json 으로 1회만 기록(불변).
 *
 * Sane default + override: 디스크 실패는 배치를 죽이지 않는다(best-effort).
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { ScreenCategory } from "./categories.js";
import type {
  DailyScreenRecord,
  Direction,
  ExchangeMarket,
  MarketGroup,
  SecurityMasterRecord,
  SecuritySignal,
  WeeklySeriesRecord,
} from "./types.js";

/** 카테고리별 결과 한 항목 (불변 스냅샷 + 검색/UI 공용 형태). */
export interface ScreenResultItem {
  category: ScreenCategory;
  market: string;
  code: string;
  name_ko: string | null;
  name_en: string | null;
  last: number | null;
  change_pct: number | null;
  direction: Direction;
  rvol: number | null;
  rsi14: number | null;
  weekly: number[];
  signal: SecuritySignal | null;
  /** 시총 상위 X% 대형주 여부. unusual_value 에 노출된 초대형주 배지용. */
  isLargeCap: boolean;
  /** 이례신호(RVOL≥3 또는 갭±5%) 동반 여부 — "이례신호 있는 초대형주" 배지 조건. */
  unusual: boolean;
}

/** 하루치 발굴 결과(불변). market 은 'US'|'KR' 그룹. */
export interface ScreenArtifact {
  market: MarketGroup;
  asof: string;
  generatedAt: string;
  /** 후보 코멘트를 만든 제공자(provenance). 'deterministic' 가능. */
  provider: string;
  categories: Record<string, ScreenResultItem[]>;
  /** 스캔/필터 통과 수 등 감사 지표. */
  stats: { scanned: number; afterNoiseFilter: number; largeCapsExcluded: number; candidates: number };
}

/** 스크리너가 쓰는 영속화 계약. */
export interface ScreenPersistence {
  saveMaster(rows: SecurityMasterRecord[]): Promise<void>;
  saveDailyScreen(rows: DailyScreenRecord[]): Promise<void>;
  saveWeekly(rows: WeeklySeriesRecord[]): Promise<void>;
  saveArtifact(artifact: ScreenArtifact): Promise<void>;
  /** 발굴 탭이 읽는 최신 아티팩트(없으면 null). API /api/discover 가 사용. */
  getLatestArtifact(market: MarketGroup): Promise<ScreenArtifact | null>;
  /**
   * 해당 거래소(market)의 security_master 에서 delisted=0 인 code 배열 반환.
   * 발굴 배치의 --from-master 모드가 전종목 스캔 유니버스로 쓴다.
   * @param opts.limit 반환 상한(미지정 시 구현체 기본).
   */
  listMasterCodes(market: ExchangeMarket, opts?: { limit?: number }): Promise<string[]>;
}

function defaultDir(): string {
  return join(process.cwd(), ".bindesk", "screener");
}

export class DiskScreenStore implements ScreenPersistence {
  private readonly dir: string | null;

  constructor(dir?: string | null) {
    this.dir = dir === undefined ? defaultDir() : dir;
  }

  private upsert<T>(file: string, rows: T[], keyOf: (r: T) => string): void {
    if (!this.dir) return;
    try {
      mkdirSync(this.dir, { recursive: true });
      const path = join(this.dir, file);
      const existing: T[] = existsSync(path)
        ? (JSON.parse(readFileSync(path, "utf8")) as T[])
        : [];
      const map = new Map<string, T>();
      for (const r of existing) map.set(keyOf(r), r);
      for (const r of rows) map.set(keyOf(r), r);
      writeFileSync(path, JSON.stringify([...map.values()], null, 0), "utf8");
    } catch {
      // best-effort persistence; never fail the batch on a disk problem
    }
  }

  async saveMaster(rows: SecurityMasterRecord[]): Promise<void> {
    this.upsert("master.json", rows, (r) => `${r.market}:${r.code}`);
  }

  async saveDailyScreen(rows: DailyScreenRecord[]): Promise<void> {
    this.upsert("screen.json", rows, (r) => `${r.market}:${r.code}:${r.asof}`);
  }

  async saveWeekly(rows: WeeklySeriesRecord[]): Promise<void> {
    this.upsert("weekly.json", rows, (r) => `${r.market}:${r.code}`);
  }

  /**
   * 불변 스냅샷(candidates-<market>-<asof>.json, 한 번만) + 가변 최신 포인터
   * (latest-<market>.json, 덮어쓰기)를 함께 쓴다. 발굴 탭은 최신 포인터를 O(1) 로 읽는다.
   */
  async saveArtifact(artifact: ScreenArtifact): Promise<void> {
    if (!this.dir) return;
    try {
      mkdirSync(this.dir, { recursive: true });
      const snapshot = join(this.dir, `candidates-${artifact.market}-${artifact.asof}.json`);
      if (!existsSync(snapshot)) {
        writeFileSync(snapshot, JSON.stringify(artifact, null, 2), "utf8"); // append-only 보존
      }
      // 최신 포인터는 항상 갱신(가변) — 발굴 탭이 읽는 대상.
      writeFileSync(join(this.dir, `latest-${artifact.market}.json`), JSON.stringify(artifact), "utf8");
    } catch {
      // best-effort
    }
  }

  async getLatestArtifact(market: MarketGroup): Promise<ScreenArtifact | null> {
    if (!this.dir) return null;
    try {
      const path = join(this.dir, `latest-${market}.json`);
      if (!existsSync(path)) return null;
      return JSON.parse(readFileSync(path, "utf8")) as ScreenArtifact;
    } catch {
      return null; // graceful: 없거나 깨졌으면 null
    }
  }

  async listMasterCodes(market: ExchangeMarket, opts?: { limit?: number }): Promise<string[]> {
    if (!this.dir) return [];
    try {
      const path = join(this.dir, "master.json");
      if (!existsSync(path)) return [];
      const rows = JSON.parse(readFileSync(path, "utf8")) as SecurityMasterRecord[];
      const codes = rows
        .filter((r) => r.market === market && !r.delisted)
        .map((r) => r.code);
      const limit = opts?.limit;
      return limit != null && limit >= 0 ? codes.slice(0, limit) : codes;
    } catch {
      return []; // graceful: 없거나 깨졌으면 빈 목록
    }
  }
}
