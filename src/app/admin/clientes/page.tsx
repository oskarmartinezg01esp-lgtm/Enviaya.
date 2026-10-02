import { getCustomersAdmin } from "@/lib/services/admin";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Clientes" };
export const dynamic = "force-dynamic";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const customers = await getCustomersAdmin(q);
  return (
    <>
      <PageHeader title="Clientes" description={`${customers.length} clientes`} />
      <form className="mb-4">
        <input name="q" defaultValue={q} placeholder="Buscar por nombre o email…" className="h-11 w-full max-w-sm rounded-xl border border-white/10 bg-white/[0.03] px-3.5 text-sm outline-none focus:border-electric/60" />
      </form>
      <div className="glass overflow-x-auto rounded-2xl">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-muted">
            <tr className="border-b border-white/5">
              <th className="p-4">Nombre</th><th className="p-4">Email</th><th className="p-4">Teléfono</th><th className="p-4 text-right">Pedidos</th><th className="p-4">Último pedido</th><th className="p-4 text-right">Total gastado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {customers.map((c) => (
              <tr key={c.id} className="hover:bg-white/[0.02]">
                <td className="p-4 font-medium">{c.name}</td>
                <td className="p-4 text-muted">{c.email}</td>
                <td className="p-4 text-muted">{c.phone ?? "—"}</td>
                <td className="p-4 text-right tabular-nums">{c.orders}</td>
                <td className="p-4 text-muted">{c.lastOrder ? formatDate(c.lastOrder) : "—"}</td>
                <td className="p-4 text-right font-medium tabular-nums">{formatCents(c.totalSpent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
