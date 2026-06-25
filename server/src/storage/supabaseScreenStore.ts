/**
 * Supabase-backed 스크리너 영속화 (SPEC §3.3-Δ2 step 1·2·7). PostgREST upsert 로
 * security_master / daily_screen / weekly_series 의 3 테이블(SPEC §3.2-Δ B 스키마)에
 * 적재한다. daily_screen 은 PK (market,code,asof) 라 과거 asof 행이 보존되는 immutable
 * 일별 스냅샷 — 사후 검증의 frozen 근거.
 *
 * 카테고리 후보 아티팩트는 SPEC 의 3-테이블 모델 밖이므로 DB 에는 daily_screen +
 * weekly 의 frozen 행으로 남기고(불변 근거), 별도 아티팩트 저장은 no-op (검색·UI 는
 * 뷰에서 재구성 가능). best-effort — 쓰기 실패가 배치를 죽이지 않는다.
 */

import { type SupabaseConfig, type FetchLike, upsertRows, selectRows } from "./supabaseRest.js";
import type { ScreenArtifact, ScreenPersistence } from "../screener/screenStore.js";
import type {
  DailyScreenRecord,
  ExchangeMarket,
  MarketGroup,
  SecurityMasterRecord,
  WeeklySeriesRecord,
} from "../screener/types.js";

const DISCOVERY_TABLE = "discovery_artifacts";

interface DiscoveryRow {
  data: ScreenArtifact;
}

interface MasterCodeRow {
  code: string;
}

export class SupabaseScreenStore implements ScreenPersistence {
  private readonly cfg: SupabaseConfig;
  private readonly fetchImpl?: FetchLike;

  constructor(cfg: SupabaseConfig, fetchImpl?: FetchLike) {
    this.cfg = cfg;
    this.fetchImpl = fetchImpl;
  }

  async saveMaster(rows: SecurityMasterRecord[]): Promise<void> {
    const mapped = rows.map((r) => ({
      market: r.market,
      code: r.code,
      name_ko: r.name_ko,
      name_en: r.name_en,
      is_etf: r.is_etf ? 1 : 0,
      delisted: r.delisted ? 1 : 0,
    }));
    await this.safe(() => upsertRows(this.cfg, "security_master", mapped, this.fetchImpl));
  }

  async saveDailyScreen(rows: DailyScreenRecord[]): Promise<void> {
    await this.safe(() => upsertRows(this.cfg, "daily_screen", rows, this.fetchImpl));
  }

  async saveWeekly(rows: WeeklySeriesRecord[]): Promise<void> {
    const mapped = rows.map((r) => ({ market: r.market, code: r.code, closes: r.closes }));
    await this.safe(() => upsertRows(this.cfg, "weekly_series", mapped, this.fetchImpl));
  }

  async saveArtifact(artifact: ScreenArtifact): Promise<void> {
    // 발굴 탭 읽기 모델 — (market, asof) 로 upsert. daily_screen 의 frozen 행이
    // 불변 근거이고, 이 아티팩트는 빠른 읽기를 위한 통합 뷰.
    await this.safe(() =>
      upsertRows(
        this.cfg,
        DISCOVERY_TABLE,
        [{ market: artifact.market, asof: artifact.asof, data: artifact }],
        this.fetchImpl,
      ),
    );
  }

  async getLatestArtifact(market: MarketGroup): Promise<ScreenArtifact | null> {
    try {
      const rows = await selectRows<DiscoveryRow>(
        this.cfg,
        DISCOVERY_TABLE,
        `select=data&market=eq.${encodeURIComponent(market)}&order=asof.desc&limit=1`,
        this.fetchImpl,
      );
      return rows[0]?.data ?? null;
    } catch {
      return null; // graceful: 읽기 실패는 null (발굴 탭이 빈 상태 처리)
    }
  }

  async listMasterCodes(market: ExchangeMarket, opts?: { limit?: number }): Promise<string[]> {
    try {
      const parts = [
        `market=eq.${encodeURIComponent(market)}`,
        "delisted=eq.0",
        "select=code",
      ];
      if (opts?.limit != null && opts.limit >= 0) parts.push(`limit=${opts.limit}`);
      const rows = await selectRows<MasterCodeRow>(
        this.cfg,
        "security_master",
        parts.join("&"),
        this.fetchImpl,
      );
      return rows.map((r) => r.code).filter((c): c is string => typeof c === "string" && c.length > 0);
    } catch {
      return []; // graceful: 조회 실패는 빈 유니버스 (배치는 하드코딩 폴백 가능)
    }
  }

  private async safe(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch {
      // best-effort: 영속화 실패는 배치를 막지 않는다 (Sane default + override)
    }
  }
}
