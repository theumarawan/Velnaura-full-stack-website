"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { profileSchema } from "@/lib/auth/validation";

export function ProfileForm({ name, email }: { name: string | null; email: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(""); setMessage("");
    const result = profileSchema.safeParse({ name: new FormData(event.currentTarget).get("name") });
    if (!result.success) { setError(result.error.issues[0].message); return; }
    setPending(true);
    try {
      const response = await fetch("/api/account/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(result.data) });
      const body = await response.json();
      if (!response.ok) setError(body.error?.message ?? "We couldn't save your details.");
      else { setMessage(body.message); router.refresh(); }
    } catch { setError("We couldn't connect. Please try again."); }
    finally { setPending(false); }
  }
  return <form onSubmit={submit} noValidate aria-busy={pending}>
    {error && <p className="form-error" role="alert">{error}</p>}
    {message && <p className="success-text" role="status">{message}</p>}
    <div className="field"><label htmlFor="profile-name">Your name</label><input id="profile-name" name="name" autoComplete="name" defaultValue={name ?? ""} maxLength={120} required /></div>
    <div className="field"><label htmlFor="profile-email">Email address</label><input id="profile-email" type="email" value={email} readOnly aria-describedby="email-note" />
      <small id="email-note">Email changes will be available with a verified change flow. Your current sign-in address stays protected.</small></div>
    <button type="submit" className="button" disabled={pending}>{pending ? "Saving…" : "Save my details"}</button>
  </form>;
}
