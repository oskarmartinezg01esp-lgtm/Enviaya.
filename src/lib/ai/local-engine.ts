/**
 * Motor conversacional determinista de CORTANA.
 * Funciona sin servicios externos y usa EXACTAMENTE las mismas herramientas que el modelo de OpenAI,
 * con las mismas garantías de confirmación.
 */
import { formatCents } from "@/lib/money";
import { listJoin, normalize, parseMaxPrice, sameWord, tokenize } from "@/lib/text";
import { getCatalog, scoreProduct, basePrice, type ProductView } from "@/lib/services/catalog";
import { getCartView, type CartView } from "@/lib/services/cart";
import { getOrderStatus as getOrderStatusView, type OrderView } from "@/lib/services/orders";
import { getAddresses } from "@/lib/services/addresses";
import { describePaymentMethod, getPaymentMethods } from "@/lib/services/payment-methods";
import { getPreferenceMap } from "@/lib/services/preferences";
import { classifyIntent, hasOrderVerb, isAffirmative, isNegative, type Intent } from "./ai-intents";
import { parseMentions, parseOrdinal, pickVariant, type CatalogItem, type Mention } from "./ai-nlu";
import { executeTool, type ToolCallRecord, type ToolContext } from "./ai-tools";
import type { ConversationState, PendingAction } from "./ai-state";
import { itemsPhrase, pick, quantityPhrase, spokenName } from "./ai-speech";

export type ProductCard = {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  imageUrl: string | null;
  categorySlug: string;
  available: boolean;
};

export type AssistantUI = {
  orb?: "SUCCESS" | "ERROR" | "CONFIRMING" | null;
  products?: ProductCard[];
  order?: OrderView | null;
  awaitingConfirmation?: boolean;
  suggestions?: string[];
};

export type EngineResult = {
  reply: string;
  intent: Intent;
  toolCalls: ToolCallRecord[];
  ui: AssistantUI;
};

type Ctx = ToolContext & {
  catalog: ProductView[];
  items: CatalogItem[];
  calls: ToolCallRecord[];
  ui: AssistantUI;
  prefs: Record<string, string>;
  userName: string;
};

const toCard = (p: ProductView): ProductCard => ({
  id: p.id,
  name: p.name,
  description: p.description,
  priceCents: basePrice(p),
  imageUrl: p.imageUrl,
  categorySlug: p.category.slug,
  available: p.available,
});

async function call(ctx: Ctx, name: string, args: Record<string, unknown> = {}) {
  const result = await executeTool(name, args, ctx);
  ctx.calls.push({ name, args, result });
  return result;
}

function byId(ctx: Ctx, id: string) {
  return ctx.catalog.find((p) => p.id === id);
}

function hasDrink(cart: CartView, ctx: Ctx) {
  return cart.items.some((i) => i.categorySlug === "bebidas" || byId(ctx, i.productId)?.tags.includes("incluye bebida"));
}

function hasFood(cart: CartView) {
  return cart.items.some((i) => !["bebidas"].includes(i.categorySlug));
}

// ---------------------------------------------------------------------------

export async function runLocalEngine(input: {
  userId: string;
  text: string;
  state: ConversationState;
  source: "voice" | "text" | "ui";
  userName: string;
}): Promise<EngineResult> {
  const catalog = await getCatalog();
  const ctx: Ctx = {
    userId: input.userId,
    userText: input.text,
    state: input.state,
    source: input.source,
    catalog,
    items: catalog.map((p) => ({ id: p.id, name: p.name, synonyms: p.synonyms, tags: p.tags, categorySlug: p.category.slug, available: p.available, variants: p.variants })),
    calls: [],
    ui: {},
    prefs: await getPreferenceMap(input.userId),
    userName: input.userName,
  };
  ctx.state.turns = (ctx.state.turns ?? 0) + 1;
  const { reply, intent } = await route(ctx, input.text);
  if (ctx.state.pending?.type === "confirm_order") {
    ctx.ui.awaitingConfirmation = true;
    ctx.ui.orb = ctx.ui.orb ?? "CONFIRMING";
  }
  return { reply, intent, toolCalls: ctx.calls, ui: ctx.ui };
}

