import { db } from "@/lib/db";
import { sendEmail, sendPush, sendWhatsApp } from "@/lib/notifications/channels";

export type OrderEvent = "order.confirmed" | "order.preparing" | "order.ready" | "order.shipped" | "order.delivered" | "order.cancelled";

/**
 * Crea la notificación in-app y la reparte a los canales que el usuario tenga activados.
 * Los envíos externos se hacen sin bloquear la respuesta de CORTANA.
 */
export async function sendNotification(params: {
  userId: string;
  event: OrderEvent | string;
  title: string;
  body: string;
  orderId?: string;
}) {
  const notification = await db.notification.create({
    data: {
      userId: params.userId,
      orderId: params.orderId,
      event: params.event,
      title: params.title,
      body: params.body,
      channel: "IN_APP",
      status: "SENT",
    },
  });

  void (async () => {
    const user = await db.user.findUnique({ where: { id: params.userId }, include: { profile: true } });
    if (!user) return;
    const msg = { to: user.email, title: params.title, body: params.body };
    const jobs: [("EMAIL" | "WHATSAPP" | "PUSH"), Promise<{ ok: boolean; skipped?: boolean }>][] = [];
    if (user.profile?.notifyEmail ?? true) jobs.push(["EMAIL", sendEmail(msg)]);
    if (user.profile?.notifyWhatsapp && user.phone) jobs.push(["WHATSAPP", sendWhatsApp({ ...msg, to: user.phone })]);
    if (user.profile?.notifyPush ?? true) jobs.push(["PUSH", sendPush(msg)]);
    for (const [channel, job] of jobs) {
      const r = await job.catch(() => ({ ok: false, skipped: false }));
      if (r.skipped) continue;
      await db.notification.create({
        data: {
          userId: params.userId,
          orderId: params.orderId,
          event: params.event,
          title: params.title,
          body: params.body,
          channel,
          status: r.ok ? "SENT" : "FAILED",
        },
      });
    }
  })().catch((e) => console.error("[notifications]", e));

  return notification;
}

export async function getNotifications(userId: string, limit = 30) {
  return db.notification.findMany({
    where: { userId, channel: "IN_APP" },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function countUnread(userId: string) {
  return db.notification.count({ where: { userId, channel: "IN_APP", readAt: null } });
}

export async function markAllRead(userId: string) {
  await db.notification.updateMany({
    where: { userId, channel: "IN_APP", readAt: null },
    data: { readAt: new Date(), status: "READ" },
  });
}
