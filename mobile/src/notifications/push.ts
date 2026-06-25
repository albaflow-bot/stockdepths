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