async function route(ctx: Ctx, text: string): Promise<{ reply: string; intent: Intent }> {
  const t = text.trim();
  if (!t) return { reply: "Te escucho. ¿Qué quieres pedir?", intent: "UNKNOWN" };

  // 1) Memoria
  const memory = await handleMemory(ctx, t);
  if (memory) return memory;

  const mentions = parseMentions(t, ctx.items);

  // 2) Acciones pendientes (confirmaciones y elecciones)
  const pendingResult = await handlePending(ctx, t, mentions);
  if (pendingResult) return pendingResult;

  // 3) Intención
  let intent = classifyIntent(t);
  const orderVerb = hasOrderVerb(t);
  if (mentions.length > 0 && (intent === "UNKNOWN" || intent === "GREETING" || (orderVerb && ["SEARCH_PRODUCT", "CREATE_ORDER", "CHANGE_ADDRESS"].includes(intent)))) {
    intent = "ADD_PRODUCT";
  }
  if ((intent === "UNKNOWN" || intent === "SEARCH_PRODUCT") && parseMaxPrice(t)) intent = "ASK_RECOMMENDATION";
  if (intent === "UNKNOWN" && isAffirmative(t)) intent = "CONFIRM_ORDER";

  switch (intent) {
    case "ADD_PRODUCT":
      return { reply: await addFlow(ctx, mentions), intent };
    case "REMOVE_PRODUCT":
      return { reply: await removeFlow(ctx, t, mentions), intent };
    case "UPDATE_QUANTITY":
      return { reply: await updateQuantityFlow(ctx, t, mentions), intent };
    case "CLEAR_CART": {
      await call(ctx, "clearCart");
      ctx.state.upsellDone = false;
      return { reply: "Listo, he vaciado el carrito. ¿Empezamos de nuevo?", intent };
    }
    case "VIEW_CART":
      return { reply: await cartFlow(ctx), intent };
    case "ASK_PRICE":
      return { reply: await priceFlow(ctx, mentions), intent };
    case "VIEW_PRODUCT":
      return { reply: await viewProductFlow(ctx, mentions), intent };
    case "ASK_RECOMMENDATION":
      return { reply: await recommendFlow(ctx, t), intent };
    case "SEARCH_PRODUCT":
      return { reply: await searchFlow(ctx, t, mentions), intent };
    case "CREATE_ORDER":
    case "CONFIRM_ORDER":
      return { reply: await checkoutFlow(ctx), intent };
    case "CANCEL_ORDER":
      return { reply: await cancelFlow(ctx, t), intent };
    case "TRACK_ORDER":
      return { reply: await trackFlow(ctx, t), intent };
    case "REPEAT_ORDER":
      return { reply: await repeatFlow(ctx, t), intent };
    case "CHANGE_ADDRESS":
      return { reply: await addressFlow(ctx, t), intent };
    case "ASK_DELIVERY_TIME":
      return { reply: await deliveryTimeFlow(ctx), intent };
    case "ASK_PAYMENT":
      return { reply: await paymentInfoFlow(ctx), intent };
    case "SELECT_PAYMENT":
      return { reply: await selectPaymentFlow(ctx, t), intent };
    case "HELP":
      ctx.ui.suggestions = ["Quiero una pizza barbacoa familiar", "¿Qué me recomiendas por menos de 10 €?", "¿Dónde está mi pedido?"];
      return {
        reply:
          "Puedo buscar productos, añadirlos a tu carrito, decirte precios e ingredientes, recomendarte algo, preparar y confirmar tu pedido, repetir el último y decirte dónde está. Prueba a decir: quiero dos hamburguesas sin cebolla y una Coca-Cola.",
        intent,
      };
    case "GREETING": {
      const first = ctx.userName.split(" ")[0];
      ctx.ui.suggestions = ["Quiero pedir una pizza", "Repite mi último pedido", "Recomiéndame algo"];
      return { reply: pick([`¡Hola, ${first}! ¿Qué te apetece pedir hoy?`, `Hola, ${first}. Dime qué quieres pedir y me encargo.`]), intent };
    }
    case "GOODBYE":
      return { reply: pick(["¡Hasta pronto! Aquí estaré cuando tengas hambre.", "¡Gracias! Que aproveche."]), intent };
    default:
      return { reply: await unknownFlow(ctx, t), intent: "UNKNOWN" };
  }
}

// ---------------------------------------------------------------------------
// Memoria

async function handleMemory(ctx: Ctx, t: string): Promise<{ reply: string; intent: Intent } | null> {
  const n = normalize(t);
  if (/(olvida|borra|elimina) (mis preferencias|lo que sabes de mi|mi memoria|todo lo que recuerdas|tus recuerdos)/.test(n)) {
    const r = await call(ctx, "clearPreferences");
    return { reply: r.ok ? "Hecho. He borrado todo lo que recordaba de tus preferencias." : r.error.message, intent: "HELP" };
  }
  const save = async (key: string, value: string, phrase: string) => {
    const r = await call(ctx, "savePreference", { key, value });
    return r.ok ? phrase : `${r.error.message} Puedes activarla en tu perfil.`;
  };
  const favMatch = /(siempre|normalmente|habitualmente|casi siempre) (quiero|pido|tomo|bebo|me pido)/.test(n) || /mi (bebida|comida|plato) (favorita|favorito|preferida|preferido) es/.test(n);
  if (favMatch) {
    const m = parseMentions(t, ctx.items).find((x) => x.kind === "specific");
    const p = m ? byId(ctx, m.productIds[0]) : undefined;
    if (p) {
      const isDrink = p.category.slug === "bebidas";
      const reply = await save(isDrink ? "preferredDrink" : "preferredFood", p.name, `Entendido. Recordaré que tu ${isDrink ? "bebida" : "comida"} favorita es ${spokenName(p.name)}.`);
      ctx.state.pending = choose([p.id], { suggestedId: p.id, purpose: "add" });
      return { reply: `${reply} ¿Te la añado ahora?`, intent: "HELP" };
    }
  }
  const dislike = n.match(/^no me gusta(?:n)? (?:nada )?(?:el |la |los |las )?([a-z ]{3,30})$/);
  if (dislike) {
    const prev = ctx.prefs.dislikes ? `${ctx.prefs.dislikes}, ` : "";
    return { reply: await save("dislikes", `${prev}${dislike[1]}`, `Apuntado: no te gusta ${dislike[1]}. Lo tendré en cuenta.`), intent: "HELP" };
  }
  const allergy = n.match(/(?:soy|es que soy) alergic[oa] (?:a|al|a la|a los|a las) ([a-z ]{3,30})/);
  if (allergy) {
    return { reply: await save("allergies", allergy[1], `Anotado: eres alérgico a ${allergy[1]}. Te avisaré si algún producto lo lleva.`), intent: "HELP" };
  }
  const diet = n.match(/\bsoy (vegano|vegana|vegetariano|vegetariana|celiaco|celiaca)\b/);
  if (diet) return { reply: await save("diet", diet[1], `Perfecto, recordaré que eres ${diet[1]}.`), intent: "HELP" };
  return null;
}

// ---------------------------------------------------------------------------
// Pendientes

