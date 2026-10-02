"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/client/api";
import type { CartView } from "@/lib/services/cart";
import { useCortanaActions } from "@/components/cortana/cortana-provider";
import { useCortana } from "@/lib/stores/cortana-store";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

/** "Repetir pedido": CORTANA prepara el carrito y pide confirmación por voz/texto. */
export function RepeatOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const { setCart } = useCortanaActions();
  const addMessage = useCortana((s) => s.addMessage);
  const [loading, setLoading] = useState(false);
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={loading}
      onClick={async () => {
        setLoading(true);
        try {
          const r = await api<{ orderNumber: number; unavailable: string[]; cart: CartView }>(`/api/orders/${orderId}/repeat`, { method: "POST" });
          setCart(r.cart);
          addMessage({
            role: "assistant",
            content: `He preparado tu carrito con el pedido #${r.orderNumber}.${r.unavailable.length ? ` ${r.unavailable.join(", ")} ya no está disponible.` : ""} Revísalo y confírmalo cuando quieras.`,
          });
          toast.success("Carrito preparado");
          router.push("/carrito");
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setLoading(false);
        }
      }}
    >
      <RotateCcw /> Repetir pedido
    </Button>
  );
}

export function CancelOrderButton({ orderId, number }: { orderId: string; number: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  return (
    <>
      <Button size="sm" variant="danger" onClick={() => setOpen(true)}>
        <XCircle /> Cancelar
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>¿Cancelar el pedido #{number}?</DialogTitle>
          <DialogDescription>Si ya se ha cobrado, se reembolsará el importe.</DialogDescription>
          <div className="mt-6 grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Mantener</Button>
            <Button
              variant="danger"
              loading={loading}
              onClick={async () => {
                setLoading(true);
                try {
                  await api(`/api/orders/${orderId}/cancel`, { method: "POST" });
                  toast.success("Pedido cancelado");
                  setOpen(false);
                  router.refresh();
                } catch (e) {
                  toast.error((e as Error).message);
                } finally {
                  setLoading(false);
                }
              }}
            >
              Sí, cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
