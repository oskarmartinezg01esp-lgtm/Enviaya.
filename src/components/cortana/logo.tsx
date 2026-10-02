import { useId } from "react";
import { cn } from "@/lib/utils";

/** Icono de marca CORTANA: "C" + ondas de voz. Vectorial, nítido a cualquier tamaño. */
export function CortanaMark({ className, glow = true }: { className?: string; glow?: boolean }) {
  // IDs únicos: si una copia del logo está oculta (display:none), sus gradientes no se pintan
  const uid = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 512 512" className={cn("size-8", className)} aria-hidden>
      <defs>
        <linearGradient id={`cm-arc-${uid}`} x1="80" y1="80" x2="432" y2="432" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#00E5FF" />
          <stop offset=".55" stopColor="#00AFFF" />
          <stop offset="1" stopColor="#7C3AED" />
        </linearGradient>
        <linearGradient id={`cm-bar-${uid}`} x1="0" y1="166" x2="0" y2="346" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#00E5FF" />
          <stop offset="1" stopColor="#0066FF" />
        </linearGradient>
        <filter id={`cm-glow-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="10" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter={glow ? `url(#cm-glow-${uid})` : undefined}>
        <path d="M370.6 159.6A150 150 0 1 0 370.6 352.4" fill="none" stroke={`url(#cm-arc-${uid})`} strokeWidth="40" strokeLinecap="round" />
        <circle cx="392" cy="256" r="18" fill="#00E5FF" />
        <g fill={`url(#cm-bar-${uid})`}>
          <rect x="186" y="226" width="22" height="60" rx="11" />
          <rect x="222" y="190" width="22" height="132" rx="11" />
          <rect x="258" y="166" width="22" height="180" rx="11" />
          <rect x="294" y="206" width="22" height="100" rx="11" />
        </g>
      </g>
    </svg>
  );
}

export function CortanaLogo({ className, compact = false, subtitle = true }: { className?: string; compact?: boolean; subtitle?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <CortanaMark className={compact ? "size-7" : "size-9"} />
      <div className="leading-none">
        <div className={cn("font-display font-semibold tracking-[0.28em] text-white", compact ? "text-sm" : "text-[15px]")}>CORTANA</div>
        {subtitle && <div className="mt-1 text-[9px] font-medium tracking-[0.32em] text-muted">PEDIDOS POR VOZ</div>}
      </div>
    </div>
  );
}
