/** Utilidades para construir respuestas habladas naturales en español. */
import { formatCents } from "@/lib/money";
import { listJoin } from "@/lib/text";

const NUM: Record<number, string> = { 2: "dos", 3: "tres", 4: "cuatro", 5: "cinco", 6: "seis", 7: "siete", 8: "ocho", 9: "nueve", 10: "diez" };
const BRAND = /^(coca|fanta|pepsi|sprite|aquarius|nestea|red bull)/i;

export function spokenName(name: string): string {
  if (BRAND.test(name)) return name;
  return name.charAt(0).toLowerCase() + name.slice(1);
}

function article(name: string): string {
  const first = name.split(/[\s-]/)[0].toLowerCase();
  if (first === "agua") return "un";
  if (BRAND.test(name)) return "una";
  if (first.endsWith("as")) return "unas";
  if (first.endsWith("os") || first.endsWith("ts") || first.endsWith("es")) return "unos";
  if (first.endsWith("a")) return "una";
  return "un";
}

function pluralize(name: string): string {
  const [first, ...rest] = name.split(" ");
  if (/s$/i.test(first)) return name;
  const pl = /[aeiou]$/i.test(first) ? `${first}s` : first;
  return [pl, ...rest].join(" ");
}

/** (2, "Hamburguesa doble") -> "dos hamburguesas doble"; (1, "Patatas fritas") -> "unas patatas fritas" */
export function quantityPhrase(q: number, name: string, extra?: string | null): string {
  const n = spokenName(name);
  const base = q === 1 ? `${article(name)} ${n}` : `${NUM[q] ?? q} ${pluralize(n)}`;
  return extra ? `${base} ${extra}` : base;
}

export function itemsPhrase(items: { quantity: number; name: string; variantName?: string | null; modifiersLabel?: string | null }[]) {
  return listJoin(
    items.map((i) => {
      const v = i.variantName && !/^(normal|mediana|unica)$/i.test(i.variantName) ? ` ${i.variantName.toLowerCase()}` : "";
      const m = i.modifiersLabel ? ` ${i.modifiersLabel}` : "";
      return quantityPhrase(i.quantity, i.name) + v + m;
    }),
  );
}

export function price(cents: number) {
  return formatCents(cents);
}

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
