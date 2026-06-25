/**
 * OnDeviceRule engine — the product's MAIN decision (지금 살까/팔까/기다릴까) for the
 * user's OWN holdings, evaluated on-device, deterministically, with ZERO LLM cost
 * (SPEC 피드백 라운드 3 §5.4 OnDeviceRule / 기존 기능 ④).
 *
 * Inputs are all local: a holding's 매입가 + 목표가·손절선 (per-holding override or the
 * persona's % defaults) and the latest (delayed, daily) 현재가. No realtime tick quotes
 * (§5.7 out of scope). Output is a `source: "onDeviceRule"` TimingSignal per holding;
 * when a target/stop threshold is *reached* it also triggers a push — reduced to a
 * single one-line timing message (매수 적정/매도 검토 …), never an info dump.
 *
 * Conflict (SPEC §5.4): if the same ticker also has a DailyBatch signal, the personal
 * rule WINS and is shown on top — both are surfaced (see {@link resolveSignalConflict}).
 *
 * Push de-dup (SPEC §5.4): the same reached condition fires at most once per day — a
 * persisted fired-set keyed by `${symbol}:${category}:${date}` re-arms on the next day.
 */

import { PRESET_THRESHOLDS, type PersonaConfig } from "../persona/types";
import type { Holding } from "../portfolio/types";
import type { NotificationItem } from "../notifications/types";
import { NotificationRepository } from "../notifications/repository";
import { presentLocalNotification } from "../notifications/push";
import { defaultStorage, type AsyncKeyValueStorage } from "../data/storage";
import { TIMING_ACTION_LABELS, type TimingAction, type TimingSignal } from "../types/timing";

/** Minimal quote the rule needs — structurally compatible with the picks quote client. */
export interface RuleQuote {
  symbol: string;
  price: number;
  /** Today's % change, used to enrich the one-line note when present. */
  changePercent?: number;
  /** Latest trading day (YYYY-MM-DD); also the per-day de-dup key. */
  asOf?: string;
}

/** Which threshold state a holding is in. `none` = nothing actionable. */
export type RuleCondition =
  | "target_reached"
  | "stop_loss"
  | "approaching_target"
  | "approaching_stop"
  | "none";

/** Only these two are "reached" conditions that trigger a push. */
const REACHED: ReadonlySet<RuleCondition> = new Set(["target_reached", "stop_loss"]);

/** Map a reached condition to the notification inbox category. */
const CONDITION_CATEGORY: Record<"target_reached" | "stop_loss", NotificationItem["category"]> = {
  target_reached: "target_reached",
  stop_loss: "stop_loss",
};

export interface RuleEvaluation {
  symbol: string;
  condition: RuleCondition;
  /** The OnDeviceRule timing signal for this holding (always produced). */
  signal: TimingSignal;
  targetPrice: number;
  stopLossPrice: number;
  returnPct: number;
}

const DEFAULT_NEAR_PCT = 2;

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
function round6(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}
function fmtPct(v: number): string {
  const r = round2(v);
  return `${r >= 0 ? "+" : ""}${r}%`;
}

/** Resolve effective target/stop prices from holding overrides + persona defaults. */
export function resolveThresholds(
  holding: Holding,
  persona?: PersonaConfig,
): { targetPrice: number; stopLossPrice: number } {
  const fallback = PRESET_THRESHOLDS.neutral;
  const targetPct = holding.targetReturnPct ?? persona?.targetReturnPct ?? fallback.target;
  const stopPct = holding.stopLossPct ?? persona?.stopLossPct ?? fallback.stop;
  return {
    targetPrice: round6(holding.targetPrice ?? holding.costBasis * (1 + targetPct / 100)),
    stopLossPrice: round6(holding.stopLossPrice ?? holding.costBasis * (1 - stopPct / 100)),
  };
}

