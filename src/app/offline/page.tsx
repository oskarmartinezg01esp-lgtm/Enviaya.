import { CortanaMark } from "@/components/cortana/logo";

export const metadata = { title: "Sin conexión" };

export default function OfflinePage() {
  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <CortanaMark className="mx-auto size-16 opacity-60" />
        <h1 className="mt-6 font-display text-2xl font-semibold">Sin conexión</h1>
        <p className="mt-2 text-muted">CORTANA necesita internet para tomar tu pedido. Vuelve a intentarlo en cuanto recuperes la conexión.</p>
      </div>
    </div>
  );
}
