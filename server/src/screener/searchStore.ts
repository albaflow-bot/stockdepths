/**
 * 인메모리/디스크 종목 검색 저장소 (로컬 dev·테스트 기본 백엔드).
 *
 * Sane default + override: Supabase 가 설정되지 않으면 이 저장소가 쓰인다. 데이터는
 * 인메모리 배열(테스트는 seed 로 주입)이며, 있으면 `.bindesk/screener/*.json` 에서
 * 시드를 로드한다(없어도 빈 결과로 graceful — 에러로 막지 않음).
 *
 * 검색 의미론은 Supabase 백엔드와 동일하게 맞춘다:
 *  - 한글: name_ko 부분일치, 영문: name_en 부분일치, 코드: code 부분일치 (대소문자 무시)
 *  - delisted(관리/상폐) 기본 제외
 *  - 종목별 최신 daily_screen 스냅샷을 JOIN → last/change_pct/direction/signal
 *  - weekly_series 를 JOIN → 스파크라인
 *  - 거래대금(turnover) desc 정렬 (스냅샷 없으면 맨 뒤)
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { deriveSignal, directionOf } from "./signal.js";
import {
  marketsInGroup,
  type DailyScreenRecord,
  type SecurityMasterRecord,
  type SecuritySearchItem,
  type SecuritySearchProvider,
  type SecuritySearchQuery,
  type WeeklySeriesRecord,
} from "./types.js";

export interface SearchStoreSeed {
  master?: SecurityMasterRecord[];
  screen?: DailyScreenRecord[];
  weekly?: WeeklySeriesRecord[];
}

export interface SearchStoreOptions {
  /** 시드 JSON 디렉토리. `null` 이면 디스크 비활성(테스트). */
  dir?: string | null;
  /** 인메모리 시드(테스트 주입). */
  seed?: SearchStoreSeed;
}

function defaultDir(): string {
  return join(process.cwd(), ".bindesk", "screener");
}

const keyOf = (market: string, code: string) => `${market}:${code}`;

export class InMemorySecuritySearchStore implements SecuritySearchProvider {
  private master: SecurityMasterRecord[] = [];
  /** 종목별 최신 스냅샷 (asof 최대). */
  private latestScreen = new Map<string, DailyScreenRecord>();
  private weekly = new Map<string, WeeklySeriesRecord>();

  constructor(opts: SearchStoreOptions = {}) {
    const dir = opts.dir === undefined ? defaultDir() : opts.dir;
    const seed = opts.seed ?? (dir ? loadSeedFromDisk(dir) : {});
    this.seed(seed);
  }

  /** 시드/리로드. daily_screen 은 종목별 최신 asof 만 보관. */
  seed(seed: SearchStoreSeed): void {
    if (seed.master) this.master = seed.master.slice();
    for (const s of seed.screen ?? []) {
      const k = keyOf(s.market, s.code);
      const prev = this.latestScreen.get(k);
      if (!prev || s.asof > prev.asof) this.latestScreen.set(k, s);
    }
    for (const w of seed.weekly ?? []) this.weekly.set(keyOf(w.market, w.code), w);
  }

  async search(query: SecuritySearchQuery): Promise<SecuritySearchItem[]> {
    const q = query.q.trim().toLowerCase();
    if (!q) return [];
    const allowed = new Set(marketsInGroup(query.market));

    const matched = this.master.filter((m) => {
      if (m.delisted) return false;
      if (!allowed.has(m.market)) return false;
      return (
        (m.name_ko != null && m.name_ko.toLowerCase().includes(q)) ||
        (m.name_en != null && m.name_en.toLowerCase().includes(q)) ||
        m.code.toLowerCase().includes(q)
      );
    });

    const items = matched.map((m) => this.toItem(m));

    // 거래대금 desc — 스냅샷(turnover) 없는 종목은 맨 뒤.
    items.sort((a, b) => turnoverOf(b, this) - turnoverOf(a, this));

    return items.slice(0, Math.max(0, query.limit));
  }

  private toItem(m: SecurityMasterRecord): SecuritySearchItem {
    const k = keyOf(m.market, m.code);
    const screen = this.latestScreen.get(k);
    const weekly = this.weekly.get(k)?.closes ?? [];
    return {
      market: m.market,
      code: m.code,
      name_ko: m.name_ko,
      name_en: m.name_en,
      last: screen?.last ?? null,
      change_pct: screen?.change_pct ?? null,
      direction: directionOf(screen?.change_pct),
      weekly,
      signal: deriveSignal(screen),
      asof: screen?.asof ?? null,
    };
  }

  /** 정렬용 turnover 조회(헬퍼). */
  turnoverFor(market: string, code: string): number {
    return this.latestScreen.get(keyOf(market, code))?.turnover ?? -1;
  }
}

function turnoverOf(item: SecuritySearchItem, store: InMemorySecuritySearchStore): number {
  return store.turnoverFor(item.market, item.code);
}

function loadSeedFromDisk(dir: string): SearchStoreSeed {
  const read = <T>(name: string): T[] => {
    try {
      const file = join(dir, name);
      if (!existsSync(file)) return [];
      const parsed = JSON.parse(readFileSync(file, "utf8"));
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return []; // graceful: 시드 없거나 깨졌으면 빈 결과
    }
  };
  return {
    master: read<SecurityMasterRecord>("master.json"),
    screen: read<DailyScreenRecord>("screen.json"),
    weekly: read<WeeklySeriesRecord>("weekly.json"),
  };
}
