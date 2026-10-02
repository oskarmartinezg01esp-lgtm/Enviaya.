import { describe, expect, it } from "vitest";
import { parseMentions, pickVariant, parseOrdinal, type CatalogItem } from "@/lib/ai/ai-nlu";
import { classifyIntent, isAffirmative, isNegative, hasOrderVerb } from "@/lib/ai/ai-intents";
import { parseMaxPrice, normalize } from "@/lib/text";
import { formatCents } from "@/lib/money";

const item = (id: string, name: string, synonyms: string[], tags: string[], categorySlug = "x", variants: { id: string; name: string }[] = []): CatalogItem => ({
  id, name, synonyms, tags, categorySlug, available: true, variants,
});

const catalog: CatalogItem[] = [
  item("clasica", "Hamburguesa clásica", ["clasica"], ["hamburguesa", "burger"]),
  item("doble", "Hamburguesa doble", ["burger doble", "doble hamburguesa"], ["hamburguesa", "burger", "contundente"]),
  item("queso", "Hamburguesa con queso", ["cheeseburger"], ["hamburguesa", "burger"]),
  item("hpollo", "Hamburguesa de pollo", ["burger de pollo"], ["hamburguesa", "pollo"]),
  item("margarita", "Pizza margarita", ["margarita"], ["pizza"], "pizzas", [{ id: "m1", name: "Mediana" }, { id: "m2", name: "Familiar" }]),
  item("barbacoa", "Pizza barbacoa", ["barbacoa", "bbq"], ["pizza"], "pizzas", [{ id: "b1", name: "Mediana" }, { id: "b2", name: "Familiar" }]),
  item("patatas", "Patatas fritas", ["patatas", "papas"], ["patatas"]),
  item("cola", "Coca-Cola", ["coca cola", "coca", "cola"], ["bebida", "refresco"], "bebidas"),
  item("zero", "Coca-Cola Zero", ["coca cola zero", "coca zero"], ["bebida", "refresco"], "bebidas"),
  item("alitas", "Alitas de pollo", ["alitas"], ["pollo"]),
];

describe("parseMentions", () => {
  it("entiende el pedido del ejemplo principal", () => {
    const m = parseMentions("Hola Cortana, quiero pedir una hamburguesa doble, unas patatas y una Coca-Cola.", catalog);
    expect(m.map((x) => [x.productIds[0], x.quantity, x.kind])).toEqual([
      ["doble", 1, "specific"],
      ["patatas", 1, "specific"],
      ["cola", 1, "specific"],
    ]);
  });

  it("prefiere la coincidencia más larga (Coca-Cola Zero)", () => {
    const m = parseMentions("ponme dos coca cola zero", catalog);
    expect(m).toHaveLength(1);
    expect(m[0].productIds).toEqual(["zero"]);
    expect(m[0].quantity).toBe(2);
  });

  it("divide 'dos hamburguesas sin cebolla, una con queso extra'", () => {
    const m = parseMentions("Quiero dos hamburguesas sin cebolla, una con queso extra.", catalog);
    expect(m).toHaveLength(2);
    expect(m[0]).toMatchObject({ kind: "generic", quantity: 1, remove: ["cebolla"], extra: [] });
    expect(m[1]).toMatchObject({ kind: "generic", quantity: 1, remove: ["cebolla"], extra: ["queso extra"] });
    expect(m[0].productIds).toContain("clasica");
  });

  it("reconoce variantes y fusiona genérico + específico", () => {
    const m = parseMentions("una pizza familiar de barbacoa", catalog);
    expect(m).toHaveLength(1);
    expect(m[0].productIds).toEqual(["barbacoa"]);
    expect(m[0].variantHint).toBe("familiar");
    expect(pickVariant([{ id: "b1", name: "Mediana" }, { id: "b2", name: "Familiar" }], "grande")?.id).toBe("b2");
  });

  it("no confunde 'salsa barbacoa' con la pizza barbacoa", () => {
    const m = parseMentions("unas alitas con salsa barbacoa extra", catalog);
    expect(m).toHaveLength(1);
    expect(m[0].productIds).toEqual(["alitas"]);
  });

  it("variantes de expresión equivalentes producen la misma mención", () => {
    const phrases = ["Quiero una pizza.", "Ponme una pizza.", "Voy a pedir una pizza.", "Me gustaría una pizza.", "Quiero pedir una pizza."];
    for (const p of phrases) {
      const m = parseMentions(p, catalog);
      expect(m).toHaveLength(1);
      expect(m[0].kind).toBe("generic");
      expect(m[0].productIds.sort()).toEqual(["barbacoa", "margarita"]);
      expect(hasOrderVerb(p)).toBe(true);
    }
  });

  it("extrae cantidades numéricas y en palabras", () => {
    expect(parseMentions("3 alitas", catalog)[0].quantity).toBe(3);
    expect(parseMentions("cuatro coca colas", catalog)[0].quantity).toBe(4);
    expect(parseMentions("media docena de alitas", catalog)[0].quantity).toBe(6);
  });
});

