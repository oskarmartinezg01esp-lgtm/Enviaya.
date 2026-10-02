"use client";

import { useMemo, useState } from "react";
import { Eye, Mail, MessageCircle, Phone, RefreshCw, Search, XCircle } from "lucide-react";
import { toast } from "sonner";
import type { OrderView } from "@/lib/services/orders";
import { api } from "@/lib/client/api";
import { formatCents } from "@/lib/money";
import { formatDate, cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { OrderTracker, STATUS_VARIANT } from "@/components/shop/order-tracker";

const STATUSES = ["CONFIRMADO", "PREPARANDO", "LISTO", "EN_CAMINO", "ENTREGADO", "CANCELADO"] as const;
const LABEL: Record<string, string> = { CONFIRMADO: "Confirmado", PREPARANDO: "Preparando", LISTO: "Listo", EN_CAMINO: "En camino", ENTREGADO: "Entregado", CANCELADO: "Cancelado" };

export function OrdersTable({ initial }: { initial: OrderView[] }) {
  const [orders, setOrders] = useState(initial);
  const [filter, setFilter] = useState<string>("");
  const [q, setQ] = useState("");
  const [view, setView] = useState<OrderView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const list = useMemo(
    () =>
      orders.filter(
        (o) =>
          (!filter || (filter === "ACTIVOS" ? ["CONFIRMADO", "PREPARANDO", "LISTO", "EN_CAMINO"].includes(o.status) : o.status === filter)) &&
          (!q || `${o.number} ${o.customer.name} ${o.customer.email}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [orders, filter, q],
  );

  const refresh = async () => setOrders(await api<OrderView[]>("/api/admin/orders"));

  const setStatus = async (o: OrderView, status: string) => {
    if (status === "CANCELADO" && !confirm(`¿Cancelar el pedido #${o.number}? Se notificará al cliente.`)) return;
    setBusy(o.id);
    try {
      const updated = await api<OrderView>(`/api/admin/orders/${o.id}`, { method: "PATCH", body: { status } });
      setOrders((list) => list.map((x) => (x.id === o.id ? { ...updated, customer: x.customer } : x)));
      if (view?.id === o.id) setView({ ...updated, customer: o.customer });
      toast.success(`#${o.number} → ${LABEL[status]}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-60 flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nº, cliente o email" className="pl-9" />
        </div>
        <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-44" aria-label="Filtrar por estado">
          <option value="">Todos los estados</option>
          <option value="ACTIVOS">Activos</option>
          {STATUSES.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
        </Select>
        <Button variant="ghost" size="icon" onClick={refresh} aria-label="Actualizar"><RefreshCw /></Button>
      </div>

      <div className="glass overflow-x-auto rounded-2xl">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-muted">
            <tr className="border-b border-white/5">
              <th className="p-4">ID</th><th className="p-4">Cliente</th><th className="p-4">Productos</th><th className="p-4 text-right">Total</th><th className="p-4">Estado</th><th className="p-4">Fecha</th><th className="p-4">Dirección</th><th className="p-4 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {list.map((o) => (
              <tr key={o.id} className={cn("hover:bg-white/[0.02]", busy === o.id && "opacity-50")}>
                <td className="p-4 font-medium">#{o.number}</td>
                <td className="p-4">
                  <div>{o.customer.name}</div>
                  <div className="text-xs text-muted">{o.customer.email}</div>
                </td>
                <td className="max-w-56 p-4 text-muted"><span className="line-clamp-2">{o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</span></td>
                <td className="p-4 text-right font-medium tabular-nums">{formatCents(o.totalCents)}</td>
                <td className="p-4">
                  {o.status === "ENTREGADO" || o.status === "CANCELADO" ? (
                    <Badge variant={STATUS_VARIANT[o.status]}>{o.statusLabel}</Badge>
                  ) : (
                    <Select value={o.status} onChange={(e) => setStatus(o, e.target.value)} className="h-9 w-36 text-xs" aria-label="Cambiar estado">
                      {STATUSES.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
                    </Select>
                  )}
                </td>
                <td className="whitespace-nowrap p-4 text-muted">{formatDate(o.createdAt)}</td>
                <td className="max-w-48 p-4 text-xs text-muted"><span className="line-clamp-2">{o.address?.text ?? "—"}</span></td>
                <td className="p-4">
                  <div className="flex justify-end gap-1">
                    <Button size="icon-sm" variant="ghost" onClick={() => setView(o)} aria-label="Ver"><Eye /></Button>
                    {!["ENTREGADO", "CANCELADO"].includes(o.status) && (
                      <Button size="icon-sm" variant="ghost" className="hover:text-danger" onClick={() => setStatus(o, "CANCELADO")} aria-label="Cancelar"><XCircle /></Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <p className="p-10 text-center text-muted">No hay pedidos con este filtro.</p>}
      </div>

      <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)}>
        <DialogContent>
          {view && (
            <>
              <DialogTitle>Pedido #{view.number}</DialogTitle>
              <DialogDescription>{view.customer.name} · {formatDate(view.createdAt, { year: "numeric" })} · {view.payment?.method}</DialogDescription>
              <div className="mt-4"><OrderTracker order={view} /></div>
              <div className="mt-4">
                <div className="mb-2 text-xs uppercase tracking-wider text-muted">Contactar cliente</div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" asChild><a href={`mailto:${view.customer.email}?subject=Tu pedido %23${view.number}`}><Mail /> Email</a></Button>
                  {view.customer.phone && (
                    <>
                      <Button size="sm" variant="outline" asChild><a href={`tel:${view.customer.phone.replace(/\s/g, "")}`}><Phone /> Llamar</a></Button>
                      <Button size="sm" variant="outline" asChild><a href={`https://wa.me/${view.customer.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hola ${view.customer.name}, te escribimos por tu pedido #${view.number}.`)}`} target="_blank" rel="noreferrer"><MessageCircle /> WhatsApp</a></Button>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
