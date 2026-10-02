import { requireUser } from "@/lib/auth/session";
import { getPreferences, PREFERENCE_LABELS } from "@/lib/services/preferences";
import { db } from "@/lib/db";
import { ProfileSettings } from "@/components/shop/profile-settings";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Perfil" };

export default async function ProfilePage() {
  const user = await requireUser("/perfil");
  const [prefs, stats] = await Promise.all([
    getPreferences(user.id),
    db.order.aggregate({ where: { userId: user.id, status: { notIn: ["PENDIENTE", "CANCELADO"] } }, _count: true, _sum: { totalCents: true } }),
  ]);
  const p = user.profile;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Perfil" description="Tus datos, tu voz y lo que CORTANA recuerda de ti." />
      <ProfileSettings
        user={{ name: user.name, email: user.email, phone: user.phone, createdAt: user.createdAt.toISOString() }}
        stats={{ orders: stats._count, spentCents: stats._sum.totalCents ?? 0 }}
        settings={{
          language: p?.language ?? "es-ES",
          voice: p?.voice ?? "alloy",
          voiceSpeed: p?.voiceSpeed ?? 1,
          autoSpeak: p?.autoSpeak ?? true,
          memoryEnabled: p?.memoryEnabled ?? true,
          notifyPush: p?.notifyPush ?? true,
          notifyEmail: p?.notifyEmail ?? true,
          notifyWhatsapp: p?.notifyWhatsapp ?? false,
          saveConversations: p?.saveConversations ?? true,
        }}
        preferences={prefs.map((x) => ({ id: x.id, key: x.key, label: PREFERENCE_LABELS[x.key] ?? x.key, value: x.value }))}
      />
    </div>
  );
}
