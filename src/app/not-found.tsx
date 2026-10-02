import Link from "next/link";
import { CortanaMark } from "@/components/cortana/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <CortanaMark className="mx-auto size-16" />
        <h1 className="mt-6 font-display text-2xl font-semibold">No encuentro esta página</h1>
        <p className="mt-2 text-muted">Pero puedo ayudarte a pedir algo rico.</p>
        <Button variant="primary" className="mt-6" asChild>
          <Link href="/">Volver con CORTANA</Link>
        </Button>
      </div>
    </div>
  );
}
