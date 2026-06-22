#!/usr/bin/env bash
set -o pipefail
cd /c/claude/stock/mobile/android || exit 9
export JAVA_HOME="C:/Users/seo/jdk17/jdk-17.0.19+10"
export ANDROID_HOME="C:/Android/Sdk"
export EXPO_PUBLIC_API_BASE_URL="https://iurptiamhohvbnpoddwy.supabase.co/storage/v1/object/public/dogfood-picks"
echo "[build] start $(date) URL=$EXPO_PUBLIC_API_BASE_URL"
MSYS_NO_PATHCONV=1 ./gradlew.bat clean assembleRelease --no-daemon 2>&1
echo "[build] gradle exit=$?"
ls -la app/build/outputs/apk/release/*.apk 2>&1
echo "[build] done $(date)"
