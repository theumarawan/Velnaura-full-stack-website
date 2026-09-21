import "server-only";
import { AuthProblem } from "@/server/auth/errors";

export type EmailMessage = { to: string; subject: string; text: string };
export interface EmailTransport {
  assertAvailable(): void;
  sendEmail(message: EmailMessage): Promise<void>;
}

export function assertEmailAvailable() {
  if (process.env.NODE_ENV === "production" || (process.env.EMAIL_DELIVERY_MODE ?? "console") !== "console") {
    throw new AuthProblem("EMAIL_UNAVAILABLE", "Password reset is temporarily unavailable. Please try again later.", 503);
  }
}
/** The only intentionally deferred integration: replace the transport, not reset logic. */
export async function sendEmail(message: EmailMessage) {
  assertEmailAvailable();
  console.info("[Velnaura development email — not delivered]", message);
}
export const emailTransport: EmailTransport = { assertAvailable: assertEmailAvailable, sendEmail };
