/**
 * Utilidades de procesamiento de lenguaje natural en español.
 * Sin dependencias: se usan tanto en servidor como en tests.
 */

export function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ñ/g, "n")
    .replace(/[¿?¡!.,;:"()«»]/g, " ")
    .replace(/[-_/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(input: string): string[] {
  const n = normalize(input);
  return n ? n.split(" ") : [];
}

/** Formas candidatas de una palabra (singular/plural) para comparar. */
export function wordForms(word: string): string[] {
  const forms = new Set([word]);
  if (word.length > 3 && word.endsWith("s")) forms.add(word.slice(0, -1));
  if (word.length > 4 && word.endsWith("es")) forms.add(word.slice(0, -2));
  return [...forms];
}

export function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const fa = wordForms(a);
  const fb = wordForms(b);
  return fa.some((x) => fb.includes(x));
}

export const NUMBER_WORDS: Record<string, number> = {
  un: 1, una: 1, uno: 1, unos: 1, unas: 1,
  dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, quince: 15, veinte: 20,
  par: 2, docena: 12, media: 6, otra: 1, otro: 1,
};

/** Devuelve la cantidad si el token es un número ("2", "dos", "par"). */
export function parseQuantityToken(token: string): number | null {
  if (/^\d{1,3}$/.test(token)) {
    const n = Number(token);
    return n > 0 ? n : null;
  }
  return NUMBER_WORDS[token] ?? null;
}

/** Extrae un precio máximo: "por menos de 15 euros", "menos de 10", "hasta 12,50". */
export function parseMaxPrice(input: string): number | null {
  const n = normalize(input.replace(/(\d)[.,](\d)/g, "$1d$2"));
  const m = n.match(/(?:menos de|por debajo de|hasta|maximo|max|no mas de|que no pase de)\s+(\d+(?:d\d+)?|[a-z]+)\s*(?:euros?|eur|€)?/);
  if (!m) return null;
  const raw = m[1];
  const value = /^\d/.test(raw) ? Number(raw.replace("d", ".")) : NUMBER_WORDS[raw];
  if (!value || !Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

/** Comprueba si alguna de las frases (ya normalizadas) aparece como palabras completas. */
export function hasPhrase(text: string, phrases: string[]): boolean {
  const t = ` ${normalize(text)} `;
  return phrases.some((p) => t.includes(` ${p} `));
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "a, b y c" */
export function listJoin(items: string[], conj = "y"): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} ${conj} ${items[items.length - 1]}`;
}
