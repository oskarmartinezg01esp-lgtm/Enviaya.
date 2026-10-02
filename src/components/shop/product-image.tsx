import { cn } from "@/lib/utils";

const CATEGORY_STYLE: Record<string, { emoji: string; from: string; to: string }> = {
  hamburguesas: { emoji: "🍔", from: "#1b2a4a", to: "#3a1f5c" },
  pizzas: { emoji: "🍕", from: "#2b1d3f", to: "#0b3a5c" },
  pollo: { emoji: "🍗", from: "#1f2f4f", to: "#3b2a5a" },
  asiatica: { emoji: "🍜", from: "#102a43", to: "#2d1b4e" },
  ensaladas: { emoji: "🥗", from: "#0e2f3a", to: "#16324f" },
  acompanamientos: { emoji: "🍟", from: "#1d2a46", to: "#33204f" },
  combos: { emoji: "🍱", from: "#0b2e4f", to: "#3b1d63" },
  bebidas: { emoji: "🥤", from: "#08304a", to: "#16245a" },
  postres: { emoji: "🍰", from: "#2a1f4a", to: "#0f2f50" },
};

/** Imagen del producto o, si no hay, una ilustración elegante por categoría. */
export function ProductImage({ src, alt, category, className, emojiClass }: { src?: string | null; alt: string; category: string; className?: string; emojiClass?: string }) {
  const s = CATEGORY_STYLE[category] ?? { emoji: "🍽️", from: "#102a43", to: "#2d1b4e" };
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} loading="lazy" className={cn("object-cover", className)} />;
  }
  return (
    <div
      role="img"
      aria-label={alt}
      className={cn("relative grid place-items-center overflow-hidden", className)}
      style={{ background: `radial-gradient(120% 90% at 30% 20%, ${s.from}, ${s.to})` }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_60%,rgba(0,229,255,0.18),transparent)]" />
      <span className={cn("relative drop-shadow-[0_8px_20px_rgba(0,175,255,0.35)]", emojiClass ?? "text-4xl")}>{s.emoji}</span>
    </div>
  );
}
