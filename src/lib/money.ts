const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

/** 1490 -> "14,90 €" */
export function formatCents(cents: number): string {
  // Intl usa un espacio duro antes de "€"; lo normalizamos para TTS y tests.
  return eur.format(cents / 100).replace(/ /g, " ");
}

/** "14,90" | "14.90" | 14.9 -> 1490 */
export function toCents(value: string | number): number {
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(n)) throw new Error("Importe no válido");
  return Math.round(n * 100);
}
