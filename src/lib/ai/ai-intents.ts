/**
 * Sistema de intenciones de CORTANA y clasificador determinista en español.
 * Se usa como motor principal sin OpenAI y como "guardarraíl" de confirmación con OpenAI.
 */
import { hasPhrase, normalize } from "@/lib/text";

export const INTENTS = [
  "SEARCH_PRODUCT",
  "VIEW_PRODUCT",
  "ADD_PRODUCT",
  "REMOVE_PRODUCT",
  "UPDATE_QUANTITY",
  "CLEAR_CART",
  "VIEW_CART",
  "ASK_PRICE",
  "ASK_RECOMMENDATION",
  "CREATE_ORDER",
  "CONFIRM_ORDER",
  "CANCEL_ORDER",
  "TRACK_ORDER",
  "REPEAT_ORDER",
  "CHANGE_ADDRESS",
  "ASK_DELIVERY_TIME",
  "ASK_PAYMENT",
  "SELECT_PAYMENT",
  "HELP",
  "GREETING",
  "GOODBYE",
  "UNKNOWN",
] as const;

export type Intent = (typeof INTENTS)[number];

const AFFIRMATIVE = [
  "si", "sip", "vale", "ok", "okay", "okey", "claro", "adelante", "confirmar", "confirmo", "confirma", "confirmalo",
  "de acuerdo", "perfecto", "hazlo", "haz el pedido", "pidelo", "pide", "venga", "dale", "correcto", "eso es",
  "por supuesto", "afirmativo", "genial", "va", "vamos", "listo", "si por favor", "si porfa", "exacto", "manda",
  "mandalo", "envialo", "tramitalo", "procede", "yes",
];

const NEGATIVE = [
  "no", "nop", "nada", "ninguno", "ninguna", "todavia no", "aun no", "mejor no", "no gracias", "espera", "para",
  "cancela", "cancelar", "olvidalo", "dejalo", "negativo", "nope",
];

/** "Sí", "Confirmar", "Adelante", "Haz el pedido"... (sin negaciones). */
export function isAffirmative(text: string): boolean {
  const n = normalize(text);
  if (!n) return false;
  if (isNegative(text)) return false;
  const words = n.split(" ");
  // respuestas cortas o que empiezan por afirmación ("si, confirma")
  if (words.length <= 6 && hasPhrase(n, AFFIRMATIVE)) return true;
  return AFFIRMATIVE.some((a) => n === a || n.startsWith(`${a} `));
}

export function isNegative(text: string): boolean {
  const n = normalize(text);
  if (!n) return false;
  if (/^(no|nop|nope|negativo)\b/.test(n)) return true;
  const words = n.split(" ");
  return words.length <= 5 && hasPhrase(n, NEGATIVE.filter((x) => x !== "nada" && x !== "para"))
    ? true
    : /^(espera|para|cancela|olvidalo|dejalo|mejor no|todavia no|aun no)\b/.test(n);
}

/** Palabras que interrumpen a CORTANA mientras habla. */
export function isInterruption(text: string): boolean {
  return /^(espera|para|stop|calla|silencio|un momento|cortana)\b/.test(normalize(text));
}

type Rule = { intent: Intent; test: (n: string) => boolean };

const has = (n: string, ...p: string[]) => p.some((x) => ` ${n} `.includes(` ${x} `));
const re = (r: RegExp) => (n: string) => r.test(n);

/**
 * Reglas ordenadas por prioridad. Las de producto (ADD/SEARCH) se resuelven después
 * con el catálogo, porque dependen de qué productos se mencionen.
 */
