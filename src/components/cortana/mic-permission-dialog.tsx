"use client";

import { Mic, MicOff, Keyboard } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useCortana } from "@/lib/stores/cortana-store";
import { useCortanaActions } from "./cortana-provider";

export function MicPermissionDialog() {
  const dialog = useCortana((s) => s.micDialog);
  const set = useCortana((s) => s.set);
  const { grantMic } = useCortanaActions();
  const close = () => set({ micDialog: "closed" });
  const useText = () => set({ micDialog: "closed", mode: "text" });

  return (
    <Dialog open={dialog !== "closed"} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        {dialog === "explain" && (
          <div className="text-center">
            <div className="mx-auto mb-5 grid size-16 place-items-center rounded-2xl bg-electric/15 text-cyan ring-glow">
              <Mic className="size-7" />
            </div>
            <DialogTitle>Habla con CORTANA</DialogTitle>
            <DialogDescription className="mx-auto max-w-sm">
              Para hablar con CORTANA necesitamos acceso a tu micrófono. Solo se usa mientras la conversación está activa.
            </DialogDescription>
            <div className="mt-6 grid gap-2">
              <Button variant="primary" size="lg" onClick={() => void grantMic()}>
                <Mic /> Permitir micrófono
              </Button>
              <Button variant="ghost" onClick={useText}>
                <Keyboard /> Prefiero escribir
              </Button>
            </div>
          </div>
        )}
        {dialog === "denied" && (
          <div>
            <div className="mb-5 grid size-14 place-items-center rounded-2xl bg-danger/15 text-danger">
              <MicOff className="size-6" />
            </div>
            <DialogTitle>El micrófono está bloqueado</DialogTitle>
            <DialogDescription>Puedes activarlo en unos segundos:</DialogDescription>
            <ol className="mt-4 space-y-2.5 text-sm text-muted">
              <li><b className="text-ink">Chrome / Edge:</b> pulsa el icono del candado junto a la dirección → Micrófono → Permitir, y recarga.</li>
              <li><b className="text-ink">Safari (iPhone):</b> Ajustes → Safari → Micrófono → Permitir. En la app instalada: Ajustes → CORTANA.</li>
              <li><b className="text-ink">Android:</b> Ajustes → Aplicaciones → Chrome → Permisos → Micrófono.</li>
            </ol>
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              <Button variant="outline" onClick={() => void grantMic()}>Reintentar</Button>
              <Button variant="primary" onClick={useText}>
                <Keyboard /> Usar modo texto
              </Button>
            </div>
          </div>
        )}
        {dialog === "unsupported" && (
          <div>
            <DialogTitle>Voz no disponible en este navegador</DialogTitle>
            <DialogDescription>
              Tu navegador no permite el reconocimiento de voz. Prueba con Chrome, Edge o Safari, o sigue con el modo texto: CORTANA funciona igual.
            </DialogDescription>
            <Button className="mt-6 w-full" variant="primary" onClick={useText}>
              <Keyboard /> Continuar escribiendo
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
