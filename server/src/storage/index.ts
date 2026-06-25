/**
 * Public entry for the storage layer. Consumers use the factories so the backend
 * (Supabase vs disk) is decided once, from the environment.
 */

export {
  readSupabaseConfig,
  supabaseConfigured,
  type SupabaseConfig,
  type FetchLike,
} from "./supabaseRest.js";
export { SupabaseArtifactStore } from "./supabaseArtifactStore.js";
export { SupabaseTrackStore } from "./supabaseTrackStore.js";
export { SupabaseDeviceTokenStore } from "./supabaseTokenStore.js";
export { SupabaseSecuritySearchStore } from "./supabaseSearchStore.js";
export { SupabaseScreenStore } from "./supabaseScreenStore.js";
export {
  createArtifactStore,
  createTrackStore,
  createTokenStore,
  createSearchStore,
  createScreenStore,
  storageMode,
} from "./factory.js";
