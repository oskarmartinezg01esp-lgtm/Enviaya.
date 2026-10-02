/**
 * Extracción de productos, cantidades, tamaños y modificaciones a partir de lenguaje natural.
 *
 * "Quiero dos hamburguesas sin cebolla, una con queso extra"
 *   -> [{ alias: hamburguesa (genérico), quantity: 1, remove: [cebolla] },
 *       { alias: hamburguesa (genérico), quantity: 1, remove: [cebolla], extra: [queso extra] }]
 */
import { normalize, parseQuantityToken, sameWord } from "@/lib/text";

export type CatalogItem = {
  id: string;
  name: string;
  synonyms: string[];
  tags: string[];
  categorySlug: string;
  available: boolean;
  variants: { id: string; name: string }[];
};

/** Etiquetas descriptivas que NO funcionan como nombre de producto. */
const NON_NOUN_TAGS = new Set([
  "contundente", "oferta", "picante", "vegano", "vegana", "vegetariano", "vegetariana", "popular", "nuevo",
  "sin gluten", "compartir", "dulce", "frio", "caliente", "ligero", "saludable", "sin alcohol", "premium", "clasico",
  "infantil", "pollo",
]);

const STOP_BETWEEN = new Set(["de", "del", "la", "el", "con", "grande", "grandes", "mediana", "medianas", "familiar", "familiares", "pequena", "pequenas", "normal", "normales", "tamano", "sabor", "tipo"]);

type Alias = {
  tokens: string[];
  kind: "specific" | "generic";
  productIds: string[];
  label: string;
};

export type Mention = {
  kind: "specific" | "generic";
  label: string;
  productIds: string[]; // 1 si es específico; candidatos si es genérico
  start: number;
  end: number;
  quantity: number;
  explicitQuantity: boolean;
  variantHint: string | null;
  remove: string[];
  extra: string[];
};

const aliasCache = new WeakMap<CatalogItem[], Alias[]>();

export function buildAliases(catalog: CatalogItem[]): Alias[] {
  const cached = aliasCache.get(catalog);
  if (cached) return cached;
  const specific = new Map<string, Set<string>>();
  const generic = new Map<string, Set<string>>();
  const add = (map: Map<string, Set<string>>, phrase: string, id: string) => {
    const key = normalize(phrase);
    if (!key) return;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(id);
  };
  for (const p of catalog) {
    add(specific, p.name, p.id);
    for (const s of p.synonyms) add(specific, s, p.id);
    for (const t of p.tags) if (!NON_NOUN_TAGS.has(normalize(t))) add(generic, t, p.id);
  }
  const aliases: Alias[] = [];
  for (const [k, ids] of specific) {
    aliases.push({ tokens: k.split(" "), kind: ids.size === 1 ? "specific" : "generic", productIds: [...ids], label: k });
  }
  for (const [k, ids] of generic) {
    if (specific.has(k) && specific.get(k)!.size === 1) continue;
    aliases.push({ tokens: k.split(" "), kind: ids.size === 1 ? "specific" : "generic", productIds: [...ids], label: k });
  }
  aliasCache.set(catalog, aliases);
  return aliases;
}

/** Tokeniza conservando comas como separadores (útil para "..., una con queso"). */
function tokens(text: string): string[] {
  return normalize(text.replace(/(\D),|,(\D)/g, "$1 COMMA $2"))
    .split(" ")
    .map((t) => (t === "comma" ? "," : t))
    .filter(Boolean);
}

function matchAt(toks: string[], i: number, alias: Alias) {
  if (i + alias.tokens.length > toks.length) return false;
  for (let k = 0; k < alias.tokens.length; k++) if (!sameWord(toks[i + k], alias.tokens[k])) return false;
  return true;
}

const FILLER = new Set(["de", "del", "la", "el", "las", "los", "y", ","]);
const MOD_STOP = new Set(["con", "sin", "y", ",", "extra", "doble", "mas", "pero", "por", "favor", "porfa", "tambien", "ademas"]);

