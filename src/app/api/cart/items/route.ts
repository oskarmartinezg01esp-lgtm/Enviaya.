import { z } from "zod";
import { apiRoute, readJson } from "@/lib/api";
import { apiUser } from "@/lib/auth/session";
import { addToCart } from "@/lib/services/cart";

const schema = z.object({
  productId: z.string().min(1),
  variantId: z.string().nullish(),
  quantity: z.number().int().min(1).max(50).default(1),
  remove: z.array(z.string()).max(10).optional(),
  extra: z.array(z.string()).max(10).optional(),
  notes: z.string().max(140).optional(),
});

export const POST = apiRoute(async (req) => {
  const user = await apiUser();
  const r = await addToCart(user.id, schema.parse(await readJson(req)));
  return r.cart;
});
