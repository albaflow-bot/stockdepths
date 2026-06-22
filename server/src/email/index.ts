/**
 * Public entry point for transactional/announcement email (Task 13).
 */

export { ResendClient, makeResendClient, EmailError } from "./resend.js";
export type { EmailMessage, SendResult, ResendClientOptions, JsonFetcher } from "./resend.js";
export {
  buildLaunchAnnouncement,
  sendLaunchAnnouncement,
  ANNOUNCEMENT_DISCLAIMER,
} from "./announcement.js";
export type { AnnouncementInput, SendAnnouncementInput, BuiltEmail } from "./announcement.js";
