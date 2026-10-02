"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, Home, MapPin, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Address } from "@prisma/client";
import { api } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

type Form = { label: string; line1: string; line2: string; city: string; postalCode: string; province: string; instructions: string; isDefault: boolean };
const EMPTY: Form = { label: "", line1: "", line2: "", city: "", postalCode: "", province: "", instructions: "", isDefault: false };

const iconFor = (label: string) => (/casa|hogar/i.test(label) ? Home : /trabajo|oficina/i.test(label) ? Briefcase : MapPin);

export function AddressManager({ initial }: { initial: Address[] }) {
  const router = useRouter();
  const [list, setList] = useState(initial);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    setList(await api<Address[]>("/api/addresses"));
    router.refresh();
  };

  const open = (a?: Address) => {
    setEditing(a ? a.id : "new");
    setForm(
      a
        ? { label: a.label, line1: a.line1, line2: a.line2 ?? "", city: a.city, postalCode: a.postalCode, province: a.province ?? "", instructions: a.instructions ?? "", isDefault: a.isDefault }
        : { ...EMPTY, label: list.length === 0 ? "Casa" : "" },
    );
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { ...form, line2: form.line2 || null, province: form.province || null, instructions: form.instructions || null };
      if (editing === "new") await api("/api/addresses", { method: "POST", body });
      else await api(`/api/addresses/${editing}`, { method: "PATCH", body });
      toast.success("Dirección guardada");
      setEditing(null);
      await reload();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("¿Eliminar esta dirección?")) return;
    await api(`/api/addresses/${id}`, { method: "DELETE" });
    toast("Dirección eliminada");
    await reload();
  };

  const makeDefault = async (id: string) => {
    await api(`/api/addresses/${id}`, { method: "PATCH", body: { isDefault: true } });
    await reload();
  };

  const f = (k: keyof Form) => ({ value: form[k] as string, onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value }) });

  return (
    <>
      {list.length === 0 ? (
        <EmptyState icon={<MapPin />} title="Sin direcciones" description="Añade dónde quieres recibir tus pedidos." action={<Button variant="primary" onClick={() => open()}><Plus /> Añadir dirección</Button>} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((a) => {
            const Icon = iconFor(a.label);
            return (
              <div key={a.id} className="glass rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-electric/10 text-cyan"><Icon className="size-5" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{a.label}</span>
                      {a.isDefault && <Badge variant="electric">Predeterminada</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-muted">{a.line1}{a.line2 ? `, ${a.line2}` : ""}</p>
                    <p className="text-sm text-muted">{a.postalCode} {a.city}</p>
                    {a.instructions && <p className="mt-1 text-xs text-muted/80">“{a.instructions}”</p>}
                  </div>
                </div>
                <div className="mt-4 flex gap-1.5">
                  {!a.isDefault && <Button size="sm" variant="ghost" onClick={() => makeDefault(a.id)}><Star /> Predeterminar</Button>}
                  <Button size="sm" variant="ghost" onClick={() => open(a)}><Pencil /> Editar</Button>
                  <Button size="sm" variant="ghost" className="ml-auto text-muted hover:text-danger" onClick={() => remove(a.id)} aria-label="Eliminar"><Trash2 /></Button>
                </div>
              </div>
            );
          })}
          <button onClick={() => open()} className="flex min-h-36 items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 text-sm text-muted transition hover:border-electric/40 hover:text-cyan">
            <Plus className="size-4" /> Añadir dirección
          </button>
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogTitle>{editing === "new" ? "Nueva dirección" : "Editar dirección"}</DialogTitle>
          <form onSubmit={save} className="mt-5 grid gap-4">
            <div>
              <Label htmlFor="label">Nombre</Label>
              <Input id="label" placeholder="Casa, Trabajo…" required {...f("label")} />
            </div>
            <div>
              <Label htmlFor="line1">Calle y número</Label>
              <Input id="line1" required autoComplete="address-line1" {...f("line1")} />
            </div>
            <div>
              <Label htmlFor="line2">Piso, puerta (opcional)</Label>
              <Input id="line2" autoComplete="address-line2" {...f("line2")} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="pc">Código postal</Label>
                <Input id="pc" required inputMode="numeric" autoComplete="postal-code" {...f("postalCode")} />
              </div>
              <div>
                <Label htmlFor="city">Ciudad</Label>
                <Input id="city" required autoComplete="address-level2" {...f("city")} />
              </div>
            </div>
            <div>
              <Label htmlFor="ins">Instrucciones para el repartidor</Label>
              <Input id="ins" placeholder="Portero 3B, timbre roto…" {...f("instructions")} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} className="size-4 accent-[#00AFFF]" />
              Usar como predeterminada
            </label>
            <Button type="submit" variant="primary" size="lg" loading={saving}>Guardar</Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
