import { Bell } from "lucide-react";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getNotifications, markAllRead } from "@/lib/services/notifications";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, cn } from "@/lib/utils";

export const metadata = { title: "Notificaciones" };
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await requireUser("/notificaciones");
  const items = await getNotifications(user.id, 50);
  await markAllRead(user.id);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Notificaciones" />
      {items.length === 0 ? (
        <EmptyState icon={<Bell />} title="Todo al día" description="Aquí verás los avisos de tus pedidos." />
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li key={n.id}>
              <Link href={n.orderId ? `/pedidos/${n.orderId}` : "#"} className={cn("glass flex gap-3 rounded-2xl p-4 transition hover:border-electric/30", !n.readAt && "border-electric/30")}>
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-white/15" : "bg-cyan")} />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-2">
                    <span className="text-sm font-medium">{n.title}</span>
                    <span className="shrink-0 text-xs text-muted">{formatDate(n.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-muted">{n.body}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
