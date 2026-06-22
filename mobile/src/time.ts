/**
 * Pure relative-time formatting for the notification list. `nowMs` is injectable
 * for deterministic tests.
 */

export function formatRelativeTime(iso: string, nowMs: number): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const diffSec = Math.max(0, (nowMs - t) / 1000);
  if (diffSec < 60) return "방금 전";
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  return iso.slice(0, 10); // older → calendar date
}
