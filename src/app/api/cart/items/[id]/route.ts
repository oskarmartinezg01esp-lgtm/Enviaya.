import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api";
import { apiUser } from "@/lib/auth/session";
import { updateCartItem } from "@/lib/services/cart";

type P = { params: Promise<{ id: string }> };

export const PATCH = apiRoute<P>(async (req, { params }) => {
  const user = await apiUser();
  const { quantity } = z.object({ quantity: z.number().int().min(0).max(50) }).parse(await readJson(req));
  return updateCartItem(user.id, (await params).id, quantity);
});

export const DELETE = apiRoute<P>(async (_req, { params }) => {
  const user = await apiUser();
  return updateCartItem(user.id, (await params).id, 0);
});
