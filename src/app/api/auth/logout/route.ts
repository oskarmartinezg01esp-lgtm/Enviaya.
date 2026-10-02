import { apiRoute } from "@/lib/api";
import { destroySession } from "@/lib/auth/session";

export const POST = apiRoute(async () => {
  await destroySession();
  return { ok: true };
});
