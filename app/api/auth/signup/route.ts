import { endpoint, clientKey } from "@/server/auth/http";
import { getAuthService } from "@/server/auth/runtime";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return endpoint(request, async input => {
    const user = await getAuthService().signup(input, clientKey(request));
    return { user: { id: user.id, email: user.email, name: user.name }, message: "Your account is ready. Sign in to begin your ritual." };
  }, 201);
}
