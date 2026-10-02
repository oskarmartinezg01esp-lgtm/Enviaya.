import { apiRoute, readJson } from "@/lib/api";
import { apiAdmin } from "@/lib/auth/session";
import { createProduct } from "@/lib/services/admin";

export const POST = apiRoute(async (req) => createProduct((await apiAdmin()).id, await readJson(req)));
