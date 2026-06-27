/**
 * APK 배포 — 빌드된 release APK 를 *이 프로젝트* 의 Supabase 공개 버킷
 * (releases/app-release.apk) 에 업로드해 "항상 최신" 다운로드 링크를 갱신한다.
 *
 * 프로젝트 격리: 자격을 이 폴더의 `.env`(SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)
 * 에서 읽으므로, 어느 프로젝트에서 실행하든 *그 프로젝트 자기 창고* 로만 올라간다
 * (파일명이 고정이라도 다른 앱과 섞이지 않음 — [[project_generated_apk_distribution_pattern]]).
 *
 * "항상 최신" 정책: 같은 경로를 덮어쓰므로 같은 짧은 링크가 늘 최신 빌드를 내려준다
 * (옛 버전 보존 ✗ — 의도된 동작).
 *
 * Usage: npm run release:publish            # 기본 APK 경로(../mobile/.../app-release.apk)
 *        npm run release:publish -- <apk>   # APK 경로 지정
 */
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

// .env 자동 로드(Node 20.6+). 외부 주입(env)이 이미 있으면 그게 우선.
if (!process.env.SUPABASE_URL) {
  try {
    (process as unknown as { loadEnvFile: (p: string) => void }).loadEnvFile(
      resolve(process.cwd(), ".env"),
    );
  } catch {
    /* .env 없고 외부 주입도 없으면 아래 가드에서 친절히 실패 */
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SHORT = process.env.RELEASE_SHORT_URL; // 선택 — 카톡 공유용 짧은 링크(Vercel rewrite)

const BUCKET = "releases";
const OBJECT = "app-release.apk";
const APK_MIME = "application/vnd.android.package-archive";

const DEFAULT_APK = resolve(
  process.cwd(),
  "..",
  "mobile",
  "android",
  "app",
  "build",
  "outputs",
  "apk",
  "release",
  "app-release.apk",
);

async function main(): Promise<void> {
  if (!SUPABASE_URL || !KEY) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없습니다 (.env 확인). 이 프로젝트의 Supabase 자격이 필요합니다.",
    );
  }

  const apkPath = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_APK;
  let bytes: Buffer;
  try {
    bytes = readFileSync(apkPath);
  } catch {
    throw new Error(
      `APK 를 찾을 수 없습니다: ${apkPath}\n먼저 release 빌드를 만든 뒤 다시 실행하세요.`,
    );
  }
  const localSize = statSync(apkPath).size;
  console.log(`[release] APK: ${apkPath} (${localSize.toLocaleString()} B)`);

  const auth = { apikey: KEY, Authorization: `Bearer ${KEY}` };

  // 1) 공개 버킷 보장 — 새 프로젝트면 생성, 이미 있으면 무시(교차 프로젝트 자동 셋업).
  const mk = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
  });
  console.log(`[release] 버킷 '${BUCKET}': ${mk.ok ? "생성" : "확인(이미 존재)"}`);

  // 2) 업로드(upsert + apk MIME) — MIME 가 핵심(카톡 다운로드 "연결프로그램 없음" 회피).
  const up = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${OBJECT}`, {
    method: "POST",
    headers: { ...auth, "Content-Type": APK_MIME, "x-upsert": "true" },
    body: bytes,
  });
  if (!up.ok) {
    throw new Error(`업로드 실패 HTTP ${up.status}: ${await up.text()}`);
  }
  console.log("[release] 업로드 완료");

  // 3) 검증 — 공개 URL 이 apk MIME + 정확한 바이트수로 응답하는지(무결성).
  const pub = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${OBJECT}`;
  const head = await fetch(`${pub}?v=${localSize}`, { method: "HEAD" });
  const ct = head.headers.get("content-type");
  const cl = Number(head.headers.get("content-length"));
  const ok = head.ok && ct === APK_MIME && cl === localSize;
  console.log(
    `[release] 검증 공개URL: HTTP ${head.status} · ${ct} · ${cl.toLocaleString()} B · ${ok ? "OK" : "불일치!"}`,
  );
  if (!ok) {
    throw new Error("검증 실패 — MIME/크기 불일치");
  }

  // 4) 짧은 링크(설정돼 있으면) 동일 검증 — 카톡 공유 주소.
  if (SHORT) {
    const s = await fetch(`${SHORT}?v=${localSize}`, { method: "HEAD" });
    const scl = Number(s.headers.get("content-length"));
    const sok = s.ok && scl === localSize;
    console.log(
      `[release] 검증 짧은URL: HTTP ${s.status} · ${s.headers.get("content-type")} · ${scl.toLocaleString()} B · ${sok ? "OK" : "확인필요"}`,
    );
  }

  console.log("\n=== 배포 완료 (항상 최신) ===");
  console.log("공개 링크 :", pub);
  if (SHORT) console.log("짧은 링크 :", SHORT, "  ← 카톡 공유용");
  else console.log("(짧은 링크를 쓰려면 .env 에 RELEASE_SHORT_URL 추가)");
}

main().catch((err: unknown) => {
  console.error("[release] 실패:", err instanceof Error ? err.message : err);
  process.exit(1);
});
