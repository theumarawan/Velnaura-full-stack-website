"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { PASSWORD_RULE, signupSchema, loginSchema, resetRequestSchema, resetPasswordSchema, safeCallbackPath } from "@/lib/auth/validation";

type Mode = "signup" | "login" | "forgot" | "reset";
const buttonText = { signup: "Create my account", login: "Welcome back", forgot: "Send reset link", reset: "Save new password" };

export function AuthForm({ mode, token = "", callbackUrl = "/account", initialError = "" }: { mode: Mode; token?: string; callbackUrl?: string; initialError?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(initialError);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState("");
  const [visible, setVisible] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(form);
    const input = mode === "reset" ? { password: values.password, token } : values;
    const schema = { signup: signupSchema, login: loginSchema, forgot: resetRequestSchema, reset: resetPasswordSchema }[mode];
    const parsed = schema.safeParse(input);
    setError(""); setFields({});
    if (!parsed.success) {
      const nextFields: Record<string, string> = {};
      for (const issue of parsed.error.issues) nextFields[String(issue.path[0] ?? "form")] ??= issue.message;
      setFields(nextFields);
      setError(mode === "reset" && !token ? "This reset link is missing its token. Request a new one below." : "Check the highlighted details.");
      return;
    }
    setPending(true);
    try {
      if (mode === "login") {
        const result = await signIn("credentials", { ...parsed.data, redirect: false, redirectTo: safeCallbackPath(callbackUrl) });
        if (!result || result.error) {
          setError(result?.code === "rate_limited" ? "Too many sign-in attempts. Please wait 15 minutes and try again." : result?.code === "service_unavailable" ? "Sign-in is temporarily unavailable. Please try again shortly." : "The email or password isn't right. Please try again.");
        } else {
          window.location.assign(safeCallbackPath(callbackUrl));
        }
      } else {
        const route = { signup: "signup", forgot: "forgot-password", reset: "reset-password" }[mode];
        const response = await fetch(`/api/auth/${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
        const body = await response.json();
        if (!response.ok) { setError(body.error?.message ?? "Something went wrong. Please try again."); setFields(body.error?.fields ?? {}); }
        else { setSuccess(body.message); }
      }
    } catch { setError("We couldn't connect. Check your connection and try again."); }
    finally { setPending(false); }
  }
  if (success) return <div className="success-panel" role="status"><p>{success}</p><Link className="button" href="/login">Back to sign in</Link></div>;
  return <form onSubmit={submit} noValidate aria-busy={pending}>
    {error && <p className="form-error" role="alert">{error}</p>}
    {mode === "signup" && <div className="field"><label htmlFor="name">Your name</label>
      <input id="name" name="name" autoComplete="name" maxLength={120} aria-invalid={!!fields.name} aria-describedby={fields.name ? "name-error" : undefined} required />
      {fields.name && <small id="name-error" className="field-error">{fields.name}</small>}</div>}
    {mode !== "reset" && <div className="field"><label htmlFor="email">Email address</label>
      <input id="email" name="email" type="email" autoComplete="email" maxLength={254} aria-invalid={!!fields.email} aria-describedby={fields.email ? "email-error" : undefined} required />
      {fields.email && <small id="email-error" className="field-error">{fields.email}</small>}</div>}
    {mode !== "forgot" && <div className="field"><label htmlFor="password">{mode === "reset" ? "New password" : "Password"}</label>
      <div className="password-field"><input id="password" name="password" type={visible ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"}
        aria-invalid={!!fields.password} aria-describedby={fields.password ? "password-error" : mode !== "login" ? "password-help" : undefined} required />
        <button className="show-password" type="button" aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? "Hide" : "Show"}</button></div>
      {mode !== "login" && <small id="password-help">{PASSWORD_RULE}</small>}
      {fields.password && <small id="password-error" className="field-error">{fields.password}</small>}</div>}
    {mode === "login" && <p className="forgot-link"><Link href="/forgot-password">Forgot your password?</Link></p>}
    <button className="button" type="submit" disabled={pending || (mode === "reset" && !token)}>{pending ? "One moment…" : buttonText[mode]} <span aria-hidden="true">↗</span></button>
    {mode === "login" && <p className="form-switch">New to Velnaura? <Link href="/signup">Make yourself at home</Link></p>}
    {mode === "signup" && <p className="form-switch">Already part of the ritual? <Link href="/login">Sign in</Link></p>}
    {mode === "reset" && <p className="form-switch"><Link href="/forgot-password">Request a new reset link</Link></p>}
    {mode === "forgot" && <p className="form-switch"><Link href="/login">Back to sign in</Link></p>}
  </form>;
}
