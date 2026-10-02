import Link from "next/link";
import { Package } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getOrderHistory } from "@/lib/services/orders";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { STATUS_VARIANT } from "@/components/shop/order-tracker";
import { RepeatOrderButton } from "@/components/shop/order-actions";

export const metadata = { title: "Mis pedidos" };
export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const user = await requireUser("/pedidos");
  const orders = await getOrderHistory(user.id, 50);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Mis pedidos" description="Pregunta «¿dónde está mi pedido?» o «repite mi último pedido»." />
      {orders.length === 0 ? (
        <EmptyState icon={<Package />} title="Aún no tienes pedidos" description="Cuando hagas tu primer pedido aparecerá aquí." action={<Button variant="primary" asChild><Link href="/">Hablar con CORTANA</Link></Button>} />
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => (
            <li key={o.id} className="glass rounded-2xl p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <Link href={`/pedidos/${o.id}`} className="group">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-lg font-semibold group-hover:text-cyan">#{o.number}</span>
                    <Badge variant={STATUS_VARIANT[o.status]}>{o.statusLabel}</Badge>
                  </div>
                  <div className="mt-0.5 text-xs text-muted">{formatDate(o.createdAt, { year: "numeric" })}</div>
                </Link>
                <div className="text-right">
                  <div className="font-display text-lg font-semibold">{formatCents(o.totalCents)}</div>
                  <div className="text-xs text-muted">{o.payment?.method}</div>
                </div>
              </div>
              <p className="mt-3 line-clamp-2 text-sm text-ink/80">{o.items.map((i) => `${i.quantity}× ${i.name}`).join(" · ")}</p>
              {o.address && <p className="mt-1 text-xs text-muted">📍 {o.address.label} · {o.address.text}</p>}
              <div className="mt-4 flex gap-2">
                <Button size="sm" variant="outline" asChild><Link href={`/pedidos/${o.id}`}>Seguimiento</Link></Button>
                <RepeatOrderButton orderId={o.id} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
