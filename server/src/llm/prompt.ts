/**
 * Prompt construction for the daily picks oneshot.
 *
 * The system prompt fixes the analyst persona, the 2-axis method (5Y trend/
 * volatility × recent trend — SPEC §장기 추세 × 최근 동향), the honesty/'참고 조언'
 * tone (SPEC §3.2), and the exact JSON output contract. The user prompt carries
 * the per-ticker compact features as data. Keeping the schema/instructions in the
 * stable system prefix and the volatile features in the user turn is also the
 * cache-friendly layout (prompt caching is a prefix match).
 */

import type { TickerFeatures } from "../features/indicators.js";
import type { PersonaContext } from "./types.js";
import { MAX_PICKS, MIN_PICKS } from "./types.js";

export const SYSTEM_PROMPT = `당신은 미국 주식(나스닥/S&P) 장기 타이밍 분석가입니다.

매일 한 번, 제공된 종목별 정량 지표를 바탕으로 주목할 종목 ${MIN_PICKS}~${MAX_PICKS}개를 선정합니다.

분석 원칙:
- 2축 분석: (1) 5년 장기 추세·변동성·최대낙폭(MDD)과 (2) 최근 흐름(1주~3개월 모멘텀)을 함께 고려합니다.
- 근거는 반드시 제공된 수치와 (있다면) 검증된 뉴스·공시 헤드라인에만 기반합니다. 수치에 없는 사실을 지어내지 마세요(no fabrication). 찌라시·추측 금지.
- 각 종목에 신뢰도(confidence)와 리스크(risk) 배지를 부여합니다. 변동성이 크면 risk가 높습니다.
- 분 단위 단타 신호는 다루지 않습니다. 일봉·종가 기준 장기 타이밍 관점입니다.
- 당신의 출력은 '투자 자문'이 아닌 '참고 조언'입니다. 단정적 수익 보장 표현을 쓰지 마세요.

출력 형식: 아래 JSON 객체 하나만 출력합니다. 마크다운 코드펜스나 설명 문장을 덧붙이지 마세요.
{
  "picks": [
    {
      "symbol": "티커(영문 대문자)",
      "companyName": "회사명(알면)",
      "rationale": "이 종목을 고른 이유 한 줄(한국어, 제공 수치 근거 명시)",
      "confidence": "low | medium | high",
      "risk": "low | medium | high",
      "action": "매수/매도 타이밍 또는 맥락 조언 한 줄(선택)"
    }
  ],
  "marketContext": "오늘의 시장 한 줄 코멘트(한국어)"
}

picks 는 ${MIN_PICKS}개 이상 ${MAX_PICKS}개 이하여야 하며, 반드시 제공된 종목 중에서만 선택합니다.`;

function personaLine(persona?: PersonaContext): string {
  if (!persona) return "투자 성향: 중립형 기준으로 균형 있게 선정하세요.";
  const labels = { conservative: "안정형", neutral: "중립형", aggressive: "공격형" } as const;
  const parts = [`투자 성향: ${labels[persona.profile]}`];
  if (persona.profile === "conservative") {
    parts.push("(변동성·MDD가 낮고 추세가 견조한 종목을 우선, 고위험 종목은 피하세요.)");
  } else if (persona.profile === "aggressive") {
    parts.push("(높은 변동성을 감수하더라도 강한 모멘텀·상승 추세 종목을 우선할 수 있습니다.)");
  } else {
    parts.push("(추세와 리스크의 균형을 고려하세요.)");
  }
  if (persona.targetReturnPct != null) parts.push(`목표 수익률 ${persona.targetReturnPct}%`);
  if (persona.stopLossPct != null) parts.push(`손절선 ${persona.stopLossPct}%`);
  return parts.join(" ");
}

/** Build the user-turn prompt from the per-ticker features. */
export function buildUserPrompt(
  features: TickerFeatures[],
  opts: { asOfDate: string; marketLabel: string; persona?: PersonaContext },
): string {
  const lines = [
    `기준일: ${opts.asOfDate} · 시장: ${opts.marketLabel}`,
    personaLine(opts.persona),
    "",
    `다음은 후보 종목 ${features.length}개의 정량 지표입니다. 수익률은 %, 변동성은 연율화 %, MDD는 최대낙폭 %입니다.`,
    "각 종목 데이터(JSON):",
    JSON.stringify(features, null, 0),
    "",
    `위 데이터만 근거로 ${MIN_PICKS}~${MAX_PICKS}개 종목을 선정해 지정된 JSON 형식으로만 답하세요.`,
    "각 pick 의 symbol 은 위 데이터의 symbol 값을 철자·형식 변경 없이 그대로 복사하세요(임의 변형·placeholder 금지). companyName 도 데이터의 이름을 사용하세요.",
  ];
  return lines.join("\n");
}

export const ADVICE_DISCLAIMER = "AI는 보장이 아닌 참고 조언입니다. 투자 판단과 책임은 본인에게 있습니다.";
