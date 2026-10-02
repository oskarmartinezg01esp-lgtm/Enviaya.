import { apiRoute, readJson } from "@/lib/api";
import { apiAdmin } from "@/lib/auth/session";
import { deleteProduct, updateProduct } from "@/lib/services/admin";

type P = { params: Promise<{ id: string }> };

export const PATCH = apiRoute<P>(async (req, { params }) => updateProduct((await apiAdmin()).id, (await params).id, await readJson(req)));
export const DELETE = apiRoute<P>(async (_req, { params }) => deleteProduct((await apiAdmin()).id, (await params).id));
