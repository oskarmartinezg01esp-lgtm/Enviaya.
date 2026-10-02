"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { motion } from "framer-motion";
import type { AssistantUI } from "@/lib/ai/local-engine";
import { formatCents } from "@/lib/money";
import { ProductImage } from "@/components/shop/product-image";
import { OrderTracker } from "@/components/shop/order-tracker";
import { Button } from "@/components/ui/button";
import { useCortanaActions } from "./cortana-provider";
import { useCortana } from "@/lib/stores/cortana-store";

/** Tarjetas de producto, seguimiento y confirmación que acompañan a una respuesta. */
export function AssistantExtras({ ui, interactive = true }: { ui: AssistantUI; interactive?: boolean }) {
  const { send } = useCortanaActions();
  const awaiting = useCortana((s) => s.awaitingConfirmation);
  return (
    <div className="space-y-3">
      {ui.products && ui.products.length > 0 && (
        <div className="scrollbar-none -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1">
          {ui.products.map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="glass w-40 shrink-0 snap-start overflow-hidden rounded-2xl"
            >
              <ProductImage src={p.imageUrl} alt={p.name} category={p.categorySlug} className="h-24 w-full" />
              <div className="p-3">
                <div className="line-clamp-2 min-h-9 text-[13px] font-medium leading-tight">{p.name}</div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-cyan">{formatCents(p.priceCents)}</span>
                  {interactive && p.available && (
                    <button
                      onClick={() => void send(`Añade ${p.name}`, "ui")}
                      className="grid size-7 place-items-center rounded-lg bg-electric/15 text-cyan transition hover:bg-electric/25"
                      aria-label={`Añadir ${p.name}`}
                    >
                      <Plus className="size-4" />
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
      {ui.order && (
        <div className="max-w-sm">
          <OrderTracker order={ui.order} compact />
          <Link href={`/pedidos/${ui.order.id}`} className="mt-2 inline-block text-xs text-cyan hover:underline">
            Ver detalle del pedido →
          </Link>
        </div>
      )}
      {interactive && ui.awaitingConfirmation && awaiting && (
        <div className="flex gap-2">
          <Button variant="primary" size="sm" onClick={() => void send("Sí, confirmar", "ui")}>
            Confirmar pedido
          </Button>
          <Button variant="outline" size="sm" onClick={() => void send("No, todavía no", "ui")}>
            Ahora no
          </Button>
        </div>
      )}
    </div>
  );
}