const RULES: Rule[] = [
  { intent: "TRACK_ORDER", test: (n) => has(n, "donde esta mi pedido", "donde esta el pedido", "estado de mi pedido", "estado del pedido", "seguimiento", "cuando llega", "cuanto falta", "como va mi pedido", "como va el pedido", "ha salido", "donde esta lo mio", "rastrear") || re(/donde (esta|anda|va) (mi|el) pedido/)(n) },
  { intent: "REPEAT_ORDER", test: (n) => has(n, "repite", "repetir", "repiteme", "lo mismo que la ultima vez", "lo de siempre", "lo mismo de siempre", "lo mismo que ayer", "mismo pedido") },
  { intent: "CANCEL_ORDER", test: (n) => re(/(cancela|cancelar|anula|anular)( el| mi)? pedido/)(n) },
  { intent: "CLEAR_CART", test: (n) => has(n, "vacia el carrito", "vaciar el carrito", "vacia la cesta", "borra todo", "quita todo", "elimina todo", "empezar de nuevo", "empieza de nuevo", "borralo todo", "quitalo todo", "vacialo") },
  { intent: "ASK_DELIVERY_TIME", test: (n) => has(n, "cuanto tarda", "cuanto tardais", "cuanto tardas", "tiempo de entrega", "a que hora llega", "cuanto se tarda", "tiempo estimado") },
  { intent: "CHANGE_ADDRESS", test: (n) => has(n, "direccion", "envialo a", "envia el pedido a", "mandalo a", "llevalo a", "a mi casa", "al trabajo", "a la oficina", "entregalo en", "enviamelo a", "envia a") },
  { intent: "SELECT_PAYMENT", test: (n) => re(/\b(paga|pagar|pago|pagalo|cobra|cobrame)\b.*\b(con|en|por)\b.*\b(tarjeta|efectivo|metalico|apple|google|visa|mastercard|\d{4})\b/)(n) || re(/^(con|en) (la )?(tarjeta|efectivo|apple pay|google pay)/)(n) },
  { intent: "ASK_PAYMENT", test: (n) => has(n, "como pago", "como puedo pagar", "metodos de pago", "formas de pago", "aceptais tarjeta", "se puede pagar", "con que pago") },
  { intent: "VIEW_CART", test: (n) => has(n, "cuanto llevo", "que llevo", "ver carrito", "ver el carrito", "mi carrito", "el carrito", "mi cesta", "cuanto es", "cuanto cuesta todo", "cuanto sale todo", "cuanto es todo", "total", "que tengo", "resumen", "que he pedido", "que hay en el carrito") },
  { intent: "CREATE_ORDER", test: (n) => has(n, "hacer el pedido", "haz el pedido", "realizar el pedido", "tramitar", "finalizar", "terminar el pedido", "eso es todo", "nada mas", "ya esta", "es todo", "pagar", "quiero pagar", "confirmar pedido", "confirma el pedido", "termina", "acaba", "listo para pedir", "procesar el pedido", "ya lo tengo") },
  { intent: "REMOVE_PRODUCT", test: (n) => re(/^(quita|quitame|elimina|borra|saca|retira|sin la|sin el|ya no quiero|quitar|eliminar|borrar)\b/)(n) || has(n, "ya no quiero", "no quiero la", "no quiero el", "quita la", "quita el", "quita una", "quita un", "quita las", "quita los") },
  { intent: "UPDATE_QUANTITY", test: (n) => re(/^(pon|ponme|anade|agrega|suma)? ?(\d+|una|uno|un|dos|tres|cuatro|cinco|seis|otra|otro) (mas|mas de)\b/)(n) || re(/^(otra|otro|uno mas|una mas)$/)(n) || re(/(cambia|deja|pon) (la cantidad )?(a|en) (\d+|una|uno|dos|tres|cuatro|cinco|seis)\b/)(n) || has(n, "mejor dos", "mejor tres", "que sean dos", "que sean tres", "que sean cuatro") },
  { intent: "ASK_RECOMMENDATION", test: (n) => has(n, "recomienda", "recomiendas", "recomendacion", "recomiendame", "sugieres", "sugiereme", "sugerencia", "que me aconsejas", "algo barato", "algo economico", "que llene", "algo que llene", "tengo mucha hambre", "que esta bueno", "lo mas vendido", "lo mas popular", "que me pido", "sorprendeme", "no se que pedir", "que hay de bueno") || re(/(menos de|por debajo de|hasta|no mas de) \d+/)(n) },
  { intent: "ASK_PRICE", test: (n) => re(/^(cuanto (cuesta|vale|sale|es)|que precio tiene|precio de|a cuanto esta)/)(n) || has(n, "cuanto cuesta", "cuanto vale", "que precio") },
  { intent: "VIEW_PRODUCT", test: (n) => has(n, "que lleva", "ingredientes", "alergenos", "tiene gluten", "lleva gluten", "es vegano", "es vegana", "describe", "cuentame de", "informacion de", "que tiene la", "que tiene el") },
  { intent: "HELP", test: (n) => has(n, "ayuda", "que puedes hacer", "como funciona", "que sabes hacer", "como te uso", "instrucciones") },
  { intent: "GOODBYE", test: (n) => re(/^(adios|hasta luego|chao|nos vemos|hasta pronto|gracias adios|bye)\b/)(n) || n === "gracias" || n === "muchas gracias" },
  { intent: "SEARCH_PRODUCT", test: (n) => re(/^(busca|buscame|encuentra|tienes|teneis|hay|que hay|que tienes|que teneis|ensename|muestrame|opciones de|que opciones)/)(n) || has(n, "quiero pedir comida", "quiero comida", "algo con", "algo de", "que tipos de", "que clase de", "carta", "menu") },
  { intent: "GREETING", test: (n) => re(/^(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|ey|que tal|saludos)\b/)(n) },
];

export function classifyIntent(text: string): Intent {
  const n = normalize(text).replace(/^(hola |oye |hey )?cortana /, "").replace(/^cortana$/, "hola");
  for (const r of RULES) if (r.test(n)) return r.intent;
  return "UNKNOWN";
}

/** Verbos de pedido: "quiero", "ponme", "voy a pedir", "me gustaria"... */
export function hasOrderVerb(text: string): boolean {
  return /\b(quiero|quisiera|ponme|pon|ponnos|anade|anademe|agrega|agregame|pide|pideme|voy a pedir|voy a querer|me gustaria|me apetece|dame|traeme|tomare|para mi|me pones|nos pones|apunta|apuntame|queremos|quiero pedir|incluye|mete|meteme)\b/.test(
    normalize(text),
  );
}
