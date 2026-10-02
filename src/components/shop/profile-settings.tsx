"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Brain, Globe, Lock, LogOut, MapPin, CreditCard, Package, Trash2, Volume2, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/client/api";
import { formatCents } from "@/lib/money";
import { speakOnce } from "@/lib/ai/voice-session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

type Settings = {
  language: string;
  voice: string;
  voiceSpeed: number;
  autoSpeak: boolean;
  memoryEnabled: boolean;
  notifyPush: boolean;
  notifyEmail: boolean;
  notifyWhatsapp: boolean;
  saveConversations: boolean;
};

function Row({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <div className="text-sm font-medium">{title}</div>
        {description && <div className="text-xs text-muted">{description}</div>}
      </div>
      {children}
    </div>
  );
}

export function ProfileSettings({
  user,
  stats,
  settings: initial,
  preferences: initialPrefs,
}: {
  user: { name: string; email: string; phone: string | null; createdAt: string };
  stats: { orders: number; spentCents: number };
  settings: Settings;
  preferences: { id: string; key: string; label: string; value: string }[];
}) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [settings, setSettings] = useState(initial);
  const [prefs, setPrefs] = useState(initialPrefs);
  const [saving, setSaving] = useState(false);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/profile", { method: "PATCH", body: { name, phone: phone || null } });
      toast.success("Perfil actualizado");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const update = async (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    try {
      await api("/api/profile", { method: "PATCH", body: { settings: patch } });
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
      setSettings(settings);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: Package, label: "Pedidos", value: String(stats.orders), href: "/pedidos" },
          { icon: CreditCard, label: "Total gastado", value: formatCents(stats.spentCents), href: "/pedidos" },
          { icon: MapPin, label: "Direcciones", value: "Gestionar", href: "/direcciones" },
        ].map(({ icon: Icon, label, value, href }) => (
          <Link key={label} href={href} className="glass rounded-2xl p-4 transition hover:border-electric/30">
            <Icon className="mb-2 size-4 text-cyan" />
            <div className="font-display text-lg font-semibold">{value}</div>
            <div className="text-xs text-muted">{label}</div>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Datos personales</CardTitle>
          <CardDescription>Cliente desde {new Date(user.createdAt).toLocaleDateString("es-ES", { month: "long", year: "numeric" })}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveProfile} className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="phone">Teléfono</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="+34 600 000 000" />
            </div>
            <div className="sm:col-span-2">
              <Label>Email</Label>
              <Input value={user.email} disabled />
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" variant="primary" loading={saving}>Guardar cambios</Button>
              <Button type="button" variant="outline" asChild><Link href="/pagos"><CreditCard /> Métodos de pago</Link></Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Volume2 className="size-4 text-cyan" /> Voz</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-white/5">
          <Row title="Responder en voz alta" description="CORTANA lee sus respuestas en modo voz.">
            <Switch checked={settings.autoSpeak} onCheckedChange={(v) => update({ autoSpeak: v })} />
          </Row>
          <Row title="Voz de CORTANA" description="Voz usada en conversaciones en tiempo real.">
            <Select className="w-36" value={settings.voice} onChange={(e) => update({ voice: e.target.value })}>
              {["marin", "cedar", "alloy", "coral", "sage", "shimmer", "verse"].map((v) => (
                <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>
              ))}
            </Select>
          </Row>
          <Row title="Velocidad" description={`${settings.voiceSpeed.toFixed(1)}×`}>
            <input type="range" min={0.7} max={1.4} step={0.1} value={settings.voiceSpeed} onChange={(e) => setSettings({ ...settings, voiceSpeed: Number(e.target.value) })} onMouseUp={() => update({ voiceSpeed: settings.voiceSpeed })} onTouchEnd={() => update({ voiceSpeed: settings.voiceSpeed })} className="w-36 accent-[#00AFFF]" aria-label="Velocidad de voz" />
          </Row>
          <div className="pt-3">
            <Button size="sm" variant="outline" onClick={() => void speakOnce("Hola, soy CORTANA. ¿Qué te apetece pedir hoy?", settings.language, settings.voiceSpeed)}>
              <Volume2 /> Probar voz
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Globe className="size-4 text-cyan" /> Idioma</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={settings.language} onChange={(e) => update({ language: e.target.value })} aria-label="Idioma">
            <option value="es-ES">Español (España)</option>
            <option value="es-MX">Español (México)</option>
            <option value="ca-ES">Català</option>
            <option value="en-US">English (US)</option>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Brain className="size-4 text-cyan" /> Memoria de CORTANA</CardTitle>
          <CardDescription>Preferencias útiles que CORTANA recuerda, como tu bebida favorita.</CardDescription>
        </CardHeader>
        <CardContent>
          <Row title="Recordar mis preferencias" description="Si la desactivas, CORTANA no usará ni guardará recuerdos.">
            <Switch checked={settings.memoryEnabled} onCheckedChange={(v) => update({ memoryEnabled: v })} />
          </Row>
          {prefs.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Aún no recuerdo nada. Prueba a decir: «Siempre quiero Coca-Cola Zero».</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {prefs.map((p) => (
                <li key={p.id} className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
                  <div>
                    <div className="text-xs text-muted">{p.label}</div>
                    <div className="text-sm">{p.value}</div>
                  </div>
                  <Button size="icon-sm" variant="ghost" aria-label="Olvidar" onClick={async () => { await api(`/api/preferences/${p.id}`, { method: "DELETE" }); setPrefs(prefs.filter((x) => x.id !== p.id)); }}>
                    <X />
                  </Button>
                </li>
              ))}
              <Button size="sm" variant="danger" className="mt-2" onClick={async () => { await api("/api/preferences", { method: "DELETE" }); setPrefs([]); toast("Memoria borrada"); }}>
                <Trash2 /> Borrar todo lo que recuerda
              </Button>
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bell className="size-4 text-cyan" /> Notificaciones</CardTitle>
          <CardDescription>Pedido confirmado, preparado, en camino y entregado.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y divide-white/5">
          <Row title="Notificaciones push"><Switch checked={settings.notifyPush} onCheckedChange={(v) => update({ notifyPush: v })} /></Row>
          <Row title="Email"><Switch checked={settings.notifyEmail} onCheckedChange={(v) => update({ notifyEmail: v })} /></Row>
          <Row title="WhatsApp" description="Requiere teléfono en tu perfil."><Switch checked={settings.notifyWhatsapp} onCheckedChange={(v) => update({ notifyWhatsapp: v })} /></Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Lock className="size-4 text-cyan" /> Privacidad</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-white/5">
          <Row title="Guardar historial de conversaciones" description="Se usa para mantener el contexto entre sesiones.">
            <Switch checked={settings.saveConversations} onCheckedChange={(v) => update({ saveConversations: v })} />
          </Row>
          <div className="flex flex-wrap gap-2 pt-3">
            <Button size="sm" variant="danger" onClick={async () => { if (!confirm("¿Eliminar todas tus conversaciones?")) return; await api("/api/profile", { method: "DELETE" }); sessionStorage.removeItem("cortana-session"); toast("Conversaciones eliminadas"); }}>
              <Trash2 /> Eliminar conversaciones
            </Button>
            <Button size="sm" variant="outline" onClick={async () => { await api("/api/auth/logout", { method: "POST" }); sessionStorage.clear(); router.replace("/login"); }}>
              <LogOut /> Cerrar sesión
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