function choose(
  candidateIds: string[],
  opts: Partial<Extract<PendingAction, { type: "choose_product" }>> & { fromUpsell?: boolean } = {},
): PendingAction {
  return {
    type: "choose_product",
    candidateIds,
    suggestedId: opts.suggestedId,
    quantity: opts.quantity ?? 1,
    variantHint: opts.variantHint ?? null,
    remove: opts.remove ?? [],
    extra: opts.extra ?? [],
    purpose: opts.purpose ?? "add",
    split: opts.split,
    ...(opts.fromUpsell ? { fromUpsell: true } : {}),
  } as PendingAction;
}

async function handlePending(ctx: Ctx, t: string, mentions: Mention[]): Promise<{ reply: string; intent: Intent } | null> {
  const p = ctx.state.pending;
  if (!p) return null;

  if (p.type === "confirm_order") {
    if (p.expiresAt < Date.now()) {
      ctx.state.pending = null;
      return null;
    }
    if (isAffirmative(t) && mentions.length === 0) {
      const r = await call(ctx, "confirmOrder", { orderId: p.orderId });
      if (!r.ok) {
        ctx.ui.orb = "ERROR";
        return { reply: `No he podido completar el pedido. ${r.error.message}`, intent: "CONFIRM_ORDER" };
      }
      const d = r.data as { number: number; etaMinutes: number | null };
      ctx.ui.orb = "SUCCESS";
      ctx.ui.order = await getOrderStatusView(ctx.userId, d.number);
      return {
        reply: `Perfecto. Tu pedido #${d.number} ha sido confirmado.${d.etaMinutes ? ` Entrega estimada: ${d.etaMinutes} minutos.` : ""}`,
        intent: "CONFIRM_ORDER",
      };
    }
    if (isNegative(t) && mentions.length === 0 && classifyIntent(t) !== "CHANGE_ADDRESS") {
      ctx.state.pending = null;
      return { reply: "De acuerdo, no lo confirmo. Tu carrito sigue intacto. ¿Quieres cambiar algo?", intent: "CANCEL_ORDER" };
    }
    // Cualquier otra cosa: se procesa normalmente (el pedido se volverá a preparar si hace falta)
    ctx.state.pending = null;
    return null;
  }

  if (p.type === "confirm_cancel") {
    if (isAffirmative(t)) {
      const r = await call(ctx, "cancelOrder", { orderId: p.orderId });
      ctx.state.pending = null;
      if (!r.ok) {
        ctx.ui.orb = "ERROR";
        return { reply: r.error.message, intent: "CANCEL_ORDER" };
      }
      return { reply: `Hecho. He cancelado el pedido #${p.orderNumber}.`, intent: "CANCEL_ORDER" };
    }
    ctx.state.pending = null;
    if (isNegative(t)) return { reply: "Vale, mantengo tu pedido tal cual.", intent: "CANCEL_ORDER" };
    return null;
  }

  if (p.type === "upsell_drink") {
    ctx.state.pending = null;
    ctx.state.upsellDone = true;
    if (mentions.length > 0) return null; // "sí, una Coca-Cola" -> flujo de añadir normal
    if (isAffirmative(t)) {
      const drinks = ctx.catalog.filter((x) => x.category.slug === "bebidas" && x.available).slice(0, 6);
      ctx.state.pending = choose(drinks.map((d) => d.id), { fromUpsell: true });
      ctx.ui.products = drinks.map(toCard);
      return { reply: `Genial. Tenemos ${listJoin(drinks.slice(0, 5).map((d) => spokenName(d.name)), "o")}. ¿Cuál te pongo?`, intent: "ASK_RECOMMENDATION" };
    }
    if (isNegative(t)) return { reply: await checkoutFlow(ctx, "Sin problema."), intent: "CREATE_ORDER" };
    return null;
  }

  if (p.type === "choose_address") {
    ctx.state.pending = null;
    if (isNegative(t)) return { reply: "Vale. ¿Quieres algo más?", intent: "CHANGE_ADDRESS" };
    return { reply: await addressFlow(ctx, t), intent: "CHANGE_ADDRESS" };
  }

  if (p.type === "choose_product") {
    const fromUpsell = (p as { fromUpsell?: boolean }).fromUpsell;
    const candidates = p.candidateIds.map((id) => byId(ctx, id)).filter(Boolean) as ProductView[];
    let chosen: ProductView | undefined;

    // a) mención compatible
    for (const m of mentions) {
      const ids = m.productIds.filter((id) => p.candidateIds.includes(id));
      if (ids.length === 1) {
        chosen = byId(ctx, ids[0]);
        break;
      }
    }
    // b) ordinal
    if (!chosen) {
      const ord = parseOrdinal(t);
      if (ord !== null && mentions.length === 0) chosen = ord === -1 ? candidates[candidates.length - 1] : candidates[ord];
    }
    // c) puntuación por nombre ("la clásica", "la de pollo")
    if (!chosen && !isAffirmative(t)) {
      const scored = candidates.map((c) => ({ c, s: scoreProduct(c, t) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
      if (scored.length === 1 || (scored.length > 1 && scored[0].s > scored[1].s)) chosen = scored[0].c;
    }
    // d) "sí" con sugerencia
    if (!chosen && isAffirmative(t) && mentions.length === 0) {
      if (p.suggestedId) chosen = byId(ctx, p.suggestedId);
      else if (candidates.length === 1) chosen = candidates[0];
      else return { reply: `¿Cuál de ellas? ${listJoin(candidates.slice(0, 4).map((c) => spokenName(c.name)), "o")}.`, intent: "ADD_PRODUCT" };
    }
    if (!chosen) {
      ctx.state.pending = null;
      if (isNegative(t) && mentions.length === 0) {
        if (fromUpsell) return { reply: await checkoutFlow(ctx, "Sin problema."), intent: "CREATE_ORDER" };
        return { reply: "Vale. ¿Qué te apetece entonces?", intent: "UNKNOWN" };
      }
      return null; // procesar como mensaje nuevo
    }
    ctx.state.pending = null;
    if (fromUpsell) ctx.state.upsellDone = true;
    switch (p.purpose) {
      case "price":
        return { reply: priceSentence(chosen), intent: "ASK_PRICE" };
      case "view":
        return { reply: productSentence(chosen), intent: "VIEW_PRODUCT" };
      case "remove": {
        const r = await call(ctx, "removeFromCart", { productId: chosen.id, quantity: p.quantity > 0 ? p.quantity : undefined });
        return { reply: r.ok ? `He quitado ${spokenName(chosen.name)}. ${await totalSentence(ctx)}` : r.error.message, intent: "REMOVE_PRODUCT" };
      }
      default: {
        const lines = p.split?.length
          ? p.split.map((s) => ({ quantity: s.quantity, remove: s.remove, extra: s.extra }))
          : [{ quantity: p.quantity, remove: p.remove, extra: p.extra }];
        const added: string[] = [];
        const errors: string[] = [];
        for (const l of lines) {
          const res = await addProduct(ctx, chosen, l.quantity, p.variantHint, l.remove, l.extra);
          if (res.ok) added.push(res.phrase);
          else errors.push(res.error);
        }
        return { reply: await afterAdd(ctx, added, errors, []), intent: "ADD_PRODUCT" };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Añadir

type Resolution = { product: ProductView } | { ambiguous: ProductView[] } | { none: true };

function resolveMention(ctx: Ctx, m: Mention, purpose: "add" | "cart", cart?: CartView): Resolution {
  let candidates = m.productIds.map((id) => byId(ctx, id)).filter(Boolean) as ProductView[];
  if (purpose === "cart" && cart) {
    const inCart = new Set(cart.items.map((i) => i.productId));
    candidates = candidates.filter((c) => inCart.has(c.id));
  } else if (candidates.some((c) => c.available)) {
    candidates = candidates.filter((c) => c.available);
  }
  if (candidates.length === 0) return { none: true };
  if (candidates.length === 1) return { product: candidates[0] };
  const recent = candidates.filter((c) => ctx.state.lastSearchIds?.includes(c.id));
  if (recent.length === 1) return { product: recent[0] };
  return { ambiguous: candidates };
}

async function addProduct(ctx: Ctx, product: ProductView, quantity: number, variantHint: string | null, remove: string[], extra: string[]) {
  const variant = pickVariant(product.variants, variantHint);
  const r = await call(ctx, "addToCart", {
    productId: product.id,
    quantity,
    ...(variant ? { variantId: variant.id } : {}),
    ...(remove.length ? { remove } : {}),
    ...(extra.length ? { extra } : {}),
  });
  if (!r.ok) {
    if (r.error.code === "UNAVAILABLE" || r.error.code === "OUT_OF_STOCK") {
      const alt = ctx.catalog.filter((x) => x.available && x.category.id === product.category.id && x.id !== product.id).slice(0, 2);
      if (alt.length) {
        ctx.ui.products = alt.map(toCard);
        return { ok: false as const, error: `${r.error.message} Como alternativa tienes ${listJoin(alt.map((a) => spokenName(a.name)), "o")}.` };
      }
    }
    return { ok: false as const, error: r.error.message };
  }
  const d = r.data as { added: { name: string; quantity: number; variant?: string; modifiers: { remove?: string[]; extra?: { name: string }[] } }; unknownOptions: string[] };
  const chosenVariant = product.variants.find((v) => v.name === d.added.variant);
  const variantName = product.variants.length > 1 && chosenVariant && (variantHint || !chosenVariant.isDefault) ? chosenVariant.name.toLowerCase() : null;
  const mods = [...(d.added.modifiers.remove ?? []).map((x) => `sin ${x}`), ...(d.added.modifiers.extra ?? []).map((x) => `con ${x.name.toLowerCase()}`)];
  let phrase = quantityPhrase(d.added.quantity, d.added.name, variantName);
  if (mods.length) phrase += ` ${listJoin(mods)}`;
  const warnings: string[] = [];
  if (d.unknownOptions.length) warnings.push(`No tengo la opción ${listJoin(d.unknownOptions, "ni")} para ${spokenName(product.name)}.`);
  const allergies = ctx.prefs.allergies ? tokenize(ctx.prefs.allergies) : [];
  const hit = product.allergens.filter((a) => allergies.some((x) => sameWord(normalize(a), x)));
  if (hit.length) warnings.push(`Ojo: ${spokenName(product.name)} contiene ${listJoin(hit)}.`);
  return { ok: true as const, phrase, warnings };
}

async function addFlow(ctx: Ctx, mentions: Mention[]): Promise<string> {
  if (mentions.length === 0) return unknownFlow(ctx, ctx.userText);
  const added: string[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  let ambiguous: { list: ProductView[]; mentions: Mention[] } | null = null;

  for (const m of mentions) {
    const res = resolveMention(ctx, m, "add");
    if ("product" in res) {
      const r = await addProduct(ctx, res.product, m.quantity, m.variantHint, m.remove, m.extra);
      if (r.ok) {
        added.push(r.phrase);
        warnings.push(...r.warnings);
      } else errors.push(r.error);
    } else if ("ambiguous" in res) {
      if (!ambiguous) ambiguous = { list: res.ambiguous, mentions: [m] };
      else if (ambiguous.mentions[0].label === m.label) ambiguous.mentions.push(m);
    } else {
      errors.push(`Ahora mismo no tenemos ${m.label} disponible.`);
    }
  }

  if (ambiguous) {
    const first = ambiguous.mentions[0];
    const total = ambiguous.mentions.reduce((s, m) => s + m.quantity, 0);
    ctx.state.pending = choose(
      ambiguous.list.map((p) => p.id),
      {
        quantity: total,
        variantHint: first.variantHint,
        remove: first.remove,
        extra: first.extra,
        purpose: "add",
        split: ambiguous.mentions.length > 1 ? ambiguous.mentions.map((m) => ({ quantity: m.quantity, remove: m.remove, extra: m.extra })) : undefined,
      },
    );
    ctx.ui.products = ambiguous.list.slice(0, 6).map(toCard);
    const names = ambiguous.list.slice(0, 4).map((p) => spokenName(p.name));
    const prefix = added.length ? `He añadido ${listJoin(added)}. ` : "";
    return `${prefix}¿${first.quantity > 1 || total > 1 ? "Cuáles" : "Cuál"} quieres? Tenemos ${listJoin(names, "o")}${ambiguous.list.length > 4 ? ", entre otras" : ""}.`;
  }
  return afterAdd(ctx, added, errors, warnings);
}

/** Tras añadir: ofrecer bebida una vez o pasar a confirmación (flujo del ejemplo del producto). */
async function afterAdd(ctx: Ctx, added: string[], errors: string[], warnings: string[]): Promise<string> {
  const parts: string[] = [];
  if (added.length) parts.push(`${pick(["Claro.", "Perfecto.", "Hecho."])} He añadido ${listJoin(added)}.`);
  parts.push(...warnings, ...errors);
  if (!added.length) {
    if (errors.length) ctx.ui.orb = "ERROR";
    return parts.join(" ") || "No he podido añadir nada. ¿Puedes repetirlo?";
  }
  const cart = await getCartView(ctx.userId);
  if (hasFood(cart) && !hasDrink(cart, ctx) && !ctx.state.upsellDone) {
    ctx.state.upsellDone = true;
    const fav = ctx.prefs.preferredDrink ? ctx.catalog.find((p) => normalize(p.name) === normalize(ctx.prefs.preferredDrink)) : undefined;
    if (fav?.available) {
      const drinks = ctx.catalog.filter((x) => x.category.slug === "bebidas" && x.available);
      ctx.state.pending = choose(drinks.map((d) => d.id), { suggestedId: fav.id, fromUpsell: true });
      parts.push(`¿Quieres la bebida de siempre, ${spokenName(fav.name)}?`);
    } else {
      ctx.state.pending = { type: "upsell_drink" };
      parts.push("¿Quieres añadir bebida?");
    }
    return parts.join(" ");
  }
  return checkoutFlow(ctx, parts.join(" "));
}

// ---------------------------------------------------------------------------
// Checkout

async function checkoutFlow(ctx: Ctx, prefix = ""): Promise<string> {
  const pre = prefix ? `${prefix} ` : "";
  const cart = await getCartView(ctx.userId);
  if (cart.items.length === 0) return `${pre}Tu carrito está vacío. ¿Qué te apetece pedir?`;
  const r = await call(ctx, "createOrder");
  if (!r.ok) {
    if (r.error.code === "NO_ADDRESS") return `${pre}Antes de confirmar necesito una dirección de entrega. Puedes añadirla en Direcciones.`;
    if (r.error.code === "NO_PAYMENT_METHOD") return `${pre}Necesito un método de pago. Puedes añadir uno en la sección Pagos.`;
    ctx.ui.orb = "ERROR";
    return `${pre}${r.error.message}`;
  }
  const d = r.data as { total: string; address: string; payment: string; items: { name: string; quantity: number; variant?: string; modifiers?: string }[] };
  const addressLabel = d.address.split(" (")[0];
  const summary = itemsPhrase(d.items.map((i) => ({ quantity: i.quantity, name: i.name, variantName: i.variant, modifiersLabel: i.modifiers })));
  const already = prefix.includes("He añadido");
  const body = already
    ? `El total es de ${d.total}. Lo envío a ${addressLabel} y lo pagas con ${d.payment}.`
    : `Tu pedido contiene ${summary}. Total: ${d.total}. Lo envío a ${addressLabel} y lo pagas con ${d.payment}.`;
  ctx.ui.orb = "CONFIRMING";
  return `${pre}${body} ¿Confirmo el pedido?`;
}

// ---------------------------------------------------------------------------
// Carrito

async function totalSentence(ctx: Ctx) {
  const cart = await getCartView(ctx.userId);
  if (!cart.items.length) return "Tu carrito se ha quedado vacío.";
  return `Ahora llevas ${formatCents(cart.totalCents)}.`;
}

async function cartFlow(ctx: Ctx) {
  const r = await call(ctx, "getCart");
  const cart = await getCartView(ctx.userId);
  if (!r.ok) return r.error.message;
  if (cart.items.length === 0) return "Tu carrito está vacío. ¿Qué te apetece?";
  return `Llevas ${itemsPhrase(cart.items)}. En total, ${formatCents(cart.totalCents)}. ¿Hago el pedido?`;
}

function findLine(cart: CartView, productId: string) {
  return [...cart.items].reverse().find((i) => i.productId === productId);
}

async function removeFlow(ctx: Ctx, t: string, mentions: Mention[]) {
  const cart = await getCartView(ctx.userId);
  if (!cart.items.length) return "Tu carrito ya está vacío.";
  if (mentions.length === 0) {
    const n = normalize(t);
    const target = /(lo ultimo|eso|quitalo|quitala|borralo|borrala|eliminalo|eliminala)/.test(n)
      ? (ctx.state.lastProductId && findLine(cart, ctx.state.lastProductId)) || cart.items[cart.items.length - 1]
      : null;
    if (!target) return `¿Qué quieres quitar? Llevas ${itemsPhrase(cart.items)}.`;
    const r = await call(ctx, "removeFromCart", { itemId: target.id });
    return r.ok ? `He quitado ${spokenName(target.name)}. ${await totalSentence(ctx)}` : r.error.message;
  }
  const out: string[] = [];
  for (const m of mentions) {
    const res = resolveMention(ctx, m, "cart", cart);
    if ("product" in res) {
      const r = await call(ctx, "removeFromCart", { productId: res.product.id, ...(m.explicitQuantity ? { quantity: m.quantity } : {}) });
      out.push(r.ok ? `He quitado ${m.explicitQuantity ? quantityPhrase(m.quantity, res.product.name) : spokenName(res.product.name)}.` : r.error.message);
      ctx.state.lastProductId = res.product.id;
    } else if ("ambiguous" in res) {
      ctx.state.pending = choose(res.ambiguous.map((p) => p.id), { purpose: "remove", quantity: m.explicitQuantity ? m.quantity : 0 });
      return `¿Cuál quieres quitar? ${listJoin(res.ambiguous.map((p) => spokenName(p.name)), "o")}.`;
    } else {
      out.push(`No llevas ${m.label} en el carrito.`);
    }
  }
  return `${out.join(" ")} ${await totalSentence(ctx)}`;
}

async function updateQuantityFlow(ctx: Ctx, t: string, mentions: Mention[]) {
  const n = normalize(t);
  const cart = await getCartView(ctx.userId);
  const numberIn = (s: string) => {
    const m = s.match(/\b(\d+|una|uno|un|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|otra|otro)\b/);
    if (!m) return null;
    const map: Record<string, number> = { una: 1, uno: 1, un: 1, otra: 1, otro: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };
    return /^\d+$/.test(m[1]) ? Number(m[1]) : map[m[1]];
  };
  let productId: string | null = null;
  if (mentions.length) {
    const res = resolveMention(ctx, mentions[0], "cart", cart);
    if ("product" in res) productId = res.product.id;
    else {
      const resAdd = resolveMention(ctx, mentions[0], "add");
      if ("product" in resAdd) productId = resAdd.product.id;
    }
  }
  if (!productId) productId = ctx.state.lastProductId ?? cart.items[cart.items.length - 1]?.productId ?? null;
  if (!productId) return "¿De qué producto quieres cambiar la cantidad?";
  const product = byId(ctx, productId)!;
  const line = findLine(cart, productId);
  const setMode = /(cambia|deja|pon) (la cantidad )?(a|en)|que sean|mejor (\d+|dos|tres|cuatro|cinco|seis)/.test(n);
  const q = numberIn(n) ?? 1;
  if (setMode && line) {
    const others = cart.items.filter((i) => i.productId === productId && i.id !== line.id).reduce((s, i) => s + i.quantity, 0);
    const r = await call(ctx, "updateCartItem", { itemId: line.id, quantity: Math.max(0, q - others) });
    return r.ok ? `Hecho, ahora llevas ${quantityPhrase(q, product.name)}. ${await totalSentence(ctx)}` : r.error.message;
  }
  if (line) {
    const r = await call(ctx, "updateCartItem", { itemId: line.id, quantity: line.quantity + q });
    return r.ok ? `Añadidas ${q} más. Llevas ${quantityPhrase(line.quantity + q, product.name)}. ${await totalSentence(ctx)}` : r.error.message;
  }
  const r = await addProduct(ctx, product, q, null, [], []);
  return r.ok ? `He añadido ${r.phrase}. ${await totalSentence(ctx)}` : r.error;
}

// ---------------------------------------------------------------------------
// Catálogo

function priceSentence(p: ProductView) {
  if (p.variants.length > 1) {
    return `${capitalizeFirst(spokenName(p.name))} cuesta ${listJoin(p.variants.map((v) => `${formatCents(v.priceCents)} la ${v.name.toLowerCase()}`))}.`;
  }
  return `${capitalizeFirst(spokenName(p.name))} cuesta ${formatCents(basePrice(p))}.`;
}

function productSentence(p: ProductView) {
  const parts = [`${p.name}: ${p.description}`];
  if (p.ingredients.length) parts.push(`Lleva ${listJoin(p.ingredients.slice(0, 6))}.`);
  parts.push(p.allergens.length ? `Alérgenos: ${listJoin(p.allergens)}.` : "No tiene alérgenos declarados.");
  parts.push(`Precio: ${formatCents(basePrice(p))}.`);
  return parts.join(" ");
}

function capitalizeFirst(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

async function priceFlow(ctx: Ctx, mentions: Mention[]) {
  if (mentions.length === 0) {
    const cart = await getCartView(ctx.userId);
    return cart.items.length ? `Ahora mismo llevas ${formatCents(cart.totalCents)}.` : "¿De qué producto quieres saber el precio?";
  }
  const res = resolveMention(ctx, mentions[0], "add");
  if ("product" in res) {
    ctx.state.lastProductId = res.product.id;
    ctx.ui.products = [toCard(res.product)];
    return priceSentence(res.product);
  }
  if ("ambiguous" in res) {
    ctx.ui.products = res.ambiguous.slice(0, 6).map(toCard);
    ctx.state.pending = choose(res.ambiguous.map((p) => p.id), { purpose: "add" });
    return `${listJoin(res.ambiguous.slice(0, 4).map((p) => `${spokenName(p.name)}, ${formatCents(basePrice(p))}`))}. ¿Te pongo alguna?`;
  }
  return "Ese producto no está disponible ahora mismo.";
}

async function viewProductFlow(ctx: Ctx, mentions: Mention[]) {
  const target = mentions[0] ? resolveMention(ctx, mentions[0], "add") : ctx.state.lastProductId ? { product: byId(ctx, ctx.state.lastProductId)! } : null;
  if (!target) return "¿De qué producto quieres información?";
  if ("product" in target && target.product) {
    await call(ctx, "getProduct", { productId: target.product.id });
    ctx.ui.products = [toCard(target.product)];
    return productSentence(target.product);
  }
  if ("ambiguous" in target) {
    ctx.state.pending = choose(target.ambiguous.map((p) => p.id), { purpose: "view" });
    return `¿De cuál? ${listJoin(target.ambiguous.slice(0, 4).map((p) => spokenName(p.name)), "o")}.`;
  }
  return "No encuentro ese producto en el catálogo.";
}

const SEARCH_FILLER =
  /^(hola |oye |cortana )*(busca(me)?|encuentra(me)?|tienes|teneis|hay|que hay de|que hay|que tienes de|que tienes|que teneis|ensename|muestrame|opciones de|que opciones hay de|que opciones|quiero pedir|quiero|me apetece|algo con|algo de|dame opciones de)\s*/;

async function searchFlow(ctx: Ctx, t: string, mentions: Mention[]) {
  const n = normalize(t);
  const query = n.replace(SEARCH_FILLER, "").replace(/^(algo )?(con|de) /, "").trim();
  let results: ProductView[] = [];
  if (mentions.length) {
    const ids = [...new Set(mentions.flatMap((m) => m.productIds))];
    results = ids.map((id) => byId(ctx, id)!).filter((p) => p?.available);
    ctx.state.lastSearchIds = results.map((r) => r.id);
    await call(ctx, "searchProducts", { query: mentions[0].label });
  } else if (query && !/^(comida|algo|de comer|comer|cena|cenar|almorzar|comer algo)$/.test(query)) {
    const r = await call(ctx, "searchProducts", { query, limit: 8 });
    if (r.ok) results = ((r.data as { products: { id: string }[] }).products.map((x) => byId(ctx, x.id)).filter(Boolean) as ProductView[]);
  }
  if (results.length === 0) {
    const cats = await call(ctx, "getCategories");
    const names = cats.ok ? (cats.data as { name: string }[]).map((c) => c.name.toLowerCase()) : [];
    if (!query || /^(comida|algo|de comer|comer|cena|cenar|comer algo)$/.test(query)) {
      return `Claro. ¿Qué te apetece? Tenemos ${listJoin(names.slice(0, 6))}.`;
    }
    return `No he encontrado nada con «${query}». Tenemos ${listJoin(names.slice(0, 6))}. ¿Te apetece algo de eso?`;
  }
  ctx.ui.products = results.slice(0, 8).map(toCard);
  ctx.state.pending = choose(results.map((r) => r.id), { purpose: "add" });
  if (results.length === 1) {
    ctx.state.pending = choose([results[0].id], { suggestedId: results[0].id, purpose: "add" });
    return `Tengo ${spokenName(results[0].name)} por ${formatCents(basePrice(results[0]))}. ¿Te lo añado?`;
  }
  // Agrupar por categoría para preguntas naturales ("¿hamburguesa, pollo asado o comida asiática?")
  const groups = new Map<string, ProductView[]>();
  for (const r of results) groups.set(r.category.name, [...(groups.get(r.category.name) ?? []), r]);
  const about = mentions[0]?.label ?? query;
  if (groups.size >= 3) {
    const opts = [...groups.entries()].slice(0, 4).map(([cat, list]) => (list.length === 1 ? spokenName(list[0].name) : cat.toLowerCase()));
    return `He encontrado varias opciones con ${about}. ¿Quieres ${listJoin(opts, "o")}?`;
  }
  return `He encontrado ${results.length} opciones: ${listJoin(results.slice(0, 4).map((p) => `${spokenName(p.name)} por ${formatCents(basePrice(p))}`))}. ¿Cuál te apetece?`;
}

async function recommendFlow(ctx: Ctx, t: string) {
  const n = normalize(t);
  const maxPriceCents = parseMaxPrice(t) ?? (/(barat|economic)/.test(n) ? 1000 : undefined);
  const filling = /(llene|hambre|contundente|potente|grande|abundante)/.test(n);
  const query = n
    .replace(/(que me )?(recomiendas|recomiendame|sugieres|sugiereme|aconsejas)/, "")
    .replace(/(algo|quiero|por|menos de|por debajo de|hasta|\d+|euros?|barato|barata|economico|que llene|tengo mucha hambre|mucha|hambre|que|me|lo mas vendido|lo mas popular)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const r = await call(ctx, "recommendProducts", { ...(maxPriceCents ? { maxPriceCents } : {}), filling, ...(query.length > 2 ? { query } : {}), limit: 4 });
  if (!r.ok) return r.error.message;
  const list = ((r.data as { products: { id: string }[] }).products.map((x) => byId(ctx, x.id)).filter(Boolean) as ProductView[]);
  if (!list.length) return maxPriceCents ? `No tengo nada por menos de ${formatCents(maxPriceCents)} ahora mismo.` : "Ahora mismo no tengo recomendaciones disponibles.";
  ctx.ui.products = list.map(toCard);
  ctx.state.pending = choose(list.map((p) => p.id), { suggestedId: list[0].id, purpose: "add" });
  const [first, ...rest] = list;
  const intro = maxPriceCents
    ? `Encontré varias opciones por menos de ${formatCents(maxPriceCents)}.`
    : filling
      ? "Si tienes hambre de verdad,"
      : pick(["Te recomiendo algo que gusta mucho:", "Mi recomendación:"]);
  const firstTxt = `${filling && !maxPriceCents ? "te recomiendo " : maxPriceCents ? " Te recomiendo " : " "}${spokenName(first.name)} por ${formatCents(basePrice(first))}`;
  const others = rest.length ? ` También tienes ${listJoin(rest.slice(0, 2).map((p) => spokenName(p.name)))}.` : "";
  return `${intro}${firstTxt}.${others} ¿Te añado ${spokenName(first.name)}?`.replace(/\s+/g, " ").replace(" .", ".");
}

// ---------------------------------------------------------------------------
// Pedidos

function orderNumberIn(t: string) {
  return normalize(t).match(/\b(\d{3,7})\b/)?.[1];
}

async function trackFlow(ctx: Ctx, t: string) {
  const num = orderNumberIn(t);
  const r = await call(ctx, "getOrderStatus", num ? { orderId: num } : {});
  if (!r.ok) return r.error.message;
  const d = r.data as { found: boolean; number?: number };
  if (!d.found) return "No tienes pedidos todavía. ¿Quieres hacer uno ahora?";
  const order = await getOrderStatusView(ctx.userId, d.number);
  ctx.ui.order = order;
  if (!order) return "No encuentro ese pedido.";
  if (order.status === "ENTREGADO") return `Tu pedido #${order.number} ya fue entregado. ¿Quieres repetirlo?`;
  if (order.status === "CANCELADO") return `El pedido #${order.number} está cancelado.`;
  const eta = order.etaMinutes ? ` Entrega estimada: ${order.etaMinutes} minutos.` : "";
  const status: Record<string, string> = {
    CONFIRMADO: "confirmado y a punto de entrar en cocina",
    PREPARANDO: "en preparación",
    LISTO: "listo, esperando al repartidor",
    EN_CAMINO: "en camino",
  };
  return `Tu pedido #${order.number} está ${status[order.status] ?? order.statusLabel.toLowerCase()}.${eta}`;
}

async function cancelFlow(ctx: Ctx, t: string) {
  const num = orderNumberIn(t);
  const r = await call(ctx, "cancelOrder", num ? { orderId: num } : {});
  if (!r.ok) return r.error.message;
  const d = r.data as { requiresConfirmation?: boolean; message?: string; number: number; status: string };
  if (d.requiresConfirmation) {
    ctx.ui.orb = "CONFIRMING";
    return `Tu pedido #${d.number} está ${d.status.toLowerCase()}. ¿Seguro que quieres cancelarlo?`;
  }
  return `He cancelado el pedido #${d.number}.`;
}

async function repeatFlow(ctx: Ctx, t: string) {
  const num = orderNumberIn(t);
  const r = await call(ctx, "repeatOrder", num ? { orderId: num } : {});
  if (!r.ok) return r.error.message;
  const d = r.data as { fromOrder: number; unavailable: string[]; cart: { itemCount: number } };
  ctx.state.upsellDone = true;
  if (d.cart.itemCount === 0) return `Lo siento, ninguno de los productos del pedido #${d.fromOrder} está disponible ahora.`;
  const missing = d.unavailable.length ? ` Ojo: ${listJoin(d.unavailable)} ya no está disponible.` : "";
  return checkoutFlow(ctx, `He preparado de nuevo tu pedido #${d.fromOrder}.${missing}`);
}

async function addressFlow(ctx: Ctx, t: string) {
  const hadPending = ctx.calls.some((c) => c.name === "createOrder") || ctx.state.pending?.type === "confirm_order";
  const r = await call(ctx, "setDeliveryAddress", { text: t });
  if (!r.ok) {
    const list = await getAddresses(ctx.userId);
    if (!list.length) return "No tienes direcciones guardadas. Puedes añadir una en la sección Direcciones.";
    ctx.state.pending = { type: "choose_address" };
    return `Tus direcciones guardadas son ${listJoin(list.map((a) => a.label), "y")}. ¿A cuál lo envío?`;
  }
  const d = r.data as { label: string; address: string };
  const cart = await getCartView(ctx.userId);
  if (cart.items.length && (hadPending || /pedido|envia|manda|lleva/.test(normalize(t)))) {
    return checkoutFlow(ctx, "Hecho, he cambiado la dirección.");
  }
  return `Perfecto, enviaré tus pedidos a ${d.label}: ${d.address}.`;
}

async function deliveryTimeFlow(ctx: Ctx) {
  const order = await getOrderStatusView(ctx.userId);
  if (order && order.etaMinutes) {
    ctx.ui.order = order;
    return `Tu pedido #${order.number} llegará en unos ${order.etaMinutes} minutos.`;
  }
  return "Ahora mismo estamos entregando en unos 30 a 40 minutos.";
}

async function paymentInfoFlow(ctx: Ctx) {
  const methods = await getPaymentMethods(ctx.userId);
  await call(ctx, "getPaymentMethods");
  if (!methods.length) return "Aceptamos tarjeta, Apple Pay, Google Pay y efectivo. Puedes añadir tu método en la sección Pagos.";
  return `Puedes pagar con ${listJoin(methods.map(describePaymentMethod), "o")}. ¿Con cuál quieres pagar?`;
}

async function selectPaymentFlow(ctx: Ctx, t: string) {
  const r = await call(ctx, "setPaymentMethod", { text: t });
  if (!r.ok) return `${r.error.message} ${await paymentInfoFlow(ctx)}`;
  const d = r.data as { description: string };
  const cart = await getCartView(ctx.userId);
  if (cart.items.length) return checkoutFlow(ctx, "Hecho, he cambiado el método de pago.");
  return `Perfecto, usaré ${d.description} para tus pedidos.`;
}

async function unknownFlow(ctx: Ctx, t: string) {
  const r = await call(ctx, "searchProducts", { query: t, limit: 3 });
  const list = r.ok ? ((r.data as { products: { id: string }[] }).products.map((x) => byId(ctx, x.id)).filter(Boolean) as ProductView[]) : [];
  if (list.length) {
    ctx.ui.products = list.map(toCard);
    ctx.state.pending = choose(list.map((p) => p.id), { suggestedId: list.length === 1 ? list[0].id : undefined, purpose: "add" });
    return `No estoy segura de haberte entendido. ¿Te refieres a ${listJoin(list.map((p) => spokenName(p.name)), "o")}?`;
  }
  ctx.ui.suggestions = ["Quiero una hamburguesa", "¿Qué me recomiendas?", "¿Dónde está mi pedido?"];
  return "No te he entendido bien. Puedes decirme, por ejemplo: quiero una pizza barbacoa, ¿qué me recomiendas? o ¿dónde está mi pedido?";
}
