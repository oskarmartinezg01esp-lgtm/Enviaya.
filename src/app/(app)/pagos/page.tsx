import { requireUser } from "@/lib/auth/session";
import { getPaymentMethods } from "@/lib/services/payment-methods";
import { PaymentManager } from "@/components/shop/payment-manager";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Pagos" };

export default async function PaymentsPage() {
  const user = await requireUser("/pagos");
  const methods = await getPaymentMethods(user.id);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Métodos de pago" description="CORTANA te preguntará antes de cobrar: «¿Quieres pagar con tu tarjeta terminada en 4821?»" />
      <PaymentManager
        initial={methods.map((m) => ({ id: m.id, type: m.type, brand: m.brand, last4: m.last4, expMonth: m.expMonth, expYear: m.expYear, isDefault: m.isDefault, provider: m.provider }))}
        stripeEnabled={Boolean(process.env.STRIPE_SECRET_KEY)}
      />
    </div>
  );
}
