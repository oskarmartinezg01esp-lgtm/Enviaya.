import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-wide", {
  variants: {
    variant: {
      default: "bg-white/[0.06] text-ink border border-white/10",
      electric: "bg-electric/15 text-cyan border border-electric/30",
      violet: "bg-violet/15 text-violet-300 border border-violet/30",
      success: "bg-success/15 text-success border border-success/30",
      warning: "bg-warning/15 text-warning border border-warning/30",
      danger: "bg-danger/15 text-danger border border-danger/30",
      muted: "bg-white/[0.04] text-muted border border-white/5",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
