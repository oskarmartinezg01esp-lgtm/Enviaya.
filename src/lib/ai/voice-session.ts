/**
 * Sesiones de voz en el cliente.
 *
 * - RealtimeVoiceSession: OpenAI Realtime API por WebRTC (voz nativa, VAD en servidor,
 *   interrupciones automáticas, tool calling ejecutado en nuestro backend).
 * - BrowserVoiceSession: Web Speech API (reconocimiento + síntesis) como alternativa
 *   sin coste ni claves, con detección de interrupciones ("barge-in").
 *
 * Este módulo solo se usa en el navegador.
 */
import { audioLevel, trackStreamLevel } from "@/lib/client/audio-level";
import { isInterruption } from "./ai-intents";
import { normalize } from "@/lib/text";

export type MicPermission = "unknown" | "prompt" | "granted" | "denied" | "unsupported";

export async function queryMicPermission(): Promise<MicPermission> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return "unsupported";
  try {
    const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
    return status.state as MicPermission;
  } catch {
    return "unknown";
  }
}

export async function requestMicStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
}

// ---------------------------------------------------------------------------
// Navegador (Web Speech API)

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onspeechstart: (() => void) | null;
};

export function browserSpeechSupported() {
  if (typeof window === "undefined") return false;
  return Boolean((window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition);
}

export type BrowserVoiceHandlers = {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onBargeIn: () => void;
  onError: (code: string) => void;
  onListeningChange: (listening: boolean) => void;
};

export class BrowserVoiceSession {
  private recognition: SpeechRecognitionLike | null = null;
  private stream: MediaStream | null = null;
  private stopLevel: (() => void) | null = null;
  private wantListening = false;
  private speaking = false;
  private spokenWords = new Set<string>();
  private speechResolve: (() => void) | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private handlers: BrowserVoiceHandlers,
    private opts: { lang: string; rate: number },
  ) {}

  async init(stream?: MediaStream) {
    this.stream = stream ?? (await requestMicStream());
    this.stopLevel = trackStreamLevel(this.stream, "mic");
    const Ctor = ((window as unknown as Record<string, unknown>).SpeechRecognition ||
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition) as new () => SpeechRecognitionLike;
    const rec = new Ctor();
    rec.lang = this.opts.lang;
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      const text = (final || interim).trim();
      if (!text) return;
      if (this.speaking) {
        // ¿Es el eco de CORTANA o el usuario interrumpiendo?
        if (!this.isUserSpeech(text)) return;
        this.cancelSpeech();
        this.handlers.onBargeIn();
      }
      if (final) {
        this.wantListening = false;
        try {
          rec.stop();
        } catch {}
        this.handlers.onFinal(final.trim());
      } else {
        this.handlers.onInterim(interim.trim());
      }
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      this.handlers.onError(e.error);
      if (e.error === "not-allowed" || e.error === "service-not-allowed") this.wantListening = false;
    };
    rec.onend = () => {
      this.handlers.onListeningChange(false);
      if (this.wantListening) {
        this.restartTimer = setTimeout(() => this.safeStart(), 150);
      }
    };
    this.recognition = rec;
  }

  private isUserSpeech(text: string) {
    if (isInterruption(text)) return true;
    const words = normalize(text).split(" ").filter((w) => w.length > 2);
    if (words.length < 3) return false;
    const overlap = words.filter((w) => this.spokenWords.has(w)).length / words.length;
    return overlap < 0.5;
  }

  private safeStart() {
    if (!this.recognition) return;
    try {
      this.recognition.start();
      this.handlers.onListeningChange(true);
    } catch {
      /* ya estaba escuchando */
    }
  }

  startListening() {
    this.wantListening = true;
    this.safeStart();
  }

  stopListening() {
    this.wantListening = false;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    try {
      this.recognition?.stop();
    } catch {}
  }

  /** Habla el texto. Mientras habla sigue escuchando para detectar interrupciones. */
  speak(text: string): Promise<void> {
    if (!("speechSynthesis" in window)) return Promise.resolve();
    this.cancelSpeech();
    const synth = window.speechSynthesis;
    const voice = pickVoice(this.opts.lang);
    this.spokenWords = new Set(normalize(text).split(" ").filter((w) => w.length > 2));
    // Chrome corta frases largas: se trocea por oraciones
    const chunks = text.match(/[^.!?¿¡]+[.!?]*|[¿¡][^?!]+[?!]/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
    this.speaking = true;
    this.startListening(); // barge-in
    return new Promise<void>((resolve) => {
      this.speechResolve = resolve;
      chunks.forEach((chunk, i) => {
        const u = new SpeechSynthesisUtterance(chunk);
        u.lang = this.opts.lang;
        u.rate = this.opts.rate;
        u.pitch = 1.02;
        if (voice) u.voice = voice;
        if (i === chunks.length - 1) {
          u.onend = () => this.finishSpeech();
          u.onerror = () => this.finishSpeech();
        }
        synth.speak(u);
      });
    });
  }

  private finishSpeech() {
    this.speaking = false;
    const r = this.speechResolve;
    this.speechResolve = null;
    r?.();
  }

  cancelSpeech() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    this.finishSpeech();
  }

  get isSpeaking() {
    return this.speaking;
  }

  destroy() {
    this.stopListening();
    this.cancelSpeech();
    this.recognition?.abort();
    this.recognition = null;
    this.stopLevel?.();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}

