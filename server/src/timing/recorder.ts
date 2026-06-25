/**
 * Timing recorder — immutably logs a delivered artifact's DailyBatch signals + the
 * daily market brief (SPEC §5.6). Runs in the same post-store recording step as the
 * track recorder (`../track/recorder.ts`), i.e. the same batch transaction boundary,
 * so the §5 성적표 can later score timing hit-rate against frozen history.
 *
 * Append-only + idempotent (per-id) via the stores; recording failures are caught by
 * the caller and never block artifact delivery (non-blocking, like the track recorder).
 */

import type { DailyPicksArtifact } from "../pipeline/artifactStore.js";
import { TimingSignalStore, MarketBriefStore } from "./store.js";

export interface TimingRecordOptions {
  signalStore: TimingSignalStore;
  briefStore: MarketBriefStore;
}

/**
 * Append the artifact's signals + brief immutably. No-op for the legacy picks-only
 * path (no signals/brief on the artifact). Returns how many of each were freshly
 * appended (idempotent: re-recording the same day appends nothing).
 */
export function recordTimingArtifacts(
  artifact: DailyPicksArtifact,
  opts: TimingRecordOptions,
): { signals: number; brief: number } {
  let signals = 0;
  let brief = 0;
  if (artifact.signals && artifact.signals.length > 0) {
    signals = opts.signalStore.record(artifact.market, artifact.date, artifact.signals).length;
  }
  if (artifact.brief) {
    brief = opts.briefStore.record(artifact.brief).length;
  }
  return { signals, brief };
}

/** Build a recorder callback for `runDailyBatch({ timingRecorder })`. */
export function makeTimingRecorder(
  opts: TimingRecordOptions,
): (artifact: DailyPicksArtifact) => Promise<void> {
  return async (artifact) => {
    recordTimingArtifacts(artifact, opts);
  };
}
