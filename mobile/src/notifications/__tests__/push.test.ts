import { describe, it, expect } from "vitest";
import { registerForPushNotifications } from "../push";

describe("registerForPushNotifications", () => {
  it("is a no-op on web/tests (returns null, never touches the native module)", async () => {
    // Under react-native-web Platform.OS === "web", so it returns before importing
    // expo-notifications and never throws.
    await expect(registerForPushNotifications()).resolves.toBeNull();
  });
});