function findQuantity(toks: string[], from: number, to: number): { q: number; explicit: boolean } {
  // Busca hacia atrás (máx. 4 tokens) un número; "media docena" = 6
  for (let i = to - 1; i >= Math.max(from, to - 4); i--) {
    if (toks[i] === "docena" && toks[i - 1] === "media") return { q: 6, explicit: true };
    const q = parseQuantityToken(toks[i]);
    if (q !== null) return { q, explicit: true };
    if (toks[i] === ",") break;
  }
  return { q: 1, explicit: false };
}

const VARIANT_WORDS = ["grande", "grandes", "familiar", "familiares", "mediana", "medianas", "mediano", "pequena", "pequeno", "normal", "individual", "xl", "doble", "maxi", "33", "50", "litro"];

/** Extrae las menciones de producto y sus modificadores. */
export function parseMentions(text: string, catalog: CatalogItem[]): Mention[] {
  const toks = tokens(text);
  const aliases = buildAliases(catalog);
  type Raw = { start: number; end: number; alias: Alias };
  const raws: Raw[] = [];
  for (let i = 0; i < toks.length; i++) {
    for (const a of aliases) if (matchAt(toks, i, a)) raws.push({ start: i, end: i + a.tokens.length, alias: a });
  }
  // Selección voraz: más largas primero, específicas antes que genéricas
  raws.sort(
    (a, b) => b.end - b.start - (a.end - a.start) || (a.alias.kind === "specific" ? -1 : 1) - (b.alias.kind === "specific" ? -1 : 1) || a.start - b.start,
  );
  const taken: Raw[] = [];
  for (const r of raws) {
    // "salsa barbacoa" es un modificador, no la pizza barbacoa
    if (r.start > 0 && toks[r.start - 1] === "salsa") continue;
    if (!taken.some((t) => r.start < t.end && t.start < r.end)) taken.push(r);
  }
  taken.sort((a, b) => a.start - b.start);

  // Fusión: "pizza ... barbacoa" (genérico seguido de específico compatible) => específico
  const merged: Raw[] = [];
  for (let i = 0; i < taken.length; i++) {
    const cur = taken[i];
    const next = taken[i + 1];
    if (
      cur.alias.kind === "generic" &&
      next &&
      next.alias.kind === "specific" &&
      next.alias.productIds.every((id) => cur.alias.productIds.includes(id)) &&
      toks.slice(cur.end, next.start).every((t) => STOP_BETWEEN.has(t))
    ) {
      merged.push({ start: cur.start, end: next.end, alias: next.alias });
      i++;
      continue;
    }
    // "barbacoa pizza" o "coca cola zero refresco"
    if (
      cur.alias.kind === "specific" &&
      next &&
      next.alias.kind === "generic" &&
      cur.alias.productIds.every((id) => next.alias.productIds.includes(id)) &&
      next.start - cur.end <= 1
    ) {
      merged.push({ start: cur.start, end: next.end, alias: cur.alias });
      i++;
      continue;
    }
    merged.push(cur);
  }

  const mentions: Mention[] = [];
  merged.forEach((m, idx) => {
    const prevEnd = idx === 0 ? 0 : merged[idx - 1].end;
    const nextStart = idx === merged.length - 1 ? toks.length : merged[idx + 1].start;
    const { q, explicit } = findQuantity(toks, prevEnd, m.start);
    const region = toks.slice(Math.max(prevEnd, m.start - 3), nextStart);
    const variantHint = region.find((t) => VARIANT_WORDS.includes(t)) ?? null;

    const base: Mention = {
      kind: m.alias.kind,
      label: m.alias.label,
      productIds: m.alias.productIds,
      start: m.start,
      end: m.end,
      quantity: q,
      explicitQuantity: explicit,
      variantHint,
      remove: [],
      extra: [],
    };
    // Parseo de modificadores en la región posterior
    const post = toks.slice(m.end, nextStart);
    // Si el siguiente producto tiene cantidad propia, no la tratamos como sub-ítem
    const subs: { q: number; remove: string[]; extra: string[] }[] = [];
    let target: { remove: string[]; extra: string[] } = base;
    let mode: "remove" | "extra" | null = null;
    let phrase: string[] = [];
    const flush = () => {
      const ph = phrase.filter((w) => !FILLER.has(w)).join(" ").trim();
      if (ph && mode) target[mode].push(ph);
      phrase = [];
    };
    for (let k = 0; k < post.length; k++) {
      const t = post[k];
      const qn = parseQuantityToken(t);
      if (qn !== null && (post[k + 1] === "con" || post[k + 1] === "sin" || (post[k + 1] === "de" && post[k + 2] === "ellas"))) {
        flush();
        const sub = { q: qn, remove: [...base.remove], extra: [...base.extra] };
        subs.push(sub);
        target = sub;
        mode = null;
        continue;
      }
      if (t === "sin") {
        flush();
        mode = "remove";
        continue;
      }
      if (t === "con") {
        flush();
        mode = "extra";
        continue;
      }
      if ((t === "extra" || t === "doble") && post[k + 1] === "de") {
        flush();
        mode = "extra";
        phrase.push(t === "doble" ? "doble" : "extra");
        k++;
        continue;
      }
      if (t === "y" || t === ",") {
        flush();
        continue;
      }
      if (["por", "favor", "porfa", "porfavor", "tambien", "ademas", "gracias", "pero"].includes(t)) {
        flush();
        mode = null;
        continue;
      }
      if (mode) {
        if (VARIANT_WORDS.includes(t) && phrase.length === 0 && t !== "doble") continue;
        phrase.push(t);
        if (MOD_STOP.has(t) && t !== "extra" && t !== "doble") flush();
      }
    }
    flush();
    // los modificadores del principal se heredan por los sub-ítems definidos después
    if (subs.length) {
      let rest = base.quantity;
      for (const s of subs) {
        const sq = Math.min(s.q, Math.max(1, rest - 1));
        rest -= sq;
        mentions.push({ ...base, quantity: sq, explicitQuantity: true, remove: dedupe(s.remove), extra: dedupe(s.extra) });
      }
      if (rest > 0) mentions.splice(mentions.length - subs.length, 0, { ...base, quantity: rest, remove: dedupe(base.remove), extra: dedupe(base.extra) });
    } else {
      mentions.push({ ...base, remove: dedupe(base.remove), extra: dedupe(base.extra) });
    }
  });
  return mentions;
}

