import { Linking, Platform } from "react-native";
import { addBreadcrumb } from "../resilience/errorLog";

/**
 * Open a URL in an external window/browser (SPEC §5: 출처 링크는 외부창으로 연다).
 * On web that's `window.open(_blank)`; on native it's `Linking.openURL`. Opening a
 * link must NEVER crash the gate, so every path is wrapped — a failure is logged as a
 * breadcrumb and swallowed (RESILIENCE CONTRACT).
 */
export function openExternal(url: string): void {
  if (!url) return;
  try {
    const w = globalThis as unknown as {
      open?: (u: string, target?: string, features?: string) => unknown;
    };
    if (Platform.OS === "web" && typeof w.open === "function") {
      w.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    void Linking.openURL(url);
  } catch {
    addBreadcrumb(`openExternal failed: ${url}`);
  }
}
