// ============================================
// Web Audio API — Procedural SFX Engine
// Zero dependencies, zero files, just oscillators.
// ============================================

let audioCtx: AudioContext | null = null;

function ctx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  return audioCtx;
}

/** Bright ascending two-note chime — score went up */
export function sfxScoreUp() {
  try {
    const c = ctx();
    const t = c.currentTime;

    // Note 1 (E5)
    const o1 = c.createOscillator();
    const g1 = c.createGain();
    o1.connect(g1).connect(c.destination);
    o1.type = "sine";
    o1.frequency.setValueAtTime(659, t);
    g1.gain.setValueAtTime(0.07, t);
    g1.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o1.start(t);
    o1.stop(t + 0.15);

    // Note 2 (G5) — slightly delayed
    const o2 = c.createOscillator();
    const g2 = c.createGain();
    o2.connect(g2).connect(c.destination);
    o2.type = "sine";
    o2.frequency.setValueAtTime(784, t + 0.08);
    g2.gain.setValueAtTime(0, t);
    g2.gain.linearRampToValueAtTime(0.07, t + 0.09);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o2.start(t + 0.08);
    o2.stop(t + 0.25);
  } catch { /* AudioContext not available */ }
}

/** Dark descending buzz — score went down */
export function sfxScoreDown() {
  try {
    const c = ctx();
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.connect(g).connect(c.destination);
    o.type = "sawtooth";
    o.frequency.setValueAtTime(300, t);
    o.frequency.exponentialRampToValueAtTime(160, t + 0.22);
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.start(t);
    o.stop(t + 0.3);
  } catch {}
}

/** Deep bass impact + high resonance ping — act transition */
export function sfxImpact() {
  try {
    const c = ctx();
    const t = c.currentTime;

    // Sub-bass thump
    const bass = c.createOscillator();
    const bg = c.createGain();
    bass.connect(bg).connect(c.destination);
    bass.type = "sine";
    bass.frequency.setValueAtTime(80, t);
    bass.frequency.exponentialRampToValueAtTime(35, t + 0.45);
    bg.gain.setValueAtTime(0.14, t);
    bg.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    bass.start(t);
    bass.stop(t + 0.55);

    // High ping
    const ping = c.createOscillator();
    const pg = c.createGain();
    ping.connect(pg).connect(c.destination);
    ping.type = "sine";
    ping.frequency.setValueAtTime(880, t + 0.06);
    pg.gain.setValueAtTime(0, t);
    pg.gain.linearRampToValueAtTime(0.05, t + 0.08);
    pg.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    ping.start(t + 0.06);
    ping.stop(t + 0.45);
  } catch {}
}

/** Quick sine sweep — agent switch */
export function sfxSwitch() {
  try {
    const c = ctx();
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.connect(g).connect(c.destination);
    o.type = "sine";
    o.frequency.setValueAtTime(380, t);
    o.frequency.exponentialRampToValueAtTime(620, t + 0.08);
    o.frequency.exponentialRampToValueAtTime(380, t + 0.18);
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.start(t);
    o.stop(t + 0.22);
  } catch {}
}

/** Close the shared AudioContext — call on app shutdown / page leave. */
export function sfxCleanup() {
  if (audioCtx) {
    audioCtx.close().catch(() => {});
    audioCtx = null;
  }
}

/** Triumphant chord — simulation complete (success) */
export function sfxComplete() {
  try {
    const c = ctx();
    const t = c.currentTime;
    // C-E-G chord
    [523, 659, 784].forEach((freq, i) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.connect(g).connect(c.destination);
      o.type = "sine";
      o.frequency.setValueAtTime(freq, t + i * 0.06);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.06, t + i * 0.06 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
      o.start(t + i * 0.06);
      o.stop(t + 0.8);
    });
  } catch {}
}
