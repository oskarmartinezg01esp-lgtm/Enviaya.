"use client";

import Link from "next/link";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useCortana } from "@/lib/stores/cortana-store";
import { useCortanaActions } from "@/components/cortana/cortana-provider";
import { api } from "@/lib/client/api";
import type { CartView } from "@/lib/services/cart";
import { formatCents } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { ProductImage } from "./product-image";
import { cn } from "@/lib/utils";

export function CartLines({ editable = true, dense = false }: { editable?: boolean; dense?: boolean }) {
  const cart = useCortana((s) => s.cart);
  const { setCart } = useCortanaActions();
  if (!cart || cart.items.length === 0) return null;

  const update = async (id: string, quantity: number) => {
    try {
      setCart(await api<CartView>(`/api/cart/items/${id}`, { method: "PATCH", body: { quantity } }));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <ul className="space-y-2.5">
      {cart.items.map((i) => (
        <li key={i.id} className={cn("flex gap-3 rounded-xl border border-white/5 bg-white/[0.02]", dense ? "p-2" : "p-3")}>
          <ProductImage src={i.imageUrl} alt={i.name} category={i.categorySlug} className={cn("shrink-0 rounded-lg", dense ? "size-11" : "size-16")} emojiClass={dense ? "text-xl" : "text-2xl"} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{i.name}</div>
                <div className="truncate text-xs text-muted">
                  {[i.variantName, i.modifiersLabel].filter(Boolean).join(" · ") || formatCents(i.unitCents)}
                </div>
              </div>
              <div className="text-sm font-medium">{formatCents(i.subtotalCents)}</div>
            </div>
            {editable && (
              <div className="mt-2 flex items-center gap-1.5">
                <Button size="icon-sm" variant="outline" aria-label="Quitar uno" onClick={() => update(i.id, i.quantity - 1)}>
                  <Minus />
                </Button>
                <span className="w-7 text-center text-sm tabular-nums">{i.quantity}</span>
                <Button size="icon-sm" variant="outline" aria-label="Añadir uno" onClick={() => update(i.id, i.quantity + 1)}>
                  <Plus />
                </Button>
                <Button size="icon-sm" variant="ghost" className="ml-auto text-muted hover:text-danger" aria-label="Eliminar" onClick={() => update(i.id, 0)}>
                  <Trash2 />
                </Button>
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Panel lateral de escritorio: carrito + contexto actual de CORTANA. */
export function CartSidePanel() {
  const cart = useCortana((s) => s.cart);
  const awaiting = useCortana((s) => s.awaitingConfirmation);
  const { send } = useCortanaActions();
  const empty = !cart || cart.items.length === 0;
  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-muted">Tu pedido</h2>
        {!empty && <span className="text-xs text-muted">{cart!.itemCount} productos</span>}
      </div>
      {empty ? (
        <div className="glass flex flex-1 flex-col items-center justify-center rounded-2xl p-6 text-center">
          <ShoppingBag className="mb-3 size-8 text-electric/70" />
          <p className="text-sm font-medium">Tu carrito está vacío</p>
          <p className="mt-1 text-xs text-muted">Dile a CORTANA qué te apetece: «Quiero una pizza barbacoa familiar».</p>
        </div>
      ) : (
        <>
          <div className="scrollbar-none -mx-1 flex-1 overflow-y-auto px-1">
            <CartLines dense />
          </div>
          <div className="glass mt-4 rounded-2xl p-4">
            <div className="flex justify-between text-sm text-muted">
              <span>Subtotal</span>
              <span>{formatCents(cart!.subtotalCents)}</span>
            </div>
            <div className="mt-1 flex justify-between text-sm text-muted">
              <span>Envío</span>
              <span>{cart!.deliveryFeeCents ? formatCents(cart!.deliveryFeeCents) : "Gratis"}</span>
            </div>
            <div className="mt-2 flex justify-between font-display text-lg font-semibold">
              <span>Total</span>
              <span>{formatCents(cart!.totalCents)}</span>
            </div>
            {awaiting ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => void send("No, todavía no", "ui")}>
                  Ahora no
                </Button>
                <Button variant="primary" onClick={() => void send("Sí, confirmar", "ui")}>
                  Confirmar
                </Button>
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="outline" asChild>
                  <Link href="/carrito">Ver carrito</Link>
                </Button>
                <Button variant="primary" onClick={() => void send("Quiero hacer el pedido", "ui")}>
                  Pedir
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
