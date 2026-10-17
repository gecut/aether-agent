/** A short local acknowledgement for attention-worthy session changes. */
export function playNotificationTone() {
  try {
    const Audio =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Audio) return;
    const context = new Audio();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(660, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(
      880,
      context.currentTime + 0.1,
    );
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.07, context.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.2);
    oscillator.addEventListener("ended", () => void context.close());
  } catch {
    /* Sound is an optional enhancement and should never interrupt work. */
  }
}
