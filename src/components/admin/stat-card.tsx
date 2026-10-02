import { cn } from "@/lib/utils";

export function StatCard({ label, value, hint, icon, accent = "electric" }: { label: string; value: string; hint?: string; icon: React.ReactNode; accent?: "electric" | "violet" | "success" | "warning" }) {
  const colors = { electric: "text-cyan bg-electric/10", violet: "text-violet-300 bg-violet/15", success: "text-success bg-success/10", warning: "text-warning bg-warning/10" };
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted">{label}</span>
        <span className={cn("grid size-8 place-items-center rounded-lg [&_svg]:size-4", colors[accent])}>{icon}</span>
      </div>
      <div className="mt-3 font-display text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}
