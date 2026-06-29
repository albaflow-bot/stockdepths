/**
 * Supabase 클라이언트(클라 직결 — Realtime 시장 속보 구독 전용). 앱은 평소 /api/* 서버를
 * 경유하지만, 실시간 뉴스 push 만 Supabase Realtime(웹소켓)으로 직접 받는다.
 *
 * URL/anon 키는 빌드시 EXPO_PUBLIC_* 로 주입(직접 참조해야 Expo 인라이너가 잡는다 — config.ts
 * 주석 정합). 미설정이면 null → 호출부가 on-demand 폴백으로 graceful degrade.
 * anon 키는 공개값이며 RLS(news 공개 read)로 보호된다. 인증 미사용(세션 저장 ✗).
 */
import "react-native-url-polyfill/auto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

declare const process: { env: Record<string, string | undefined> };

let cached: SupabaseClient | null | undefined;

export function supabaseClient(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    cached = null;
    return null;
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
