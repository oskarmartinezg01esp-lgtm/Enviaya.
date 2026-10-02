import type { OrderStatus } from "@prisma/client";
import { apiRoute } from "@/lib/api";
import { apiAdmin } from "@/lib/auth/session";
import { listOrdersAdmin } from "@/lib/services/orders";

export const GET = apiRoute(async (req) => {
  await apiAdmin();
  const status = req.nextUrl.searchParams.get("status") as OrderStatus | null;
  const q = req.nextUrl.searchParams.get("q") ?? undefined;
  return listOrdersAdmin({ status: status ?? undefined, q });
});
