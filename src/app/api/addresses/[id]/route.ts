import { apiRoute, readJson } from "@/lib/api";
import { apiUser } from "@/lib/auth/session";
import { deleteAddress, updateAddress, type AddressInput } from "@/lib/services/addresses";

type P = { params: Promise<{ id: string }> };

export const PATCH = apiRoute<P>(async (req, { params }) => updateAddress((await apiUser()).id, (await params).id, await readJson<Partial<AddressInput>>(req)));
export const DELETE = apiRoute<P>(async (_req, { params }) => {
  await deleteAddress((await apiUser()).id, (await params).id);
  return { ok: true };
});
