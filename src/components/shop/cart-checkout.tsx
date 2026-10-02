"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CreditCard, MapPin, ShoppingCart, Trash2, Mic, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useCortana } from "@/lib/stores/cortana-store";
import { useCortanaActions } from "@/components/cortana/cortana-provider";
import { api } from "@/lib/client/api";
import type { CartView } from "@/lib/services/cart";
import type { OrderView } from "@/lib/services/orders";
import { formatCents } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, Textarea, Label } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { CartLines } from "./cart-panel";

type Opt = { id: string; label: string; isDefault: boolean };

export function CartCheckout({ addresses, methods }: { addresses: (Opt & { text: string })[]; methods: Opt[] }) {
  const cart = useCortana((s) => s.cart);
  const { setCart, startVoice } = useCortanaActions();
  const router = useRouter();
  const [addressId, setAddressId] = useState("");
  const [methodId, setMethodId] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState<{ order: OrderView; paymentLabel: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setAddressId(cart?.addressId ?? addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? "");
    setMethodId(cart?.paymentMethodId ?? methods.find((m) => m.isDefault)?.id ?? methods[0]?.id ?? "");
    setNotes(cart?.notes ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart?.id]);

  if (!cart || cart.items.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingCart />}
        title="Tu carrito está vacío"
        description="Pídele a CORTANA lo que te apetece o explora el catálogo."
        action={
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => void startVoice()}>
              <Mic /> Hablar con CORTANA
            </Button>
            <Button variant="outline" asChild>
              <Link href="/catalogo">Ver catálogo</Link>
            </Button>
          </div>
        }
      />
    );
  }

  const prepare = async () => {
    setLoading(true);
    try {
      setPending(await api("/api/cart/checkout", { method: "POST", body: { addressId: addressId || undefined, paymentMethodId: methodId || undefined, notes } }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const confirm = async () => {
    if (!pending) return;
    setLoading(true);
    try {
      const order = await api<OrderView>(`/api/orders/${pending.order.id}/confirm`, { method: "POST" });
      setCart(await api<CartView>("/api/cart"));
      toast.success(`Pedido #${order.number} confirmado`);
      setPending(null);
      router.push(`/pedidos/${order.id}`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const clear = async () => {
    setCart(await api<CartView>("/api/cart", { method: "DELETE" }));
    toast("Carrito vaciado");
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm text-muted">{cart.itemCount} productos</span>
          <Button size="sm" variant="ghost" onClick={clear} className="text-muted hover:text-danger">
            <Trash2 /> Vaciar carrito
          </Button>
        </div>
        <CartLines />
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><MapPin className="size-4 text-cyan" /> Entrega</CardTitle>
          </CardHeader>
          <CardContent>
            {addresses.length ? (
              <Select value={addressId} onChange={(e) => setAddressId(e.target.value)} aria-label="Dirección">
                {addresses.map((a) => (
                  <option key={a.id} value={a.id}>{a.label} — {a.text}</option>
                ))}
              </Select>
            ) : (
              <Button variant="outline" asChild className="w-full"><Link href="/direcciones">Añadir dirección</Link></Button>
            )}
            <Label className="mt-4">Instrucciones especiales</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej.: llamar al llegar, sin cubiertos…" maxLength={200} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CreditCard className="size-4 text-cyan" /> Pago</CardTitle>
          </CardHeader>
          <CardContent>
            {methods.length ? (
              <Select value={methodId} onChange={(e) => setMethodId(e.target.value)} aria-label="Método de pago">
                {methods.map((m) => (
                  <option key={m.id} value={m.id}>{m.label.charAt(0).toUpperCase() + m.label.slice(1)}</option>
                ))}
              </Select>
            ) : (
              <Button variant="outline" asChild className="w-full"><Link href="/pagos">Añadir método de pago</Link></Button>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex justify-between text-sm text-muted"><span>Subtotal</span><span>{formatCents(cart.subtotalCents)}</span></div>
            <div className="mt-1 flex justify-between text-sm text-muted"><span>Envío</span><span>{cart.deliveryFeeCents ? formatCents(cart.deliveryFeeCents) : "Gratis"}</span></div>
            <div className="mt-3 flex justify-between font-display text-xl font-semibold"><span>Total</span><span>{formatCents(cart.totalCents)}</span></div>
            <Button variant="primary" size="lg" className="mt-4 w-full" loading={loading} onClick={prepare} disabled={!addresses.length || !methods.length}>
              Revisar y pedir
            </Button>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent>
          {pending && (
            <>
              <DialogTitle>¿Confirmas el pedido?</DialogTitle>
              <DialogDescription>Revisa el resumen. No se cobrará nada hasta que confirmes.</DialogDescription>
              <div className="mt-5 space-y-2 text-sm">
                {pending.order.items.map((i) => (
                  <div key={i.id} className="flex justify-between gap-2">
                    <span>{i.quantity}× {i.name}{i.variantName ? ` · ${i.variantName}` : ""}{i.modifiersLabel && <span className="block text-xs text-muted">{i.modifiersLabel}</span>}</span>
                    <span>{formatCents(i.subtotalCents)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-white/10 pt-3 font-display text-lg font-semibold"><span>Total</span><span>{formatCents(pending.order.totalCents)}</span></div>
                <p className="text-xs text-muted">Entrega en {pending.order.address?.label}: {pending.order.address?.text}</p>
                <p className="text-xs text-muted">Pago con {pending.paymentLabel}</p>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => setPending(null)}>Volver</Button>
                <Button variant="primary" loading={loading} onClick={confirm}>
                  <ShieldCheck /> Confirmar pedido
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
