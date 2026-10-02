import { apiRoute } from "@/lib/api";
import { apiUser } from "@/lib/auth/session";
import { clearCart, getCartView } from "@/lib/services/cart";

export const GET = apiRoute(async () => getCartView((await apiUser()).id));
export const DELETE = apiRoute(async () => clearCart((await apiUser()).id));
