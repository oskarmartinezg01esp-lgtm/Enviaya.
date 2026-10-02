import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/auth/session";
import { getCartView } from "@/lib/services/cart";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const cart = await getCartView(user.id);
  return (
    <AppShell
      user={{ id: user.id, name: user.name, email: user.email, role: user.role, avatarUrl: user.profile?.avatarUrl ?? null }}
      settings={{ lang: user.profile?.language ?? "es-ES", rate: user.profile?.voiceSpeed ?? 1, autoSpeak: user.profile?.autoSpeak ?? true }}
      initialCart={cart}
    >
      {children}
    </AppShell>
  );
}
