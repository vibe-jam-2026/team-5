// Tiny synth sound effects via WebAudio. No asset files needed.
let ctx = null;
let muted = false;
try { muted = localStorage.getItem('team5.muted') === '1'; } catch {}

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// ---- Background music: an original, subtle 80s synth-rock loop ----------
// Am - F - C - G at 104 BPM: pulsing saw bass, gated reverb snare, warm pad
// and a sparse echoing lead every other pass. Scheduled ahead with WebAudio.
const BPM = 104, STEP = 60 / BPM / 4;            // 16th-note length in seconds
const MUSIC_VOL = 0.22;                          // master music level (subtle)
const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);
// Chord per bar: [bass root, pad notes] as MIDI numbers.
const CHORDS = [
  [45, [57, 60, 64]],   // Am
  [41, [57, 60, 65]],   // F
  [48, [55, 60, 64]],   // C
  [43, [55, 59, 62]],   // G
];
// Lead: [step in 4-bar phrase (0..63), midi, length in steps]. Played on odd passes.
const LEAD = [
  [0, 76, 6], [6, 74, 2], [8, 72, 4], [12, 71, 4],
  [16, 72, 6], [22, 69, 2], [24, 72, 8],
  [32, 67, 6], [38, 69, 2], [40, 72, 4], [44, 74, 4],
  [48, 76, 10], [58, 74, 2], [60, 71, 4],
];
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
  return { bus, reverb, delay, noise, step: 0, next: a.currentTime + 0.1, timer: null };
}

function voice(a, t, freq, dur, { type = 'sawtooth', vol = 0.1, cutoff = 2000, attack = 0.01,
  detune = 0, rev = 0, echo = 0 } = {}) {
  const m = music;
  const o = a.createOscillator(), f = a.createBiquadFilter(), g = a.createGain();
  o.type = type; o.frequency.value = freq; o.detune.value = detune;
  f.type = 'lowpass'; f.frequency.value = cutoff;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.setValueAtTime(vol, t + Math.max(attack, dur - 0.05));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
  o.connect(f).connect(g).connect(m.bus);
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
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = m.noise;
  const snare = kind === 'snare';
  f.type = snare ? 'bandpass' : 'highpass';
  f.frequency.value = snare ? 1800 : 8000;
  const vol = snare ? 0.35 : 0.05, dur = snare ? 0.18 : 0.04;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(m.bus);
  if (snare) { const s = a.createGain(); s.gain.value = 0.9; g.connect(s).connect(m.reverb); }
  src.start(t); src.stop(t + dur + 0.02);
}

function playStep(a, t, step) {
  const s16 = step % 16, bar = Math.floor(step / 16) % 4, pass = Math.floor(step / 64);
  const [root, pad] = CHORDS[bar];
  // Drums: kick on 1 and 3, gated snare on 2 and 4, soft eighth hats.
  if (s16 === 0 || s16 === 8 || (s16 === 10 && bar === 3)) drum(a, t, 'kick');
  if (s16 === 4 || s16 === 12) drum(a, t, 'snare');
  if (s16 % 2 === 0) drum(a, t, 'hat');
  // Driving eighth-note bass, octave pop on the last eighth of each bar.
  if (s16 % 2 === 0) {
    const n = s16 === 14 ? root + 12 : root;
    voice(a, t, hz(n), STEP * 1.8, { vol: 0.13, cutoff: 600 + (s16 === 0 ? 400 : 0) });
  }
  // Pad: slow-swelling detuned saws for the whole bar.
  if (s16 === 0) {
    for (const n of pad) for (const d of [-8, 8]) {
      voice(a, t, hz(n), STEP * 16, { vol: 0.025, cutoff: 1400, attack: 0.6, detune: d, rev: 0.6 });
    }
  }
  // Lead every other pass, so the loop breathes.
  if (pass % 2 === 1) {
    const ph = step % 64;
    for (const [at, n, len] of LEAD) {
      if (at === ph) voice(a, t, hz(n), STEP * len, { type: 'square', vol: 0.04, cutoff: 2600,
        attack: 0.03, rev: 0.5, echo: 0.5 });
    }
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
  boom() { tone(140, 0.25, 'sawtooth', 0.1, -110); },
  select() { tone(660, 0.05, 'square', 0.08); },
};
