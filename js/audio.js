// Tiny synth sound effects via WebAudio. No asset files needed.
let ctx = null;
let muted = false;
try { muted = localStorage.getItem('team5.muted') === '1'; } catch {}

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// ---- Background music: three original, very cheesy 80s neon tracks -------
// All synthesized here. The game picks a track for the time of night
// (sfx.music(i)) and they crossfade with a whoosh:
//   0 "Neon Sunset"   (start / daytime) 108 BPM, Am-F-C-G: octave-bounce bass,
//                     gated snare, lush pad, sparkly arp, vibrato lead.
//   1 "Midnight Drive" (from midnight)  122 BPM, Dm-Bb-C-A: four-on-the-floor,
//                     rolling 16th bass, 6-step arp, brass stabs.
//   2 "Dawn Strike"   (near the boss)   146 BPM, Em-C-D-B: power chords,
//                     orchestra hits, heroic lead and a key change up.
const MUSIC_VOL = 0.3;                           // master music level
const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);
let music = null;      // { bus, ir, noise, curve, tracks, cur, timer }
let wantTrack = 0;     // track asked for before the music started

function makeMusic(a) {
  const bus = a.createGain();
  bus.gain.value = muted ? 0 : MUSIC_VOL;
  bus.connect(a.destination);
  // Big, dark 80s reverb impulse from decaying noise (shared by all tracks).
  const len = a.sampleRate * 2.2, ir = a.createBuffer(2, len, a.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  const noise = a.createBuffer(1, a.sampleRate * 1.5, a.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 6); }
  return { bus, ir, noise, curve, tracks: [], cur: -1, timer: null };
}

// One playing track: its own fader, reverb, echo and overdrive, so a
// crossfade fades everything it plays, tails included.
function makeTrack(a, def, idx) {
  const m = music, step = 60 / def.bpm / 4;
  const fade = a.createGain(); fade.gain.value = 0.0001;
  fade.connect(m.bus);
  const reverb = a.createConvolver(); reverb.buffer = m.ir;
  const wet = a.createGain(); wet.gain.value = 0.35;
  reverb.connect(wet).connect(fade);
  const delay = a.createDelay(1); delay.delayTime.value = step * 3;   // dotted-8th echo
  const fb = a.createGain(); fb.gain.value = 0.35;
  delay.connect(fb).connect(delay);
  delay.connect(fade); delay.connect(reverb);
  const drive = a.createWaveShaper(); drive.curve = m.curve;
  const driveTone = a.createBiquadFilter(); driveTone.type = 'lowpass'; driveTone.frequency.value = 3200;
  const driveOut = a.createGain(); driveOut.gain.value = 0.11;
  drive.connect(driveTone).connect(driveOut).connect(fade);
  return { def, idx, fade, reverb, delay, drive, stepLen: step, step: 0, next: a.currentTime + 0.1, dieAt: 0 };
}

function voice(tr, t, freq, dur, { type = 'sawtooth', vol = 0.1, cutoff = 2000, attack = 0.01,
  detune = 0, rev = 0, echo = 0, dist = false, vib = 0, sweep = 0 } = {}) {
  const a = ctx;
  const o = a.createOscillator(), f = a.createBiquadFilter(), g = a.createGain();
  o.type = type; o.frequency.value = freq; o.detune.value = detune;
  f.type = 'lowpass';
  if (sweep) {   // filter opens up then closes: the classic "bwaaw"
    f.frequency.setValueAtTime(cutoff * 0.25, t);
    f.frequency.exponentialRampToValueAtTime(cutoff, t + sweep);
    f.frequency.exponentialRampToValueAtTime(cutoff * 0.3, t + dur + 0.05);
  } else f.frequency.value = cutoff;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.setValueAtTime(vol, t + Math.max(attack, dur - 0.05));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
  o.connect(f).connect(g).connect(dist ? tr.drive : tr.fade);
  if (rev) { const s = a.createGain(); s.gain.value = rev; g.connect(s).connect(tr.reverb); }
  if (echo) { const s = a.createGain(); s.gain.value = echo; g.connect(s).connect(tr.delay); }
  let lfo = null;
  if (vib) {     // delayed, cheesy vibrato
    lfo = a.createOscillator(); const lg = a.createGain();
    lfo.frequency.value = 5.5;
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(freq * vib, t + Math.min(0.3, dur));
    lfo.connect(lg).connect(o.frequency);
    lfo.start(t); lfo.stop(t + dur + 0.1);
  }
  o.start(t); o.stop(t + dur + 0.1);
}

