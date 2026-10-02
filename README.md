# CORTANA · Pedidos por voz

CORTANA es una app de pedidos donde la voz es la forma principal de interactuar: hablas, CORTANA te entiende, prepara el pedido, **te pide confirmación** y luego te deja seguirlo.

> «Hola Cortana, quiero pedir una hamburguesa doble, unas patatas y una Coca-Cola.»
> «Perfecto. He añadido una hamburguesa doble, unas patatas fritas y una Coca-Cola. El total es de 14,90 €. Lo envío a Casa y lo pagas con tu tarjeta Visa terminada en 4821. ¿Confirmo el pedido?»
> «Sí.» → «Perfecto. Tu pedido #190 ha sido confirmado. Entrega estimada: 31 minutos.»

## Puesta en marcha

```bash
cp .env.example .env              # ajusta DATABASE_URL
docker compose up -d db           # o usa tu propio PostgreSQL
npm install
npx prisma migrate deploy
npm run db:seed                   # catálogo, usuarios demo e historial
npm run dev                       # http://localhost:3000
```

Cuentas demo:

| Rol | Email | Contraseña |
|---|---|---|
| Cliente | `demo@cortana.app` | `cortana123` |
| Admin (`/admin`) | `admin@cortana.app` | `admin1234` |

**Funciona sin ninguna clave externa.** Sin `OPENAI_API_KEY`, CORTANA usa su motor conversacional local en español y la voz del navegador (Web Speech API). Con la clave, pasa a usar OpenAI para el razonamiento y la **Realtime API por WebRTC** para la voz.

## Scripts

| | |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm test` | Vitest: NLU (unitarios) + diálogos completos contra PostgreSQL |
| `npm run typecheck` / `lint` | TypeScript y ESLint |
| `npm run db:seed` | Datos demo (idempotente) |
| `node scripts/generate-icons.mjs` | Regenera los iconos PWA desde `public/brand` |

## Arquitectura

```
src/
├─ app/
│  ├─ (auth)/login, registro         Acceso (email/contraseña, Google opcional, cuenta demo)
│  ├─ (app)/                         App de cliente (requiere sesión)
│  │   ├─ page.tsx                   Inicio: orbe + «Hablar con CORTANA»
│  │   ├─ conversacion, catalogo, carrito, pedidos[/id],
│  │   └─ direcciones, pagos, perfil, notificaciones
│  ├─ admin/                         Dashboard, pedidos, productos, categorías, clientes, analytics
│  ├─ api/                           Route handlers (JSON, errores tipados, comprobación de Origin)
│  └─ manifest.ts, icon.svg          PWA
├─ components/
│  ├─ cortana/                       Orbe, proveedor de voz, chat, compositor, logo
│  ├─ shop/                          Catálogo, carrito, seguimiento, direcciones, pagos, perfil
│  ├─ admin/                         Tablas, gráficas (Recharts)
│  └─ ui/                            Primitivas estilo shadcn/ui (Radix + CVA + Tailwind)
└─ lib/
   ├─ ai/                            Capa de IA (sin lógica visual)
   │   ├─ ai-intents.ts              22 intents + clasificador y confirmaciones explícitas
   │   ├─ ai-nlu.ts                  Productos, cantidades, tamaños, «sin…», «con … extra»
   │   ├─ ai-tools.ts                Herramientas (Zod + JSON Schema) con guardas de confirmación
   │   ├─ ai-prompts.ts              System prompt de CORTANA
   │   ├─ ai-context.ts              Contexto por turno (carrito, direcciones, pagos, memoria)
   │   ├─ ai-client.ts               OpenAI Chat Completions + tool calling
   │   ├─ local-engine.ts            Motor de diálogo determinista (sin dependencias externas)
   │   ├─ assistant.ts               Orquestador: elige motor, persiste mensajes y estado
   │   ├─ voice-server.ts            Token efímero de la Realtime API
   │   └─ voice-session.ts           Cliente: WebRTC Realtime y Web Speech API con «barge-in»
   ├─ services/                      Dominio: catálogo, carrito, pedidos, direcciones, pagos,
   │                                 notificaciones, memoria, admin, auditoría
   ├─ payments/                      Interfaz de proveedor, Stripe (REST + webhook firmado), demo, efectivo
   ├─ notifications/                 Email (Resend), WhatsApp Cloud API, push (punto de extensión)
   ├─ auth/                          Sesiones en BD (token aleatorio, hash SHA-256, cookie httpOnly)
   └─ stores/                        Zustand
