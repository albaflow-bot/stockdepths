/**
 * Runtime error capture (RESILIENCE CONTRACT).
 *
 * Captures crashes as one-line JSON records with a breadcrumb trail of the last
 * actions, so a non-developer can copy a useful report. On web there is no app-
 * root filesystem, so records persist to a bounded localStorage ring (the
 * contract's '.bindesk/runtime-errors.ndjson' analog); storage is injectable and
 * falls back to memory, so this is testable and never itself throws.
 */

export interface ErrorRecord {
  kind: string;
  message: string;
  stack?: string;
  ts: string;
  breadcrumbs: string[];
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const ERRORS_KEY = "bindesk:runtime-errors";
const MAX_RECORDS = 50;
const MAX_BREADCRUMBS = 40;
const STACK_CAP = 1024;

function memoryStorage(): KeyValueStorage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, v),
  };
}

/** Resolve a usable storage: localStorage when present, else in-memory. */
export function resolveStorage(): KeyValueStorage {
  try {
    const ls = (globalThis as { localStorage?: KeyValueStorage }).localStorage;
    if (ls) {
      ls.getItem(ERRORS_KEY); // probe (throws in some privacy modes)
      return ls;
    }
  } catch {
    /* fall through to memory */
  }
  return memoryStorage();
}

const breadcrumbs: string[] = [];

/** Record a recent user/app action (boot step, navigation, save, …). */
export function addBreadcrumb(message: string): void {
  breadcrumbs.push(`${new Date().toISOString()} ${message}`);
  if (breadcrumbs.length > MAX_BREADCRUMBS) breadcrumbs.shift();
}

export function getBreadcrumbs(): string[] {
  return [...breadcrumbs];
}

/** Head+tail cap so a huge stack can't blow up storage. */
function capStack(stack?: string): string | undefined {
  if (!stack) return undefined;
  if (stack.length <= STACK_CAP * 2) return stack;
  return `${stack.slice(0, STACK_CAP)}\n…\n${stack.slice(-STACK_CAP)}`;
}

/** Append an error record to the bounded ring. Never throws. */
export function logError(
  err: unknown,
  kind = "error",
  storage: KeyValueStorage = resolveStorage(),
): ErrorRecord {
  const e = err instanceof Error ? err : undefined;
  const record: ErrorRecord = {
    kind,
    message: e?.message ?? String(err),
    stack: capStack(e?.stack),
    ts: new Date().toISOString(),
    breadcrumbs: getBreadcrumbs(),
  };
  try {
    const prev = storage.getItem(ERRORS_KEY);
    const lines = prev ? prev.split("\n").filter(Boolean) : [];
    lines.push(JSON.stringify(record));
    while (lines.length > MAX_RECORDS) lines.shift();
    storage.setItem(ERRORS_KEY, lines.join("\n"));
  } catch {
    /* logging must never crash the app */
  }
  if (typeof console !== "undefined") console.error(`[${kind}]`, record.message);
  return record;
}

/** All captured records (newest last). */
export function readErrors(storage: KeyValueStorage = resolveStorage()): ErrorRecord[] {
  try {
    const raw = storage.getItem(ERRORS_KEY);
    if (!raw) return [];
    return raw
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as ErrorRecord);
  } catch {
    return [];
  }
}

/** Install global handlers (web) so unhandled errors are captured too. */
export function installGlobalErrorHandlers(): void {
  const g = globalThis as {
    addEventListener?: (type: string, cb: (ev: unknown) => void) => void;
  };
  if (typeof g.addEventListener !== "function") return;
  g.addEventListener("error", (ev) => {
    const e = ev as { error?: unknown; message?: string };
    logError(e.error ?? e.message ?? "window error", "window.onerror");
  });
  g.addEventListener("unhandledrejection", (ev) => {
    const e = ev as { reason?: unknown };
    logError(e.reason ?? "unhandled rejection", "unhandledrejection");
  });
}
