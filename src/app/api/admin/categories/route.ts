import { apiRoute, readJson } from "@/lib/api";
import { apiAdmin } from "@/lib/auth/session";
import { createCategory } from "@/lib/services/admin";

export const POST = apiRoute(async (req) => createCategory((await apiAdmin()).id, await readJson(req)));
