/* eslint-disable no-console */
import { PrismaClient, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const BURGER_OPTIONS = [
  { id: "no-onion", name: "Sin cebolla", type: "remove", priceCents: 0 },
  { id: "no-tomato", name: "Sin tomate", type: "remove", priceCents: 0 },
  { id: "no-lettuce", name: "Sin lechuga", type: "remove", priceCents: 0 },
  { id: "no-pickles", name: "Sin pepinillos", type: "remove", priceCents: 0 },
  { id: "no-sauce", name: "Sin salsa", type: "remove", priceCents: 0 },
  { id: "extra-cheese", name: "Queso extra", type: "extra", priceCents: 100 },
  { id: "extra-bacon", name: "Bacon extra", type: "extra", priceCents: 150 },
  { id: "double-meat", name: "Doble carne", type: "extra", priceCents: 250 },
  { id: "extra-jalapenos", name: "Jalapeños extra", type: "extra", priceCents: 80 },
];
const PIZZA_OPTIONS = [
  { id: "no-onion", name: "Sin cebolla", type: "remove", priceCents: 0 },
  { id: "no-olives", name: "Sin aceitunas", type: "remove", priceCents: 0 },
  { id: "extra-cheese", name: "Queso extra", type: "extra", priceCents: 150 },
  { id: "extra-pepperoni", name: "Pepperoni extra", type: "extra", priceCents: 180 },
  { id: "extra-mushrooms", name: "Champiñones extra", type: "extra", priceCents: 120 },
];
const SAUCE_OPTIONS = [
  { id: "extra-ketchup", name: "Ketchup extra", type: "extra", priceCents: 30 },
  { id: "extra-alioli", name: "Alioli extra", type: "extra", priceCents: 50 },
  { id: "extra-bbq", name: "Salsa barbacoa extra", type: "extra", priceCents: 50 },
];
const DRINK_OPTIONS = [
  { id: "no-ice", name: "Sin hielo", type: "remove", priceCents: 0 },
  { id: "lemon", name: "Limón extra", type: "extra", priceCents: 0 },
];

type Seed = {
  slug: string;
  name: string;
  description: string;
  price: number;
  category: string;
  ingredients?: string[];
  allergens?: string[];
  tags?: string[];
  synonyms?: string[];
  options?: typeof BURGER_OPTIONS;
  variants?: { name: string; price: number; isDefault?: boolean }[];
  popularity?: number;
  isCombo?: boolean;
  isOffer?: boolean;
  isFeatured?: boolean;
  stock?: number | null;
};

const categories = [
  { slug: "hamburguesas", name: "Hamburguesas", icon: "🍔", sortOrder: 1 },
  { slug: "pizzas", name: "Pizzas", icon: "🍕", sortOrder: 2 },
  { slug: "pollo", name: "Pollo", icon: "🍗", sortOrder: 3 },
  { slug: "asiatica", name: "Comida asiática", icon: "🥢", sortOrder: 4 },
  { slug: "ensaladas", name: "Ensaladas", icon: "🥗", sortOrder: 5 },
  { slug: "acompanamientos", name: "Acompañamientos", icon: "🍟", sortOrder: 6 },
  { slug: "combos", name: "Combos", icon: "🍱", sortOrder: 7 },
  { slug: "bebidas", name: "Bebidas", icon: "🥤", sortOrder: 8 },
  { slug: "postres", name: "Postres", icon: "🍰", sortOrder: 9 },
];

const products: Seed[] = [
  // Hamburguesas
  { slug: "hamburguesa-clasica", name: "Hamburguesa clásica", description: "Ternera 150 g, lechuga, tomate, cebolla y salsa de la casa en pan brioche.", price: 7.9, category: "hamburguesas", ingredients: ["ternera", "pan brioche", "lechuga", "tomate", "cebolla", "salsa de la casa"], allergens: ["gluten", "huevo", "mostaza", "sésamo"], tags: ["hamburguesa", "burger", "ternera"], synonyms: ["clasica", "burger clasica", "hamburguesa normal", "hamburguesa sencilla"], options: BURGER_OPTIONS, popularity: 80 },
  { slug: "hamburguesa-doble", name: "Hamburguesa doble", description: "Dos carnes de ternera, doble cheddar, cebolla caramelizada y pepinillos.", price: 8.9, category: "hamburguesas", ingredients: ["ternera", "cheddar", "cebolla caramelizada", "pepinillos", "pan brioche"], allergens: ["gluten", "lácteos", "huevo", "sésamo"], tags: ["hamburguesa", "burger", "ternera", "contundente"], synonyms: ["burger doble", "doble burger", "doble hamburguesa", "hamburguesa de dos carnes"], options: BURGER_OPTIONS, popularity: 95, isFeatured: true },
  { slug: "hamburguesa-con-queso", name: "Hamburguesa con queso", description: "Ternera, cheddar fundido, cebolla, pepinillos, ketchup y mostaza.", price: 8.4, category: "hamburguesas", ingredients: ["ternera", "cheddar", "cebolla", "pepinillos", "ketchup", "mostaza"], allergens: ["gluten", "lácteos", "mostaza"], tags: ["hamburguesa", "burger", "ternera"], synonyms: ["cheeseburger", "cheese burger", "hamburguesa de queso", "burger con queso"], options: BURGER_OPTIONS, popularity: 70 },
  { slug: "hamburguesa-de-pollo", name: "Hamburguesa de pollo", description: "Pechuga de pollo crujiente, lechuga, tomate y mayonesa de lima.", price: 10.4, category: "hamburguesas", ingredients: ["pollo", "lechuga", "tomate", "mayonesa de lima", "pan brioche"], allergens: ["gluten", "huevo"], tags: ["hamburguesa", "burger", "pollo"], synonyms: ["burger de pollo", "chicken burger", "hamburguesa pollo", "hamburguesa de pollo crujiente"], options: BURGER_OPTIONS, popularity: 75 },
  { slug: "hamburguesa-vegana", name: "Hamburguesa vegana", description: "Medallón vegetal, aguacate, rúcula, tomate y salsa vegana.", price: 9.5, category: "hamburguesas", ingredients: ["medallón vegetal", "aguacate", "rúcula", "tomate", "salsa vegana"], allergens: ["gluten", "soja"], tags: ["hamburguesa", "burger", "vegano", "vegetariano"], synonyms: ["burger vegana", "hamburguesa vegetal", "veggie burger", "hamburguesa vegetariana"], options: BURGER_OPTIONS, popularity: 40 },
  { slug: "hamburguesa-bbq-bacon", name: "Hamburguesa BBQ bacon", description: "Ternera, bacon crujiente, aros de cebolla, cheddar y salsa barbacoa.", price: 10.9, category: "hamburguesas", ingredients: ["ternera", "bacon", "aros de cebolla", "cheddar", "salsa barbacoa"], allergens: ["gluten", "lácteos", "mostaza"], tags: ["hamburguesa", "burger", "ternera", "contundente"], synonyms: ["burger bbq", "hamburguesa barbacoa", "hamburguesa bbq", "hamburguesa de bacon", "burger bacon"], options: BURGER_OPTIONS, popularity: 85 },
  // Pizzas
  { slug: "pizza-margarita", name: "Pizza margarita", description: "Tomate, mozzarella fior di latte y albahaca fresca.", price: 9.9, category: "pizzas", ingredients: ["tomate", "mozzarella", "albahaca"], allergens: ["gluten", "lácteos"], tags: ["pizza", "vegetariano"], synonyms: ["margarita", "margherita", "pizza margherita"], options: PIZZA_OPTIONS, variants: [{ name: "Mediana", price: 9.9, isDefault: true }, { name: "Familiar", price: 13.9 }], popularity: 72 },
  { slug: "pizza-barbacoa", name: "Pizza barbacoa", description: "Salsa barbacoa, mozzarella, ternera, bacon, cebolla y pollo.", price: 11.9, category: "pizzas", ingredients: ["salsa barbacoa", "mozzarella", "ternera", "bacon", "cebolla", "pollo"], allergens: ["gluten", "lácteos", "mostaza"], tags: ["pizza", "contundente", "pollo"], synonyms: ["barbacoa", "pizza bbq", "bbq"], options: PIZZA_OPTIONS, variants: [{ name: "Mediana", price: 11.9, isDefault: true }, { name: "Familiar", price: 15.9 }], popularity: 90, isFeatured: true },
  { slug: "pizza-pepperoni", name: "Pizza pepperoni", description: "Tomate, mozzarella y doble de pepperoni.", price: 10.9, category: "pizzas", ingredients: ["tomate", "mozzarella", "pepperoni"], allergens: ["gluten", "lácteos"], tags: ["pizza", "picante"], synonyms: ["pepperoni", "peperoni", "pizza peperoni"], options: PIZZA_OPTIONS, variants: [{ name: "Mediana", price: 10.9, isDefault: true }, { name: "Familiar", price: 14.9 }], popularity: 78 },
  { slug: "pizza-cuatro-quesos", name: "Pizza cuatro quesos", description: "Mozzarella, gorgonzola, parmesano y queso de cabra.", price: 11.5, category: "pizzas", ingredients: ["mozzarella", "gorgonzola", "parmesano", "queso de cabra"], allergens: ["gluten", "lácteos"], tags: ["pizza", "vegetariano"], synonyms: ["cuatro quesos", "4 quesos", "pizza 4 quesos", "quattro formaggi"], options: PIZZA_OPTIONS, variants: [{ name: "Mediana", price: 11.5, isDefault: true }, { name: "Familiar", price: 15.5 }], popularity: 60 },
  { slug: "pizza-vegetal", name: "Pizza vegetal", description: "Tomate, mozzarella, pimiento, champiñón, cebolla, aceitunas y calabacín.", price: 10.5, category: "pizzas", ingredients: ["tomate", "mozzarella", "pimiento", "champiñón", "cebolla", "aceitunas", "calabacín"], allergens: ["gluten", "lácteos"], tags: ["pizza", "vegetariano", "saludable"], synonyms: ["vegetal", "pizza vegetariana", "pizza de verduras"], options: PIZZA_OPTIONS, variants: [{ name: "Mediana", price: 10.5, isDefault: true }, { name: "Familiar", price: 14.5 }], popularity: 45 },
  // Pollo
  { slug: "pollo-asado", name: "Pollo asado", description: "Medio pollo asado al limón con hierbas y patatas panaderas.", price: 9.9, category: "pollo", ingredients: ["pollo", "limón", "hierbas", "patatas"], allergens: [], tags: ["pollo", "contundente", "asado"], synonyms: ["medio pollo", "pollo al horno", "pollo asado con patatas"], popularity: 66 },
  { slug: "alitas-de-pollo", name: "Alitas de pollo", description: "8 alitas glaseadas con salsa barbacoa ahumada.", price: 7.5, category: "pollo", ingredients: ["alitas de pollo", "salsa barbacoa"], allergens: ["mostaza"], tags: ["pollo", "alitas", "compartir"], synonyms: ["alitas", "alas de pollo", "chicken wings", "wings"], options: SAUCE_OPTIONS, popularity: 74 },
  { slug: "tiras-de-pollo", name: "Tiras de pollo crujiente", description: "Tiras de pechuga rebozadas con salsa miel mostaza.", price: 6.9, category: "pollo", ingredients: ["pollo", "rebozado", "miel", "mostaza"], allergens: ["gluten", "huevo", "mostaza"], tags: ["pollo", "crujiente"], synonyms: ["tiras de pollo", "chicken tenders", "tenders", "fingers de pollo"], options: SAUCE_OPTIONS, popularity: 58 },
  { slug: "nuggets", name: "Nuggets de pollo", description: "9 nuggets de pollo con salsa a elegir.", price: 5.5, category: "pollo", ingredients: ["pollo", "rebozado"], allergens: ["gluten"], tags: ["pollo", "infantil"], synonyms: ["nuggets", "nugget", "nuguets"], options: SAUCE_OPTIONS, popularity: 62 },
  // Asiática
  { slug: "pollo-teriyaki", name: "Pollo teriyaki con arroz", description: "Pollo salteado en salsa teriyaki con arroz jazmín y sésamo.", price: 11.5, category: "asiatica", ingredients: ["pollo", "salsa teriyaki", "arroz jazmín", "sésamo"], allergens: ["soja", "sésamo", "gluten"], tags: ["asiatico", "pollo", "arroz"], synonyms: ["teriyaki", "pollo teriyaki", "arroz con pollo teriyaki"], popularity: 64 },
  { slug: "pad-thai", name: "Pad thai de pollo", description: "Fideos de arroz salteados con pollo, cacahuete, brotes y lima.", price: 12.4, category: "asiatica", ingredients: ["fideos de arroz", "pollo", "cacahuete", "brotes de soja", "lima", "huevo"], allergens: ["cacahuetes", "huevo", "soja", "pescado"], tags: ["asiatico", "pollo", "fideos"], synonyms: ["pad thai", "padthai", "fideos thai"], popularity: 55 },
  { slug: "gyozas", name: "Gyozas de pollo", description: "6 empanadillas japonesas a la plancha con salsa ponzu.", price: 6.2, category: "asiatica", ingredients: ["pollo", "col", "jengibre", "salsa ponzu"], allergens: ["gluten", "soja"], tags: ["asiatico", "pollo", "compartir"], synonyms: ["gyozas", "gyoza", "empanadillas japonesas"], popularity: 50 },
  { slug: "ramen", name: "Ramen tonkotsu", description: "Caldo de cerdo cremoso, fideos, huevo marinado, chashu y cebolleta.", price: 12.9, category: "asiatica", ingredients: ["caldo de cerdo", "fideos", "huevo", "chashu", "cebolleta"], allergens: ["gluten", "huevo", "soja", "sésamo"], tags: ["asiatico", "sopa", "contundente"], synonyms: ["ramen", "sopa ramen", "tonkotsu"], popularity: 57 },
  { slug: "sushi-mix", name: "Sushi mix", description: "16 piezas variadas: nigiri, maki y uramaki de salmón y atún.", price: 15.9, category: "asiatica", ingredients: ["arroz", "salmón", "atún", "alga nori", "aguacate"], allergens: ["pescado", "soja", "sésamo"], tags: ["asiatico", "sushi", "pescado"], synonyms: ["sushi", "variado de sushi", "bandeja de sushi"], popularity: 68 },
  // Ensaladas
  { slug: "ensalada-cesar", name: "Ensalada César con pollo", description: "Lechuga romana, pollo a la plancha, parmesano, picatostes y salsa César.", price: 9.2, category: "ensaladas", ingredients: ["lechuga romana", "pollo", "parmesano", "picatostes", "salsa césar"], allergens: ["gluten", "lácteos", "huevo", "pescado"], tags: ["ensalada", "pollo", "saludable"], synonyms: ["cesar", "ensalada cesar", "cesar con pollo"], popularity: 52 },
  { slug: "ensalada-mediterranea", name: "Ensalada mediterránea", description: "Mezclum, tomate cherry, feta, aceitunas kalamata, pepino y orégano.", price: 8.4, category: "ensaladas", ingredients: ["mezclum", "tomate cherry", "feta", "aceitunas", "pepino"], allergens: ["lácteos"], tags: ["ensalada", "vegetariano", "saludable", "ligero"], synonyms: ["mediterranea", "ensalada griega", "ensalada de feta"], popularity: 35 },
  // Acompañamientos
  { slug: "patatas-fritas", name: "Patatas fritas", description: "Patatas fritas crujientes con sal marina.", price: 3.5, category: "acompanamientos", ingredients: ["patata", "sal marina"], allergens: [], tags: ["patatas", "vegano"], synonyms: ["patatas", "papas", "papas fritas", "fritas", "patatas normales"], options: SAUCE_OPTIONS, variants: [{ name: "Normal", price: 3.5, isDefault: true }, { name: "Grande", price: 4.5 }], popularity: 88 },
  { slug: "patatas-bravas", name: "Patatas bravas", description: "Patatas con salsa brava picante y alioli.", price: 4.5, category: "acompanamientos", ingredients: ["patata", "salsa brava", "alioli"], allergens: ["huevo"], tags: ["patatas", "picante", "compartir"], synonyms: ["bravas", "patatas con salsa brava"], popularity: 60 },
  { slug: "aros-de-cebolla", name: "Aros de cebolla", description: "Aros de cebolla rebozados con salsa barbacoa.", price: 3.9, category: "acompanamientos", ingredients: ["cebolla", "rebozado"], allergens: ["gluten"], tags: ["vegetariano", "compartir"], synonyms: ["aros", "onion rings", "aros cebolla"], popularity: 42 },
  // Combos
  { slug: "combo-clasico", name: "Combo clásico", description: "Hamburguesa clásica + patatas fritas + bebida a elegir.", price: 11.9, category: "combos", ingredients: ["hamburguesa clásica", "patatas fritas", "refresco"], allergens: ["gluten", "huevo", "mostaza", "sésamo"], tags: ["combo", "menu", "incluye bebida", "oferta", "contundente"], synonyms: ["menu clasico", "combo hamburguesa", "menu hamburguesa"], popularity: 82, isCombo: true, isOffer: true },
  { slug: "combo-doble", name: "Combo doble", description: "Hamburguesa doble + patatas grandes + bebida a elegir.", price: 13.5, category: "combos", ingredients: ["hamburguesa doble", "patatas grandes", "refresco"], allergens: ["gluten", "lácteos", "huevo", "sésamo"], tags: ["combo", "menu", "incluye bebida", "contundente"], synonyms: ["menu doble", "combo de la doble"], popularity: 77, isCombo: true, isFeatured: true },
  { slug: "combo-pollo", name: "Combo pollo", description: "Hamburguesa de pollo + patatas + bebida a elegir.", price: 12.5, category: "combos", ingredients: ["hamburguesa de pollo", "patatas fritas", "refresco"], allergens: ["gluten", "huevo"], tags: ["combo", "menu", "incluye bebida", "pollo", "contundente"], synonyms: ["menu pollo", "menu de pollo", "combo de pollo"], popularity: 61, isCombo: true },
  { slug: "menu-pizza-familiar", name: "Menú pizza familiar", description: "Pizza familiar a elegir + 2 bebidas + alitas. Ideal para compartir.", price: 22.9, category: "combos", ingredients: ["pizza familiar", "alitas", "2 refrescos"], allergens: ["gluten", "lácteos"], tags: ["combo", "menu", "incluye bebida", "compartir", "oferta", "contundente"], synonyms: ["menu pizza", "menu familiar", "combo pizza"], popularity: 59, isCombo: true, isOffer: true },
  // Bebidas
  { slug: "coca-cola", name: "Coca-Cola", description: "Lata 33 cl bien fría.", price: 2.5, category: "bebidas", ingredients: [], allergens: [], tags: ["bebida", "refresco"], synonyms: ["coca cola", "coca", "cocacola", "cola"], options: DRINK_OPTIONS, popularity: 92 },
  { slug: "coca-cola-zero", name: "Coca-Cola Zero", description: "Lata 33 cl sin azúcar.", price: 2.5, category: "bebidas", ingredients: [], allergens: [], tags: ["bebida", "refresco", "sin azucar"], synonyms: ["coca cola zero", "coca zero", "cola zero", "zero"], options: DRINK_OPTIONS, popularity: 84 },
  { slug: "fanta-naranja", name: "Fanta naranja", description: "Lata 33 cl.", price: 2.5, category: "bebidas", ingredients: [], allergens: [], tags: ["bebida", "refresco"], synonyms: ["fanta", "fanta de naranja", "refresco de naranja"], options: DRINK_OPTIONS, popularity: 48 },
  { slug: "agua-mineral", name: "Agua mineral", description: "Botella 50 cl.", price: 1.8, category: "bebidas", ingredients: [], allergens: [], tags: ["bebida", "saludable"], synonyms: ["agua", "botella de agua", "agua sin gas"], popularity: 65 },
  { slug: "cerveza", name: "Cerveza", description: "Cerveza lager 33 cl. Venta solo a mayores de 18 años.", price: 2.9, category: "bebidas", ingredients: ["malta de cebada", "lúpulo"], allergens: ["gluten"], tags: ["bebida", "alcohol"], synonyms: ["cerveza", "birra", "cana", "cervecita"], popularity: 70 },
  { slug: "limonada", name: "Limonada casera", description: "Limonada natural con hierbabuena, 40 cl.", price: 3.2, category: "bebidas", ingredients: ["limón", "hierbabuena", "azúcar de caña"], allergens: [], tags: ["bebida", "natural"], synonyms: ["limonada", "limonada natural"], popularity: 38 },
  { slug: "te-helado", name: "Té helado", description: "Té negro con limón, 33 cl.", price: 2.6, category: "bebidas", ingredients: ["té negro", "limón"], allergens: [], tags: ["bebida", "refresco"], synonyms: ["te helado", "nestea", "te frio", "ice tea"], popularity: 33 },
  // Postres
  { slug: "brownie", name: "Brownie con nueces", description: "Brownie templado de chocolate negro y nueces.", price: 4.5, category: "postres", ingredients: ["chocolate", "nueces", "mantequilla", "huevo"], allergens: ["gluten", "huevo", "lácteos", "frutos de cáscara"], tags: ["postre", "dulce", "chocolate"], synonyms: ["brownie", "brownie de chocolate"], popularity: 54 },
  { slug: "helado-vainilla", name: "Helado de vainilla", description: "Tarrina de helado artesano de vainilla de Madagascar.", price: 3.5, category: "postres", ingredients: ["leche", "nata", "vainilla"], allergens: ["lácteos"], tags: ["postre", "dulce", "helado"], synonyms: ["helado", "helado vainilla", "tarrina"], popularity: 44 },
  { slug: "tarta-de-queso", name: "Tarta de queso", description: "Tarta de queso cremosa al horno, estilo vasco.", price: 4.9, category: "postres", ingredients: ["queso crema", "nata", "huevo", "azúcar"], allergens: ["lácteos", "huevo", "gluten"], tags: ["postre", "dulce"], synonyms: ["tarta de queso", "cheesecake", "tarta"], popularity: 63, isFeatured: true },
];

const cents = (n: number) => Math.round(n * 100);

async function main() {
  console.log("🌱 Sembrando CORTANA…");

  for (const c of categories) {
    await db.category.upsert({ where: { slug: c.slug }, update: c, create: c });
  }
  const catMap = Object.fromEntries((await db.category.findMany()).map((c) => [c.slug, c.id]));

  for (const p of products) {
    const data = {
      name: p.name,
      description: p.description,
      priceCents: cents(p.price),
      categoryId: catMap[p.category],
      ingredients: p.ingredients ?? [],
      allergens: p.allergens ?? [],
      tags: p.tags ?? [],
      synonyms: p.synonyms ?? [],
      options: (p.options ?? []) as Prisma.InputJsonValue,
      popularity: p.popularity ?? 0,
      isCombo: p.isCombo ?? false,
      isOffer: p.isOffer ?? false,
      isFeatured: p.isFeatured ?? false,
      stock: p.stock ?? null,
      available: true,
    };
    const product = await db.product.upsert({ where: { slug: p.slug }, update: data, create: { slug: p.slug, ...data } });
    await db.productVariant.deleteMany({ where: { productId: product.id, cartItems: { none: {} }, orderItems: { none: {} } } });
    const existing = await db.productVariant.findMany({ where: { productId: product.id } });
    for (const [i, v] of (p.variants ?? []).entries()) {
      if (existing.some((e) => e.name === v.name)) continue;
      await db.productVariant.create({ data: { productId: product.id, name: v.name, priceCents: cents(v.price), isDefault: !!v.isDefault, sortOrder: i } });
    }
  }

  // Usuarios demo
  const demoHash = await bcrypt.hash("cortana123", 12);
  const adminHash = await bcrypt.hash("admin1234", 12);

  const demo = await db.user.upsert({
    where: { email: "demo@cortana.app" },
    update: {},
    create: {
      email: "demo@cortana.app",
      name: "Laura Martín",
      phone: "+34 600 123 456",
      passwordHash: demoHash,
      profile: { create: {} },
      addresses: {
        create: [
          { label: "Casa", line1: "Calle de Alcalá 120, 3º B", city: "Madrid", postalCode: "28009", province: "Madrid", isDefault: true, instructions: "Portero automático 3B" },
          { label: "Trabajo", line1: "Paseo de la Castellana 95, planta 12", city: "Madrid", postalCode: "28046", province: "Madrid" },
        ],
      },
      paymentMethods: {
        create: [
          { type: "CARD", provider: "demo", providerRef: "demo_pm_visa_4821", brand: "Visa", last4: "4821", expMonth: 9, expYear: 2029, isDefault: true },
          { type: "APPLE_PAY", provider: "demo", providerRef: "demo_pm_applepay" },
          { type: "CASH", provider: "cash" },
        ],
      },
      preferences: { create: [{ key: "preferredDrink", value: "Coca-Cola Zero", source: "seed" }] },
    },
  });

  const admin = await db.user.upsert({
    where: { email: "admin@cortana.app" },
    update: { role: "ADMIN" },
    create: { email: "admin@cortana.app", name: "Admin CORTANA", passwordHash: adminHash, role: "ADMIN", profile: { create: {} } },
  });
  await db.adminUser.upsert({ where: { userId: admin.id }, update: {}, create: { userId: admin.id } });

  // Clientes e historial de pedidos para que el panel tenga datos reales
  const existingOrders = await db.order.count();
  if (existingOrders === 0) {
    const names = ["Carlos Ruiz", "Marta Gómez", "Javier López", "Lucía Fernández", "Pablo Sánchez", "Elena Díaz", "Sergio Navarro", "Ana Torres"];
    const customers = [demo];
    for (const [i, name] of names.entries()) {
      const email = `${name.split(" ")[0].toLowerCase()}.${i}@ejemplo.com`;
      customers.push(
        await db.user.upsert({
          where: { email },
          update: {},
          create: {
            email,
            name,
            phone: `+34 6${String(10000000 + i * 1234567).slice(0, 8)}`,
            passwordHash: demoHash,
            profile: { create: {} },
            addresses: { create: [{ label: "Casa", line1: `Calle Mayor ${10 + i}`, city: "Madrid", postalCode: "28013", isDefault: true }] },
            paymentMethods: { create: [{ type: "CARD", provider: "demo", brand: i % 2 ? "Mastercard" : "Visa", last4: String(1000 + i * 731).slice(0, 4), isDefault: true }] },
          },
        }),
      );
    }
    const all = await db.product.findMany({ include: { variants: true } });
    const rand = (n: number) => Math.floor(Math.random() * n);
    const now = Date.now();
    for (let k = 0; k < 140; k++) {
      const user = customers[rand(customers.length)];
      const address = await db.address.findFirst({ where: { userId: user.id } });
      const pm = await db.paymentMethod.findFirst({ where: { userId: user.id } });
      const daysAgo = k < 12 ? 0 : rand(30);
      const hour = [13, 14, 14, 15, 20, 21, 21, 22, 12, 19][rand(10)];
      const created = new Date(now - daysAgo * 86400000);
      created.setHours(hour, rand(60), 0, 0);
      if (created.getTime() > now) created.setTime(now - rand(90) * 60000);
      const lines = Array.from({ length: 1 + rand(3) }, () => {
        const p = all[rand(all.length)];
        const v = p.variants.find((x) => x.isDefault) ?? p.variants[0];
        return { p, v, q: 1 + rand(2) };
      });
      const subtotal = lines.reduce((s, l) => s + (l.v?.priceCents ?? l.p.priceCents) * l.q, 0);
      const status = daysAgo === 0 && k < 6 ? (["CONFIRMADO", "PREPARANDO", "EN_CAMINO", "LISTO", "PREPARANDO", "CONFIRMADO"] as const)[k] : rand(12) === 0 ? "CANCELADO" : "ENTREGADO";
      const after = (min: number) => new Date(created.getTime() + min * 60000);
      await db.order.create({
        data: {
          userId: user.id,
          status,
          createdAt: created,
          addressId: address?.id,
          addressSnapshot: address ? { label: address.label, text: `${address.line1}, ${address.postalCode} ${address.city}` } : undefined,
          subtotalCents: subtotal,
          totalCents: subtotal,
          estimatedMinutes: 35,
          source: ["voice", "voice", "text", "ui"][rand(4)],
          confirmedAt: created,
          preparingAt: status !== "CONFIRMADO" ? after(3) : null,
          readyAt: ["LISTO", "EN_CAMINO", "ENTREGADO"].includes(status) ? after(15) : null,
          shippedAt: ["EN_CAMINO", "ENTREGADO"].includes(status) ? after(18) : null,
          deliveredAt: status === "ENTREGADO" ? after(34) : null,
          cancelledAt: status === "CANCELADO" ? after(5) : null,
          items: {
            create: lines.map((l) => ({
              productId: l.p.id,
              variantId: l.v?.id,
              name: l.p.name,
              variantName: l.v?.name,
              quantity: l.q,
              unitCents: l.v?.priceCents ?? l.p.priceCents,
            })),
          },
          payments: {
            create: { paymentMethodId: pm?.id, provider: "demo", amountCents: subtotal, status: status === "CANCELADO" ? "REFUNDED" : "SUCCEEDED" },
          },
        },
      });
    }
    // Las órdenes activas de hoy no deben auto-avanzar en la demo del panel: se dejan sin simulación temporal
    await db.order.updateMany({ where: { status: { in: ["CONFIRMADO", "PREPARANDO", "LISTO", "EN_CAMINO"] }, userId: { not: demo.id } }, data: { confirmedAt: new Date() } });
  }

  console.log("✅ Listo. Usuario demo: demo@cortana.app / cortana123 · Admin: admin@cortana.app / admin1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
