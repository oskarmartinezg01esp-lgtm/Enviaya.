import { Check, Clock, MapPin, XCircle } from "lucide-react";
import type { OrderView } from "@/lib/services/orders";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export const STATUS_VARIANT: Record<string, "electric" | "violet" | "success" | "warning" | "danger" | "muted"> = {
  PENDIENTE: "muted",
  CONFIRMADO: "electric",
  PREPARANDO: "violet",
  LISTO: "warning",
  EN_CAMINO: "electric",
  ENTREGADO: "success",
  CANCELADO: "danger",
};

export function OrderTracker({ order, compact = false }: { order: OrderView; compact?: boolean }) {
  const cancelled = order.status === "CANCELADO";
  const current = order.steps.filter((s) => s.done).length - 1;
  return (
    <div className={cn("glass rounded-2xl", compact ? "p-4" : "p-5")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted">Pedido</div>
          <div className="font-display text-xl font-semibold">#{order.number}</div>
        </div>
        <Badge variant={STATUS_VARIANT[order.status]}>{order.statusLabel}</Badge>
      </div>
      {cancelled ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-danger">
          <XCircle className="size-4" /> Este pedido fue cancelado.
        </div>
      ) : (
        <ol className="mt-4 space-y-0">
          {order.steps.map((s, i) => (
            <li key={s.status} className="relative flex gap-3 pb-3 last:pb-0">
              {i < order.steps.length - 1 && (
                <span className={cn("absolute left-[11px] top-6 h-[calc(100%-12px)] w-px", s.done && order.steps[i + 1].done ? "bg-electric/60" : "bg-white/10")} />
              )}
              <span
                className={cn(
                  "relative z-10 grid size-6 shrink-0 place-items-center rounded-full border text-[10px]",
                  s.done ? "border-electric/50 bg-electric/20 text-cyan" : "border-white/15 bg-white/[0.03] text-muted",
                  i === current && "ring-4 ring-electric/15",
                )}
              >
                {s.done ? <Check className="size-3.5" /> : null}
              </span>
              <div className="flex flex-1 items-center justify-between gap-2 pt-0.5">
                <span className={cn("text-sm", s.done ? "text-ink" : "text-muted")}>{s.label}</span>
                {s.at && <span className="text-xs text-muted">{new Date(s.at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</span>}
              </div>
            </li>
          ))}
        </ol>
      )}
      {!cancelled && order.etaMinutes && (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-electric/10 px-3 py-2 text-sm text-cyan">
          <Clock className="size-4" /> Entrega estimada: {order.etaMinutes} minutos
        </div>
      )}
      {!compact && (
        <div className="mt-4 space-y-1.5 border-t border-white/5 pt-4 text-sm">
          {order.items.map((i) => (
            <div key={i.id} className="flex justify-between gap-2">
              <span className="text-muted">
                {i.quantity}× <span className="text-ink">{i.name}</span>
                {i.variantName ? ` · ${i.variantName}` : ""}
                {i.modifiersLabel && <span className="block text-xs text-muted/80">{i.modifiersLabel}</span>}
              </span>
              <span>{formatCents(i.subtotalCents)}</span>
            </div>
          ))}
          <div className="flex justify-between pt-2 font-semibold">
            <span>Total</span>
            <span>{formatCents(order.totalCents)}</span>
          </div>
          {order.address && (
            <div className="flex items-start gap-2 pt-2 text-xs text-muted">
              <MapPin className="mt-0.5 size-3.5 shrink-0" /> {order.address.label} · {order.address.text}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
