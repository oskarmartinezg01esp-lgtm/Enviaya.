import Link from "next/link";
import { CheckCircle2, Clock, Euro, Package, ShoppingBag, TrendingUp, Users, Receipt } from "lucide-react";
import { getAnalytics, getDashboardStats } from "@/lib/services/admin";
import { listOrdersAdmin } from "@/lib/services/orders";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { StatCard } from "@/components/admin/stat-card";
import { SalesChart } from "@/components/admin/charts";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { STATUS_VARIANT } from "@/components/shop/order-tracker";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const [stats, analytics, recent] = await Promise.all([getDashboardStats(), getAnalytics(14), listOrdersAdmin({ take: 8 })]);
  return (
    <>
      <PageHeader title="Dashboard" description="Actividad de CORTANA en tiempo real." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Pedidos hoy" value={String(stats.ordersToday)} icon={<ShoppingBag />} />
        <StatCard label="Ventas hoy" value={formatCents(stats.salesToday)} icon={<Euro />} accent="success" />
        <StatCard label="Clientes" value={String(stats.customers)} icon={<Users />} accent="violet" />
        <StatCard label="Productos activos" value={String(stats.products)} icon={<Package />} />
        <StatCard label="Pendientes" value={String(stats.pending)} hint="Confirmados, en cocina o en camino" icon={<Clock />} accent="warning" />
        <StatCard label="Completados" value={String(stats.completed)} icon={<CheckCircle2 />} accent="success" />
        <StatCard label="Ingresos" value={formatCents(stats.revenue)} icon={<TrendingUp />} accent="violet" />
        <StatCard label="Ticket medio" value={formatCents(stats.avgTicket)} icon={<Receipt />} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="glass rounded-2xl p-5">
          <h2 className="mb-4 font-display font-semibold">Ventas · últimos 14 días</h2>
          <SalesChart data={analytics.byDay} />
        </div>
        <div className="glass rounded-2xl p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display font-semibold">Últimos pedidos</h2>
            <Link href="/admin/pedidos" className="text-xs text-cyan hover:underline">Ver todos</Link>
          </div>
          <ul className="divide-y divide-white/5">
            {recent.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="font-medium">#{o.number} · {o.customer.name}</div>
                  <div className="text-xs text-muted">{formatDate(o.createdAt)} · {o.source === "voice" ? "🎙️ voz" : o.source}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="tabular-nums">{formatCents(o.totalCents)}</span>
                  <Badge variant={STATUS_VARIANT[o.status]}>{o.statusLabel}</Badge>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