describe("intenciones", () => {
  it.each([
    ["¿Dónde está mi pedido?", "TRACK_ORDER"],
    ["Repite mi último pedido", "REPEAT_ORDER"],
    ["Quita una hamburguesa", "REMOVE_PRODUCT"],
    ["Pon dos más", "UPDATE_QUANTITY"],
    ["¿Cuánto llevo?", "VIEW_CART"],
    ["¿Cuánto cuesta todo?", "VIEW_CART"],
    ["¿Cuánto cuesta la pizza barbacoa?", "ASK_PRICE"],
    ["Quiero algo por menos de 15 €", "ASK_RECOMMENDATION"],
    ["Busca hamburguesas", "SEARCH_PRODUCT"],
    ["Envía el pedido a mi casa", "CHANGE_ADDRESS"],
    ["Usa la dirección del trabajo", "CHANGE_ADDRESS"],
    ["Vacía el carrito", "CLEAR_CART"],
    ["Cancela mi pedido", "CANCEL_ORDER"],
    ["¿Cuánto tarda?", "ASK_DELIVERY_TIME"],
    ["Quiero pagar con la tarjeta", "SELECT_PAYMENT"],
    ["¿Cómo puedo pagar?", "ASK_PAYMENT"],
    ["Eso es todo", "CREATE_ORDER"],
    ["Hola Cortana", "GREETING"],
    ["Adiós", "GOODBYE"],
    ["¿Qué puedes hacer?", "HELP"],
    ["Quiero pedir comida", "SEARCH_PRODUCT"],
  ])("%s -> %s", (text, intent) => {
    expect(classifyIntent(text)).toBe(intent);
  });

  it("confirmaciones explícitas", () => {
    for (const t of ["Sí", "Confirmar", "Adelante", "Haz el pedido", "sí, confírmalo", "Vale", "De acuerdo"]) expect(isAffirmative(t)).toBe(true);
    for (const t of ["No", "Espera", "todavía no", "no, gracias", "mejor no"]) {
      expect(isAffirmative(t)).toBe(false);
      expect(isNegative(t)).toBe(true);
    }
    expect(isAffirmative("quiero una pizza")).toBe(false);
  });
});

describe("utilidades", () => {
  it("precio máximo", () => {
    expect(parseMaxPrice("algo por menos de 15 €")).toBe(1500);
    expect(parseMaxPrice("hasta 12,50 euros")).toBe(1250);
    expect(parseMaxPrice("menos de diez euros")).toBe(1000);
  });
  it("formato de moneda", () => {
    expect(formatCents(1490)).toBe("14,90 €");
  });
  it("normaliza acentos", () => {
    expect(normalize("¿Dónde está?")).toBe("donde esta");
  });
  it("ordinales", () => {
    expect(parseOrdinal("la segunda")).toBe(1);
    expect(parseOrdinal("el último")).toBe(-1);
  });
});