/** Síntesis de voz simple (modo texto con lectura en voz alta). */
export function speakOnce(text: string, lang: string, rate = 1): Promise<void> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return Promise.resolve();
  window.speechSynthesis.cancel();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = rate;
    const v = pickVoice(lang);
    if (v) u.voice = v;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });
}

function pickVoice(lang: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  const base = lang.split("-")[0];
  const candidates = voices.filter((v) => v.lang.replace("_", "-").toLowerCase().startsWith(lang.toLowerCase()));
  const pool = candidates.length ? candidates : voices.filter((v) => v.lang.toLowerCase().startsWith(base));
  const preferred = ["Google español", "Mónica", "Monica", "Paulina", "Elvira", "Helena", "Laura", "Lucia", "Natural"];
  for (const name of preferred) {
    const v = pool.find((x) => x.name.includes(name));
    if (v) return v;
  }
  return pool[0] ?? null;
}

// ---------------------------------------------------------------------------
// OpenAI Realtime (WebRTC)

export type RealtimeHandlers = {
  onUserSpeechStart: () => void;
  onUserInterim: (text: string) => void;
  onUserFinal: (text: string) => void;
  onAssistantInterim: (text: string) => void;
  onAssistantFinal: (text: string) => void;
  onThinking: () => void;
  onSpeaking: (speaking: boolean) => void;
  onToolCall: (name: string, args: unknown) => Promise<unknown>;
  onError: (message: string) => void;
  onClosed: () => void;
};

export class RealtimeVoiceSession {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private mic: MediaStream | null = null;
  private audio: HTMLAudioElement | null = null;
  private stopMicLevel: (() => void) | null = null;
  private stopOutLevel: (() => void) | null = null;
  private userInterim = "";
  private assistantInterim = "";

  constructor(private handlers: RealtimeHandlers) {}

