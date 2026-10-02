"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ProductOption, ProductView } from "@/lib/services/catalog";
import { api } from "@/lib/client/api";
import { formatCents, toCents } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ProductImage } from "@/components/shop/product-image";

type P = ProductView & { rawAvailable: boolean };
type Cat = { id: string; name: string; slug: string };

type Form = {
  name: string;
  description: string;
  price: string;
  categoryId: string;
  imageUrl: string;
  stock: string;
  available: boolean;
  ingredients: string;
  allergens: string;
  tags: string;
  synonyms: string;
  isCombo: boolean;
  isOffer: boolean;
  isFeatured: boolean;
  variants: { id?: string; name: string; price: string; isDefault: boolean }[];
  options: { id: string; name: string; type: "remove" | "extra"; price: string }[];
};

const toForm = (p: P | null, cats: Cat[]): Form =>
  p
    ? {
        name: p.name,
        description: p.description,
        price: (p.priceCents / 100).toFixed(2).replace(".", ","),
        categoryId: p.category.id,
        imageUrl: p.imageUrl ?? "",
        stock: p.stock === null ? "" : String(p.stock),
        available: p.rawAvailable,
        ingredients: p.ingredients.join(", "),
        allergens: p.allergens.join(", "),
        tags: p.tags.join(", "),
        synonyms: p.synonyms.join(", "),
        isCombo: p.isCombo,
        isOffer: p.isOffer,
        isFeatured: p.isFeatured,
        variants: p.variants.map((v) => ({ id: v.id, name: v.name, price: (v.priceCents / 100).toFixed(2).replace(".", ","), isDefault: v.isDefault })),
        options: p.options.map((o) => ({ id: o.id, name: o.name, type: o.type, price: (o.priceCents / 100).toFixed(2).replace(".", ",") })),
      }
    : { name: "", description: "", price: "", categoryId: cats[0]?.id ?? "", imageUrl: "", stock: "", available: true, ingredients: "", allergens: "", tags: "", synonyms: "", isCombo: false, isOffer: false, isFeatured: false, variants: [], options: [] };

