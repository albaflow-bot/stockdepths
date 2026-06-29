#!/usr/bin/env bash
set -o pipefail
cd /c/claude/stock/mobile/android || exit 9
export JAVA_HOME="C:/Users/seo/jdk17/jdk-17.0.19+10"
export ANDROID_HOME="C:/Android/Sdk"
export EXPO_PUBLIC_API_BASE_URL="https://stockdepths.vercel.app"
# Supabase Realtime(시장 속보) — anon 키는 공개용(RLS 로 news 공개 read 만 허용).
export EXPO_PUBLIC_SUPABASE_URL="${SUPABASE_URL_OVERRIDE:-https://fifulgqbrblxdrfwlcsb.supabase.co}"
export EXPO_PUBLIC_SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY_OVERRIDE:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpZnVsZ3FicmJseGRyZndsY3NiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMDk2NjIsImV4cCI6MjA5Nzc4NTY2Mn0.WNBXaKXs6nlKatKYfJHkoysGuwErgPiUqF8A9_xeiPk}"
echo "[build] start $(date) URL=$EXPO_PUBLIC_API_BASE_URL SUPABASE=${EXPO_PUBLIC_SUPABASE_URL:0:32}..."
MSYS_NO_PATHCONV=1 ./gradlew.bat clean assembleRelease --no-daemon 2>&1
echo "[build] gradle exit=$?"
ls -la app/build/outputs/apk/release/*.apk 2>&1
echo "[build] done $(date)"
