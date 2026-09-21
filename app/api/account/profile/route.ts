import { endpoint } from "@/server/auth/http";
import { getAuthService } from "@/server/auth/runtime";
import { requireApiUser } from "@/server/auth/guards";
export const runtime = "nodejs";
export async function PATCH(request: Request) {
  return endpoint(request, async input => {
    const user = await requireApiUser();
    const updated = await getAuthService().editProfile(user.id, input);
    return { user: { name: updated.name, email: updated.email }, message: "Your profile is updated." };
  });
}
