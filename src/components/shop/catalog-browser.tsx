"use client";

import { useMemo, useState } from "react";
import { Search, Plus, Minus, Flame, Star, Tag } from "lucide-react";
import { toast } from "sonner";
import type { ProductView } from "@/lib/services/catalog";
import type { CartView } from "@/lib/services/cart";
import { formatCents } from "@/lib/money";
import { api } from "@/lib/client/api";
import { useCortanaActions } from "@/components/cortana/cortana-provider";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ProductImage } from "./product-image";
import { normalize } from "@/lib/text";
import { cn } from "@/lib/utils";

const VIRTUAL = [
  { slug: "todo", name: "Todo", icon: "✨" },
  { slug: "mas-vendidos", name: "Más vendidos", icon: "🔥" },
  { slug: "recomendados", name: "Recomendados", icon: "⭐" },
  { slug: "ofertas", name: "Ofertas", icon: "🏷️" },
];

const fromPrice = (p: ProductView) => (p.variants.find((v) => v.isDefault) ?? p.variants[0])?.priceCents ?? p.priceCents;

export function CatalogBrowser({ products, categories }: { products: ProductView[]; categories: { slug: string; name: string; icon: string | null }[] }) {
  const [filter, setFilter] = useState("todo");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ProductView | null>(null);

  const list = useMemo(() => {
    let l = products;
    if (filter === "mas-vendidos") l = [...l].sort((a, b) => b.popularity - a.popularity).slice(0, 12);
    else if (filter === "recomendados") l = l.filter((p) => p.isFeatured || p.isCombo);
    else if (filter === "ofertas") l = l.filter((p) => p.isOffer);
    else if (filter !== "todo") l = l.filter((p) => p.category.slug === filter);
    if (query.trim()) {
      const q = normalize(query);
      l = l.filter((p) => normalize(`${p.name} ${p.description} ${p.tags.join(" ")} ${p.ingredients.join(" ")}`).includes(q));
    }
    return l;
  }, [products, filter, query]);

  return (
    <>
      <div className="relative mb-4">
        <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar hamburguesas, pizza, sin gluten…" className="pl-10" />
      </div>
      <div className="scrollbar-none -mx-4 mb-6 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        {[...VIRTUAL, ...categories].map((c) => (
          <button
            key={c.slug}
            onClick={() => setFilter(c.slug)}
            className={cn(
              "shrink-0 rounded-full border px-4 py-2 text-sm transition",
              filter === c.slug ? "border-electric/50 bg-electric/15 text-ink" : "border-white/10 bg-white/[0.03] text-muted hover:text-ink",
            )}
          >
            <span className="mr-1.5">{c.icon}</span>
            {c.name}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <p className="py-16 text-center text-muted">No hay productos con ese filtro.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
          {list.map((p) => (
            <button key={p.id} onClick={() => setSelected(p)} className={cn("glass group overflow-hidden rounded-2xl text-left transition hover:border-electric/30", !p.available && "opacity-50")}>
              <div className="relative">
                <ProductImage src={p.imageUrl} alt={p.name} category={p.category.slug} className="aspect-[4/3] w-full transition duration-500 group-hover:scale-105" emojiClass="text-5xl" />
                <div className="absolute left-2 top-2 flex gap-1">
                  {p.isOffer && <Badge variant="warning"><Tag className="size-3" /> Oferta</Badge>}
                  {p.popularity >= 85 && <Badge variant="electric"><Flame className="size-3" /> Top</Badge>}
                  {p.isFeatured && !p.isOffer && p.popularity < 85 && <Badge variant="violet"><Star className="size-3" /></Badge>}
                </div>
              </div>
              <div className="p-3 sm:p-4">
                <div className="line-clamp-1 text-sm font-medium sm:text-[15px]">{p.name}</div>
                <div className="mt-1 line-clamp-2 min-h-8 text-xs text-muted">{p.description}</div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="font-semibold text-cyan">
                    {p.variants.length > 1 && <span className="text-xs font-normal text-muted">desde </span>}
                    {formatCents(fromPrice(p))}
                  </span>
                  {!p.available ? <Badge variant="muted">Agotado</Badge> : <span className="grid size-8 place-items-center rounded-lg bg-electric/15 text-cyan"><Plus className="size-4" /></span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <ProductDialog product={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function ProductDialog({ product, onClose }: { product: ProductView | null; onClose: () => void }) {
  const { setCart } = useCortanaActions();
  const [qty, setQty] = useState(1);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [remove, setRemove] = useState<string[]>([]);
  const [extra, setExtra] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setQty(1);
    setVariantId(null);
    setRemove([]);
    setExtra([]);
  };

  if (!product) return null;
  const variant = product.variants.find((v) => v.id === variantId) ?? product.variants.find((v) => v.isDefault) ?? product.variants[0];
  const extrasCents = product.options.filter((o) => o.type === "extra" && extra.includes(o.name)).reduce((s, o) => s + o.priceCents, 0);
  const unit = (variant?.priceCents ?? product.priceCents) + extrasCents;
  const toggle = (arr: string[], set: (v: string[]) => void, v: string) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const add = async () => {
    setLoading(true);
    try {
      const cart = await api<CartView>("/api/cart/items", {
        method: "POST",
        body: { productId: product.id, variantId: variant?.id, quantity: qty, remove: remove.map((r) => r.replace(/^Sin /i, "")), extra },
      });
      setCart(cart);
      toast.success(`${product.name} añadido al carrito`);
      reset();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={!!product} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-xl">
        <ProductImage src={product.imageUrl} alt={product.name} category={product.category.slug} className="-mx-6 -mt-6 mb-5 h-44 w-[calc(100%+3rem)] rounded-t-3xl" emojiClass="text-7xl" />
        <DialogTitle>{product.name}</DialogTitle>
        <DialogDescription>{product.description}</DialogDescription>

        {product.variants.length > 1 && (
          <div className="mt-5">
            <div className="mb-2 text-xs uppercase tracking-wider text-muted">Tamaño</div>
            <div className="flex flex-wrap gap-2">
              {product.variants.map((v) => (
                <button key={v.id} onClick={() => setVariantId(v.id)} className={cn("rounded-xl border px-4 py-2 text-sm", variant?.id === v.id ? "border-electric/60 bg-electric/15" : "border-white/10")}>
                  {v.name} · {formatCents(v.priceCents)}
                </button>
              ))}
            </div>
          </div>
        )}

        {product.options.length > 0 && (
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {(["remove", "extra"] as const).map((type) => {
              const opts = product.options.filter((o) => o.type === type);
              if (!opts.length) return null;
              const arr = type === "remove" ? remove : extra;
              const set = type === "remove" ? setRemove : setExtra;
              return (
                <div key={type}>
                  <div className="mb-2 text-xs uppercase tracking-wider text-muted">{type === "remove" ? "Quitar" : "Extras"}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {opts.map((o) => (
                      <button key={o.id} onClick={() => toggle(arr, set, o.name)} className={cn("rounded-lg border px-2.5 py-1.5 text-xs", arr.includes(o.name) ? "border-electric/60 bg-electric/15 text-ink" : "border-white/10 text-muted")}>
                        {o.name}
                        {o.priceCents ? ` +${formatCents(o.priceCents)}` : ""}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-5 grid gap-1 text-xs text-muted">
          {product.ingredients.length > 0 && <p><b className="text-ink/80">Ingredientes:</b> {product.ingredients.join(", ")}</p>}
          <p><b className="text-ink/80">Alérgenos:</b> {product.allergens.length ? product.allergens.join(", ") : "ninguno declarado"}</p>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-xl border border-white/10 p-1">
            <Button size="icon-sm" variant="ghost" onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Menos"><Minus /></Button>
            <span className="w-8 text-center tabular-nums">{qty}</span>
            <Button size="icon-sm" variant="ghost" onClick={() => setQty(Math.min(20, qty + 1))} aria-label="Más"><Plus /></Button>
          </div>
          <Button variant="primary" className="flex-1" size="lg" loading={loading} disabled={!product.available} onClick={add}>
            Añadir · {formatCents(unit * qty)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
