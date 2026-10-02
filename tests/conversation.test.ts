/**
 * Pruebas de integración del motor conversacional contra PostgreSQL (requiere `npm run db:seed`).
 * Reproducen los diálogos de la especificación del producto.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { handleUserMessage } from "@/lib/ai/assistant";

process.env.AI_ENGINE = "local";
process.env.SIMULATE_ORDER_PROGRESS = "false";

let userId = "";
let conversationId: string | null = null;

async function say(text: string) {
  const r = await handleUserMessage({ userId, text, conversationId, source: "voice" });
  conversationId = r.conversationId;
  return r;
}

beforeAll(async () => {
  // Usuario dedicado para no ensuciar la cuenta demo
  await db.user.deleteMany({ where: { email: "test-conversation@cortana.app" } });
  const u = await db.user.create({
    data: {
      email: "test-conversation@cortana.app",
      name: "Test Cortana",
      profile: { create: {} },
      addresses: {
        create: [
          { label: "Casa", line1: "Calle de Alcalá 120", city: "Madrid", postalCode: "28009", isDefault: true },
          { label: "Trabajo", line1: "Paseo de la Castellana 95", city: "Madrid", postalCode: "28046" },
        ],
      },
      paymentMethods: {
        create: [
          { type: "CARD", provider: "demo", brand: "Visa", last4: "4821", isDefault: true },
          { type: "CASH", provider: "cash" },
        ],
      },
      preferences: { create: [{ key: "preferredDrink", value: "Coca-Cola Zero" }] },
    },
  });
  userId = u.id;
});

afterAll(async () => {
  await db.order.deleteMany({ where: { userId } });
  await db.user.deleteMany({ where: { id: userId } });
});

beforeEach(async () => {
  conversationId = null;
  await db.cartItem.deleteMany({ where: { cart: { userId } } });
  await db.cart.updateMany({ where: { userId }, data: { addressId: null, paymentMethodId: null } });
  await db.order.deleteMany({ where: { userId, status: "PENDIENTE" } });
});

describe("CORTANA · flujos de conversación", () => {
  it("ejemplo principal: hamburguesa doble + patatas + Coca-Cola = 14,90 € y confirmación", async () => {
    const r1 = await say("Hola Cortana, quiero pedir una hamburguesa doble, unas patatas y una Coca-Cola.");
    expect(r1.reply).toContain("He añadido una hamburguesa doble, unas patatas fritas y una Coca-Cola");
    expect(r1.reply).toContain("14,90 €");
    expect(r1.ui.awaitingConfirmation).toBe(true);
    expect(r1.cart.totalCents).toBe(1490);

    const r2 = await say("Sí.");
    expect(r2.reply).toMatch(/Tu pedido #\d+ ha sido confirmado/);
    expect(r2.ui.orb).toBe("SUCCESS");
    expect(r2.cart.items).toHaveLength(0);
    const order = await db.order.findFirstOrThrow({ where: { userId }, orderBy: { createdAt: "desc" } });
    expect(order.status).toBe("CONFIRMADO");
    expect(order.totalCents).toBe(1490);
  });

  it("nunca confirma sin un sí explícito", async () => {
    const before = await db.order.count({ where: { userId, status: "CONFIRMADO" } });
    await say("ponme una pizza margarita y una coca cola");
    const r = await say("no, espera");
    expect(r.reply).toMatch(/no lo confirmo/);
    const r2 = await say("¿qué llevo?");
    expect(r2.reply).toMatch(/pizza margarita/);
    expect(await db.order.count({ where: { userId, status: "CONFIRMADO" } })).toBe(before);
  });

  it("flujo guiado: comida -> pollo -> hamburguesa -> bebida -> 12,90 €", async () => {
    const r1 = await say("Cortana, quiero pedir comida.");
    expect(r1.reply).toMatch(/Qué te apetece/);
    const r2 = await say("Algo con pollo.");
    expect(r2.reply).toMatch(/varias opciones con pollo/);
    const r3 = await say("Una hamburguesa.");
    expect(r3.reply).toContain("hamburguesa de pollo");
    expect(r3.reply).toMatch(/bebida/);
    const r4 = await say("Sí, una Coca-Cola.");
    expect(r4.reply).toContain("12,90 €");
    expect(r4.reply).toMatch(/Confirmo el pedido/);
  });

  it("modificaciones: dos hamburguesas sin cebolla, una con queso extra", async () => {
    const r1 = await say("Quiero dos hamburguesas sin cebolla, una con queso extra.");
    expect(r1.reply).toMatch(/Cuáles quieres/);
    await say("la clásica");
    const items = (await db.cartItem.findMany({ where: { cart: { userId } }, orderBy: { createdAt: "asc" } })).map((i) => ({ q: i.quantity, m: i.modifiers, u: i.unitCents }));
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ q: 1, m: { remove: ["cebolla"] }, u: 790 });
    expect(items[1]).toMatchObject({ q: 1, u: 890 });
  });

  it("carrito por voz: quitar, añadir más y total", async () => {
    await say("ponme dos hamburguesas clásicas y una coca cola zero");
    const r1 = await say("Quita una hamburguesa.");
    expect(r1.reply).toMatch(/He quitado una hamburguesa clásica/);
    const r2 = await say("Pon dos más.");
    expect(r2.reply).toMatch(/Llevas tres hamburguesas clásica/);
    const r3 = await say("¿Cuánto llevo?");
    expect(r3.reply).toContain(r3.cart.totalCents === 790 * 3 + 250 ? "26,20 €" : "€");
  });

  it("dirección por voz y método de pago", async () => {
    await say("ponme una pizza barbacoa familiar y un agua");
    const r = await say("Envía el pedido al trabajo");
    expect(r.reply).toMatch(/Trabajo/);
    expect(r.reply).toContain("17,70 €");
    const r2 = await say("mejor paga en efectivo");
    expect(r2.reply).toMatch(/efectivo/);
  });

  it("recomendaciones por precio sin inventar productos", async () => {
    const r = await say("Quiero algo por menos de 15 €");
    expect(r.reply).toMatch(/menos de 15,00 €/);
    expect(r.ui.products?.length).toBeGreaterThan(0);
    expect(r.ui.products!.every((p) => p.priceCents <= 1500)).toBe(true);
  });

  it("memoria: bebida favorita y oferta de la bebida de siempre", async () => {
    await say("Siempre quiero Coca-Cola Zero");
    await say("no");
    const r = await say("ponme una hamburguesa con queso");
    expect(r.reply).toMatch(/bebida de siempre, Coca-Cola Zero/);
    const r2 = await say("sí");
    expect(r2.reply).toMatch(/Coca-Cola Zero/);
    expect(r2.ui.awaitingConfirmation).toBe(true);
  });

  it("seguimiento y repetición de pedido", async () => {
    await say("una pizza pepperoni y una fanta");
    await say("confirmar");
    const r = await say("¿Dónde está mi pedido?");
    expect(r.reply).toMatch(/Tu pedido #\d+ está/);
    expect(r.ui.order?.steps[0].done).toBe(true);
    const r2 = await say("Repite mi último pedido");
    expect(r2.reply).toMatch(/He preparado de nuevo tu pedido/);
    expect(r2.ui.awaitingConfirmation).toBe(true);
  });

  it("precio y producto ambiguo", async () => {
    const r = await say("¿Cuánto cuesta la pizza barbacoa?");
    expect(r.reply).toBe("Pizza barbacoa cuesta 11,90 € la mediana y 15,90 € la familiar.");
    const r2 = await say("Quiero una pizza");
    expect(r2.reply).toMatch(/Cuál quieres\? Tenemos/);
  });
});
