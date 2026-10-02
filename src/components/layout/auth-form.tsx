"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/client/api";
import { CortanaLogo } from "@/components/cortana/logo";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

const ERRORS: Record<string, string> = {
  google_disabled: "El acceso con Google no está configurado en este entorno.",
  oauth_state: "La sesión de Google ha caducado. Vuelve a intentarlo.",
  email_unverified: "Tu email de Google no está verificado.",
  oauth: "No se pudo iniciar sesión con Google.",
  oauth_token: "No se pudo iniciar sesión con Google.",
};

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.2 14.6 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12s4.4 9.8 9.8 9.8c5.6 0 9.4-4 9.4-9.6 0-.6-.1-1.1-.2-1.6H12z" />
    </svg>
  );
}

export function AuthForm({ mode, googleEnabled }: { mode: "login" | "register"; googleEnabled: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const error = params.get("error");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);

  const submit = async (e?: React.FormEvent, override?: { email: string; password: string }) => {
    e?.preventDefault();
    setLoading(true);
    try {
      const body = override ?? (mode === "login" ? { email: form.email, password: form.password } : form);
      const r = await api<{ role?: string }>(mode === "login" || override ? "/api/auth/login" : "/api/auth/register", { method: "POST", body });
      sessionStorage.removeItem("cortana-session");
      router.replace(r.role === "ADMIN" && next === "/" ? "/admin" : next.startsWith("/") ? next : "/");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm">
      <div className="mb-10 flex justify-center lg:hidden">
        <CortanaLogo />
      </div>
      <h1 className="font-display text-3xl font-semibold tracking-tight">{mode === "login" ? "Bienvenido de nuevo" : "Crea tu cuenta"}</h1>
      <p className="mt-2 text-sm text-muted">{mode === "login" ? "Entra y dile a CORTANA qué te apetece." : "En un minuto estarás pidiendo con tu voz."}</p>
      {error && <p className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{ERRORS[error] ?? "Ha ocurrido un error."}</p>}

      <form onSubmit={submit} className="mt-8 grid gap-4">
        {mode === "register" && (
          <div>
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" autoComplete="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
        )}
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="password">Contraseña</Label>
          <Input id="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "register" ? 8 : 1} required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <Button type="submit" variant="primary" size="lg" loading={loading}>
          {mode === "login" ? "Entrar" : "Crear cuenta"}
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-white/10" /> o <span className="h-px flex-1 bg-white/10" />
      </div>
      <div className="grid gap-2">
        {googleEnabled && (
          <Button variant="secondary" asChild>
            <a href="/api/auth/google">
              <GoogleIcon /> Continuar con Google
            </a>
          </Button>
        )}
        <Button variant="outline" disabled={loading} onClick={() => void submit(undefined, { email: "demo@cortana.app", password: "cortana123" })}>
          <Sparkles /> Entrar con la cuenta demo
        </Button>
      </div>

      <p className="mt-8 text-center text-sm text-muted">
        {mode === "login" ? (
          <>¿No tienes cuenta? <Link href="/registro" className="text-cyan hover:underline">Regístrate</Link></>
        ) : (
          <>¿Ya tienes cuenta? <Link href="/login" className="text-cyan hover:underline">Inicia sesión</Link></>
        )}
      </p>
    </div>
  );
}