function dedupe(a: string[]) {
  return [...new Set(a)];
}

/** Resuelve la variante a partir de una pista ("grande" -> "Familiar"). */
export function pickVariant<T extends { id: string; name: string }>(variants: T[], hint: string | null): T | null {
  if (!hint || variants.length === 0) return null;
  const aliases: Record<string, string[]> = {
    grande: ["grande", "familiar", "xl", "maxi", "50"],
    grandes: ["grande", "familiar", "xl", "maxi"],
    familiar: ["familiar", "grande"],
    familiares: ["familiar", "grande"],
    mediana: ["mediana", "mediano", "normal"],
    medianas: ["mediana", "normal"],
    mediano: ["mediano", "mediana", "normal"],
    pequena: ["pequena", "pequeno", "individual", "mediana", "normal", "33"],
    pequeno: ["pequeno", "pequena", "individual", "normal", "33"],
    normal: ["normal", "mediana", "mediano", "33"],
    individual: ["individual", "pequena", "mediana"],
    xl: ["xl", "grande", "familiar"],
    maxi: ["maxi", "grande", "xl"],
  };
  const wanted = aliases[hint] ?? [hint];
  for (const w of wanted) {
    const v = variants.find((x) => normalize(x.name).split(" ").some((t) => sameWord(t, w)));
    if (v) return v;
  }
  return null;
}

/** Ordinales para elegir entre opciones: "la primera", "la segunda", "el último". */
export function parseOrdinal(text: string): number | null {
  const n = ` ${normalize(text)} `;
  const map: [RegExp, number][] = [
    [/ (primera|primero|1a|1o|la 1|el 1|uno) /, 0],
    [/ (segunda|segundo|2a|2o|la 2|el 2|dos) /, 1],
    [/ (tercera|tercero|3a|3o|la 3|el 3|tres) /, 2],
    [/ (cuarta|cuarto|4a|4o) /, 3],
    [/ (quinta|quinto) /, 4],
    [/ (ultima|ultimo) /, -1],
  ];
  for (const [r, i] of map) if (r.test(n)) return i;
  return null;
}
