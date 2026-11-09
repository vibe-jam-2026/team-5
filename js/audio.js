// Tiny synth sound effects via WebAudio. No asset files needed.
let ctx = null;
let muted = false;
try { muted = localStorage.getItem('team5.muted') === '1'; } catch {}

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// ---- Background music: an original, driving 80s jet-rock loop -----------
// Em - C - D - B at 138 BPM: chugging 16th-note bass, distorted power-chord
// stabs, rock beat with a big gated snare, tom fills and a heroic saw lead.
const BPM = 138, STEP = 60 / BPM / 4;            // 16th-note length in seconds
const MUSIC_VOL = 0.3;                           // master music level
const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);
// Bass root per bar (MIDI). Power chords are built on root + 12.
const ROOTS = [40, 36, 38, 35];   // E, C, D, B
// Lead phrases: [step in 4-bar phrase (0..63), midi, length in steps].
// A = call (passes 0 and 2), B = answer (pass 1), C = climb (pass 3).
const LEAD_A = [
  [0, 71, 6], [6, 74, 2], [8, 76, 8],
  [16, 79, 4], [20, 76, 4], [24, 72, 8],
  [32, 74, 6], [38, 76, 2], [40, 78, 8],
  [48, 75, 12], [60, 71, 4],
];
const LEAD_B = [
  [0, 76, 4], [4, 79, 4], [8, 83, 8],
  [16, 81, 4], [20, 79, 4], [24, 76, 8],
  [32, 78, 4], [36, 79, 4], [40, 81, 8],
  [48, 78, 6], [54, 75, 2], [56, 71, 8],
];
const LEAD_C = [
  [0, 76, 2], [2, 78, 2], [4, 79, 4], [8, 83, 8],
  [16, 84, 6], [22, 83, 2], [24, 79, 8],
  [32, 81, 6], [38, 83, 2], [40, 86, 8],
  [48, 87, 16],
];
const LEADS = [LEAD_A, LEAD_B, LEAD_A, LEAD_C];
let music = null;   // { bus, reverb, delay, noise, step, next, timer }

function makeMusic(a) {
  const bus = a.createGain();
  bus.gain.value = muted ? 0 : MUSIC_VOL;
  bus.connect(a.destination);
  // Big, dark 80s reverb from a decaying noise impulse.
  const reverb = a.createConvolver();
  const len = a.sampleRate * 2.2, ir = a.createBuffer(2, len, a.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  reverb.buffer = ir;
  const wet = a.createGain(); wet.gain.value = 0.35;
  reverb.connect(wet).connect(bus);
  // Dotted-eighth echo for the lead.
  const delay = a.createDelay(1); delay.delayTime.value = STEP * 3;
  const fb = a.createGain(); fb.gain.value = 0.35;
  delay.connect(fb).connect(delay);
  delay.connect(bus); delay.connect(reverb);
  const noise = a.createBuffer(1, a.sampleRate * 0.5, a.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  // Overdrive for the "guitar" power chords.
  const drive = a.createWaveShaper(), curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 6); }
  drive.curve = curve;
  const driveTone = a.createBiquadFilter(); driveTone.type = 'lowpass'; driveTone.frequency.value = 3200;
  const driveOut = a.createGain(); driveOut.gain.value = 0.11;
  drive.connect(driveTone).connect(driveOut).connect(bus);
  return { bus, reverb, delay, noise, drive, step: 0, next: a.currentTime + 0.1, timer: null };
}

function voice(a, t, freq, dur, { type = 'sawtooth', vol = 0.1, cutoff = 2000, attack = 0.01,
  detune = 0, rev = 0, echo = 0, dist = false } = {}) {
  const m = music;
  const o = a.createOscillator(), f = a.createBiquadFilter(), g = a.createGain();
  o.type = type; o.frequency.value = freq; o.detune.value = detune;
  f.type = 'lowpass'; f.frequency.value = cutoff;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.setValueAtTime(vol, t + Math.max(attack, dur - 0.05));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
  o.connect(f).connect(g).connect(dist ? m.drive : m.bus);
  if (rev) { const s = a.createGain(); s.gain.value = rev; g.connect(s).connect(m.reverb); }
  if (echo) { const s = a.createGain(); s.gain.value = echo; g.connect(s).connect(m.delay); }
  o.start(t); o.stop(t + dur + 0.1);
}

