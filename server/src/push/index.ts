/**
 * Public entry point for the FCM push backbone (Task 5, server side).
 * The 9 AM digest scheduler and a token-registration API consume these.
 */

export { FcmClient, makeFcmClient } from "./fcm.js";
export type { FcmClientOptions } from "./fcm.js";
export { DeviceTokenStore } from "./tokenStore.js";
export type { DeviceTokenStoreOptions } from "./tokenStore.js";
export { buildDigestMessage, sendDailyDigest } from "./digest.js";
export type { SendDailyDigestDeps } from "./digest.js";
export {
  loadServiceAccount,
  ServiceAccountTokenProvider,
} from "./serviceAccount.js";
export type { ServiceAccount } from "./serviceAccount.js";
export type {
  DeviceToken,
  PushMessage,
  SendResult,
  MulticastResult,
  AccessTokenProvider,
  DigestPushSummary,
  Fetcher,
} from "./types.js";
