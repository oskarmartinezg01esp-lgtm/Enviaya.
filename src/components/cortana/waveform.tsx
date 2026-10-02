"use client";

import { useEffect, useRef } from "react";
import { audioLevel } from "@/lib/client/audio-level";
import type { OrbState } from "./orb";

/** Barras de audio discretas bajo el orbe. */
export function Waveform({ state, bars = 28, className }: { state: OrbState; bars?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    const el = ref.current!;
    const nodes = Array.from(el.children) as HTMLElement[];
    let raf = 0;
    let t = 0;
    const loop = () => {
      t += 0.016;
      const s = stateRef.current;
      const lvl = s === "LISTENING" ? audioLevel.mic : s === "SPEAKING" ? (audioLevel.outputMeasured ? audioLevel.output : 0.35 + 0.25 * Math.abs(Math.sin(t * 6))) : s === "THINKING" ? 0.15 : 0.04;
      nodes.forEach((n, i) => {
        const center = 1 - Math.abs(i - nodes.length / 2) / (nodes.length / 2);
        const wave = 0.5 + 0.5 * Math.sin(t * 5 + i * 0.6);
        const h = 0.08 + Math.min(1, lvl * 1.6) * center * (0.45 + wave * 0.55);
        n.style.transform = `scaleY(${h})`;
      });
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div ref={ref} className={className} aria-hidden style={{ display: "flex", alignItems: "center", gap: 3, height: 36 }}>
      {Array.from({ length: bars }).map((_, i) => (
        <span key={i} className="block h-full w-[3px] origin-center rounded-full bg-gradient-to-b from-cyan to-deep opacity-80 transition-transform duration-75" />
      ))}
    </div>
  );
}
