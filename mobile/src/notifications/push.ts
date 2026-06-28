/**
 * Register this device for the daily push digest.
 *
 * Native (Android) only — a no-op on web/tests and when the API base URL is unset.
 * Never throws: receiving a real FCM token needs Firebase config on the build, and
 * the app must keep working even when that isn't set up yet. Returns the token on
 * success, otherwise null.
 */

import { Platform } from "react-native";
import { apiBaseUrl } from "../data/config";

/**
 * Android 알림 채널 id — 서버 FCM digest 가 보내는 channel_id 와 *반드시* 일치해야 한다
 * (server/src/push/fcm.ts DEFAULT_CHANNEL = "stock_timing"). Android 8+ 는 존재하지 않는
 * 채널의 알림을 조용히 드롭하므로, 이 채널을 만들지 않으면 원격 푸시가 표시되지 않는다.
 */
const TIMING_CHANNEL = "stock_timing";

/** stock_timing 채널 생성(멱등, best-effort). 채널 없으면 원격 푸시가 드롭된다. */
async function ensureAndroidChannel(Notifications: any): Promise<void> {
  try {
    await Notifications.setNotificationChannelAsync(TIMING_CHANNEL, {
      name: "매수/매도 타이밍",
      importance: Notifications.AndroidImportance?.HIGH ?? 4,
    });
  } catch {
    // best-effort — 채널 생성 실패가 등록/알림 흐름을 깨지 않게.
  }
}

/**
 * Present a local (on-device) notification — used by the OnDeviceRule engine when a
 * holding hits its target/stop (no server round-trip; SPEC §5.4 OnDeviceRule).
 * Native (Android) only, best-effort: a no-op on web/tests and never throws, so a
 * missing/unconfigured expo-notifications module can't break the evaluation flow.
 * Returns true when the OS was asked to present it.
 */
export async function presentLocalNotification(title: string, body: string): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  try {
    const Notifications = await import(/* @vite-ignore */ "expo-notifications");
    await ensureAndroidChannel(Notifications); // 채널 보장(없으면 Android 가 드롭)
    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: null, // present immediately
    });
    return true;
  } catch {
    return false;
  }
}

export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS !== "android") return null;
  const base = apiBaseUrl();
  if (!base) return null;
  try {
    // Dynamic import keeps the native module out of the web bundle / test graph.
    // @vite-ignore so the web/test bundler never tries to resolve it (only the
    // real Expo build, where the package exists, ever runs this branch).
    const Notifications = await import(/* @vite-ignore */ "expo-notifications");
    // 원격 푸시가 표시되려면 서버 channel_id 와 같은 채널이 먼저 있어야 한다.
    await ensureAndroidChannel(Notifications);
    const perm = await Notifications.requestPermissionsAsync();
    if (perm.status !== "granted") return null;

    const resp = await Notifications.getDevicePushTokenAsync();
    const token = String(resp.data ?? "");
    if (!token) return null;

    await fetch(`${base}/api/devices/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, platform: "android" }),
    });
    return token;
  } catch {
    // Firebase not configured yet, permission denied, or offline — fail silently.
    return null;
  }
}
