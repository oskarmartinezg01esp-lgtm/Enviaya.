import { apiRoute } from "@/lib/api";
import { apiUser } from "@/lib/auth/session";
import { clearPreferences, getPreferences } from "@/lib/services/preferences";

export const GET = apiRoute(async () => getPreferences((await apiUser()).id));
export const DELETE = apiRoute(async () => {
  await clearPreferences((await apiUser()).id);
  return { ok: true };
});
