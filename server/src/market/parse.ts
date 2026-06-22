/**
 * Pure parsing/normalization helpers. No I/O — every function takes raw text and
 * returns normalized models, which makes them trivially unit-testable with
 * fixtures (E2E 하네스 계약: deterministic grader before any LLM/human review).
 */

import { XMLParser } from "fast-xml-parser";
import { createHash } from "node:crypto";
import type { Candle, Market, NewsItem, NewsKind } from "./types.js";

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

/** Coerce a value to a finite number or undefined (rejects NaN, "N/D", "", null). */
function num(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "" || /^n\/?d$/i.test(t)) return undefined;
    const n = Number(t);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function arrify<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

/** Stable de-dup id from the parts that identify a feed item. */
export function newsId(url: string, title: string): string {
  return createHash("sha1").update(`${url}|${title}`).digest("hex").slice(0, 16);
}

/**
 * Parse Stooq daily-history CSV.
 * Header: `Date,Open,High,Low,Close,Volume` (Stooq supplies no adjusted close,
 * so adjClose mirrors close). Returns ascending-by-date candles, malformed rows
 * skipped rather than throwing.
 */
export function parseStooqDailyCsv(csv: string): Candle[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length <= 1) return [];
  const header = (lines[0] ?? "").toLowerCase();
  if (!header.startsWith("date")) return [];

  const out: Candle[] = [];
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i];
    if (!row) continue;
    const cols = row.split(",");
    if (cols.length < 5) continue;
    const date = (cols[0] ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const open = num(cols[1]);
    const high = num(cols[2]);
    const low = num(cols[3]);
    const close = num(cols[4]);
    const volume = num(cols[5]) ?? 0;
    if (open == null || high == null || low == null || close == null) continue;
    out.push({ date, open, high, low, close, adjClose: close, volume });
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

/** A single delayed quote row from Stooq's `q/l` CSV endpoint. */
export interface StooqQuoteRow {
  symbol: string;
  date: string;
  close: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
}

/**
 * Parse Stooq latest-quote CSV (`f=sd2t2ohlcv`).
 * Header: `Symbol,Date,Time,Open,High,Low,Close,Volume`.
 */
export function parseStooqQuoteCsv(csv: string): StooqQuoteRow | undefined {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return undefined;
  const cols = (lines[1] ?? "").split(",");
  if (cols.length < 7) return undefined;
  const symbol = (cols[0] ?? "").trim();
  const date = (cols[1] ?? "").trim();
  const close = num(cols[6]);
  if (!symbol || !/^\d{4}-\d{2}-\d{2}$/.test(date) || close == null) return undefined;
  return {
    symbol,
    date,
    close,
    open: num(cols[3]),
    high: num(cols[4]),
    low: num(cols[5]),
    volume: num(cols[7]),
  };
}

/** Minimal shape of the Yahoo v8 chart JSON we depend on. */
interface YahooChart {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
          volume?: (number | null)[];
        }>;
        adjclose?: Array<{ adjclose?: (number | null)[] }>;
      };
    }>;
    error?: unknown;
  };
}

/** Convert a Yahoo epoch-seconds timestamp to a YYYY-MM-DD UTC calendar day. */
function epochToDay(sec: number): string {
  return new Date(sec * 1000).toISOString().slice(0, 10);
}

/**
 * Parse Yahoo Finance v8 chart JSON into candles. Rows with any null OHLC are
 * dropped (Yahoo emits nulls on holidays/halts). Ascending by date.
 */
export function parseYahooChart(json: string): Candle[] {
  let data: YahooChart;
  try {
    data = JSON.parse(json) as YahooChart;
  } catch {
    return [];
  }
  const result = data.chart?.result?.[0];
  const ts = result?.timestamp;
  const q = result?.indicators?.quote?.[0];
  if (!ts || !q) return [];
  const adj = result?.indicators?.adjclose?.[0]?.adjclose;

  const out: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i];
    const h = q.high?.[i];
    const l = q.low?.[i];
    const c = q.close?.[i];
    if (o == null || h == null || l == null || c == null) continue;
    const tsi = ts[i];
    if (tsi == null) continue;
    const a = adj?.[i];
    out.push({
      date: epochToDay(tsi),
      open: o,
      high: h,
      low: l,
      close: c,
      adjClose: a == null ? c : a,
      volume: q.volume?.[i] ?? 0,
    });
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

interface FeedEntry {
  title?: unknown;
  link?: unknown;
  guid?: unknown;
  pubDate?: unknown;
  published?: unknown;
  updated?: unknown;
  description?: unknown;
  summary?: unknown;
}

function asText(v: unknown): string | undefined {
  if (typeof v === "string") return v.trim() || undefined;
  if (v && typeof v === "object" && "#text" in (v as Record<string, unknown>)) {
    const t = (v as Record<string, unknown>)["#text"];
    return typeof t === "string" ? t.trim() || undefined : undefined;
  }
  return undefined;
}

/** Extract an href from an RSS string link or an Atom <link href="..."> object/array. */
function extractLink(link: unknown): string | undefined {
  const direct = asText(link);
  if (direct) return direct;
  for (const l of arrify(link as Record<string, unknown> | Record<string, unknown>[])) {
    if (l && typeof l === "object" && "@_href" in l) {
      const href = (l as Record<string, unknown>)["@_href"];
      if (typeof href === "string" && href.trim()) return href.trim();
    }
  }
  return undefined;
}

function toIso(v: unknown): string {
  const s = asText(v);
  if (!s) return new Date(0).toISOString();
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();
}

/**
 * Parse an RSS 2.0 or Atom feed into normalized NewsItems. Handles both
 * `<channel><item>` (RSS) and `<feed><entry>` (Atom). Items missing a title or
 * link are skipped. Caller supplies market/symbol/source/kind context.
 */
export function parseFeed(
  feedXml: string,
  ctx: { market: Market; symbol?: string; source: string; kind: NewsKind },
): NewsItem[] {
  let doc: Record<string, unknown>;
  try {
    doc = xml.parse(feedXml) as Record<string, unknown>;
  } catch {
    return [];
  }

  const channel = (doc["rss"] as Record<string, unknown> | undefined)?.["channel"] as
    | Record<string, unknown>
    | undefined;
  const feed = doc["feed"] as Record<string, unknown> | undefined;

  const entries: FeedEntry[] = channel
    ? arrify(channel["item"] as FeedEntry | FeedEntry[])
    : feed
      ? arrify(feed["entry"] as FeedEntry | FeedEntry[])
      : [];

  const items: NewsItem[] = [];
  for (const e of entries) {
    const title = asText(e.title);
    const url = extractLink(e.link) ?? asText(e.guid);
    if (!title || !url) continue;
    const publishedAt = toIso(e.pubDate ?? e.published ?? e.updated);
    const summary = asText(e.description) ?? asText(e.summary);
    items.push({
      id: newsId(url, title),
      symbol: ctx.symbol,
      market: ctx.market,
      title,
      url,
      publishedAt,
      summary,
      source: ctx.source,
      kind: ctx.kind,
    });
  }
  return items;
}
