"use client";

import { useEffect, useRef } from "react";
import { audioLevel } from "@/lib/client/audio-level";
import { cn } from "@/lib/utils";

export type OrbState = "IDLE" | "LISTENING" | "THINKING" | "SPEAKING" | "CONFIRMING" | "PROCESSING" | "SUCCESS" | "ERROR" | "OFFLINE";

type RGB = [number, number, number];
type Params = {
  c1: RGB; // núcleo brillante
  c2: RGB; // cuerpo
  c3: RGB; // borde
  glow: RGB;
  glowAlpha: number;
  amp: number; // deformación
  speed: number;
  scale: number;
  particles: number; // 0..1 visibilidad
  particleSpeed: number;
  rings: number; // 0..1
  spinner: number; // 0..1
};

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

const PRESETS: Record<OrbState, Params> = {
  IDLE: { c1: hex("#7DF3FF"), c2: hex("#0089FF"), c3: hex("#5B2BD6"), glow: hex("#0066FF"), glowAlpha: 0.22, amp: 0.025, speed: 0.35, scale: 1, particles: 0.25, particleSpeed: 0.15, rings: 0, spinner: 0 },
  LISTENING: { c1: hex("#B8FBFF"), c2: hex("#00C8FF"), c3: hex("#0055FF"), glow: hex("#00E5FF"), glowAlpha: 0.38, amp: 0.05, speed: 0.9, scale: 1.08, particles: 0.35, particleSpeed: 0.3, rings: 1, spinner: 0 },
  THINKING: { c1: hex("#C9B6FF"), c2: hex("#4C6BFF"), c3: hex("#7C3AED"), glow: hex("#7C3AED"), glowAlpha: 0.32, amp: 0.04, speed: 1.6, scale: 0.97, particles: 1, particleSpeed: 1.4, rings: 0, spinner: 0 },
  SPEAKING: { c1: hex("#D6FDFF"), c2: hex("#00AFFF"), c3: hex("#3A3AED"), glow: hex("#00AFFF"), glowAlpha: 0.4, amp: 0.06, speed: 1.2, scale: 1.04, particles: 0.45, particleSpeed: 0.5, rings: 0.25, spinner: 0 },
  CONFIRMING: { c1: hex("#E5DBFF"), c2: hex("#5B7CFF"), c3: hex("#7C3AED"), glow: hex("#7C3AED"), glowAlpha: 0.3, amp: 0.03, speed: 0.6, scale: 1.02, particles: 0.4, particleSpeed: 0.25, rings: 0.5, spinner: 0 },
  PROCESSING: { c1: hex("#B8FBFF"), c2: hex("#0089FF"), c3: hex("#7C3AED"), glow: hex("#00AFFF"), glowAlpha: 0.3, amp: 0.03, speed: 1.4, scale: 0.98, particles: 0.8, particleSpeed: 1.8, rings: 0, spinner: 1 },
  SUCCESS: { c1: hex("#D9FFF3"), c2: hex("#22D3A6"), c3: hex("#00AFFF"), glow: hex("#22D3A6"), glowAlpha: 0.38, amp: 0.03, speed: 0.6, scale: 1.06, particles: 0.6, particleSpeed: 0.4, rings: 0.8, spinner: 0 },
  ERROR: { c1: hex("#FFD6DE"), c2: hex("#E2365A"), c3: hex("#6D28D9"), glow: hex("#FF4D6D"), glowAlpha: 0.26, amp: 0.035, speed: 0.8, scale: 0.98, particles: 0.2, particleSpeed: 0.2, rings: 0, spinner: 0 },
  OFFLINE: { c1: hex("#CBD5E1"), c2: hex("#475569"), c3: hex("#1E293B"), glow: hex("#334155"), glowAlpha: 0.12, amp: 0.012, speed: 0.15, scale: 0.94, particles: 0, particleSpeed: 0.05, rings: 0, spinner: 0 },
};

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lerpRGB = (a: RGB, b: RGB, k: number): RGB => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const rgba = (c: RGB, a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

type Particle = { a: number; r: number; s: number; size: number; phase: number };

export function CortanaOrb({ state, size = 280, className, onClick, label }: { state: OrbState; size?: number; className?: string; onClick?: () => void; label?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = size * 1.6;
    canvas.width = W * dpr;
    canvas.height = W * dpr;
    ctx.scale(dpr, dpr);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const p: Params = structuredClone(PRESETS[stateRef.current]);
    const particles: Particle[] = Array.from({ length: 46 }, () => ({
      a: Math.random() * Math.PI * 2,
      r: 1.15 + Math.random() * 0.5,
      s: (0.4 + Math.random()) * (Math.random() > 0.5 ? 1 : -1),
      size: 0.6 + Math.random() * 1.6,
      phase: Math.random() * Math.PI * 2,
    }));
    let rings: number[] = [];
    let lastRing = 0;
    let level = 0;
    let t = 0;
    let prevState = stateRef.current;
    let burst = 0; // animación de éxito
    let shake = 0; // animación de error
    let raf = 0;
    let last = performance.now();

    const N = 120;
    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const st = stateRef.current;
      if (st !== prevState) {
        if (st === "SUCCESS") burst = 1;
        if (st === "ERROR") shake = 1;
        prevState = st;
      }
      const target = PRESETS[st];
      const k = 1 - Math.pow(0.002, dt); // suavizado independiente de FPS
      p.c1 = lerpRGB(p.c1, target.c1, k);
      p.c2 = lerpRGB(p.c2, target.c2, k);
      p.c3 = lerpRGB(p.c3, target.c3, k);
      p.glow = lerpRGB(p.glow, target.glow, k);
      for (const key of ["glowAlpha", "amp", "speed", "scale", "particles", "particleSpeed", "rings", "spinner"] as const) p[key] = lerp(p[key], target[key], k);

      // Nivel de audio
      let raw = 0;
      if (st === "LISTENING") raw = audioLevel.mic;
      else if (st === "SPEAKING") {
        raw = audioLevel.outputMeasured ? audioLevel.output : 0.28 + 0.22 * Math.abs(Math.sin(t * 7.3) * Math.sin(t * 2.9 + 1));
      }
      level = lerp(level, raw, raw > level ? 0.35 : 0.12);

      t += dt * (reduced ? 0.2 : 1) * (0.6 + p.speed);
      burst = Math.max(0, burst - dt * 0.9);
      shake = Math.max(0, shake - dt * 2.2);

      const cx = W / 2 + (shake > 0 ? Math.sin(now / 18) * 4 * shake : 0);
      const cy = W / 2;
      const R = (size / 2) * 0.62 * p.scale * (1 + level * 0.1 + Math.sin(t * 1.3) * 0.008 + (st === "THINKING" ? Math.sin(t * 3.2) * 0.02 : 0));

      ctx.clearRect(0, 0, W, W);

      // 1) Resplandor ambiental
      const glowR = R * (2.1 + level * 0.4);
      const g = ctx.createRadialGradient(cx, cy, R * 0.4, cx, cy, glowR);
      g.addColorStop(0, rgba(p.glow, p.glowAlpha * (0.9 + level * 0.6)));
      g.addColorStop(0.45, rgba(p.glow, p.glowAlpha * 0.35));
      g.addColorStop(1, rgba(p.glow, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, W);

      // 2) Ondas expansivas
      if (p.rings > 0.05 && !reduced) {
        const interval = st === "LISTENING" ? 0.9 - level * 0.5 : 1.6;
        if (t - lastRing > interval) {
          rings.push(0);
          lastRing = t;
        }
      }
      rings = rings.map((r) => r + dt * (0.45 + level * 0.6)).filter((r) => r < 1);
      for (const r of rings) {
        ctx.beginPath();
        ctx.arc(cx, cy, R * (1.02 + r * 0.95), 0, Math.PI * 2);
        ctx.strokeStyle = rgba(p.c1, (1 - r) * 0.28 * p.rings);
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      if (burst > 0) {
        ctx.beginPath();
        ctx.arc(cx, cy, R * (1 + (1 - burst) * 0.9), 0, Math.PI * 2);
        ctx.strokeStyle = rgba(p.c1, burst * 0.6);
        ctx.lineWidth = 2.5 * burst + 0.5;
        ctx.stroke();
      }

      // 3) Esfera deformable
      const amp = p.amp + level * 0.16;
      const pts: [number, number][] = [];
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        const n =
          Math.sin(a * 3 + t * 1.3) * 0.5 +
          Math.sin(a * 5 - t * 1.75 + 1.3) * 0.3 +
          Math.sin(a * 2 + t * 0.7) * 0.35 +
          Math.sin(a * 8 + t * 3.1) * 0.12 * (level * 2);
        const r = R * (1 + amp * n);
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
      const path = new Path2D();
      for (let i = 0; i <= N; i++) {
        const [x0, y0] = pts[i % N];
        const [x1, y1] = pts[(i + 1) % N];
        const mx = (x0 + x1) / 2;
        const my = (y0 + y1) / 2;
        if (i === 0) path.moveTo(mx, my);
        else path.quadraticCurveTo(x0, y0, mx, my);
      }
      path.closePath();

      const body = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.05, cx, cy, R * 1.15);
      body.addColorStop(0, rgba(p.c1, 1));
      body.addColorStop(0.35, rgba(p.c2, 0.95));
      body.addColorStop(0.85, rgba(p.c3, 0.92));
      body.addColorStop(1, rgba(p.c3, 0.75));
      ctx.fillStyle = body;
      ctx.fill(path);

      // Remolinos internos (sensación 3D)
      ctx.save();
      ctx.clip(path);
      ctx.globalCompositeOperation = "lighter";
      for (let j = 0; j < 3; j++) {
        const ang = t * (0.35 + j * 0.22) * (j % 2 ? -1 : 1) + j * 2.1;
        const ox = cx + Math.cos(ang) * R * 0.42;
        const oy = cy + Math.sin(ang) * R * 0.32;
        const sw = ctx.createRadialGradient(ox, oy, 0, ox, oy, R * (0.75 + 0.1 * j));
        const col = j === 1 ? p.c3 : p.c1;
        sw.addColorStop(0, rgba(col, 0.22 + level * 0.25));
        sw.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = sw;
        ctx.fillRect(cx - R * 1.5, cy - R * 1.5, R * 3, R * 3);
      }
      ctx.globalCompositeOperation = "source-over";
      // Brillo especular
      const spec = ctx.createRadialGradient(cx - R * 0.38, cy - R * 0.46, 0, cx - R * 0.38, cy - R * 0.46, R * 0.55);
      spec.addColorStop(0, "rgba(255,255,255,0.42)");
      spec.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = spec;
      ctx.fillRect(cx - R * 1.5, cy - R * 1.5, R * 3, R * 3);
      // Sombra inferior
      const shade = ctx.createRadialGradient(cx + R * 0.3, cy + R * 0.5, 0, cx + R * 0.3, cy + R * 0.5, R * 1.1);
      shade.addColorStop(0, "rgba(5,7,13,0)");
      shade.addColorStop(1, "rgba(5,7,13,0.35)");
      ctx.fillStyle = shade;
      ctx.fillRect(cx - R * 1.5, cy - R * 1.5, R * 3, R * 3);
      ctx.restore();

      // Borde fino
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = rgba(p.c1, 0.35 + level * 0.3);
      ctx.stroke(path);

      // 4) Arco de procesamiento
      if (p.spinner > 0.05) {
        const a0 = t * 2.6;
        ctx.beginPath();
        ctx.arc(cx, cy, R * 1.22, a0, a0 + Math.PI * 0.55);
        ctx.strokeStyle = rgba(p.c1, 0.75 * p.spinner);
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.stroke();
      }

      // 5) Partículas discretas
      if (p.particles > 0.02) {
        for (const pt of particles) {
          pt.a += dt * pt.s * p.particleSpeed;
          const rr = R * (pt.r + Math.sin(t * 0.8 + pt.phase) * 0.04 + level * 0.15);
          const x = cx + Math.cos(pt.a) * rr;
          const y = cy + Math.sin(pt.a) * rr * 0.92;
          const alpha = (0.25 + 0.45 * (0.5 + 0.5 * Math.sin(t * 2 + pt.phase))) * p.particles;
          ctx.beginPath();
          ctx.arc(x, y, pt.size, 0, Math.PI * 2);
          ctx.fillStyle = rgba(p.c1, alpha);
          ctx.fill();
        }
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  const W = size * 1.6;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label ?? "Hablar con CORTANA"}
      className={cn("relative grid place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-electric/50", onClick ? "cursor-pointer" : "cursor-default", className)}
      style={{ width: size, height: size }}
    >
      <canvas ref={canvasRef} style={{ width: W, height: W }} className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
    </button>
  );
}

export const ORB_LABEL: Record<OrbState, string> = {
  IDLE: "Toca para hablar",
  LISTENING: "CORTANA está escuchando...",
  THINKING: "CORTANA está pensando...",
  SPEAKING: "CORTANA está hablando...",
  CONFIRMING: "Esperando tu confirmación",
  PROCESSING: "Procesando tu pedido...",
  SUCCESS: "Pedido confirmado",
  ERROR: "No he podido completar la acción.",
  OFFLINE: "Sin conexión",
};