```

### Cómo fluye un pedido

1. **Voz** → `voice-session.ts` (Realtime o navegador) → transcripción en directo en pantalla.
2. **Entender** → `assistant.ts` envía el texto a OpenAI (tool calling) o al motor local. Los dos llaman a las **mismas herramientas** de `ai-tools.ts`.
3. **Pedido** → `createOrder` crea un pedido `PENDIENTE` (sin cobrar) y guarda la acción pendiente en `Conversation.state`.
4. **Confirmar** → `confirmOrder` **solo se ejecuta en el servidor** si hay una confirmación pendiente sin caducar (10 min) *y* el último mensaje real del usuario es afirmativo («sí», «confirmar», «adelante», «haz el pedido»…). El modelo no puede saltarse esta regla. Cancelar un pedido sigue el mismo patrón.
5. **Ejecutar** → cobro mediante el proveedor de pago (Stripe con `pm_…` tokenizado, demo o efectivo), descuento de stock, vaciado del carrito, notificación y registro de auditoría.
6. **Seguimiento** → timeline Confirmado → Preparando → Listo → En camino → Entregado, con ETA. El admin cambia los estados; con `SIMULATE_ORDER_PROGRESS=true` avanzan solos para hacer demos.

### Orbe

`components/cortana/orb.tsx` es un renderizador en Canvas 2D (sin dependencias de WebGL): esfera deformable con remolinos internos, brillo especular, ondas y partículas discretas. Tiene 9 estados (`IDLE`, `LISTENING`, `THINKING`, `SPEAKING`, `CONFIRMING`, `PROCESSING`, `SUCCESS`, `ERROR`, `OFFLINE`) con transiciones suaves, reacciona al nivel real del micrófono y de la voz de salida (`lib/client/audio-level.ts`) y respeta `prefers-reduced-motion`.

### Voz e interrupciones

- **Realtime (OpenAI)**: el VAD del servidor detecta cuándo hablas e interrumpe la respuesta automáticamente. Las herramientas se ejecutan en `/api/ai/tool` con las mismas guardas.
- **Navegador**: el reconocimiento sigue activo mientras CORTANA habla. Si detecta voz que no es su propio eco («espera», «para» o una frase nueva), corta la síntesis y te escucha. También puedes tocar el orbe para interrumpir.
- **Permiso de micrófono**: la primera vez se explica antes de pedirlo; si se deniega, se muestran instrucciones para Chrome, Safari y Android, y se ofrece el modo texto.

### Seguridad

- Contraseñas con bcrypt (coste 12). Sesiones guardadas en BD como hash; cookie `httpOnly` + `SameSite=Lax`.
- Comprobación de `Origin` en las peticiones que modifican datos, rate limiting en login, chat, herramientas y voz.
- No se almacena nunca el número completo de una tarjeta: solo marca, últimos 4 dígitos y la referencia del proveedor.
- La clave de OpenAI nunca llega al navegador (tokens efímeros de 10 min).
- Cabeceras de seguridad (`Permissions-Policy: microphone=(self)`, HSTS, `X-Frame-Options`…).
- `AuditLog` registra las acciones relevantes (pedidos, herramientas de IA, cambios del admin).

### Memoria

Frases como «siempre quiero Coca-Cola Zero», «no me gusta la cebolla» o «soy alérgico al gluten» se guardan como `Preference`. Desde el perfil se puede desactivar la memoria, borrar recuerdos uno a uno o eliminarlos todos (también diciendo «olvida mis preferencias»).

## Integraciones preparadas

| Integración | Variables | Estado |
|---|---|---|
| OpenAI (texto + Realtime) | `OPENAI_API_KEY` | Implementado; si falla, recurre al motor local |
| Google OAuth | `GOOGLE_CLIENT_ID/SECRET` | Implementado |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Cobro off-session, SetupIntent y webhook implementados. **Pendiente**: Stripe Elements en `/pagos` (ahora la tarjeta demo se valida en el cliente y solo se envían marca y últimos 4 dígitos) |
| Email | `RESEND_API_KEY` | Implementado |
| WhatsApp | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` | Implementado (Cloud API) |
| Push web | `VAPID_*` | Service worker listo; falta el proveedor de envío |
| Mapas / catálogos externos | — | `lat/lng` en `Address`; el catálogo pasa por `services/catalog.ts` |

## Marca

Los logos están en `public/brand/`: icono, icono de app, versión oscura y versión clara. Para usar el logo oficial, sustituye esos SVG y ejecuta `node scripts/generate-icons.mjs`.
