import { apiRoute } from "@/lib/api";
import { apiUser } from "@/lib/auth/session";
import { deletePreference } from "@/lib/services/preferences";

export const DELETE = apiRoute<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  await deletePreference((await apiUser()).id, (await params).id);
  return { ok: true };
});
