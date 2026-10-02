import { apiRoute, readJson } from "@/lib/api";
import { apiAdmin } from "@/lib/auth/session";
import { deleteCategory, updateCategory } from "@/lib/services/admin";

type P = { params: Promise<{ id: string }> };

export const PATCH = apiRoute<P>(async (req, { params }) => updateCategory((await apiAdmin()).id, (await params).id, await readJson(req)));
export const DELETE = apiRoute<P>(async (_req, { params }) => {
  await deleteCategory((await apiAdmin()).id, (await params).id);
  return { ok: true };
});
