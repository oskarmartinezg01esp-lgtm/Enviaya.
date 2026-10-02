"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, FolderTree, LayoutDashboard, Package, ShoppingBag, Users, ArrowLeft } from "lucide-react";
import { CortanaLogo } from "@/components/cortana/logo";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/pedidos", label: "Pedidos", icon: ShoppingBag },
  { href: "/admin/productos", label: "Productos", icon: Package },
  { href: "/admin/categorias", label: "Categorías", icon: FolderTree },
  { href: "/admin/clientes", label: "Clientes", icon: Users },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
];

export function AdminShell({ name, children }: { name: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = (href: string) => (href === "/admin" ? pathname === href : pathname.startsWith(href));
  return (
    <div className="flex min-h-dvh">
      <aside className="glass-strong sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-y-0 border-l-0 p-5 md:flex">
        <CortanaLogo compact />
        <div className="mt-2 pl-[38px] text-[10px] font-semibold uppercase tracking-[0.3em] text-violet-300">Admin</div>
        <nav className="mt-8 flex-1 space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition", active(href) ? "bg-electric/10 text-ink" : "text-muted hover:bg-white/[0.04] hover:text-ink")}>
              <Icon className={cn("size-[18px]", active(href) && "text-cyan")} /> {label}
            </Link>
          ))}
        </nav>
        <Link href="/" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted hover:text-ink">
          <ArrowLeft className="size-4" /> Volver a la app
        </Link>
        <div className="mt-2 px-3 text-xs text-muted">{name}</div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="glass-strong scrollbar-none sticky top-0 z-20 flex gap-1 overflow-x-auto border-x-0 border-t-0 px-3 py-2 md:hidden">
          {NAV.map(({ href, label }) => (
            <Link key={href} href={href} className={cn("shrink-0 rounded-lg px-3 py-1.5 text-sm", active(href) ? "bg-electric/15 text-ink" : "text-muted")}>
              {label}
            </Link>
          ))}
        </div>
        <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
