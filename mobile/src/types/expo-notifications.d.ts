/**
 * Minimal ambient shim for `expo-notifications`, mirroring `react-native.d.ts`:
 * it lets typecheck pass without installing the native module in the web/test
 * toolchain. On a real Expo build the genuine package applies. We only declare
 * the two functions the push registration uses.
 */
declare module "expo-notifications" {
  export function requestPermissionsAsync(): Promise<{ status: string; granted?: boolean }>;
  export function getDevicePushTokenAsync(): Promise<{ type: string; data: string }>;
  export function scheduleNotificationAsync(request: {
    content: { title: string; body: string; data?: Record<string, unknown> };
    trigger: null | Record<string, unknown>;
  }): Promise<string>;
}