function drum(a, t, kind) {
  const m = music;
  if (kind === 'kick') {
    const o = a.createOscillator(), g = a.createGain();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g).connect(m.bus);
    o.start(t); o.stop(t + 0.3);
    return;
  }
  if (kind.startsWith('tom')) {
    const o = a.createOscillator(), g = a.createGain(), f0 = +kind.slice(3);
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.5, t + 0.25);
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(m.bus);
    const s = a.createGain(); s.gain.value = 0.5; g.connect(s).connect(m.reverb);
    o.start(t); o.stop(t + 0.35);
    return;
  }
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = m.noise;
  const snare = kind === 'snare';
  f.type = snare ? 'bandpass' : 'highpass';
  f.frequency.value = snare ? 1800 : 8000;
  const vol = snare ? 0.5 : 0.06, dur = snare ? 0.22 : 0.04;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(m.bus);
  if (snare) { const s = a.createGain(); s.gain.value = 0.9; g.connect(s).connect(m.reverb); }
  src.start(t); src.stop(t + dur + 0.02);
}

function playStep(a, t, step) {
  const s16 = step % 16, bar = Math.floor(step / 16) % 4, pass = Math.floor(step / 64) % 4;
  const root = ROOTS[bar], fill = bar === 3 && pass % 2 === 1 && s16 >= 8;
  // Drums: rock beat (kick 1, 1&, 3), big gated snare on 2 and 4, 8th hats, tom fill.
  if (s16 === 0 || s16 === 6 || s16 === 8 || (s16 === 11 && !fill)) drum(a, t, 'kick');
  if (fill) {
    if (s16 % 2 === 0) drum(a, t, `tom${[220, 180, 140, 110][(s16 - 8) / 2]}`);
  } else {
    if (s16 === 4 || s16 === 12) drum(a, t, 'snare');
    if (s16 % 2 === 0) drum(a, t, 'hat');
  }
  if (step % 64 === 0) drum(a, t, 'snare');   // crash-ish accent at phrase start
  // Chugging 16th-note bass with a little octave kick on the offbeats.
  voice(a, t, hz(root + (s16 % 4 === 3 ? 12 : 0)), STEP * 0.85,
    { vol: 0.12, cutoff: s16 % 4 === 0 ? 1400 : 800 });
  // Distorted power chords: big hit on 1, punchy stabs on 2& and 3&, ringing on 4.
  const hits = { 0: 6, 6: 1.5, 10: 1.5, 12: 4 };
  if (hits[s16]) {
    for (const n of [root + 12, root + 19, root + 24]) for (const d of [-7, 7]) {
      voice(a, t, hz(n), STEP * hits[s16], { vol: 0.5, cutoff: 5000, detune: d, dist: true });
    }
  }
  // Heroic saw lead with echo, a different phrase each pass.
  const ph = step % 64;
  for (const [at, n, len] of LEADS[pass]) {
    if (at === ph) for (const d of [-10, 10]) voice(a, t, hz(n), STEP * len, { vol: 0.035, cutoff: 4200,
      attack: 0.02, detune: d, rev: 0.45, echo: 0.4 });
  }
}

function startMusic() {
  if (music) return;
  const a = ac();
  music = makeMusic(a);
  const tick = () => {
    // After a background-tab stall, skip ahead instead of firing a burst of old notes.
    if (music.next < a.currentTime) music.next = a.currentTime + 0.05;
    while (music.next < a.currentTime + 0.25) {
      playStep(a, music.next, music.step++);
      music.next += STEP;
    }
  };
  music.timer = setInterval(tick, 40);
  tick();
}

function setMusicGain() {
  if (!music) return;
  const g = music.bus.gain, t = ctx.currentTime;
  g.cancelScheduledValues(t);
  g.setTargetAtTime(muted ? 0 : MUSIC_VOL, t, 0.05);
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
    setMusicGain();
  },
  unlock() { try { ac(); startMusic(); } catch {} },
  pickup() { tone(880 + Math.random() * 200, 0.04, 'sine', 0.05, 300); },
  kill(mult = 1) { tone(180 + mult * 40, 0.06, 'square', 0.06, -80); },
  hit() { tone(200, 0.3, 'sawtooth', 0.2, -160); },
  choose() { tone(784, 0.08, 'square', 0.1); setTimeout(() => tone(1046, 0.12, 'square', 0.1), 70); },
  levelUp() { tone(523, 0.1); setTimeout(() => tone(784, 0.15), 100); },
  gameOver() { tone(300, 0.6, 'triangle', 0.2, -250); },
  flak() { tone(90, 0.12, 'square', 0.08, -40); },
  zap() { tone(1200, 0.07, 'square', 0.04, -700); },
  boom() { tone(140, 0.25, 'sawtooth', 0.1, -110); },
  power() { tone(440, 0.08, 'square', 0.1); setTimeout(() => tone(660, 0.08, 'square', 0.1), 60); setTimeout(() => tone(990, 0.15, 'square', 0.1), 120); },
  rocket() { tone(500, 0.1, 'sawtooth', 0.03, 400); },
  pop() { tone(110, 0.12, 'square', 0.05, -60); },
  select() { tone(660, 0.05, 'square', 0.08); },
};