  async connect(params: { clientSecret: string; callsUrl: string; model: string }, stream?: MediaStream) {
    const pc = new RTCPeerConnection();
    this.pc = pc;
    this.audio = document.createElement("audio");
    this.audio.autoplay = true;
    pc.ontrack = (e) => {
      this.audio!.srcObject = e.streams[0];
      this.stopOutLevel = trackStreamLevel(e.streams[0], "output");
    };
    this.mic = stream ?? (await requestMicStream());
    this.stopMicLevel = trackStreamLevel(this.mic, "mic");
    pc.addTrack(this.mic.getTracks()[0], this.mic);

    const dc = pc.createDataChannel("oai-events");
    this.dc = dc;
    dc.addEventListener("message", (e) => this.onEvent(JSON.parse(e.data)));
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed" || pc.connectionState === "disconnected") this.handlers.onClosed();
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const res = await fetch(`${params.callsUrl}?model=${encodeURIComponent(params.model)}`, {
      method: "POST",
      body: offer.sdp,
      headers: { Authorization: `Bearer ${params.clientSecret}`, "Content-Type": "application/sdp" },
    });
    if (!res.ok) throw new Error(`No se pudo conectar la voz (${res.status})`);
    await pc.setRemoteDescription({ type: "answer", sdp: await res.text() });
    await new Promise<void>((resolve, reject) => {
      if (dc.readyState === "open") return resolve();
      dc.addEventListener("open", () => resolve(), { once: true });
      setTimeout(() => reject(new Error("Tiempo de conexión agotado")), 10000);
    });
  }

  private send(event: Record<string, unknown>) {
    if (this.dc?.readyState === "open") this.dc.send(JSON.stringify(event));
  }

  private async onEvent(ev: { type: string; [k: string]: unknown }) {
    switch (ev.type) {
      case "input_audio_buffer.speech_started":
        this.userInterim = "";
        this.handlers.onUserSpeechStart();
        break;
      case "conversation.item.input_audio_transcription.delta":
        this.userInterim += String(ev.delta ?? "");
        this.handlers.onUserInterim(this.userInterim);
        break;
      case "conversation.item.input_audio_transcription.completed":
        this.handlers.onUserFinal(String(ev.transcript ?? this.userInterim).trim());
        this.userInterim = "";
        break;
      case "response.created":
        this.assistantInterim = "";
        this.handlers.onThinking();
        break;
      case "response.output_audio_transcript.delta":
      case "response.audio_transcript.delta":
        this.assistantInterim += String(ev.delta ?? "");
        this.handlers.onAssistantInterim(this.assistantInterim);
        break;
      case "response.output_audio_transcript.done":
      case "response.audio_transcript.done":
        this.handlers.onAssistantFinal(String(ev.transcript ?? this.assistantInterim).trim());
        this.assistantInterim = "";
        break;
      case "output_audio_buffer.started":
        this.handlers.onSpeaking(true);
        break;
      case "output_audio_buffer.stopped":
      case "output_audio_buffer.cleared":
        this.handlers.onSpeaking(false);
        break;
      case "response.function_call_arguments.done": {
        let args: unknown = {};
        try {
          args = JSON.parse(String(ev.arguments ?? "{}"));
        } catch {}
        const output = await this.handlers.onToolCall(String(ev.name), args).catch((e: Error) => ({ ok: false, error: { message: e.message } }));
        this.send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: ev.call_id, output: JSON.stringify(output) } });
        this.send({ type: "response.create" });
        break;
      }
      case "error":
        this.handlers.onError(String((ev.error as { message?: string })?.message ?? "Error de voz"));
        break;
    }
  }

  /** Mensaje escrito durante una sesión de voz (mismo contexto). */
  sendText(text: string) {
    this.send({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text }] } });
    this.send({ type: "response.create" });
  }

  /** Interrupción manual (botón o "espera"). */
  interrupt() {
    this.send({ type: "response.cancel" });
    this.send({ type: "output_audio_buffer.clear" });
    this.handlers.onSpeaking(false);
  }

  disconnect() {
    this.stopMicLevel?.();
    this.stopOutLevel?.();
    this.dc?.close();
    this.pc?.getSenders().forEach((s) => s.track?.stop());
    this.pc?.close();
    this.mic?.getTracks().forEach((t) => t.stop());
    if (this.audio) this.audio.srcObject = null;
    this.pc = null;
    this.dc = null;
    audioLevel.output = 0;
  }
}
