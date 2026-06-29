/**
 * Pure presentation helpers — Korean badge labels, badge tones, and number
 * formatting. No React, no I/O → directly unit-testable.
 */

import type { BadgeLevel } from "./types/picks";
import type { BadgeTone } from "./theme/tokens";

/** Korean label for a confidence/risk level. */
export function badgeLabel(level: BadgeLevel): string {
  return level === "high" ? "높음" : level === "medium" ? "보통" : "낮음";
}

/** Confidence tone: more confident → stronger/positive; least → muted. */
export function confidenceTone(level: BadgeLevel): BadgeTone {
  return level === "high" ? "positive" : level === "medium" ? "neutral" : "muted";
}

/** Risk tone: low risk is reassuring (green), high risk is a warning (red). */
export function riskTone(level: BadgeLevel): BadgeTone {
  return level === "high" ? "negative" : level === "medium" ? "warning" : "positive";
}

/** Format a percent value with a sign to 2 decimals (e.g. +12.30% / -4.50%), or "—" when null. */
export function fmtSignedPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

/** Format a percent value (2 decimals) without forcing a sign, or "—" when null. */
export function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(2)}%`;
}

/**
 * 스냅샷 기준일(YYYY-MM-DD) → 짧은 라벨. 기기 로컬 오늘이면 "오늘", 아니면 "M/D"(예: 6/28).
 * asof 없으면 "" 반환 — 등락률에 날짜를 안 붙여 'stale 을 오늘로' 오인시키지 않는다.
 */
export function fmtAsofLabel(asof: string | null | undefined): string {
  if (!asof || !/^\d{4}-\d{2}-\d{2}/.test(asof)) return "";
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (asof.slice(0, 10) === today) return "오늘";
  return `${Number(asof.slice(5, 7))}/${Number(asof.slice(8, 10))}`;
}

/** Tone for a return number: positive → green, negative → red, zero → muted. */
export function returnTone(v: number | null | undefined): BadgeTone {
  if (v == null || !Number.isFinite(v) || v === 0) return "muted";
  return v > 0 ? "positive" : "negative";
}

function groupedAbs(v: number): string {
  return Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Format a USD amount (US market), or "—" when null. */
export function fmtMoney(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v < 0 ? "-" : ""}$${groupedAbs(v)}`;
}

/** Format a USD gain/loss with an explicit sign, or "—" when null. */
export function fmtSignedMoney(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : "-"}$${groupedAbs(v)}`;
}

/** Format a share quantity compactly, or "—" when absent. */
export function fmtQty(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toLocaleString("en-US", { maximumFractionDigits: 4 })}주`;
}
