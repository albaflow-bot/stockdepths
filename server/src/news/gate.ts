/**
 * Source gate (SPEC §5.3 출처 게이트). A NewsItem is allowed only when its URL host
 * is in the whitelist (`WHITELISTED_DOMAINS`). This is the last line of defense:
 * even if a whitelisted feed links out to an untrusted origin, the item is dropped
 * so 찌라시·미검증 출처 can never reach the brief. The original URL is retained on
 * every surviving item for verifiability (brief 박제).
 */

import { WHITELISTED_DOMAINS } from "../config/newsSources.js";
import type { NewsItem } from "../market/types.js";

/** Extract a lowercase hostname from a URL, or undefined if unparseable. */
export function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

/**
 * True when `url`'s host equals or is a subdomain of a whitelisted domain. Suffix
 * match is dot-anchored so "evil-sec.gov.example.com" does NOT pass for "sec.gov".
 */
export function isWhitelistedUrl(url: string, domains: readonly string[] = WHITELISTED_DOMAINS): boolean {
  const host = hostOf(url);
  if (!host) return false;
  return domains.some((d) => {
    const dom = d.toLowerCase();
    return host === dom || host.endsWith(`.${dom}`);
  });
}

/** Keep only items whose URL passes the whitelist gate. */
export function gateItems<T extends NewsItem>(items: T[], domains?: readonly string[]): T[] {
  return items.filter((it) => isWhitelistedUrl(it.url, domains));
}