/** Action + one-line reason per condition (비전문가용 한 줄, 정보 나열 ✗). */
function signalFor(
  condition: RuleCondition,
  quote: RuleQuote,
  returnPct: number,
  distancePct: number,
): { action: TimingAction; confidence: number; reason: string } {
  const today = quote.changePercent == null ? "" : ` (오늘 ${fmtPct(quote.changePercent)})`;
  switch (condition) {
    case "target_reached":
      return { action: "sell", confidence: 1, reason: `목표가 도달 · 수익률 ${fmtPct(returnPct)} — 분할 매도 검토${today}` };
    case "stop_loss":
      return { action: "sell", confidence: 1, reason: `손절선 도달 · 수익률 ${fmtPct(returnPct)} — 매도 검토${today}` };
    case "approaching_target":
      return { action: "hold", confidence: 0.7, reason: `목표가까지 ${round2(distancePct)}% — 보유 유지하며 매도 타이밍 주시${today}` };
    case "approaching_stop":
      return { action: "watch", confidence: 0.7, reason: `손절선까지 ${round2(distancePct)}% — 관망, 하락 흐름 유의${today}` };
    case "none":
      return { action: "hold", confidence: 0.5, reason: `목표가·손절선 미도달 · 수익률 ${fmtPct(returnPct)} — 보유 유지${today}` };
  }
}

/**
 * Evaluate ONE holding against ONE quote (pure, deterministic, no I/O). Always
 * returns an OnDeviceRule TimingSignal; `condition` tells the caller whether a push
 * should fire (REACHED). Returns null only when cost/price are unusable.
 */
export function evaluateHoldingRule(
  holding: Holding,
  quote: RuleQuote,
  persona?: PersonaConfig,
  nearThresholdPct: number = DEFAULT_NEAR_PCT,
): RuleEvaluation | null {
  const cost = holding.costBasis;
  const price = quote.price;
  if (!Number.isFinite(cost) || cost <= 0 || !Number.isFinite(price) || price <= 0) return null;

  const { targetPrice, stopLossPrice } = resolveThresholds(holding, persona);
  const returnPct = ((price - cost) / cost) * 100;

  let condition: RuleCondition = "none";
  let distancePct = 0;
  if (price >= targetPrice) {
    condition = "target_reached";
  } else if (price <= stopLossPrice) {
    condition = "stop_loss";
  } else if (nearThresholdPct > 0) {
    const distToTarget = ((targetPrice - price) / price) * 100;
    const distToStop = ((price - stopLossPrice) / price) * 100;
    const targetNear = distToTarget > 0 && distToTarget <= nearThresholdPct;
    const stopNear = distToStop > 0 && distToStop <= nearThresholdPct;
    if (targetNear && (!stopNear || distToTarget <= distToStop)) {
      condition = "approaching_target";
      distancePct = distToTarget;
    } else if (stopNear) {
      condition = "approaching_stop";
      distancePct = distToStop;
    }
  }

  const { action, confidence, reason } = signalFor(condition, quote, returnPct, distancePct);
  const symbol = holding.symbol.toUpperCase();
  const signal: TimingSignal = {
    ticker: symbol,
    action,
    confidence,
    oneLineReason: reason,
    contextNewsIds: [],
    evaluatedAt: quote.asOf ?? "",
    source: "onDeviceRule",
  };
  return { symbol, condition, signal, targetPrice: round2(targetPrice), stopLossPrice: round2(stopLossPrice), returnPct: round2(returnPct) };
}

/**
 * Conflict resolution (SPEC §5.4): personal OnDeviceRule wins and is shown on top;
 * the DailyBatch signal is kept below. Returns the ordered list to render (both when
 * present, else whichever exists).
 */
export function resolveSignalConflict(
  personal?: TimingSignal,
  batch?: TimingSignal,
): TimingSignal[] {
  const out: TimingSignal[] = [];
  if (personal) out.push(personal); // personal rule first (top)
  if (batch) out.push(batch);
  return out;
}

// ── Fired-set de-dup (persisted) ─────────────────────────────────────────────────

const FIRED_KEY = "bindesk:rule-fired";
const FIRED_MAX = 500;

interface FiredStore {
  has(key: string): Promise<boolean>;
  add(key: string): Promise<void>;
}

function makeFiredStore(storage: AsyncKeyValueStorage): FiredStore {
  return {
    async has(key) {
      try {
        const raw = await storage.getItem(FIRED_KEY);
        if (!raw) return false;
        const arr = JSON.parse(raw) as string[];
        return Array.isArray(arr) && arr.includes(key);
      } catch {
        return false;
      }
    },
    async add(key) {
      try {
        const raw = await storage.getItem(FIRED_KEY);
        const arr = raw ? (JSON.parse(raw) as string[]) : [];
        const next = Array.isArray(arr) ? arr : [];
        if (next.includes(key)) return;
        next.push(key);
        // Bounded ring: keep the most recent keys.
        const capped = next.slice(Math.max(0, next.length - FIRED_MAX));
        await storage.setItem(FIRED_KEY, JSON.stringify(capped));
      } catch {
        /* de-dup is best-effort; a storage failure must not block evaluation */
      }
    },
  };
}

