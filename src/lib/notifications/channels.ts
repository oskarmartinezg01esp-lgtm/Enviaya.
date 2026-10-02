/**
 * Adaptadores de canales externos. Cada uno se activa con sus variables de entorno;
 * si no están configuradas, el envío se registra como omitido (no rompe el flujo).
 */
export type OutboundMessage = { to: string; title: string; body: string };
export type ChannelResult = { ok: boolean; skipped?: boolean; error?: string };

export async function sendEmail(msg: OutboundMessage): Promise<ChannelResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "CORTANA <pedidos@cortana.app>";
  if (!key) return { ok: false, skipped: true };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: msg.to, subject: msg.title, text: msg.body }),
    });
    return res.ok ? { ok: true } : { ok: false, error: await res.text() };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** WhatsApp Cloud API (Meta). Requiere WHATSAPP_TOKEN y WHATSAPP_PHONE_ID. */
export async function sendWhatsApp(msg: OutboundMessage): Promise<ChannelResult> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) return { ok: false, skipped: true };
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: msg.to.replace(/[^\d]/g, ""),
        type: "text",
        text: { body: `*${msg.title}*\n${msg.body}` },
      }),
    });
    return res.ok ? { ok: true } : { ok: false, error: await res.text() };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Push web: la suscripción del navegador se gestiona en el service worker.
 * Punto de extensión para web-push / FCM (requiere VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY).
 */
export async function sendPush(_msg: OutboundMessage): Promise<ChannelResult> {
  if (!process.env.VAPID_PRIVATE_KEY) return { ok: false, skipped: true };
  return { ok: false, skipped: true, error: "Proveedor push pendiente de configurar" };
}
