// Tiny synth sound effects via WebAudio. No asset files needed.
let ctx = null;
let muted = false;
try { muted = localStorage.getItem('team5.muted') === '1'; } catch {}

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, dur = 0.1, type = 'square', vol = 0.15, slide = 0) {
  if (muted) return;
  const a = ac();
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, a.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), a.currentTime + dur);
  g.gain.setValueAtTime(vol, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
  o.connect(g).connect(a.destination);
  o.start();
  o.stop(a.currentTime + dur);
}

export const sfx = {
  get muted() { return muted; },
  toggleMute() {
    muted = !muted;
    try { localStorage.setItem('team5.muted', muted ? '1' : '0'); } catch {}
  },
  unlock() { try { ac(); } catch {} },
  pickup(mult = 1) { tone(440 + mult * 80, 0.08, 'square', 0.12, 200); },
  hit() { tone(200, 0.3, 'sawtooth', 0.2, -160); },
  levelUp() { tone(523, 0.1); setTimeout(() => tone(784, 0.15), 100); },
  gameOver() { tone(300, 0.6, 'triangle', 0.2, -250); },
  select() { tone(660, 0.05, 'square', 0.08); },
};
