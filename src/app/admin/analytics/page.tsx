import { getAnalytics } from "@/lib/services/admin";
import { formatCents } from "@/lib/money";
import { BarsChart, SalesChart, SourcePie } from "@/components/admin/charts";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/admin/stat-card";
import { Euro, Receipt, ShoppingBag } from "lucide-react";

export const metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const a = await getAnalytics(30);
  const box = "glass rounded-2xl p-5";
  return (
    <>
      <PageHeader title="Analytics" description="Últimos 30 días." />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="Pedidos" value={String(a.totals.orders)} icon={<ShoppingBag />} />
        <StatCard label="Ventas" value={formatCents(a.totals.revenue)} icon={<Euro />} accent="success" />
        <StatCard label="Ticket medio" value={formatCents(a.totals.avgTicket)} icon={<Receipt />} accent="violet" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className={box}><h2 className="mb-4 font-display font-semibold">Ventas por día</h2><SalesChart data={a.byDay} /></div>
        <div className={box}><h2 className="mb-4 font-display font-semibold">Pedidos por día</h2><BarsChart data={a.byDay} x="date" y="pedidos" label="Pedidos" color="#7C3AED" /></div>
        <div className={box}><h2 className="mb-4 font-display font-semibold">Ticket medio por día</h2><BarsChart data={a.byDay} x="date" y="ticket" label="Ticket medio" format="eur" color="#22D3A6" /></div>
        <div className={box}><h2 className="mb-4 font-display font-semibold">Pedidos por hora</h2><BarsChart data={a.byHour} x="hora" y="pedidos" label="Pedidos" color="#00E5FF" /></div>
        <div className={box}><h2 className="mb-4 font-display font-semibold">Productos más vendidos</h2><BarsChart data={a.topProducts} x="name" y="unidades" label="Unidades" horizontal /></div>
        <div className={box}><h2 className="mb-4 font-display font-semibold">Canal del pedido</h2><SourcePie data={a.bySource} /></div>
      </div>
    </>
  );
}
