import { apiRoute, readJson } from "@/lib/api";
import { apiUser } from "@/lib/auth/session";
import { addPaymentMethod, getPaymentMethods, paymentMethodSchema } from "@/lib/services/payment-methods";

export const GET = apiRoute(async () => getPaymentMethods((await apiUser()).id));
/** Solo acepta datos tokenizados (brand, last4, providerRef). Nunca el número completo. */
export const POST = apiRoute(async (req) => addPaymentMethod((await apiUser()).id, paymentMethodSchema.parse(await readJson(req))));
