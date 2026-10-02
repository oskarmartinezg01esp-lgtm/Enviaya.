import { apiRoute, readJson } from "@/lib/api";
import { apiUser } from "@/lib/auth/session";
import { createAddress, getAddresses, type AddressInput } from "@/lib/services/addresses";

export const GET = apiRoute(async () => getAddresses((await apiUser()).id));
export const POST = apiRoute(async (req) => createAddress((await apiUser()).id, await readJson<AddressInput>(req)));
