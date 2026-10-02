"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, LogOut, Menu, Shield, X, LayoutGrid, MapPin, CreditCard } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { CortanaLogo } from "@/components/cortana/logo";
import { CortanaProvider, type VoiceSettings } from "@/components/cortana/cortana-provider";
import { MicPermissionDialog } from "@/components/cortana/mic-permission-dialog";
import { CartSidePanel } from "@/components/shop/cart-panel";
import { useCortana } from "@/lib/stores/cortana-store";
import { api } from "@/lib/client/api";
import type { CartView } from "@/lib/services/cart";
import { cn } from "@/lib/utils";
import { BOTTOM_NAV, SIDEBAR_NAV, isActive } from "./nav";

export type ShellUser = { id: string; name: string; email: string; role: "CUSTOMER" | "ADMIN"; avatarUrl: string | null };

function Avatar({ user, className }: { user: ShellUser; className?: string }) {
  const initials = user.name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <span className={cn("grid size-9 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-deep to-violet text-xs font-semibold", className)}>
      {user.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.avatarUrl} alt="" className="size-full object-cover" />
      ) : (
        initials
      )}
    </span>
  );
}

function NotificationBell() {
  const unread = useCortana((s) => s.unread);
  const set = useCortana((s) => s.set);
  useEffect(() => {
    let alive = true;
    const load = () =>
      api<{ unread: number }>("/api/notifications")
        .then((r) => alive && set({ unread: r.unread }))
        .catch(() => {});
    load();
    const id = setInterval(load, 45_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [set]);
  return (
    <Link href="/notificaciones" className="relative grid size-10 place-items-center rounded-xl text-muted transition hover:bg-white/5 hover:text-ink" aria-label="Notificaciones">
      <Bell className="size-5" />
      {unread > 0 && (
        <span className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-cyan px-1 text-[10px] font-bold text-bg">{unread > 9 ? "9+" : unread}</span>
      )}
    </Link>
  );
}

function CartBadge() {
  const count = useCortana((s) => s.cart?.itemCount ?? 0);
  if (!count) return null;
  return <span className="absolute -right-1.5 -top-1 grid min-w-4 place-items-center rounded-full bg-cyan px-1 text-[10px] font-bold text-bg">{count}</span>;
}

async function logout(router: ReturnType<typeof useRouter>) {
  await api("/api/auth/logout", { method: "POST" }).catch(() => {});
  sessionStorage.removeItem("cortana-session");
  router.replace("/login");
  router.refresh();
}

export function AppShell({ user, settings, initialCart, children }: { user: ShellUser; settings: VoiceSettings; initialCart: CartView; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const showSidePanel = pathname !== "/carrito";

  useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <CortanaProvider settings={settings} initialCart={initialCart}>
      <div className="flex min-h-dvh">
        {/* Sidebar escritorio */}
        <aside className="glass-strong sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-y-0 border-l-0 px-4 py-6 lg:flex">
          <Link href="/" className="px-2">
            <CortanaLogo />
          </Link>
          <nav className="mt-10 flex-1 space-y-1">
            {SIDEBAR_NAV.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
                    active ? "bg-electric/10 text-ink" : "text-muted hover:bg-white/[0.04] hover:text-ink",
                  )}
                >
                  {active && <motion.span layoutId="nav-active" className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-cyan" />}
                  <Icon className={cn("size-[18px]", active ? "text-cyan" : "")} />
                  {label}
                  {href === "/carrito" && (
                    <span className="relative ml-auto">
                      <CartBadge />
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
          {user.role === "ADMIN" && (
            <Link href="/admin" className="mb-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted transition hover:bg-white/[0.04] hover:text-ink">
              <Shield className="size-[18px]" /> Panel admin
            </Link>
          )}
          <div className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] p-3">
            <Avatar user={user} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{user.name}</div>
              <div className="truncate text-xs text-muted">{user.email}</div>
            </div>
            <button onClick={() => void logout(router)} className="rounded-lg p-1.5 text-muted transition hover:bg-white/5 hover:text-ink" aria-label="Cerrar sesión">
              <LogOut className="size-4" />
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top bar */}
          <header className="pt-safe sticky top-0 z-30 border-b border-white/5 bg-bg/70 backdrop-blur-xl lg:border-0 lg:bg-transparent lg:backdrop-blur-0">
            <div className="flex h-16 items-center justify-between px-4 sm:px-6">
              <Link href="/" className="lg:hidden">
                <CortanaLogo compact />
              </Link>
              <div className="hidden lg:block" />
              <div className="flex items-center gap-1">
                <NotificationBell />
                <Link href="/perfil" className="ml-1 hidden sm:block" aria-label="Perfil">
                  <Avatar user={user} />
                </Link>
                <button onClick={() => setMenuOpen(true)} className="grid size-10 place-items-center rounded-xl text-muted transition hover:bg-white/5 hover:text-ink lg:hidden" aria-label="Menú">
                  <Menu className="size-5" />
                </button>
              </div>
            </div>
          </header>

          <div className="flex flex-1">
            <main className="min-w-0 flex-1 px-4 pb-28 pt-2 sm:px-6 lg:pb-10">{children}</main>
            {showSidePanel && (
              <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-[340px] shrink-0 px-5 pb-6 xl:block">
                <CartSidePanel />
              </aside>
            )}
          </div>
        </div>
      </div>

      {/* Navegación inferior móvil */}
      <nav className="glass-strong pb-safe fixed inset-x-0 bottom-0 z-40 border-x-0 border-b-0 lg:hidden" aria-label="Navegación principal">
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {BOTTOM_NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link href={href} className={cn("flex flex-col items-center gap-1 pb-1 pt-2.5 text-[10px] font-medium transition", active ? "text-cyan" : "text-muted")}>
                  <span className="relative">
                    <Icon className="size-5" />
                    {href === "/carrito" && <CartBadge />}
                  </span>
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Menú móvil */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div className="fixed inset-0 z-50 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMenuOpen(false)} />
            <motion.div
              className="glass-strong absolute inset-y-0 right-0 flex w-[82%] max-w-xs flex-col p-5"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
            >
              <div className="flex items-center justify-between">
                <CortanaLogo compact />
                <button onClick={() => setMenuOpen(false)} className="rounded-lg p-2 text-muted hover:bg-white/5" aria-label="Cerrar menú">
                  <X className="size-5" />
                </button>
              </div>
              <div className="mt-6 flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] p-3">
                <Avatar user={user} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{user.name}</div>
                  <div className="truncate text-xs text-muted">{user.email}</div>
                </div>
              </div>
              <nav className="mt-4 flex-1 space-y-1">
                {[{ href: "/catalogo", label: "Catálogo", icon: LayoutGrid }, { href: "/direcciones", label: "Direcciones", icon: MapPin }, { href: "/pagos", label: "Pagos", icon: CreditCard }, { href: "/notificaciones", label: "Notificaciones", icon: Bell }, ...(user.role === "ADMIN" ? [{ href: "/admin", label: "Panel admin", icon: Shield }] : [])].map(({ href, label, icon: Icon }) => (
                  <Link key={href} href={href} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-muted transition hover:bg-white/[0.04] hover:text-ink">
                    <Icon className="size-[18px]" /> {label}
                  </Link>
                ))}
              </nav>
              <button onClick={() => void logout(router)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-muted transition hover:bg-white/[0.04] hover:text-ink">
                <LogOut className="size-[18px]" /> Cerrar sesión
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <MicPermissionDialog />
    </CortanaProvider>
  );
}
