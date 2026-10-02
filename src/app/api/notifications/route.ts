import { apiRoute } from "@/lib/api";
import { apiUser } from "@/lib/auth/session";
import { countUnread, getNotifications, markAllRead } from "@/lib/services/notifications";

export const GET = apiRoute(async () => {
  const user = await apiUser();
  const [items, unread] = await Promise.all([getNotifications(user.id), countUnread(user.id)]);
  return { items, unread };
});

export const POST = apiRoute(async () => {
  await markAllRead((await apiUser()).id);
  return { ok: true };
});
