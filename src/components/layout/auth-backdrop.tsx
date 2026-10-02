"use client";

import { useEffect, useState } from "react";
import { CortanaOrb, type OrbState } from "@/components/cortana/orb";
import { CortanaLogo } from "@/components/cortana/logo";

const DEMO: { state: OrbState; user?: string; cortana?: string }[] = [
  { state: "LISTENING", user: "Quiero una hamburguesa doble, unas patatas y una Coca-Cola." },
  { state: "THINKING" },
  { state: "SPEAKING", cortana: "Claro. El total es de 14,90 €. ¿Quieres confirmar el pedido?" },
  { state: "LISTENING", user: "Sí." },
  { state: "SUCCESS", cortana: "Perfecto. Tu pedido ha sido confirmado." },
  { state: "IDLE" },
];

export function AuthBackdrop() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((x) => (x + 1) % DEMO.length), 2600);
    return () => clearInterval(id);
  }, []);
  const step = DEMO[i];
  return (
    <div className="relative hidden flex-col items-center justify-center overflow-hidden border-r border-white/5 lg:flex">
      <div className="absolute left-10 top-10">
        <CortanaLogo />
      </div>
      <CortanaOrb state={step.state} size={320} />
      <div className="mt-10 h-24 max-w-md px-6 text-center">
        {step.user && <p className="text-lg text-ink/90">“{step.user}”</p>}
        {step.cortana && <p className="text-lg text-cyan">{step.cortana}</p>}
      </div>
      <p className="absolute bottom-10 text-xs uppercase tracking-[0.35em] text-muted">Habla · Pide · Confirma · Sigue</p>
    </div>
  );
}
