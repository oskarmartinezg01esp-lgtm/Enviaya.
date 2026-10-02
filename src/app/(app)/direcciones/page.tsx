import { requireUser } from "@/lib/auth/session";
import { getAddresses } from "@/lib/services/addresses";
import { AddressManager } from "@/components/shop/address-manager";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Direcciones" };

export default async function AddressesPage() {
  const user = await requireUser("/direcciones");
  const addresses = await getAddresses(user.id);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Direcciones" description="Di «envíalo a casa» o «usa la dirección del trabajo» y CORTANA lo entenderá." />
      <AddressManager initial={JSON.parse(JSON.stringify(addresses))} />
    </div>
  );
}
