import { endpoint, clientKey } from "@/server/auth/http";
import { getAuthService } from "@/server/auth/runtime";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return endpoint(request, input => getAuthService().requestReset(input, clientKey(request)));
}
