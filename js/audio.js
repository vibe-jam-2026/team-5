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
  pickup() { tone(880 + Math.random() * 200, 0.04, 'sine', 0.05, 300); },
  kill(mult = 1) { tone(180 + mult * 40, 0.06, 'square', 0.06, -80); },
  hit() { tone(200, 0.3, 'sawtooth', 0.2, -160); },
  choose() { tone(784, 0.08, 'square', 0.1); setTimeout(() => tone(1046, 0.12, 'square', 0.1), 70); },
  levelUp() { tone(523, 0.1); setTimeout(() => tone(784, 0.15), 100); },
  gameOver() { tone(300, 0.6, 'triangle', 0.2, -250); },
  flak() { tone(90, 0.12, 'square', 0.08, -40); },
  boom() { tone(140, 0.25, 'sawtooth', 0.1, -110); },
  select() { tone(660, 0.05, 'square', 0.08); },
};
