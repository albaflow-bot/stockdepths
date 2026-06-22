import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Text } from "react-native";
import { logError, readErrors, addBreadcrumb, type KeyValueStorage } from "../errorLog";
import { recordBootStart, markStable, isSafeMode, getCrashCount, STRIKE_THRESHOLD } from "../safeMode";
import { ErrorBoundary } from "../ErrorBoundary";

function memStore(): KeyValueStorage {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

describe("errorLog", () => {
  it("appends bounded JSON records with breadcrumbs and reads them back", () => {
    const s = memStore();
    addBreadcrumb("did a thing");
    logError(new Error("boom"), "test", s);
    const errors = readErrors(s);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toBe("boom");
    expect(errors[0]!.kind).toBe("test");
    expect(errors[0]!.breadcrumbs.some((b) => b.includes("did a thing"))).toBe(true);
  });

  it("never throws on a failing storage", () => {
    const bad: KeyValueStorage = {
      getItem: () => {
        throw new Error("nope");
      },
      setItem: () => {
        throw new Error("nope");
      },
    };
    expect(() => logError(new Error("x"), "test", bad)).not.toThrow();
  });
});

describe("safeMode (3-strike)", () => {
  it("trips only after STRIKE_THRESHOLD consecutive boots without markStable", () => {
    const s = memStore();
    expect(isSafeMode(recordBootStart(s))).toBe(false); // 1
    expect(isSafeMode(recordBootStart(s))).toBe(false); // 2
    expect(isSafeMode(recordBootStart(s))).toBe(true); // 3 → safe mode
    expect(STRIKE_THRESHOLD).toBe(3);
  });

  it("markStable resets the consecutive-crash counter", () => {
    const s = memStore();
    recordBootStart(s);
    recordBootStart(s);
    markStable(s);
    expect(getCrashCount(s)).toBe(0);
    expect(isSafeMode(recordBootStart(s))).toBe(false); // back to 1
  });
});

describe("ErrorBoundary", () => {
  function Boom(): JSX.Element {
    throw new Error("render exploded");
  }

  it("catches a render error and shows the recovery fallback with the cause", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId("error-boundary-fallback")).toBeInTheDocument();
    expect(screen.getByText("render exploded")).toBeInTheDocument();
    expect(screen.getByText("오류 복사")).toBeInTheDocument();
  });

  it("renders children normally when nothing throws", () => {
    render(
      <ErrorBoundary>
        <Text>정상</Text>
      </ErrorBoundary>,
    );
    expect(screen.getByText("정상")).toBeInTheDocument();
    expect(screen.queryByTestId("error-boundary-fallback")).toBeNull();
  });
});
