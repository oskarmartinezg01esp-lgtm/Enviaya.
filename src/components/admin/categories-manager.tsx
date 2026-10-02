"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

type Cat = { id: string; name: string; icon: string | null; description: string | null; active: boolean; count: number };

export function CategoriesManager({ initial }: { initial: Cat[] }) {
  const [list, setList] = useState(initial);
  const [editing, setEditing] = useState<Cat | "new" | null>(null);
  const [form, setForm] = useState({ name: "", icon: "", description: "" });

  const open = (c: Cat | "new") => {
    setEditing(c);
    setForm(c === "new" ? { name: "", icon: "", description: "" } : { name: c.name, icon: c.icon ?? "", description: c.description ?? "" });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing === "new") {
        const c = await api<Cat>("/api/admin/categories", { method: "POST", body: form });
        setList([...list, { ...c, count: 0 }]);
      } else if (editing) {
        await api(`/api/admin/categories/${editing.id}`, { method: "PATCH", body: form });
        setList(list.map((x) => (x.id === editing.id ? { ...x, ...form } : x)));
      }
      toast.success("Categoría guardada");
      setEditing(null);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const move = async (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
    await api("/api/admin/categories/reorder", { method: "POST", body: { ids: next.map((c) => c.id) } });
  };

  const remove = async (c: Cat) => {
    if (!confirm(`¿Eliminar ${c.name}?`)) return;
    try {
      await api(`/api/admin/categories/${c.id}`, { method: "DELETE" });
      setList(list.filter((x) => x.id !== c.id));
      toast.success("Categoría eliminada");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button variant="primary" onClick={() => open("new")}><Plus /> Crear categoría</Button>
      </div>
      <ul className="space-y-2">
        {list.map((c, i) => (
          <li key={c.id} className="glass flex items-center gap-3 rounded-2xl p-3 sm:p-4">
            <div className="flex flex-col">
              <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-0.5 text-muted hover:text-ink disabled:opacity-20" aria-label="Subir"><ArrowUp className="size-4" /></button>
              <button onClick={() => move(i, 1)} disabled={i === list.length - 1} className="rounded p-0.5 text-muted hover:text-ink disabled:opacity-20" aria-label="Bajar"><ArrowDown className="size-4" /></button>
            </div>
            <span className="text-2xl">{c.icon ?? "📦"}</span>
            <div className="min-w-0 flex-1">
              <div className="font-medium">{c.name}</div>
              <div className="text-xs text-muted">{c.count} productos</div>
            </div>
            <Switch
              checked={c.active}
              onCheckedChange={async (v) => {
                await api(`/api/admin/categories/${c.id}`, { method: "PATCH", body: { active: v } });
                setList(list.map((x) => (x.id === c.id ? { ...x, active: v } : x)));
              }}
              aria-label="Activa"
            />
            <Button size="icon-sm" variant="ghost" onClick={() => open(c)} aria-label="Editar"><Pencil /></Button>
            <Button size="icon-sm" variant="ghost" className="hover:text-danger" onClick={() => remove(c)} aria-label="Eliminar"><Trash2 /></Button>
          </li>
        ))}
      </ul>
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogTitle>{editing === "new" ? "Crear categoría" : "Editar categoría"}</DialogTitle>
          <form onSubmit={save} className="mt-5 grid gap-4">
            <div className="grid grid-cols-[80px_1fr] gap-3">
              <div><Label>Icono</Label><Input value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} placeholder="🍔" /></div>
              <div><Label>Nombre</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            </div>
            <div><Label>Descripción</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <Button type="submit" variant="primary" size="lg">Guardar</Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
