import { requireUser } from "@/lib/auth/session";
import { formatAddress, getAddresses } from "@/lib/services/addresses";
import { describePaymentMethod, getPaymentMethods } from "@/lib/services/payment-methods";
import { CartCheckout } from "@/components/shop/cart-checkout";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Carrito" };

export default async function CartPage() {
  const user = await requireUser("/carrito");
  const [addresses, methods] = await Promise.all([getAddresses(user.id), getPaymentMethods(user.id)]);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Carrito" description="También puedes decir: «quita una hamburguesa», «pon dos más» o «¿cuánto llevo?»." />
      <CartCheckout
        addresses={addresses.map((a) => ({ id: a.id, label: a.label, text: formatAddress(a), isDefault: a.isDefault }))}
        methods={methods.map((m) => ({ id: m.id, label: describePaymentMethod(m), isDefault: m.isDefault }))}
      />
    </div>
  );
}
