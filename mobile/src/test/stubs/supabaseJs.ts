/**
 * 테스트용 @supabase/supabase-js 스텁. 테스트 환경엔 EXPO_PUBLIC_SUPABASE_* 가 없어
 * supabaseClient() 가 null 을 반환하므로 createClient 는 실제로 호출되지 않지만,
 * import 해석을 위해 더미를 둔다(실 라이브러리의 무거운 로드 회피).
 */
export function createClient() {
  const qb: Record<string, unknown> = {
    select: () => qb,
    eq: () => qb,
    order: () => qb,
    limit: () => Promise.resolve({ data: [], error: null }),
  };
  const channel: Record<string, unknown> = {
    on: () => channel,
    subscribe: () => channel,
  };
  return {
    from: () => qb,
    channel: () => channel,
    removeChannel: () => {},
  };
}