export function ProductsManager({ initial, categories }: { initial: P[]; categories: Cat[] }) {
  const router = useRouter();
  const [products, setProducts] = useState(initial);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [editing, setEditing] = useState<P | "new" | null>(null);
  const [form, setForm] = useState<Form>(toForm(null, categories));
  const [saving, setSaving] = useState(false);

  const list = useMemo(() => products.filter((p) => (!cat || p.category.id === cat) && (!q || p.name.toLowerCase().includes(q.toLowerCase()))), [products, q, cat]);

  const open = (p: P | "new") => {
    setEditing(p);
    setForm(toForm(p === "new" ? null : p, categories));
  };

  const reload = () => {
    router.refresh();
    setTimeout(() => window.location.reload(), 300);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        name: form.name,
        description: form.description,
        priceCents: toCents(form.price || "0"),
        categoryId: form.categoryId,
        imageUrl: form.imageUrl || null,
        stock: form.stock === "" ? null : Number(form.stock),
        available: form.available,
        ingredients: form.ingredients,
        allergens: form.allergens,
        tags: form.tags,
        synonyms: form.synonyms,
        isCombo: form.isCombo,
        isOffer: form.isOffer,
        isFeatured: form.isFeatured,
        variants: form.variants.filter((v) => v.name).map((v) => ({ id: v.id, name: v.name, priceCents: toCents(v.price || "0"), isDefault: v.isDefault })),
        options: form.options.filter((o) => o.name).map((o) => ({ id: o.id, name: o.name, type: o.type, priceCents: toCents(o.price || "0") })) satisfies ProductOption[],
      };
      if (editing === "new") await api("/api/admin/products", { method: "POST", body });
      else if (editing) await api(`/api/admin/products/${editing.id}`, { method: "PATCH", body });
      toast.success("Producto guardado");
      setEditing(null);
      reload();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (p: P) => {
    await api(`/api/admin/products/${p.id}`, { method: "PATCH", body: { available: !p.rawAvailable } });
    setProducts((l) => l.map((x) => (x.id === p.id ? { ...x, rawAvailable: !p.rawAvailable, available: !p.rawAvailable } : x)));
  };

  const remove = async (p: P) => {
    if (!confirm(`¿Eliminar ${p.name}?`)) return;
    const r = await api<{ archived?: boolean }>(`/api/admin/products/${p.id}`, { method: "DELETE" });
    if (r.archived) {
      toast("Tiene pedidos asociados: se ha desactivado en lugar de eliminarse.");
      setProducts((l) => l.map((x) => (x.id === p.id ? { ...x, rawAvailable: false, available: false } : x)));
    } else {
      toast.success("Producto eliminado");
      setProducts((l) => l.filter((x) => x.id !== p.id));
    }
  };

  const text = (k: keyof Form) => ({ value: form[k] as string, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value }) });

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-60 flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto" className="pl-9" />
        </div>
        <Select value={cat} onChange={(e) => setCat(e.target.value)} className="w-48" aria-label="Categoría">
          <option value="">Todas las categorías</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Button variant="primary" className="ml-auto" onClick={() => open("new")}><Plus /> Crear producto</Button>
      </div>

      <div className="glass overflow-x-auto rounded-2xl">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-muted">
            <tr className="border-b border-white/5">
              <th className="p-4">Producto</th><th className="p-4">Categoría</th><th className="p-4 text-right">Precio</th><th className="p-4 text-right">Stock</th><th className="p-4">Etiquetas</th><th className="p-4">Activo</th><th className="p-4 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {list.map((p) => (
              <tr key={p.id} className="hover:bg-white/[0.02]">
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <ProductImage src={p.imageUrl} alt={p.name} category={p.category.slug} className="size-10 shrink-0 rounded-lg" emojiClass="text-lg" />
                    <div>
                      <div className="font-medium">{p.name}</div>
                      {p.variants.length > 1 && <div className="text-xs text-muted">{p.variants.map((v) => v.name).join(" · ")}</div>}
                    </div>
                  </div>
                </td>
                <td className="p-4 text-muted">{p.category.name}</td>
                <td className="p-4 text-right tabular-nums">{formatCents(p.variants[0]?.priceCents ?? p.priceCents)}</td>
                <td className="p-4 text-right tabular-nums text-muted">{p.stock ?? "∞"}</td>
                <td className="p-4">
                  <div className="flex flex-wrap gap-1">
                    {p.isOffer && <Badge variant="warning">Oferta</Badge>}
                    {p.isCombo && <Badge variant="violet">Combo</Badge>}
                    {p.isFeatured && <Badge variant="electric">Destacado</Badge>}
                  </div>
                </td>
                <td className="p-4"><Switch checked={p.rawAvailable} onCheckedChange={() => toggle(p)} aria-label="Activar/desactivar" /></td>
                <td className="p-4">
                  <div className="flex justify-end gap-1">
                    <Button size="icon-sm" variant="ghost" onClick={() => open(p)} aria-label="Editar"><Pencil /></Button>
                    <Button size="icon-sm" variant="ghost" className="hover:text-danger" onClick={() => remove(p)} aria-label="Eliminar"><Trash2 /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogTitle>{editing === "new" ? "Crear producto" : "Editar producto"}</DialogTitle>
          <form onSubmit={save} className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label>Nombre</Label><Input required {...text("name")} /></div>
            <div className="sm:col-span-2"><Label>Descripción</Label><Textarea required {...text("description")} /></div>
            <div><Label>Precio (€)</Label><Input required inputMode="decimal" placeholder="9,90" {...text("price")} /></div>
            <div>
              <Label>Categoría</Label>
              <Select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
            <div><Label>Imagen (URL)</Label><Input placeholder="https://…" {...text("imageUrl")} /></div>
            <div><Label>Stock (vacío = ilimitado)</Label><Input inputMode="numeric" {...text("stock")} /></div>
            <div className="sm:col-span-2"><Label>Ingredientes (separados por comas)</Label><Input {...text("ingredients")} /></div>
            <div><Label>Alérgenos</Label><Input placeholder="gluten, lácteos" {...text("allergens")} /></div>
            <div><Label>Etiquetas</Label><Input placeholder="hamburguesa, pollo, picante" {...text("tags")} /></div>
            <div className="sm:col-span-2"><Label>Sinónimos para voz</Label><Input placeholder="burger, hamburguesa de pollo" {...text("synonyms")} /></div>

            <div className="sm:col-span-2">
              <div className="mb-2 flex items-center justify-between"><Label className="mb-0">Variantes</Label>
                <Button type="button" size="sm" variant="ghost" onClick={() => setForm({ ...form, variants: [...form.variants, { name: "", price: "", isDefault: form.variants.length === 0 }] })}><Plus /> Variante</Button>
              </div>
              <div className="space-y-2">
                {form.variants.map((v, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input placeholder="Mediana" value={v.name} onChange={(e) => setForm({ ...form, variants: form.variants.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                    <Input placeholder="9,90" className="w-28" value={v.price} onChange={(e) => setForm({ ...form, variants: form.variants.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)) })} />
                    <label className="flex items-center gap-1 text-xs text-muted"><input type="radio" name="defv" checked={v.isDefault} onChange={() => setForm({ ...form, variants: form.variants.map((x, j) => ({ ...x, isDefault: j === i })) })} /> Def.</label>
                    <Button type="button" size="icon-sm" variant="ghost" onClick={() => setForm({ ...form, variants: form.variants.filter((_, j) => j !== i) })} aria-label="Quitar"><Trash2 /></Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="sm:col-span-2">
              <div className="mb-2 flex items-center justify-between"><Label className="mb-0">Opciones (quitar / extras)</Label>
                <Button type="button" size="sm" variant="ghost" onClick={() => setForm({ ...form, options: [...form.options, { id: `opt-${Date.now()}`, name: "", type: "extra", price: "0" }] })}><Plus /> Opción</Button>
              </div>
              <div className="space-y-2">
                {form.options.map((o, i) => (
                  <div key={o.id} className="flex items-center gap-2">
                    <Select className="w-28" value={o.type} onChange={(e) => setForm({ ...form, options: form.options.map((x, j) => (j === i ? { ...x, type: e.target.value as "remove" | "extra" } : x)) })}>
                      <option value="extra">Extra</option><option value="remove">Quitar</option>
                    </Select>
                    <Input placeholder="Queso extra" value={o.name} onChange={(e) => setForm({ ...form, options: form.options.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                    <Input placeholder="1,00" className="w-24" value={o.price} onChange={(e) => setForm({ ...form, options: form.options.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)) })} />
                    <Button type="button" size="icon-sm" variant="ghost" onClick={() => setForm({ ...form, options: form.options.filter((_, j) => j !== i) })} aria-label="Quitar"><Trash2 /></Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-5 sm:col-span-2">
              {([["available", "Disponible"], ["isOffer", "Oferta"], ["isCombo", "Combo"], ["isFeatured", "Destacado"]] as const).map(([k, l]) => (
                <label key={k} className="flex items-center gap-2 text-sm"><Switch checked={form[k]} onCheckedChange={(v) => setForm({ ...form, [k]: v })} /> {l}</label>
              ))}
            </div>
            <Button type="submit" variant="primary" size="lg" loading={saving} className="sm:col-span-2">Guardar producto</Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
