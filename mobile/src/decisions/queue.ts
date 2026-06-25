/**
 * Seed decision-queue items (single source for the app's '결정 대기' 탭). Mirrors
 * `specs/decision-queue.md` — keep ids + 요지 in sync across both. These are the
 * deferred/open items of the 피드백 라운드 3 delta, surfaced for user decision so
 * nothing hides behind a false sense of completion (memory 정합).
 */

import type { DecisionItem } from "./types";

export const SEED_DECISIONS: readonly DecisionItem[] = [
  {
    id: "DQ-1",
    category: "data",
    title: "KR 무료·합법 시장 데이터 경로 실증",
    summary: "코스피/코스닥 지수·TOP·인기 종목의 무료·합법 수집 경로를 어떻게 확정할지.",
    detail:
      "지수와 등락률·거래상위는 무료 경로로 검증됨(유니버스 기준). 시가총액 TOP·인기 검색은 무료 keyless 소스가 없어 생략/프록시로 둠. 부재를 단정하지 않음(§5.6).",
    needs: "거래소 전역 순위의 무료·합법 경로를 더 찾을지, 현행 유니버스-스코프 산출로 확정할지.",
    spec: "§5.6",
    status: "open",
  },
  {
    id: "DQ-2",
    category: "scope",
    title: "실시간(틱) 시세 스트리밍 분리",
    summary: "분 단위 실시간 호가/틱 스트리밍을 별도 태스크로 착수할지.",
    detail:
      "본 delta 범위는 일봉 + 단말 규칙 평가까지. 타이밍 신호는 일봉·종가 기준이며 실시간 틱은 범위 밖으로 분리됨(§5.7).",
    needs: "실시간 틱 스트리밍을 별도 태스크로 착수할지 여부와 우선순위.",
    spec: "§5.7",
    status: "deferred",
  },
  {
    id: "DQ-3",
    category: "sources",
    title: "뉴스 RSS 화이트리스트 확정 목록",
    summary: "brief 의 검증 출처 화이트리스트를 확정(찌라시 배제)할지.",
    detail:
      "활성: SEC EDGAR(US 공시), Yahoo Finance RSS(US/KR 언론). 비활성(키 필요): DART(OpenDART). 코드 단일 소스에 등록됨(newsSources.ts).",
    needs: "추가 언론사 RSS 를 넣을지, DART 키를 발급해 KR 공시를 활성화할지.",
    spec: "§5.2-4 / §5.3",
    status: "open",
  },
];