function chord(tr, t, notes, dur, opts) {
  for (const n of notes) for (const d of [-9, 9]) voice(tr, t, hz(n), dur, { ...opts, detune: d });
}

function noiseHit(tr, t, { type = 'highpass', freq = 8000, vol = 0.06, dur = 0.04, rev = 0, q = 1 }) {
  const a = ctx, src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = music.noise;
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(tr.fade);
  if (rev) { const s = a.createGain(); s.gain.value = rev; g.connect(s).connect(tr.reverb); }
  src.start(t); src.stop(t + dur + 0.02);
}

function drum(tr, t, kind, v = 1) {
  const a = ctx;
  if (kind === 'kick') {
    const o = a.createOscillator(), g = a.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    g.gain.setValueAtTime(0.55 * v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    o.connect(g).connect(tr.fade);
    o.start(t); o.stop(t + 0.3);
  } else if (kind.startsWith('tom')) {
    const o = a.createOscillator(), g = a.createGain(), f0 = +kind.slice(3);
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.5, t + 0.25);
    g.gain.setValueAtTime(0.35 * v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(tr.fade);
    const s = a.createGain(); s.gain.value = 0.6; g.connect(s).connect(tr.reverb);
    o.start(t); o.stop(t + 0.35);
  } else if (kind === 'snare') {   // the huge gated 80s snare
    noiseHit(tr, t, { type: 'bandpass', freq: 1800, vol: 0.5 * v, dur: 0.22, rev: 1.1, q: 0.7 });
    const o = a.createOscillator(), g = a.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(160, t + 0.08);
    g.gain.setValueAtTime(0.25 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(g).connect(tr.fade); o.start(t); o.stop(t + 0.12);
  } else if (kind === 'clap') {
    for (let i = 0; i < 3; i++) noiseHit(tr, t + i * 0.011, { type: 'bandpass', freq: 1200, vol: 0.3 * v, dur: 0.05, rev: 0.6, q: 1.5 });
  } else if (kind === 'hat') noiseHit(tr, t, { vol: 0.06 * v, dur: 0.04 });
  else if (kind === 'ohat') noiseHit(tr, t, { vol: 0.05 * v, dur: 0.18 });
  else if (kind === 'crash') noiseHit(tr, t, { freq: 4500, vol: 0.12 * v, dur: 1.6, rev: 0.6 });
}

// The cheesiest sound of the decade: a stacked "orchestra hit".
function orch(tr, t, root) {
  chord(tr, t, [root + 12, root + 19, root + 24, root + 31, root + 36], 0.32,
    { vol: 0.03, cutoff: 3800, attack: 0.005, rev: 0.9 });
  noiseHit(tr, t, { type: 'bandpass', freq: 900, vol: 0.18, dur: 0.15, rev: 0.8 });
}

// Lead phrases: [step in the 4-bar phrase (0..63), midi, length in steps].
function lead(tr, t, phrase, ph, opts, shift = 0) {
  if (!phrase) return;
  for (const [at, n, len] of phrase) {
    if (at === ph) for (const d of [-10, 10]) voice(tr, t, hz(n + shift), tr.stepLen * len,
      { attack: 0.02, rev: 0.45, echo: 0.4, detune: d, vib: 0.012, ...opts });
  }
}

// ---- Track 0: "Neon Sunset" ----
const SUN_A = [
  [0, 76, 6], [6, 74, 2], [8, 72, 4], [12, 74, 4],
  [16, 72, 6], [22, 69, 2], [24, 72, 8],
  [32, 67, 6], [38, 69, 2], [40, 72, 4], [44, 76, 4],
  [48, 74, 12], [60, 71, 4],
];
const SUN_B = [
  [0, 81, 8], [8, 79, 4], [12, 76, 4],
  [16, 77, 8], [24, 76, 4], [28, 72, 4],
  [32, 76, 6], [38, 74, 2], [40, 72, 8],
  [48, 74, 6], [54, 76, 2], [56, 79, 8],
];
const SUNSET = {
  bpm: 108,
  roots: [45, 41, 36, 43],                                         // A F C G
  chords: [[57, 60, 64], [57, 60, 65], [55, 60, 64], [55, 59, 62]],
  leads: [null, SUN_A, SUN_B, SUN_A],
  play(tr, t, step) {
    const s16 = step % 16, bar = Math.floor(step / 16) % 4, pass = Math.floor(step / 64) % 4;
    const root = this.roots[bar], ch = this.chords[bar];
    if (s16 === 0 || s16 === 8 || (s16 === 10 && bar === 3)) drum(tr, t, 'kick');
    if (s16 === 4 || s16 === 12) drum(tr, t, 'snare');
    if (s16 % 4 === 2) drum(tr, t, 'ohat'); else if (s16 % 2 === 0) drum(tr, t, 'hat');
    if (step % 64 === 0) drum(tr, t, 'crash');
    // Octave-bouncing 8th bass, the synthwave signature.
    if (s16 % 2 === 0) voice(tr, t, hz(root - 12 + (s16 % 4 ? 12 : 0)), tr.stepLen * 1.8, { vol: 0.13, cutoff: 900 });
    // Lush detuned pad, one swell per bar.
    if (s16 === 0) chord(tr, t, ch, tr.stepLen * 16, { vol: 0.018, cutoff: 1800, attack: 0.35, rev: 0.6 });
    // Sparkly arp, up and down the chord.
    if (pass > 0 || bar >= 2) {
      const i = [0, 1, 2, 1][s16 % 4] + (s16 >= 8 ? 3 : 0);
      const n = ch[i % 3] + 12 * (1 + Math.floor(i / 3));
      voice(tr, t, hz(n), tr.stepLen * 0.8, { type: 'square', vol: 0.022, cutoff: 3200, echo: 0.3 });
    }
    lead(tr, t, this.leads[pass], step % 64, { type: 'square', vol: 0.035, cutoff: 3500 });
  },
};

// ---- Track 1: "Midnight Drive" ----
const MID_A = [
  [0, 74, 4], [4, 77, 4], [8, 81, 6], [14, 79, 2],
  [16, 77, 4], [20, 74, 4], [24, 70, 8],
  [32, 72, 4], [36, 76, 4], [40, 79, 6], [46, 77, 2],
  [48, 76, 8], [56, 73, 8],
];
const MID_B = [
  [0, 81, 2], [2, 82, 2], [4, 81, 4], [8, 77, 8],
  [16, 82, 4], [20, 81, 4], [24, 77, 4], [28, 74, 4],
  [32, 79, 4], [36, 77, 4], [40, 76, 8],
  [48, 73, 4], [52, 76, 4], [56, 81, 8],
];
const MIDNIGHT = {
  bpm: 122,
  roots: [38, 34, 36, 33],                                         // D Bb C A
  chords: [[62, 65, 69], [62, 65, 70], [60, 64, 67], [61, 64, 69]],
  leads: [null, null, MID_A, MID_B],
  play(tr, t, step) {
    const s16 = step % 16, bar = Math.floor(step / 16) % 4, pass = Math.floor(step / 64) % 4;
    const root = this.roots[bar], ch = this.chords[bar];
    const fill = bar === 3 && pass % 2 === 1 && s16 >= 12;
    if (s16 % 4 === 0) drum(tr, t, 'kick');
    if (fill) drum(tr, t, `tom${[220, 170, 130, 100][s16 - 12]}`);
    else {
      if (s16 === 4 || s16 === 12) { drum(tr, t, 'snare', 0.8); drum(tr, t, 'clap'); }
      drum(tr, t, s16 % 4 === 2 ? 'ohat' : 'hat', s16 % 2 ? 0.6 : 1);
    }
    if (step % 64 === 0) drum(tr, t, 'crash');
    // Rolling 16th bass with an octave pop.
    voice(tr, t, hz(root + (s16 % 4 === 2 ? 12 : 0)), tr.stepLen * 0.8,
      { vol: 0.11, cutoff: s16 % 4 === 0 ? 1300 : 700 });
    // Six-step arp against the 4/4 beat: it rolls across the bar line.
    const i = [0, 1, 2, 3, 2, 1][step % 6];
    voice(tr, t, hz(ch[i % 3] + 12 + (i === 3 ? 12 : 0)), tr.stepLen * 0.7,
      { type: 'square', vol: 0.02, cutoff: 2600, echo: 0.35 });
    // Brassy syncopated stabs.
    if (pass > 0 && (s16 === 0 || s16 === 3 || s16 === 6 || s16 === 10)) {
      chord(tr, t, ch, tr.stepLen * (s16 === 10 ? 4 : 1.5), { vol: 0.022, cutoff: 3000, sweep: 0.04, rev: 0.4 });
    }
    // Long pad underneath.
    if (s16 === 0) chord(tr, t, ch.map((n) => n - 12), tr.stepLen * 16, { vol: 0.014, cutoff: 1100, attack: 0.5, rev: 0.6 });
    lead(tr, t, this.leads[pass], step % 64, { type: 'sawtooth', vol: 0.03, cutoff: 3800 });
  },
};

// ---- Track 2: "Dawn Strike" (boss) ----
const BOSS_A = [
  [0, 71, 6], [6, 74, 2], [8, 76, 8],
  [16, 79, 4], [20, 76, 4], [24, 72, 8],
  [32, 74, 6], [38, 76, 2], [40, 78, 8],
  [48, 75, 12], [60, 71, 4],
];
const BOSS_B = [
  [0, 76, 4], [4, 79, 4], [8, 83, 8],
  [16, 81, 4], [20, 79, 4], [24, 76, 8],
  [32, 78, 4], [36, 79, 4], [40, 81, 8],
  [48, 78, 6], [54, 75, 2], [56, 71, 8],
];
const BOSS_C = [
  [0, 76, 2], [2, 78, 2], [4, 79, 4], [8, 83, 8],
  [16, 84, 6], [22, 83, 2], [24, 79, 8],
  [32, 81, 6], [38, 83, 2], [40, 86, 8],
  [48, 87, 16],
];
const DAWN_STRIKE = {
  bpm: 146,
  roots: [40, 36, 38, 35],                                         // E C D B
  chords: [[64, 67, 71], [64, 67, 72], [62, 66, 69], [63, 66, 71]],
  leads: [BOSS_A, BOSS_B, BOSS_A, BOSS_C],
  play(tr, t, step) {
    const s16 = step % 16, bar = Math.floor(step / 16) % 4, pass = Math.floor(step / 64) % 4;
    // Cheesy key change: every 4 phrases the whole song jumps up a whole tone.
    const key = Math.floor(step / 256) % 2 ? 2 : 0;
    const root = this.roots[bar] + key, ch = this.chords[bar].map((n) => n + key);
    const fill = bar === 3 && pass % 2 === 1 && s16 >= 8;
    if (s16 % 2 === 0 || (s16 === 11 && !fill)) drum(tr, t, 'kick', s16 % 4 ? 0.7 : 1);   // double-time kick
    if (fill) {
      if (s16 % 2 === 0) drum(tr, t, `tom${[230, 185, 145, 110][(s16 - 8) / 2]}`);
    } else {
      if (s16 === 4 || s16 === 12) drum(tr, t, 'snare');
      drum(tr, t, 'hat', s16 % 2 ? 0.5 : 1);
    }
    if (step % 64 === 0) { drum(tr, t, 'crash', 1.3); orch(tr, t, root); }
    if (pass === 3 && s16 === 0) orch(tr, t, root);   // orchestra hit on every bar of the climb
    // Galloping bass (da-da-dum).
    if (s16 % 4 !== 1) voice(tr, t, hz(root + (s16 % 4 === 3 ? 12 : 0)), tr.stepLen * 0.85,
      { vol: 0.12, cutoff: s16 % 4 === 0 ? 1500 : 800 });
    // Distorted power chords: big hit on 1, stabs on 2& and 3&, ringing on 4.
    const hits = { 0: 6, 6: 1.5, 10: 1.5, 12: 4 };
    if (hits[s16]) for (const n of [root + 12, root + 19, root + 24]) for (const d of [-7, 7]) {
      voice(tr, t, hz(n), tr.stepLen * hits[s16], { vol: 0.5, cutoff: 5000, detune: d, dist: true });
    }
    // Fast arp sparkle on top.
    const i = [0, 1, 2, 3][s16 % 4];
    voice(tr, t, hz(ch[i % 3] + 12 + (i === 3 ? 12 : 0)), tr.stepLen * 0.6,
      { type: 'square', vol: 0.016, cutoff: 3000, echo: 0.25 });
    lead(tr, t, this.leads[pass], step % 64, { type: 'sawtooth', vol: 0.035, cutoff: 4200, vib: 0.008 }, key);
  },
};

const TRACKS = [SUNSET, MIDNIGHT, DAWN_STRIKE];

// A noise "whoosh" riser and a crash to glue the crossfade together.
function whoosh(a, t) {
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = music.noise;
  f.type = 'bandpass'; f.Q.value = 2;
  f.frequency.setValueAtTime(300, t);
  f.frequency.exponentialRampToValueAtTime(7000, t + 1.3);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.25, t + 1.25);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.45);
  src.connect(f).connect(g).connect(music.bus);
  src.start(t); src.stop(t + 1.5);
}