/** Stable de-dup key — one push per (symbol, reached condition, day). */
export function firedKey(symbol: string, condition: RuleCondition, asOf: string | undefined): string {
  return `${symbol.toUpperCase()}:${condition}:${asOf ?? "nodate"}`;
}

export interface OnDeviceRuleDeps {
  notifications?: NotificationRepository;
  storage?: AsyncKeyValueStorage;
  /** Local-notification presenter (best-effort). Injectable for tests. */
  present?: (title: string, body: string) => Promise<boolean>;
  /** ISO timestamp source for the notification createdAt. */
  now?: () => string;
  nearThresholdPct?: number;
}

export interface OnDeviceRuleResult {
  /** One OnDeviceRule signal per evaluated holding. */
  signals: TimingSignal[];
  /** Notifications freshly fired this run (after de-dup). */
  fired: NotificationItem[];
  /** Per-holding evaluation detail (for the screen / conflict resolution). */
  evaluations: RuleEvaluation[];
}

/**
 * Evaluate all holdings, emit OnDeviceRule signals, and fire de-duped pushes for any
 * reached target/stop. Pure-ish: side effects (inbox append, local push) are guarded
 * and best-effort so one failure never breaks the rest.
 */
export class OnDeviceRuleService {
  private readonly notifications: NotificationRepository;
  private readonly fired: FiredStore;
  private readonly present: (title: string, body: string) => Promise<boolean>;
  private readonly now: () => string;
  private readonly nearThresholdPct: number;

  constructor(deps: OnDeviceRuleDeps = {}) {
    this.notifications = deps.notifications ?? new NotificationRepository(deps.storage ? { storage: deps.storage } : {});
    // Build the fired store on the same storage the inbox uses (default if none).
    const storage = deps.storage ?? defaultStorage();
    this.fired = makeFiredStore(storage);
    this.present = deps.present ?? presentLocalNotification;
    this.now = deps.now ?? (() => new Date().toISOString());
    this.nearThresholdPct = deps.nearThresholdPct ?? DEFAULT_NEAR_PCT;
  }

  async evaluate(
    holdings: Holding[],
    quotes: RuleQuote[] | Record<string, RuleQuote>,
    persona?: PersonaConfig,
  ): Promise<OnDeviceRuleResult> {
    const quoteMap = new Map<string, RuleQuote>();
    const entries = Array.isArray(quotes) ? quotes : Object.values(quotes);
    for (const q of entries) quoteMap.set(q.symbol.toUpperCase(), q);

    const signals: TimingSignal[] = [];
    const evaluations: RuleEvaluation[] = [];
    const fired: NotificationItem[] = [];

    for (const h of holdings) {
      const q = quoteMap.get(h.symbol.toUpperCase());
      if (!q) continue; // no quote → can't evaluate this holding
      const evalResult = evaluateHoldingRule(h, q, persona, this.nearThresholdPct);
      if (!evalResult) continue;
      signals.push(evalResult.signal);
      evaluations.push(evalResult);

      if (!REACHED.has(evalResult.condition)) continue;
      const condition = evalResult.condition as "target_reached" | "stop_loss";
      const key = firedKey(evalResult.symbol, condition, q.asOf);
      if (await this.fired.has(key)) continue; // already pushed this condition today

      const notification = this.buildNotification(evalResult, condition);
      await this.notifications.add(notification); // idempotent inbox append
      await this.present(notification.title, notification.body); // best-effort OS push
      await this.fired.add(key);
      fired.push(notification);
    }

    return { signals, fired, evaluations };
  }

  private buildNotification(
    evalResult: RuleEvaluation,
    condition: "target_reached" | "stop_loss",
  ): NotificationItem {
    const sym = evalResult.symbol;
    const label = TIMING_ACTION_LABELS[evalResult.signal.action]; // 매도 검토
    return {
      // Stable id (no timestamp) → inbox de-dup; the per-day fired-set gates re-push.
      id: `alert:${sym}:${condition}:${evalResult.signal.evaluatedAt || "nodate"}`,
      kind: "alert",
      title: `${sym} ${label}`,
      body: evalResult.signal.oneLineReason,
      createdAt: this.now(),
      read: false,
      symbol: sym,
      category: CONDITION_CATEGORY[condition],
    };
  }
}
