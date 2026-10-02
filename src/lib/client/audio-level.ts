/**
 * Niveles de audio compartidos fuera de React (se actualizan ~60 veces/s y
 * no deben provocar renders). El orbe los lee en su bucle de animación.
 */
export const audioLevel = {
  mic: 0,
  output: 0,
  /** true si `output` se mide de verdad (WebRTC); si no, el orbe lo simula al hablar */
  outputMeasured: false,
};

/** Analiza un MediaStream y escribe su nivel RMS (0..1) en `audioLevel[key]`. */
export function trackStreamLevel(stream: MediaStream, key: "mic" | "output"): () => void {
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.6;
  source.connect(analyser);
  const data = new Uint8Array(analyser.fftSize);
  let raf = 0;
  const loop = () => {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    audioLevel[key] = Math.min(1, rms * 4);
    raf = requestAnimationFrame(loop);
  };
  loop();
  if (key === "output") audioLevel.outputMeasured = true;
  return () => {
    cancelAnimationFrame(raf);
    audioLevel[key] = 0;
    if (key === "output") audioLevel.outputMeasured = false;
    source.disconnect();
    ctx.close().catch(() => {});
  };
}
