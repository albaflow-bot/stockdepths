import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // On web/test, react-native primitives resolve to react-native-web.
    // 네이티브 react-native-webview 는 테스트에서 못 띄우므로 더미 스텁으로 매핑.
    alias: {
      "react-native": "react-native-web",
      "react-native-webview": fileURLToPath(new URL("./src/test/stubs/reactNativeWebView.tsx", import.meta.url)),
      // 무거운/네이티브 의존 라이브러리는 테스트에서 더미로 대체.
      "@supabase/supabase-js": fileURLToPath(new URL("./src/test/stubs/supabaseJs.ts", import.meta.url)),
      "react-native-url-polyfill/auto": fileURLToPath(new URL("./src/test/stubs/empty.ts", import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