function switchTrack(i) {
  const a = ctx, m = music, t = a.currentTime;
  if (m.cur === i) return;
  const first = m.cur < 0;
  for (const tr of m.tracks) if (!tr.dieAt) {   // fade out whatever is playing
    tr.fade.gain.cancelScheduledValues(t);
    tr.fade.gain.setTargetAtTime(0.0001, t + 0.6, 0.35);
    tr.dieAt = t + 3;
  }
  const tr = makeTrack(a, TRACKS[i], i);
  tr.next = t + (first ? 0.1 : 1.3);            // land the new track's downbeat on the whoosh peak
  tr.fade.gain.setTargetAtTime(1, first ? t : t + 1.2, first ? 0.05 : 0.08);
  if (!first) whoosh(a, t);
  m.tracks.push(tr);
  m.cur = i;
}

function startMusic() {
  if (music) return;
  const a = ac();
  music = makeMusic(a);
  switchTrack(wantTrack);
  const tick = () => {
    const now = a.currentTime;
    for (const tr of music.tracks) {
      // After a background-tab stall, skip ahead instead of firing a burst of old notes.
      if (tr.next < now) tr.next = now + 0.05;
      while (tr.next < now + 0.25 && !(tr.dieAt && tr.next > tr.dieAt)) {
        tr.def.play(tr, tr.next, tr.step++);
        tr.next += tr.stepLen;
      }
    }
    music.tracks = music.tracks.filter((tr) => {
      if (!tr.dieAt || now < tr.dieAt + 0.5) return true;
      tr.fade.disconnect();
      return false;
    });
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

// Filtered white noise burst: tyre screech, crowd roar, firework crack.
let noiseBuf = null;
function noise(dur, vol, type, freq, q = 1, attack = 0.01) {
  if (muted) return;
  const a = ac(), now = a.currentTime;
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = noiseBuf; src.loop = true;
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(0.0001, now);
  g.gain.linearRampToValueAtTime(vol, now + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  src.connect(f).connect(g).connect(a.destination);
  src.start(now); src.stop(now + dur + 0.05);
}

export const sfx = {
  get muted() { return muted; },
  toggleMute() {
    muted = !muted;
    try { localStorage.setItem('team5.muted', muted ? '1' : '0'); } catch {}
    setMusicGain();
  },
  unlock() { try { ac(); startMusic(); } catch {} },
  // Pick the soundtrack: 0 sunset, 1 midnight, 2 boss. Crossfades on change.
  music(i) {
    wantTrack = i;
    if (music && music.cur !== i) try { switchTrack(i); } catch {}
  },
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
  // Big red button: a rocket-seat whoosh, then a soft pop as the chute opens.
  seatFire() { tone(160, 0.5, 'sawtooth', 0.14, 900); },
  flare() { for (let i = 0; i < 4; i++) setTimeout(() => tone(1400 - i * 200, 0.12, 'sawtooth', 0.05, -900), i * 50); tone(660, 0.4, 'triangle', 0.08, 500); },
  chute() { tone(240, 0.18, 'triangle', 0.1, -120); },
  select() { tone(660, 0.05, 'square', 0.08); },
  // Boss: a two-tone siren, a big crunch, and a rising fanfare at dawn.
  bossWarn() { for (let i = 0; i < 6; i++) setTimeout(() => tone(i % 2 ? 520 : 780, 0.22, 'square', 0.09), i * 230); },
  bossDown() { tone(70, 0.9, 'sawtooth', 0.2, -50); setTimeout(() => tone(160, 0.5, 'square', 0.12, -120), 120); },
  // Victory landing: tyre chirp, the crowd roaring with whistles, distant fireworks.
  touchdown() { noise(0.3, 0.1, 'bandpass', 2600, 5); tone(90, 0.25, 'triangle', 0.15, -40); setTimeout(() => noise(0.25, 0.07, 'bandpass', 2300, 5), 160); },
  cheer() {
    noise(3.4, 0.12, 'bandpass', 1100, 0.6, 0.5);
    noise(3, 0.05, 'bandpass', 2600, 1.2, 0.4);
    for (let i = 0; i < 5; i++) setTimeout(() => tone(1700 + Math.random() * 700, 0.3, 'sine', 0.035, 500), 250 + i * 420);
  },
  firework() { noise(0.7, 0.09, 'lowpass', 500 + Math.random() * 400, 0.7, 0.005); setTimeout(() => noise(0.8, 0.03, 'highpass', 5000, 0.7, 0.2), 150); },
  dawn() { [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => tone(f, i === 4 ? 0.6 : 0.16, 'square', 0.1), i * 120)); },
};
