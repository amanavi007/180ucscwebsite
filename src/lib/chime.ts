let context: AudioContext | null = null;

/** A short, soft two-note chime for "time's up". Quiet on purpose: you should notice it, not flinch. */
export function playChime() {
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    context ??= new AudioCtx();
    const ctx = context;
    if (ctx.state === "suspended") void ctx.resume();
    const start = ctx.currentTime;
    [660, 880].forEach((frequency, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = start + i * 0.28;
      osc.type = "sine";
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.07, t + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.5);
    });
  } catch {
    // No sound is fine: the on-screen banner says the same thing.
  }
}
