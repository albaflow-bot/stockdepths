/**
 * On-device deterministic alert rule engine (SPEC Task 5).
 *
 * Evaluates each holding against its target-price / stop-loss thresholds using the
 * latest (cached, delayed) quote and emits a one-line contextual buy/sell note.
 * Entirely deterministic — no network, no per-user LLM. Persona defaults fill in
 * thresholds when a holding doesn't override them (SPEC §3.2 성향 매칭).
 */

import type {
  Alert,
  AlertKind,
  Holding,
  InvestorProfile,
  QuoteLike,
  RuleConfig,
} from "./types.js";

/** Default {target%, stop%} per persona (SPEC §3.2 conservative/neutral/aggressive). */
export const PROFILE_THRESHOLDS: Record<InvestorProfile, { target: number; stop: number }> = {
  conservative: { target: 10, stop: 5 },
  neutral: { target: 20, stop: 10 },
  aggressive: { target: 40, stop: 20 },
};

const DEFAULT_NEAR_PCT = 2;

interface ResolvedThresholds {
  targetPrice: number;
  stopLossPrice: number;
}

/** Round to 6 dp to kill float noise (e.g. 100*1.1 = 110.00000000000001). */
function round6(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}

/** Resolve a holding's effective target/stop prices from overrides + persona. */
export function resolveThresholds(holding: Holding, config: RuleConfig = {}): ResolvedThresholds {
  const persona = config.profile ? PROFILE_THRESHOLDS[config.profile] : undefined;
  const targetReturnPct =
    holding.targetReturnPct ?? config.defaultTargetReturnPct ?? persona?.target ?? 20;
  const stopLossPct = holding.stopLossPct ?? config.defaultStopLossPct ?? persona?.stop ?? 10;
  return {
    targetPrice: round6(holding.targetPrice ?? holding.costBasis * (1 + targetReturnPct / 100)),
    stopLossPrice: round6(holding.stopLossPrice ?? holding.costBasis * (1 - stopLossPct / 100)),
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function fmtPct(v: number): string {
  const r = round2(v);
  return `${r >= 0 ? "+" : ""}${r}%`;
}

function todayPart(quote: QuoteLike): string {
  return quote.changePercent == null ? "" : ` (오늘 ${fmtPct(quote.changePercent)})`;
}

function buildNote(
  kind: AlertKind,
  holding: Holding,
  quote: QuoteLike,
  returnPct: number,
  distancePct?: number,
): string {
  const sym = holding.symbol.toUpperCase();
  const today = todayPart(quote);
  switch (kind) {
    case "target_reached":
      return `${sym} 목표가 도달 (수익률 ${fmtPct(returnPct)}). 흐름을 고려해 분할 매도를 검토하세요.${today}`;
    case "stop_loss":
      return `${sym} 손절선 도달 (수익률 ${fmtPct(returnPct)}). 리스크 관리를 점검하세요.${today}`;
    case "approaching_target":
      return `${sym} 목표가 근접 — 목표까지 ${round2(distancePct ?? 0)}% (현재 ${fmtPct(returnPct)}). 매도 타이밍을 지켜보세요.${today}`;
    case "approaching_stop":
      return `${sym} 손절선 근접 — 손절까지 ${round2(distancePct ?? 0)}% (현재 ${fmtPct(returnPct)}). 하락 흐름에 유의하세요.${today}`;
  }
}

/**
 * Evaluate one holding against one quote. Returns the most urgent applicable
 * alert, or null if nothing is actionable / approaching. Order of precedence:
 * target_reached / stop_loss (action) → approaching_target / approaching_stop.
 */
export function evaluateHolding(
  holding: Holding,
  quote: QuoteLike,
  config: RuleConfig = {},
): Alert | null {
  const cost = holding.costBasis;
  const price = quote.price;
  if (!Number.isFinite(cost) || cost <= 0 || !Number.isFinite(price) || price <= 0) {
    return null; // can't evaluate without a valid cost basis + price
  }

  const { targetPrice, stopLossPrice } = resolveThresholds(holding, config);
  const returnPct = ((price - cost) / cost) * 100;
  const near = config.nearThresholdPct ?? DEFAULT_NEAR_PCT;

  const base = {
    symbol: holding.symbol.toUpperCase(),
    currentPrice: round2(price),
    costBasis: round2(cost),
    returnPct: round2(returnPct),
    targetPrice: round2(targetPrice),
    stopLossPrice: round2(stopLossPrice),
    asOf: quote.asOf,
  };

  // Hit thresholds first (action severity).
  if (price >= targetPrice) {
    return { ...base, kind: "target_reached", severity: "action", note: buildNote("target_reached", holding, quote, returnPct) };
  }
  if (price <= stopLossPrice) {
    return { ...base, kind: "stop_loss", severity: "action", note: buildNote("stop_loss", holding, quote, returnPct) };
  }

  // Approaching thresholds (info severity) — only when enabled.
  if (near > 0) {
    const distToTarget = ((targetPrice - price) / price) * 100;
    const distToStop = ((price - stopLossPrice) / price) * 100;
    const targetNear = distToTarget > 0 && distToTarget <= near;
    const stopNear = distToStop > 0 && distToStop <= near;
    if (targetNear && (!stopNear || distToTarget <= distToStop)) {
      return {
        ...base,
        kind: "approaching_target",
        severity: "info",
        distanceToThresholdPct: round2(distToTarget),
        note: buildNote("approaching_target", holding, quote, returnPct, distToTarget),
      };
    }
    if (stopNear) {
      return {
        ...base,
        kind: "approaching_stop",
        severity: "info",
        distanceToThresholdPct: round2(distToStop),
        note: buildNote("approaching_stop", holding, quote, returnPct, distToStop),
      };
    }
  }

  return null;
}

/**
 * Evaluate every holding against the supplied quotes. `quotes` may be an array or
 * a symbol→quote map. Holdings without a matching quote are skipped. Returns
 * alerts ordered: action alerts first, then info.
 */
export function evaluateHoldings(
  holdings: Holding[],
  quotes: QuoteLike[] | Record<string, QuoteLike>,
  config: RuleConfig = {},
): Alert[] {
  const quoteMap = new Map<string, QuoteLike>();
  const entries = Array.isArray(quotes) ? quotes : Object.values(quotes);
  for (const q of entries) quoteMap.set(q.symbol.toUpperCase(), q);

  const alerts: Alert[] = [];
  for (const h of holdings) {
    const q = quoteMap.get(h.symbol.toUpperCase());
    if (!q) continue;
    const alert = evaluateHolding(h, q, config);
    if (alert) alerts.push(alert);
  }
  // Action alerts (hit) before info alerts (approaching).
  return alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "action" ? -1 : 1));
}
