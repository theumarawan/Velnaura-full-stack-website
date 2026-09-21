import { z } from "zod";

export const PASSWORD_RULE = "Use 12 or more characters, including an uppercase letter, a lowercase letter, a number and a symbol. Maximum 72 UTF-8 bytes.";
export const emailSchema = z.string().trim().toLowerCase().max(254).email("Enter a valid email address.");
export const passwordSchema = z.string().min(12, PASSWORD_RULE)
  .regex(/[A-Z]/, PASSWORD_RULE).regex(/[a-z]/, PASSWORD_RULE)
  .regex(/[0-9]/, PASSWORD_RULE).regex(/[^A-Za-z0-9\s]/u, PASSWORD_RULE)
  .refine(value => new TextEncoder().encode(value).length <= 72, PASSWORD_RULE);
export const nameSchema = z.string().trim().min(1, "Enter your name.").max(120, "Use 120 characters or fewer.");
export const signupSchema = z.object({ name: nameSchema, email: emailSchema, password: passwordSchema }).strict();
// Existing Phase 1 seed passwords may predate the new signup complexity policy.
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(1024) });
export const resetRequestSchema = z.object({ email: emailSchema }).strict();
export const resetPasswordSchema = z.object({ token: z.string().min(1).max(2048), password: passwordSchema }).strict();
export const profileSchema = z.object({ name: nameSchema }).strict();

/** A callback can only navigate to our account area; blocks open redirects. */
export function safeCallbackPath(value: unknown): string {
  return typeof value === "string" && /^\/account(?:\/[A-Za-z0-9/_-]*)?$/.test(value) ? value : "/account";
}
