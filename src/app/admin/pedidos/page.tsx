import { listOrdersAdmin } from "@/lib/services/orders";
import { OrdersTable } from "@/components/admin/orders-table";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Pedidos" };
export const dynamic = "force-dynamic";

export default async function AdminOrdersPage() {
  const orders = await listOrdersAdmin({ take: 200 });
  return (
    <>
      <PageHeader title="Pedidos" description="Gestiona estados, cancela o contacta con el cliente." />
      <OrdersTable initial={JSON.parse(JSON.stringify(orders))} />
    </>
  );
}
