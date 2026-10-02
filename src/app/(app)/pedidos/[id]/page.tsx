import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getOrder } from "@/lib/services/orders";
import { OrderTracker } from "@/components/shop/order-tracker";
import { AutoRefresh, CancelOrderButton, RepeatOrderButton } from "@/components/shop/order-actions";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("/pedidos");
  const { id } = await params;
  const order = await getOrder(user.id, id).catch(() => null);
  if (!order) notFound();
  const active = ["CONFIRMADO", "PREPARANDO", "LISTO", "EN_CAMINO"].includes(order.status);
  return (
    <div className="mx-auto max-w-xl">
      <Link href="/pedidos" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Mis pedidos
      </Link>
      <p className="mb-3 text-xs text-muted">Realizado el {formatDate(order.createdAt, { year: "numeric" })} · {order.payment?.method}</p>
      <OrderTracker order={order} />
      {order.notes && <p className="mt-3 text-sm text-muted">Nota: {order.notes}</p>}
      <div className="mt-4 flex gap-2">
        <RepeatOrderButton orderId={order.id} />
        {["PENDIENTE", "CONFIRMADO"].includes(order.status) && <CancelOrderButton orderId={order.id} number={order.number} />}
      </div>
      {active && <AutoRefresh seconds={15} />}
    </div>
  );
}
