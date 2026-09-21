import { isIP } from "node:net";
import { ZodError } from "zod";
import { AuthProblem } from "./errors";

export function clientKey(request: Request) {
  // Only use x-real-ip if a configured proxy overwrites it; never trust arbitrary forwarded headers.
  const ip = request.headers.get("x-real-ip");
  return process.env.AUTH_TRUST_PROXY_IP === "true" && ip && isIP(ip) ? ip : "shared";
}
export function requireSameOrigin(request: Request) {
  const configured = process.env.APP_URL;
  if (!configured) throw new Error("APP_URL is required.");
  if (request.headers.get("origin") !== new URL(configured).origin) {
    throw new AuthProblem("INVALID_ORIGIN", "This request could not be verified. Refresh and try again.", 403);
  }
}
export async function readJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AuthProblem("INVALID_BODY", "Send a JSON request.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new AuthProblem("INVALID_BODY", "Enter the requested details.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 8192) { await reader.cancel(); throw new AuthProblem("BODY_TOO_LARGE", "This request is too large.", 413); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new AuthProblem("INVALID_BODY", "This request could not be read."); }
}
export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
export function errorResponse(error: unknown) {
  if (error instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of error.issues) fields[String(issue.path[0] ?? "form")] ??= issue.message;
    return json({ error: { code: "VALIDATION_ERROR", message: "Check the highlighted details.", fields } }, 400);
  }
  if (error instanceof AuthProblem) {
    const response = json({ error: { code: error.code, message: error.message } }, error.status);
    if (error.retryAfter) response.headers.set("Retry-After", String(error.retryAfter));
    return response;
  }
  console.error("[Velnaura auth] Request failed", error instanceof Error ? error.name : "UnknownError");
  return json({ error: { code: "SERVICE_UNAVAILABLE", message: "We couldn't complete that request. Please try again shortly." } }, 503);
}
export async function endpoint(request: Request, action: (input: unknown) => Promise<unknown>, status = 200) {
  try { requireSameOrigin(request); return json(await action(await readJson(request)), status); }
  catch (error) { return errorResponse(error); }
}
