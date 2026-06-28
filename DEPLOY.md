# 배포 체크리스트 (주식알리미)

> 비밀 키는 이 파일이나 코드에 적지 마세요. 아래 "넣는 곳"(수파베이스/버셀/GitHub
> 대시보드의 비밀값 칸)에만 입력합니다. 채팅에도 붙여넣지 마세요.

## 1) 수파베이스 (저장소)
1. supabase.com → 새 프로젝트 생성(무료).
2. 좌측 **SQL Editor** → `server/supabase/schema.sql` 내용을 붙여넣고 **Run**
   → 표 3개(추천/성적표/기기토큰)가 만들어집니다.
3. **Settings → API** 에서 두 값을 복사해 둡니다(아래 2·3단계에서 사용):
   - **Project URL** (`https://○○○.supabase.co`)
   - **service_role key** (비밀 — 서버 전용)

## 2) 버셀 (서버 올리기)
1. vercel.com → 이 저장소를 Import.
2. **Root Directory = `server`** 로 설정 (중요 — 서버 폴더가 루트).
3. **Environment Variables** 에 아래를 추가:
   | 이름 | 값 | 비고 |
   |---|---|---|
   | `SUPABASE_URL` | 1단계의 Project URL | |
   | `SUPABASE_SERVICE_ROLE_KEY` | 1단계의 service_role key | 비밀 |
   | `GEMINI_API_KEY` | 제미나이 무료 키 | 비밀 |
   | `PICKS_PRIMARY` | `gemini` | 무료(제미나이) 우선 |
4. Deploy → 배포 주소(`https://○○○.vercel.app`)를 받습니다.

## 3) GitHub (매일 자동 추천 + 푸시)
저장소 **Settings → Secrets and variables → Actions** 에 등록:
- Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`,
  (푸시 사용 시) `FCM_SERVICE_ACCOUNT_JSON`
- Variables: `PICKS_PRIMARY` = `gemini`

→ 평일 자동 예약(`.github/workflows/daily-batch.yml`)이 미국·한국 추천을 만들어
수파베이스에 저장하고, 등록된 기기에 푸시를 보냅니다.

## 4) 앱(APK) 받기
- 앱은 **서버 주소를 빌드 시점에 박아 넣습니다.** 그래서 **2단계의 버셀 주소가 나온 뒤**
  빌드해야 합니다. 빌드 설정의 `EXPO_PUBLIC_API_BASE_URL` 에 그 주소를 넣고,
  화면의 **📱 결과물 빌드해서 받기** 로 APK를 받으세요.

## 5) 푸시 알림 켜기 (원격 푸시 — v1 핵심)
Firebase 무료 프로젝트가 필요합니다. 두 산출물을 받습니다:
1. **google-services.json** (앱) → `mobile/android/app/google-services.json` 에 두면
   다음 빌드부터 FCM 토큰 발급이 켜집니다(빌드는 조건부라 파일 없어도 안 깨짐).
2. **서비스 계정 JSON** (서버) → 2·3단계의 `FCM_SERVICE_ACCOUNT_JSON` 에 넣으면
   서버가 매일 디지스트 푸시를 발송합니다.

CLI 자동화(권장): `npm i -g firebase-tools` → `firebase login`(브라우저 1회) →
프로젝트 생성·안드로이드 앱(`com.bindesk.stocktiming`) 등록·google-services.json
추출까지 자동. 서비스 계정 키는 콘솔 1회 다운로드(Settings → Service accounts).

없어도 앱·추천·로컬 알림(보유종목 목표가/손절)은 정상 동작하며, 원격 푸시만 비활성화됩니다.
