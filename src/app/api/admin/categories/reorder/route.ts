import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api";
import { apiAdmin } from "@/lib/auth/session";
import { reorderCategories } from "@/lib/services/admin";

export const POST = apiRoute(async (req) => {
  const admin = await apiAdmin();
  const { ids } = z.object({ ids: z.array(z.string()).min(1).max(100) }).parse(await readJson(req));
  await reorderCategories(admin.id, ids);
  return { ok: true };
});
