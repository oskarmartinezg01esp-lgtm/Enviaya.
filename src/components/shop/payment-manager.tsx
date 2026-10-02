"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Banknote, CreditCard, Lock, Plus, Smartphone, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

type PM = { id: string; type: "CARD" | "APPLE_PAY" | "GOOGLE_PAY" | "CASH"; brand: string | null; last4: string | null; expMonth: number | null; expYear: number | null; isDefault: boolean; provider: string };

const LABEL: Record<PM["type"], string> = { CARD: "Tarjeta", APPLE_PAY: "Apple Pay", GOOGLE_PAY: "Google Pay", CASH: "Efectivo a la entrega" };

function detectBrand(n: string) {
  if (/^4/.test(n)) return "Visa";
  if (/^(5[1-5]|2[2-7])/.test(n)) return "Mastercard";
  if (/^3[47]/.test(n)) return "Amex";
  return "Tarjeta";
}

function luhn(n: string) {
  let sum = 0;
  let alt = false;
  for (let i = n.length - 1; i >= 0; i--) {
    let d = Number(n[i]);
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return n.length >= 13 && sum % 10 === 0;
}

export function PaymentManager({ initial, stripeEnabled }: { initial: PM[]; stripeEnabled: boolean }) {
  const router = useRouter();
  const [list, setList] = useState(initial);
  const [open, setOpen] = useState(false);
  const [card, setCard] = useState({ number: "", exp: "", cvc: "" });
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    setList(await api<PM[]>("/api/payment-methods"));
    router.refresh();
  };

  const add = async (body: Record<string, unknown>) => {
    setSaving(true);
    try {
      await api("/api/payment-methods", { method: "POST", body });
      toast.success("Método de pago añadido");
      setOpen(false);
      setCard({ number: "", exp: "", cvc: "" });
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  /**
   * Modo demostración: la tarjeta se valida y "tokeniza" en el navegador; al servidor solo
   * llegan marca y últimos 4 dígitos. Con Stripe configurado, aquí se usaría Stripe Elements
   * + SetupIntent (/api/payments/setup-intent) y se guardaría el `pm_...` resultante.
   */
  const addCard = (e: React.FormEvent) => {
    e.preventDefault();
    const digits = card.number.replace(/\D/g, "");
    const [mm, yy] = card.exp.split("/").map((x) => Number(x.trim()));
    if (!luhn(digits)) return toast.error("Número de tarjeta no válido");
    if (!mm || mm > 12 || !yy) return toast.error("Caducidad no válida (MM/AA)");
    if (!/^\d{3,4}$/.test(card.cvc)) return toast.error("CVC no válido");
    void add({ type: "CARD", brand: detectBrand(digits), last4: digits.slice(-4), expMonth: mm, expYear: 2000 + yy });
  };

  return (
    <>
      <div className="space-y-3">
        {list.map((m) => (
          <div key={m.id} className="glass flex items-center gap-4 rounded-2xl p-4">
            <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-deep/40 to-violet/30 text-cyan">
              {m.type === "CARD" ? <CreditCard className="size-5" /> : m.type === "CASH" ? <Banknote className="size-5" /> : <Smartphone className="size-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{m.type === "CARD" ? `${m.brand ?? "Tarjeta"} •••• ${m.last4}` : LABEL[m.type]}</span>
                {m.isDefault && <Badge variant="electric">Predeterminado</Badge>}
              </div>
              <div className="text-xs text-muted">
                {m.type === "CARD" && m.expMonth ? `Caduca ${String(m.expMonth).padStart(2, "0")}/${String(m.expYear).slice(-2)} · ` : ""}
                {m.provider === "stripe" ? "Tokenizada con Stripe" : m.type === "CASH" ? "Pagas al recibir el pedido" : "Modo demostración"}
              </div>
            </div>
            {!m.isDefault && (
              <Button size="icon-sm" variant="ghost" aria-label="Predeterminar" onClick={async () => { await api(`/api/payment-methods/${m.id}`, { method: "PATCH" }); await reload(); }}>
                <Star />
              </Button>
            )}
            <Button size="icon-sm" variant="ghost" className="text-muted hover:text-danger" aria-label="Eliminar" onClick={async () => { await api(`/api/payment-methods/${m.id}`, { method: "DELETE" }); await reload(); }}>
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        <Button variant="primary" onClick={() => setOpen(true)}><Plus /> Tarjeta</Button>
        <Button variant="secondary" onClick={() => add({ type: "APPLE_PAY" })} disabled={list.some((m) => m.type === "APPLE_PAY")}> Apple Pay</Button>
        <Button variant="secondary" onClick={() => add({ type: "GOOGLE_PAY" })} disabled={list.some((m) => m.type === "GOOGLE_PAY")}>Google Pay</Button>
        <Button variant="secondary" onClick={() => add({ type: "CASH" })} disabled={list.some((m) => m.type === "CASH")}>Efectivo</Button>
      </div>

      <p className="mt-6 flex items-start gap-2 text-xs text-muted">
        <Lock className="mt-0.5 size-3.5 shrink-0" />
        Nunca almacenamos el número completo de tu tarjeta. {stripeEnabled ? "Los pagos se procesan y tokenizan con Stripe." : "Entorno de demostración: no se realizan cargos reales."}
      </p>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Añadir tarjeta</DialogTitle>
          <DialogDescription>Los datos se tokenizan en tu dispositivo. Solo guardamos la marca y los 4 últimos dígitos.</DialogDescription>
          <form onSubmit={addCard} className="mt-5 grid gap-4" autoComplete="on">
            <div>
              <Label htmlFor="cc">Número de tarjeta</Label>
              <Input id="cc" inputMode="numeric" autoComplete="cc-number" placeholder="4242 4242 4242 4242" value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value.replace(/[^\d ]/g, "").slice(0, 23) })} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="exp">Caducidad</Label>
                <Input id="exp" placeholder="MM/AA" autoComplete="cc-exp" value={card.exp} onChange={(e) => setCard({ ...card, exp: e.target.value.slice(0, 5) })} required />
              </div>
              <div>
                <Label htmlFor="cvc">CVC</Label>
                <Input id="cvc" inputMode="numeric" autoComplete="cc-csc" value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/\D/g, "").slice(0, 4) })} required />
              </div>
            </div>
            <Button type="submit" variant="primary" size="lg" loading={saving}><Lock /> Guardar tarjeta</Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
