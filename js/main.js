// Game shell: state machine (title / playing / paused / name entry / game over),
// fixed-timestep loop, HUD, high scores ("top pilots") and screen shake.
import { CONFIG } from './config.js';
import { input } from './input.js';
import { voice } from './voice.js';
import { highscores } from './highscores.js';
import { sfx } from './audio.js';
import { Game } from './game.js';
import { quotes } from './quotes.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = CONFIG.width, H = CONFIG.height;

let state = 'title';      // 'title' | 'select' | 'playing' | 'paused' | 'entry' | 'gameover'
let game = null;
let shake = 0;
let clock = 0;            // for blinking text
let entryName = '';
let lastRank = -1;
let isNewBest = false;
let aircraftIndex = 1;    // remembered between rounds
let soundBudget = 0;
const quoteSet = CONFIG.deathQuotes; // set in config.js
let quote = null;                    // the quote shown for this death      // limits kill/pickup sounds per frame when many happen at once

const START = ['Enter', 'Space', 'NumpadEnter'];
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function openSelect() {
  state = 'select';
  sfx.unlock();
  sfx.select();
}

// Testing: open the page with ?boss to start every run right at the final boss.
const BOSS_TEST = new URLSearchParams(location.search).has('boss');

function startGame() {
  game = new Game(CONFIG.aircraft[aircraftIndex]);
  if (BOSS_TEST) game.skipToBoss();
  state = 'playing';
  lastRank = -1;
  sfx.unlock();
  sfx.select();
}

const deathReason = () => (game.won ? 'won' : game.pressedRed ? 'red' : game.crashed ? 'crash' : 'shot');

function endGame() {
  quote = quotes.pick(quoteSet, deathReason());
  const score = Math.floor(game.score);
  isNewBest = score > highscores.best();
  if (!game.testRun && highscores.qualifies(score)) {
    state = 'entry';
    entryName = '';
    input.takeTyped();
  } else {
    state = 'gameover';
  }
}

// Which soundtrack fits right now: 0 sunset/day, 1 midnight, 2 boss.
function musicTrack() {
  if (!game || state === 'title' || state === 'select') return 0;
  const M = CONFIG.music, h = game.hour;
  if (game.boss && !game.cleared) return 2;
  if (!game.cleared && h >= M.bossMusicHour && h < 6) return 2;
  if (h >= M.midnightHour && h < 6) return 1;
  return 0;
}

function update(dt) {
  clock += dt;
  voice.allowToggle = state !== 'entry';   // V is a letter while typing initials
  // The mic turns on with the key press that starts a run (it has to happen inside the key press).
  voice.autoStartKeys = state === 'select' ? [...START, ...CONFIG.aircraft.flatMap((_, i) => ['Digit' + (i + 1), 'Numpad' + (i + 1)])] : [];
  sfx.music(musicTrack());
  shake = Math.max(0, shake - dt * 30);
  if (input.wasPressed('KeyM') && !input.wasPressed('Shift+KeyM')) sfx.toggleMute();   // Shift+M is a test shortcut

  switch (state) {
    case 'title':
      if (input.wasPressed(...START)) openSelect();
      break;

    case 'select': {
      const n = CONFIG.aircraft.length;
      if (input.wasPressed(...START)) { startGame(); break; }
      if (input.wasPressed('ArrowLeft', 'KeyA', 'ArrowUp', 'KeyW')) { aircraftIndex = (aircraftIndex + n - 1) % n; sfx.select(); }
      if (input.wasPressed('ArrowRight', 'KeyD', 'ArrowDown', 'KeyS')) { aircraftIndex = (aircraftIndex + 1) % n; sfx.select(); }
      for (let i = 0; i < n; i++) if (input.wasPressed('Digit' + (i + 1), 'Numpad' + (i + 1))) { aircraftIndex = i; startGame(); }
      if (input.wasPressed('Escape')) state = 'title';
      break;
    }

    case 'playing':
      if (input.wasPressed('Escape')) { state = 'paused'; break; }
      game.update(dt, input);
      soundBudget = 2;
      for (const e of game.events) {
        if (e === 'kill' && soundBudget-- > 0) sfx.kill(game.multiplier);
        if (e === 'pickup' && soundBudget-- > 0) sfx.pickup();
        if (e === 'hit') { sfx.hit(); shake = Math.max(shake, 6); }
        if (e === 'flak') sfx.flak();
        if (e === 'zap' && soundBudget-- > 0) sfx.zap();
        if (e === 'boom') { sfx.boom(); shake = Math.max(shake, 3); }
        if (e === 'power') sfx.power();
        if (e === 'rocket' && soundBudget-- > 0) sfx.rocket();
        if (e === 'pop' && soundBudget-- > 0) sfx.pop();
        if (e === 'levelup') sfx.levelUp();
        if (e === 'choose') sfx.choose();
        if (e === 'eject') { sfx.bossWarn(); shake = Math.max(shake, 8); }
        if (e === 'seatFire') { sfx.seatFire(); shake = Math.max(shake, 6); }
        if (e === 'chute') sfx.chute();
        if (e === 'flare') sfx.flare();
        if (e === 'bossWarn') sfx.bossWarn();
        if (e === 'bossDown') { sfx.bossDown(); shake = Math.max(shake, 14); }
        if (e === 'dawn') { sfx.dawn(); shake = Math.max(shake, 10); }
        if (e === 'touchdown') { sfx.touchdown(); shake = Math.max(shake, 4); }
        if (e === 'cheer') sfx.cheer();
        if (e === 'firework' && soundBudget-- > 0) sfx.firework();
        if (e === 'over') { if (game.won) sfx.dawn(); else { sfx.gameOver(); shake = 20; } endGame(); }
      }
      break;

    case 'paused':
      if (input.wasPressed('Escape')) state = 'playing';
      if (input.wasPressed('KeyQ')) state = 'title';
      break;

    case 'entry':
      for (const k of input.takeTyped()) {
        if (k === 'Backspace') entryName = entryName.slice(0, -1);
        else if (k === 'Enter') {
          lastRank = highscores.add(entryName.trim() || 'AAA', Math.floor(game.score), game.level, game.time, game.kills);
          sfx.select();
          state = 'gameover';
          input.endFrame(); // don't let this Enter also restart
          return;
        } else if (/^[a-z0-9]$/i.test(k) && entryName.length < 3) {
          entryName += k.toUpperCase();
          sfx.select();
        }
      }
      break;

    case 'gameover':
      if (input.wasPressed('Enter', 'NumpadEnter')) openSelect();
      if (input.wasPressed('Escape')) state = 'title';
      break;
  }
}

// ---------- Drawing helpers ----------
function text(str, x, y, size = 20, color = '#fff', align = 'center', weight = 'bold') {
  ctx.font = `${weight} ${size}px monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

function blink(str, x, y, size, color) {
  if (Math.floor(clock * 2) % 2 === 0) text(str, x, y, size, color);
}

// 80s neon palette for the title screen.
const NEON = { pink: '#ff2a6d', magenta: '#ff71ce', cyan: '#05d9e8', purple: '#b967ff', yellow: '#fffb96', ink: '#e8dcff', dim: '#9a86c4' };

// Draw with a neon glow.
function glow(color, blur, fn) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  fn();
  ctx.restore();
}

// A keyboard key cap, returns its width.
function keycap(label, x, y) {
  ctx.font = 'bold 13px monospace';
  const w = Math.max(24, ctx.measureText(label).width + 12);
  ctx.fillStyle = '#1a0838';
  ctx.fillRect(x, y - 12, w, 24);
  glow(NEON.cyan, 6, () => {
    ctx.strokeStyle = NEON.cyan;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y - 12, w, 24);
  });
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + 1);
  return w;
}

// One controls line: a label, then key caps. 'or' is drawn as plain text.
function controlRow(label, keys, x, y, labelW = 118) {
  text(label, x, y, 14, NEON.ink, 'left', 'normal');
  let cx = x + labelW;
  for (const k of keys) {
    if (k === 'or') { text('or', cx + 4, y, 12, NEON.dim, 'left', 'normal'); cx += 26; continue; }
    cx += keycap(k, cx, y) + 4;
  }
  return cx; // x just after the last key, for a note beside it
}

// Fixed star positions, shared by the title and in-game skies.
const STARS = Array.from({ length: 45 }, (_, i) => {
  const r = (n) => { const x = Math.sin(i * 127.1 + n * 311.7) * 43758.5453; return x - Math.floor(x); };
  return { x: r(1) * W, y: r(2) * H * 0.6, s: 0.6 + r(3) * 1.2, phase: r(4) * 6.28, speed: 0.6 + r(5) * 1.6 };
});

// Denser star field for the in-game night sky; a few big ones sparkle.
const SKY_STARS = Array.from({ length: 140 }, (_, i) => {
  const r = (n) => { const x = Math.sin(i * 91.7 + n * 271.3) * 24634.6345; return x - Math.floor(x); };
  const big = r(6) < 0.08;
  return { x: r(1) * W, y: r(2) * H * 0.85, s: big ? 1.6 : 0.5 + r(3) * 1.1, big, phase: r(4) * 6.28, speed: 0.6 + r(5) * 2,
    tint: r(7) < 0.15 ? '185,220,255' : r(7) > 0.9 ? '255,190,240' : '255,240,255' };
});

// Long thin synthwave cloud streaks at fixed heights above the horizon.
// They drift slowly and scroll with the jet a little (parallax).
const CLOUDS = Array.from({ length: 9 }, (_, i) => {
  const r = (n) => { const x = Math.sin(i * 57.3 + n * 113.9) * 9631.123; return x - Math.floor(x); };
  return { x: r(1) * (W + 600), up: 120 + r(2) * 330, len: 180 + r(3) * 320, th: 5 + r(4) * 9, par: 0.03 + r(5) * 0.05, drift: 4 + r(6) * 8 };
});

// Distant wireframe mountains on the horizon: a ridge height for x. The
// waves fit a whole number of times into MOUNTAIN_PERIOD, so it repeats.
const MOUNTAIN_PERIOD = 1920;
function ridge(x, seed, h) {
  const n = (k) => Math.sin(x * k * Math.PI * 2 / MOUNTAIN_PERIOD + seed * k) * 0.5 + 0.5;
  const v = n(3) * 0.5 + n(8) * 0.3 + n(19) * 0.2;
  return h * (0.35 + 0.65 * v * v);
}

// In-game sky with a day cycle driven by the in-game clock (game.hour):
// each run starts at sunset, 6 PM. Night falls, and by 6 AM (when the final
// boss arrives) the horizon glows with twilight. The sun only rises once the
// boss is beaten, while the jet lands at home base.
// The horizon sits behind the forest and sinks out of view as the jet climbs,
// so the sky darkens up high.
const SUNSET_SUN = { x: W * 0.68, r: 90 };
// The moon rises at 6:45 PM and sets at 5:30 AM, just before the boss's twilight.
const MOON = { r: 52, rise: 18.75, span: 10.75, fromX: W * 0.1, toX: SUNSET_SUN.x + 40, peak: H * 0.62 };

// Sky gradient stops (top → horizon) for each time of day.
const SKIES = {
  sunset:  ['#07011a', '#2a0a52', '#8a1f78', '#e0407a', '#ff9e3d'],
  night:   ['#020008', '#0a0420', '#150a36', '#1f0f44', '#2a1650'],
  twilight: ['#07031f', '#1d1450', '#5a2c74', '#a54a7c', '#e07a5c'],
  sunrise: ['#0e0b3c', '#3a2a7a', '#b8559c', '#ff8a80', '#ffd27a'],
  day:     ['#1b4fa6', '#3b7fd6', '#6fb2ec', '#a8d8f5', '#e8f6ff'],
};
// Keyframes over 24 hours starting at 6 PM (u = hours since 6 PM / 24, so
// u 0.5 = 6 AM): sky, sun height above the horizon (in sun radii; negative =
// set), star brightness and moon brightness.
const CYCLE = [
  { u: 0.00, sky: 'sunset',   sun: 0.2,  stars: 0.3, moon: 0.6 },  // 6:00 PM, run starts (moon rises at 6:45)
  { u: 0.10, sky: 'night',    sun: -2.6, stars: 1,   moon: 1 },    // ~8:30 PM
  { u: 0.44, sky: 'night',    sun: -2.6, stars: 1,   moon: 1 },    // ~4:30 AM
  { u: 0.50, sky: 'twilight', sun: -1.1, stars: 0.5, moon: 0.3 },  // 6:00 AM, boss (clock holds here)
  { u: 0.52, sky: 'sunrise',  sun: 0.2,  stars: 0.3, moon: 0 },    // ~6:30 AM, boss beaten: sunrise
  { u: 0.60, sky: 'day',      sun: 2.6,  stars: 0,   moon: 0 },    // ~8:30 AM
  { u: 0.88, sky: 'day',      sun: 2.6,  stars: 0,   moon: 0 },
  { u: 1.00, sky: 'sunset',   sun: 0.2,  stars: 0.3, moon: 0 },    // 6:00 PM again
];

const hexRgb = (h) => (h[0] === '#' ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) : h.match(/\d+/g).map(Number));
function mixHex(a, b, k) {
  const A = hexRgb(a), B = hexRgb(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(',')})`;
}

// Current time-of-day state from the in-game clock (hours, 0..24).
function timeOfDay(hour) {
  const u = (((hour - 18) / 24) % 1 + 1) % 1;
  let i = 0;
  while (u > CYCLE[i + 1].u) i++;
  const a = CYCLE[i], b = CYCLE[i + 1];
  const k0 = (u - a.u) / (b.u - a.u), k = k0 * k0 * (3 - 2 * k0);   // smoothstep
  const lerp = (f) => a[f] + (b[f] - a[f]) * k;
  return {
    stops: SKIES[a.sky].map((c, j) => mixHex(c, SKIES[b.sky][j], k)),
    sun: lerp('sun'), stars: lerp('stars'), moon: lerp('moon'),
  };
}

function drawBackground() {
  const t = performance.now() / 1000;
  const inRun = game && state !== 'select';
  const horizon = H - 50 + (inRun ? game.groundOffset : 0);
  const hour = inRun ? game.hour : 18;
  const tod = timeOfDay(hour);
  const camX = inRun ? game.viewX : 0;
  const sky = ctx.createLinearGradient(0, horizon - H * 1.6, 0, horizon);
  [0, 0.5, 0.8, 0.93, 1].forEach((at, j) => sky.addColorStop(at, tod.stops[j]));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  // Faint horizon glow band in the sky's own colour
  const hb = ctx.createLinearGradient(0, horizon - 160, 0, horizon);
  hb.addColorStop(0, 'rgba(255,42,109,0)');
  hb.addColorStop(1, `rgba(255,${Math.round(60 + 120 * (1 - tod.stars))},140,${(0.10 + 0.12 * (1 - tod.stars)).toFixed(3)})`);
  ctx.fillStyle = hb; ctx.fillRect(0, horizon - 160, W, 160);

  // Stars fade in towards the top, where the sky is darkest, and only at night.
  if (tod.stars > 0.01) {
    for (const st of SKY_STARS) {
      const fade = tod.stars * Math.max(0, Math.min(1, (horizon - st.y - H * 0.15) / (H * 0.45)));
      if (fade <= 0) continue;
      const tw = 0.5 + 0.5 * Math.sin(t * st.speed + st.phase);
      const a = fade * (0.25 + 0.6 * tw);
      ctx.fillStyle = `rgba(${st.tint},${a.toFixed(3)})`;
      ctx.fillRect(st.x, st.y, st.s, st.s);
      if (st.big) {      // four-point sparkle
        const l = 3 + tw * 4, cx = st.x + st.s / 2, cy = st.y + st.s / 2;
        ctx.fillStyle = `rgba(${st.tint},${(a * 0.6).toFixed(3)})`;
        ctx.fillRect(cx - l, cy - 0.4, l * 2, 0.8); ctx.fillRect(cx - 0.4, cy - l, 0.8, l * 2);
      }
    }
    // A shooting star now and then
    const period = 7, k = (t % period) / 0.9, n = Math.floor(t / period);
    if (k < 1) {
      const r = (m) => { const x = Math.sin(n * 12.9 + m * 78.2) * 43758.5; return x - Math.floor(x); };
      const sx = W * (0.15 + r(1) * 0.7) + k * 220, sy = H * (0.05 + r(2) * 0.3) + k * 90;
      const g = ctx.createLinearGradient(sx - 90, sy - 37, sx, sy);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, `rgba(220,240,255,${(0.8 * tod.stars * Math.sin(k * Math.PI)).toFixed(3)})`);
      ctx.strokeStyle = g; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(sx - 90, sy - 37); ctx.lineTo(sx, sy); ctx.stroke();
    }
  }

  // Moon: the sun's night twin, drawn in the same striped synthwave style.
  // It rises from the forest on the left just after sunset, arcs over the
  // night and sets on the right (where the sun will come up) before dawn.
  // Its lit side always faces the sun, wherever that is below the horizon.
  const sunPos = { x: SUNSET_SUN.x, y: horizon - tod.sun * SUNSET_SUN.r };
  const mp = ((hour - MOON.rise + 24) % 24) / MOON.span;   // 0 rise .. 1 set
  if (tod.moon > 0.01 && mp >= 0 && mp <= 1) drawMoon(mp, horizon, sunPos, tod.moon, sky, t);

  const { x, r } = SUNSET_SUN;
  const cy = horizon - tod.sun * r;                 // sun centre
  const low = Math.max(0, Math.min(1, 1 - tod.sun / 2));
  if (!(cy - r > H || tod.sun < -1.05)) {           // sun is above the horizon and on screen
    // Pink glow when the sun is low, a soft white one when it's high.
    const halo = ctx.createRadialGradient(x, cy, r * 0.6, x, cy, r * 2.4);
    halo.addColorStop(0, low > 0.5 ? `rgba(255,42,109,${(0.45 * low).toFixed(3)})` : `rgba(255,250,220,${(0.35 * (1 - low)).toFixed(3)})`);
    halo.addColorStop(1, 'rgba(255,42,109,0)');
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, horizon); ctx.clip();   // nothing below the horizon
    ctx.fillStyle = halo;
    ctx.fillRect(x - r * 2.4, cy - r * 2.4, r * 4.8, r * 4.8);
    ctx.beginPath();
    ctx.arc(x, cy, r, 0, Math.PI * 2);
    ctx.clip();
    const sg = ctx.createLinearGradient(0, cy - r, 0, cy + r);
    sg.addColorStop(0, NEON.yellow);
    sg.addColorStop(0.45, low > 0.5 ? '#ff9e3d' : '#fff3b0');
    sg.addColorStop(1, low > 0.5 ? NEON.pink : '#ffd166');
    ctx.fillStyle = sg;
    ctx.fillRect(x - r, cy - r, r * 2, r * 2);
    // Slats cut through the sun near the horizon, thicker lower down, slowly sinking.
    ctx.fillStyle = sky;
    const gap = 12, drift = (t * 6) % gap;
    for (let i = 0; i < 7; i++) {
      const y = cy - r * 0.6 + i * gap + drift;
      const h = 1 + ((y - (cy - r * 0.6)) / (r * 0.6)) * 6;
      ctx.fillRect(x - r, y, r * 2, h);
    }
    ctx.restore();
  }

  // Cloud streaks: dark bodies lit from below by the sun (pink and orange at
  // dusk), edged lavender by moonlight at night, white by day.
  const day = Math.max(0, 1 - tod.stars * 1.2) * Math.max(0, Math.min(1, tod.sun / 2));
  const body = mixHex(tod.stops[1], tod.stops[2], 0.5);
  const rimSun = low > 0.5 ? '#ff7a9c' : '#fff6e0';
  const rim = tod.stars > 0.6 ? mixHex('#2a1650', '#9d8cff', tod.moon * 0.8) : mixHex(rimSun, '#ffffff', day);
  for (const c of CLOUDS) {
    const span = W + c.len + 200;
    const cx = ((((c.x - camX * c.par - t * c.drift) % span) + span) % span) - c.len - 100;
    const cyy = horizon - c.up;
    if (cyy < -20 || cyy > H) continue;
    ctx.globalAlpha = 0.55 + 0.35 * day;
    const cg = ctx.createLinearGradient(0, cyy - c.th, 0, cyy + c.th);
    cg.addColorStop(0, body); cg.addColorStop(0.6, body); cg.addColorStop(1, rim);
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.ellipse(cx + c.len / 2, cyy, c.len / 2, c.th, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + c.len * 0.35, cyy - c.th * 0.5, c.len * 0.22, c.th * 0.9, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + c.len * 0.68, cyy - c.th * 0.3, c.len * 0.18, c.th * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Wireframe mountains on the horizon, in two ranges (behind the forest).
  drawMountains(horizon, camX, tod, low);
  // Ground detail scrolls with the camera; it's drawn in game.js.
}

// Synthwave wireframe mountains: a dark translucent range (the sun glows
// through) with a neon ridge line and contour lines, scrolling with parallax.
// Each range is drawn once into a repeating offscreen strip and blitted.
const mountainCache = new Map();
function drawMountains(horizon, camX, tod, low) {
  if (horizon - 110 > H) return;
  const neon = tod.stars > 0.6 ? '5,217,232' : low > 0.5 ? '255,113,206' : '190,140,255';
  const ranges = [
    { par: 0.05, h: 100, seed: 1.7, fill: 'rgba(22,6,44,0.5)', line: 0.35 },
    { par: 0.12, h: 68, seed: 4.2, fill: 'rgba(12,4,28,0.78)', line: 0.6 },
  ];
  const P = MOUNTAIN_PERIOD, RES = 2;
  for (const m of ranges) {
    const sh = m.h + 6;
    let c = mountainCache.get(m.seed);
    if (!c || c.neon !== neon) {
      c = c || { canvas: document.createElement('canvas') };
      c.neon = neon;
      c.canvas.width = P * RES; c.canvas.height = sh * RES;
      const g = c.canvas.getContext('2d');
      g.scale(RES, RES);
      const step = 12, pts = [];
      for (let x = 0; x <= P; x += step) pts.push([x, sh - ridge(x, m.seed, m.h)]);
      const path = () => { g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); };
      path(); g.lineTo(P, sh); g.lineTo(0, sh); g.closePath();
      g.fillStyle = m.fill; g.fill();
      g.save(); g.clip();
      // Contour lines that follow the ridge, and vertical wireframe ribs
      g.strokeStyle = `rgba(${neon},${(0.12 * m.line).toFixed(3)})`; g.lineWidth = 1;
      for (let k = 1; k <= 4; k++) {
        g.beginPath();
        pts.forEach(([px, py], i) => { const y = py + (sh - py) * k * 0.22; i ? g.lineTo(px, y) : g.moveTo(px, y); });
        g.stroke();
      }
      g.beginPath();
      pts.forEach(([px, py], i) => { if (i % 3 === 0) { g.moveTo(px, py); g.lineTo(px, sh); } });
      g.stroke();
      g.restore();
      // Glowing ridge line: a wide faint stroke under a thin bright one
      path(); g.lineJoin = 'round';
      g.strokeStyle = `rgba(${neon},${(m.line * 0.25).toFixed(3)})`; g.lineWidth = 5; g.stroke();
      g.strokeStyle = `rgba(${neon},${m.line.toFixed(3)})`; g.lineWidth = 1.4; g.stroke();
      mountainCache.set(m.seed, c);
    }
    const off = (((camX * m.par) % P) + P) % P;
    for (let x = -off; x < W; x += P) ctx.drawImage(c.canvas, x, horizon - sh, P, sh);
  }
}

// Striped neon moon at path position p (0 = rising, 1 = setting).
function drawMoon(p, horizon, sunPos, alpha, sky, t) {
  const { r } = MOON;
  const x = MOON.fromX + (MOON.toX - MOON.fromX) * p;
  const y = horizon + r * 0.9 - Math.sin(Math.PI * p) * (MOON.peak + r * 0.9);   // starts and ends below the trees
  if (y - r > H) return;
  // The lit side faces the sun: the shadow disc sits on the opposite side.
  const ang = Math.atan2(sunPos.y - y, sunPos.x - x);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath(); ctx.rect(0, 0, W, horizon); ctx.clip();   // set behind the horizon like the sun
  // Cool cyan-violet halo, the night version of the sun's pink glow.
  const halo = ctx.createRadialGradient(x, y, r * 0.7, x, y, r * 3);
  halo.addColorStop(0, 'rgba(120,200,255,0.30)');
  halo.addColorStop(0.5, 'rgba(185,103,255,0.10)');
  halo.addColorStop(1, 'rgba(185,103,255,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
  // Neon rim
  glow(NEON.cyan, 18, () => {
    ctx.strokeStyle = 'rgba(5,217,232,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r + 1, 0, Math.PI * 2); ctx.stroke();
  });
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
  // Disc: white-lavender on top to cyan at the bottom (the sun goes yellow to pink).
  const mg = ctx.createLinearGradient(0, y - r, 0, y + r);
  mg.addColorStop(0, '#ffffff');
  mg.addColorStop(0.45, '#c9b8ff');
  mg.addColorStop(1, NEON.cyan);
  ctx.fillStyle = mg;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  // A few soft craters
  ctx.fillStyle = 'rgba(120,90,200,0.25)';
  for (const [cx, cy, cr] of [[-0.3, -0.25, 0.18], [0.25, 0.1, 0.12], [-0.05, 0.35, 0.1], [0.35, -0.4, 0.08]]) {
    ctx.beginPath(); ctx.arc(x + cx * r, y + cy * r, cr * r, 0, Math.PI * 2); ctx.fill();
  }
  // Shadow side: a dark disc offset away from the sun, with faint earthshine.
  ctx.fillStyle = 'rgba(14,6,40,0.72)';
  ctx.beginPath();
  ctx.arc(x - Math.cos(ang) * r * 0.85, y - Math.sin(ang) * r * 0.85, r * 0.98, 0, Math.PI * 2);
  ctx.fill();
  // Slats like the sun's, slowly sinking through the lower half.
  ctx.fillStyle = sky;
  const gap = 10, drift = (t * 5) % gap;
  for (let i = 0; i < 6; i++) {
    const sy = y + r * 0.1 + i * gap + drift;
    ctx.fillRect(x - r, sy, r * 2, 1 + ((sy - y) / r) * 5);
  }
  ctx.restore();
}

function drawHud() {
  const score = Math.floor(game.score);
  // Top middle: score, high score and time. Top left holds the HP/XP bars (game.js).
  text(`SCORE ${String(score).padStart(7, '0')}`, W / 2, 22, 18, '#fff');
  neonText(`HI ${String(Math.max(score, highscores.best())).padStart(7, '0')}`, W / 2, 42, 14, NEON.cyan);
  // In-game clock (6 PM at the start, 6 AM at the boss) and time airborne.
  const h = Math.floor(game.hour), m = Math.floor((game.hour % 1) * 60);
  const clockStr = `${(h + 11) % 12 + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  const held = game.boss && !game.cleared && Math.floor(clock * 2) % 2;   // blinks while the boss holds back dawn
  text(`${held ? '' : clockStr}  ·  ${fmtTime(game.time)}`, W / 2, 62, 16, '#fff');
  neonText(`LV ${game.level}`, W - 16, 22, 18, NEON.magenta, 'right');
  text(`SPLASH ${game.kills}`, W - 16, 44, 14, NEON.ink, 'right');
  if (game.multiplier > 1) {
    neonText(`x${game.multiplier} STREAK`, 16, 76, 16, NEON.yellow, 'left');
    ctx.fillStyle = NEON.yellow;
    ctx.fillRect(16, 88, 110 * (game.streakTimer / CONFIG.streakWindow), 4);
  }
}

// High-score board (the look is PILOT_LOG, defined with the title screen).
function drawPilotLog(x, y, w, rows = CONFIG.highscoreCount, look = PILOT_LOG) {
  neonText(look.heading, x + w / 2, y, 16, look.color);
  if (!highscores.list.length) {
    look.empty.forEach((l, i) => text(l, x + w / 2, y + 34 + i * 20, 14, look.dim, 'center', 'normal'));
    return;
  }
  text('#  NAME    SCORE   TIME  LV', x + w / 2, y + 26, 12, look.dim);
  highscores.list.slice(0, rows).forEach((e, i) => {
    const color = i === lastRank ? NEON.yellow : i === 0 ? '#fff' : NEON.ink;
    const line = `${String(i + 1).padStart(2)} ${e.name.padEnd(3)} ${String(e.score).padStart(8)}  ${fmtTime(e.time ?? 0).padStart(5)} ${String(e.level).padStart(3)}`;
    text(line, x + w / 2, y + 48 + i * 20, 14, color);
  });
}

// ---------- Title screen: a neon night sortie, 1980s style ----------
const HORIZON = 124;
const SUN = { x: W / 2, r: 104 };

function drawSynthwaveSky(t) {
  const sky = ctx.createLinearGradient(0, 0, 0, HORIZON);
  sky.addColorStop(0, '#07011a');
  sky.addColorStop(0.55, '#2a0a52');
  sky.addColorStop(1, '#8a1f78');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, HORIZON);

  for (const st of STARS) {
    const y = st.y * (HORIZON / (H * 0.6));
    const a = 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(t * st.speed + st.phase));
    ctx.fillStyle = `rgba(255,235,255,${a.toFixed(3)})`;
    ctx.fillRect(st.x, y, st.s, st.s);
  }

  // Sun glow, then the striped sun sitting on the horizon.
  const halo = ctx.createRadialGradient(SUN.x, HORIZON, SUN.r * 0.6, SUN.x, HORIZON, SUN.r * 2.2);
  halo.addColorStop(0, 'rgba(255,42,109,0.45)');
  halo.addColorStop(1, 'rgba(255,42,109,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, W, HORIZON);

  ctx.save();
  ctx.beginPath();
  ctx.arc(SUN.x, HORIZON, SUN.r, Math.PI, 0);
  ctx.clip();
  const sg = ctx.createLinearGradient(0, HORIZON - SUN.r, 0, HORIZON);
  sg.addColorStop(0, NEON.yellow);
  sg.addColorStop(0.45, '#ff9e3d');
  sg.addColorStop(1, NEON.pink);
  ctx.fillStyle = sg;
  ctx.fillRect(SUN.x - SUN.r, HORIZON - SUN.r, SUN.r * 2, SUN.r);
  // Slats cut through the lower sun, thicker towards the horizon, slowly sinking.
  ctx.fillStyle = sky;
  const gap = 13, drift = (t * 6) % gap;
  for (let i = 0; i < 7; i++) {
    const y = HORIZON - SUN.r * 0.6 + i * gap + drift;
    const h = 1 + ((y - (HORIZON - SUN.r * 0.6)) / (SUN.r * 0.6)) * 6;
    ctx.fillRect(SUN.x - SUN.r, y, SUN.r * 2, h);
  }
  ctx.restore();

  // A fighter jet streaks across the sky.
  const span = W + 240;
  const jx = ((t * 110) % span) - 120;
  drawJetSilhouette(jx, 40 + Math.sin(t * 1.3) * 6, t);
}

function drawJetSilhouette(x, y, t) {
  ctx.save();
  ctx.translate(x, y);
  // Neon afterburner trail.
  const trail = ctx.createLinearGradient(-90, 0, -16, 0);
  trail.addColorStop(0, 'rgba(5,217,232,0)');
  trail.addColorStop(1, 'rgba(5,217,232,0.8)');
  ctx.fillStyle = trail;
  ctx.fillRect(-90, -1.5, 74, 3);
  glow(NEON.magenta, 10, () => {
    ctx.fillStyle = NEON.magenta;
    ctx.beginPath(); ctx.arc(-17, 0, 2.5 + Math.sin(t * 30), 0, Math.PI * 2); ctx.fill();
  });
  // Body, swept wings and tail fin, in black against the sky.
  ctx.fillStyle = '#05010f';
  ctx.beginPath();
  ctx.moveTo(26, 0); ctx.lineTo(4, -4); ctx.lineTo(-6, -16); ctx.lineTo(-11, -16); ctx.lineTo(-6, -4);
  ctx.lineTo(-14, -4); ctx.lineTo(-20, -11); ctx.lineTo(-23, -11); ctx.lineTo(-19, -2);
  ctx.lineTo(-19, 2); ctx.lineTo(-6, 4); ctx.lineTo(-11, 12); ctx.lineTo(-6, 12); ctx.lineTo(4, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// Neon perspective grid rushing towards you.
function drawSynthwaveGround(t) {
  const g = ctx.createLinearGradient(0, HORIZON, 0, H);
  g.addColorStop(0, '#1b0638');
  g.addColorStop(1, '#07011a');
  ctx.fillStyle = g;
  ctx.fillRect(0, HORIZON, W, H - HORIZON);

  glow(NEON.pink, 8, () => {
    ctx.lineWidth = 1.5;
    for (let i = -16; i <= 16; i++) {
      ctx.strokeStyle = 'rgba(255,42,109,0.55)';
      ctx.beginPath();
      ctx.moveTo(SUN.x + i * 14, HORIZON);
      ctx.lineTo(SUN.x + i * 150, H);
      ctx.stroke();
    }
    const n = 12, scroll = (t * 0.9) % 1;
    for (let k = 0; k < n; k++) {
      const p = (k + scroll) / n;
      const y = HORIZON + (H - HORIZON) * p * p;
      ctx.strokeStyle = `rgba(255,42,109,${(0.15 + 0.6 * p).toFixed(3)})`;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.strokeStyle = NEON.magenta;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, HORIZON); ctx.lineTo(W, HORIZON); ctx.stroke();
  });
}

// Chrome-and-neon logo text.
function chromeTitle(str, x, y, size) {
  ctx.font = `italic 900 ${size}px Impact, "Arial Black", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const top = y - size / 2, bottom = y + size / 2;
  const chrome = ctx.createLinearGradient(0, top, 0, bottom);
  chrome.addColorStop(0, '#f4fdff');
  chrome.addColorStop(0.45, '#5fd3ff');
  chrome.addColorStop(0.5, '#1a0838');
  chrome.addColorStop(0.55, '#ff71ce');
  chrome.addColorStop(1, '#fff0fa');
  ctx.lineJoin = 'round';
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#12032b';
  ctx.strokeText(str, x + 3, y + 3);
  glow(NEON.pink, 22, () => { ctx.fillStyle = chrome; ctx.fillText(str, x, y); });
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.strokeText(str, x, y);
}

function neonPanel(x, y, w, h, color) {
  ctx.fillStyle = 'rgba(9,2,28,0.82)';
  ctx.fillRect(x, y, w, h);
  glow(color, 14, () => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
  });
}

function neonText(str, x, y, size, color, align = 'center') {
  glow(color, 10, () => text(str, x, y, size, color, align));
}

const PILOT_LOG = {
  heading: 'TOP PILOTS · BEST SORTIES', color: NEON.cyan, dim: NEON.dim,
  empty: ['No sorties logged yet.', 'Survive a night flight to make the board.'],
};

function drawTitle() {
  const t = performance.now() / 1000;
  drawSynthwaveSky(t);
  drawSynthwaveGround(t);

  chromeTitle(CONFIG.title, W / 2, 56, 68);
  ctx.fillStyle = 'rgba(9,2,28,0.85)';
  ctx.fillRect(W / 2 - 150, 94, 300, 24);
  neonText(`★  ${CONFIG.subtitle.toUpperCase()}  ★`, W / 2, 106, 14, NEON.cyan);

  // Left: mission briefing + controls
  const lx = 30, ly = 134, lw = 490, lh = 352;
  neonPanel(lx, ly, lw, lh, NEON.magenta);
  neonText('MISSION BRIEFING', lx + 20, ly + 22, 16, NEON.magenta, 'left');
  const how = [
    'Drones swarm in. Your guns fire on their own.',
    'Grab SSD cards to level up and pick upgrades.',
    'Dodge flak from the AA guns in the forest.',
    'Beat the Mothership before sunrise for dawn!',
  ];
  how.forEach((l, i) => text('▸ ' + l, lx + 20, ly + 48 + i * 22, 14, NEON.ink, 'left', 'normal'));

  // Controls: one row per action, 30 px apart so the 24 px key caps never touch.
  neonText('FLIGHT CONTROLS', lx + 20, ly + 168, 16, NEON.magenta, 'left');
  const cy = ly + 200, row = 30, note = (str, x, y) => text(str, x + 8, y, 12, NEON.dim, 'left', 'normal');
  controlRow('Fly', ['↑', '↓', '←', '→', 'or', 'W', 'A', 'S', 'D'], lx + 20, cy);
  controlRow('Pick upgrade', ['1', '2', '3', 'or', '←', '→', 'Enter'], lx + 20, cy + row);
  note('(V: mic on/off · say "flares")', controlRow('Flares', ['F', 'or', 'Space'], lx + 20, cy + row * 2), cy + row * 2);
  note('(after you go down)', controlRow('Fly again', ['Enter'], lx + 20, cy + row * 3), cy + row * 3);
  const afterEsc = controlRow('Pause', ['Esc'], lx + 20, cy + row * 4);
  controlRow('Sound', ['M'], afterEsc + 40, cy + row * 4, 60);

  // Right: high scores
  const rx = 540, rw = 390;
  neonPanel(rx, ly, rw, lh, NEON.cyan);
  drawPilotLog(rx, ly + 24, rw, CONFIG.highscoreCount, PILOT_LOG);

  if (Math.floor(clock * 2) % 2 === 0) neonText('PRESS ENTER TO START', W / 2, H - 28, 22, NEON.yellow);
}

// Aircraft selection: three cards with a preview and stat bars, on the same neon backdrop.
function drawSelect() {
  const t = performance.now() / 1000;
  drawSynthwaveSky(t);
  drawSynthwaveGround(t);
  chromeTitle('CHOOSE YOUR AIRCRAFT', W / 2, 62, 42);
  ctx.fillStyle = 'rgba(9,2,28,0.85)';
  ctx.fillRect(W / 2 - 210, 96, 420, 24);
  neonText('1 / 2 / 3   or   ← → and ENTER   ·   ESC back', W / 2, 108, 14, NEON.cyan);
  const list = CONFIG.aircraft, cw = 260, ch = 300, gap = 24;
  const x0 = W / 2 - (list.length * cw + (list.length - 1) * gap) / 2;
  const stats = [['SPEED', 'speed'], ['HEALTH', 'health'], ['DAMAGE', 'damage']];
  const roles = ['RECON', 'MULTIROLE', 'HEAVY'];
  list.forEach((a, i) => {
    const sel = i === aircraftIndex;
    const x = x0 + i * (cw + gap), y = 140 - (sel ? 6 : 0);
    const pulse = 0.5 + 0.5 * Math.sin(t * 5);
    Game.drawNeonCard(ctx, x, y, cw, ch, sel, t, String(i + 1));
    // Class tag in the header band
    text(roles[i] ?? 'AIRCRAFT', x + 22, y + 16, 12, sel ? NEON.yellow : '#fff', 'left');
    // Preview on a glowing launch pad, gently bobbing when selected
    const px = x + cw / 2, py = y + 92;
    const pad = ctx.createRadialGradient(px, py, 6, px, py, 62);
    pad.addColorStop(0, sel ? 'rgba(255,113,206,0.35)' : 'rgba(5,217,232,0.18)');
    pad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = pad; ctx.beginPath(); ctx.arc(px, py, 62, 0, Math.PI * 2); ctx.fill();
    glow(sel ? NEON.magenta : NEON.cyan, 10, () => {
      ctx.strokeStyle = sel ? NEON.magenta : NEON.cyan; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(px, py, 48, 0, Math.PI * 2); ctx.stroke();
      // Rotating targeting ticks round the ring
      ctx.save(); ctx.translate(px, py); ctx.rotate(t * (sel ? 1.2 : 0.3));
      for (let k = 0; k < 4; k++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath(); ctx.arc(0, 0, 54, -0.25, 0.25); ctx.stroke();
      }
      ctx.restore();
    });
    // The model banks gently from side to side (the selected one rolls
    // further), casting a shadow on the pad, with a hologram scan over it.
    const roll = Math.sin(t * (sel ? 1.6 : 0.7) + i * 2) * (sel ? 0.5 : 0.25);
    const bob = sel ? Math.sin(clock * 4) * 3 : 0;
    const span = 40 * Math.abs(Math.cos(roll)) + 8;
    const sh = ctx.createRadialGradient(px + 4, py + 30, 2, px + 4, py + 30, span);
    sh.addColorStop(0, 'rgba(5,1,15,0.6)'); sh.addColorStop(1, 'rgba(5,1,15,0)');
    ctx.save();
    ctx.translate(px + 4 - roll * 8, py + 30); ctx.scale(1, 0.32);
    ctx.fillStyle = sh; ctx.translate(-(px + 4), -(py + 30));
    ctx.beginPath(); ctx.arc(px + 4, py + 30, span, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(px + roll * 4, py + bob);
    ctx.rotate(-Math.PI / 2);
    ctx.scale(2.4, 2.4 * Math.cos(roll));
    Game.drawJet(ctx, a, (sel ? 6 : 4.5) + Math.sin(clock * 50 + i) * 2);
    ctx.restore();
    // Hologram scanline sweeping up the model
    ctx.save();
    ctx.beginPath(); ctx.arc(px, py, 47, 0, Math.PI * 2); ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    const sy = py + 47 - ((t * (sel ? 0.9 : 0.4) + i * 0.3) % 1) * 94;
    const scan = ctx.createLinearGradient(0, sy - 14, 0, sy + 2);
    const sc = sel ? '255,113,206' : '5,217,232';
    scan.addColorStop(0, `rgba(${sc},0)`); scan.addColorStop(0.85, `rgba(${sc},0.22)`); scan.addColorStop(1, `rgba(${sc},0.7)`);
    ctx.fillStyle = scan; ctx.fillRect(px - 50, sy - 14, 100, 16);
    ctx.fillStyle = `rgba(${sc},0.05)`;
    for (let yy = py - 47; yy < py + 47; yy += 3) ctx.fillRect(px - 50, yy, 100, 1);
    ctx.restore();
    // Name: chrome on the selected card
    cardName(a.name.toUpperCase(), x + cw / 2, y + 166, sel);
    text(a.desc, x + cw / 2, y + 186, 13, NEON.ink, 'center', 'normal');
    text(`WEAPON: ${a.gun.name.toUpperCase()}`, x + cw / 2, y + 205, 12, sel ? NEON.yellow : a.gun.color, 'center');
    // Stat bars: segmented neon meters
    stats.forEach(([label, k], j) => {
      const sy = y + 230 + j * 22;
      text(label, x + 20, sy, 12, NEON.ink, 'left');
      const segs = 10, bx = x + 92, bw = cw - 148, sw = bw / segs;
      const filled = Math.round(segs * a[k]);   // full bar = 100%
      const col = a[k] >= 1 ? NEON.cyan : a[k] >= 0.8 ? NEON.yellow : NEON.pink;
      for (let s = 0; s < segs; s++) {
        const sx = bx + s * sw;
        ctx.beginPath();
        ctx.moveTo(sx + 2, sy - 5); ctx.lineTo(sx + sw - 1, sy - 5); ctx.lineTo(sx + sw - 3, sy + 5); ctx.lineTo(sx, sy + 5); ctx.closePath();
        if (s < filled) {
          const lit = sel && s === filled - 1 ? 0.6 + 0.4 * pulse : 1;
          ctx.globalAlpha = lit;
          glow(col, sel ? 8 : 4, () => { ctx.fillStyle = col; ctx.fill(); });
          ctx.globalAlpha = 1;
        } else { ctx.strokeStyle = 'rgba(154,134,196,0.45)'; ctx.lineWidth = 1; ctx.stroke(); }
      }
      text(`${Math.round(a[k] * 100)}%`, x + cw - 18, sy, 12, sel ? '#fff' : NEON.ink, 'right', 'normal');
    });
  });
}

// Aircraft name; chrome gradient (like the big titles) on the selected card.
function cardName(str, x, y, sel) {
  ctx.font = 'italic 900 22px Impact, "Arial Black", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const g = ctx.createLinearGradient(0, y - 11, 0, y + 11);
  g.addColorStop(0, '#f4fdff'); g.addColorStop(0.45, '#5fd3ff');
  g.addColorStop(0.55, '#ff71ce'); g.addColorStop(1, '#fff0fa');
  if (!sel) { ctx.fillStyle = '#fff'; ctx.fillText(str, x, y); return; }
  glow(NEON.pink, 12, () => { ctx.fillStyle = g; ctx.fillText(str, x, y); });
}

// Split text into lines that fit maxW at the current font.
function wrap(str, maxW) {
  const lines = [];
  let line = '';
  for (const word of str.split(' ')) {
    const tryLine = line ? line + ' ' + word : word;
    if (line && ctx.measureText(tryLine).width > maxW) { lines.push(line); line = word; } else line = tryLine;
  }
  if (line) lines.push(line);
  return lines;
}

// The death quote: italic white lines with a dim magenta attribution.
function drawQuote(y) {
  if (!quote) return;
  ctx.font = 'italic 16px Georgia, "Times New Roman", serif';
  const lines = wrap(`“${quote.q}”`, 640);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  lines.forEach((l, i) => glow(NEON.purple, 8, () => {
    ctx.font = 'italic 16px Georgia, "Times New Roman", serif';
    ctx.fillStyle = '#fff0fa';
    ctx.fillText(l, W / 2, y + i * 20);
  }));
  text(`— ${quote.by}`, W / 2, y + lines.length * 20 + 2, 12, NEON.dim, 'center', 'normal');
}

function overlay(alpha = 0.6) {
  ctx.fillStyle = `rgba(9,2,28,${alpha})`;
  ctx.fillRect(0, 0, W, H);
}

// Render at the canvas's real on-screen resolution (including high-DPI
// screens) so everything stays sharp; game code still draws in W x H units.
function fitCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round((canvas.clientWidth || W) * dpr), h = Math.round(w * H / W);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  ctx.setTransform(w / W, 0, 0, h / H, 0, 0);
}

// Mic status, bottom right: press V to talk, say "flares".
const VOICE_LABEL = {
  off: ['V: VOICE OFF', NEON.dim], loading: ['MIC LOADING, PRESS V AGAIN', NEON.dim], starting: ['MIC STARTING…', NEON.cyan],
  on: ['● MIC ON · SAY "FLARES"', '#ff4d6d'], denied: ['MIC BLOCKED', NEON.dim], unsupported: ['NO VOICE IN THIS BROWSER', NEON.dim],
};
function drawVoice() {
  const [label, color] = VOICE_LABEL[voice.state] || VOICE_LABEL.off;
  if (voice.state === 'on' && Math.floor(clock * 1.5) % 2) text(label.replace('●', ' '), W - 16, H - 16, 12, color, 'right');
  else text(label, W - 16, H - 16, 12, color, 'right');
  if (voice.heard && performance.now() - voice.heard.t < 900) neonText(voice.heard.text, W - 16, H - 36, 18, NEON.yellow, 'right');
}

function draw() {
  fitCanvas();
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  drawBackground();
  if (game && state !== 'select') game.draw(ctx);
  ctx.restore();

  if (state === 'title') {
    drawTitle();
  } else if (state === 'select') {
    drawSelect();
  } else if (game) {
    drawHud();
    game.drawUi(ctx);
  }
  if (state !== 'entry' && state !== 'gameover') drawVoice();

  if (state === 'paused') {
    overlay();
    chromeTitle('PAUSED', W / 2, H / 2 - 20, 48);
    neonText('ESC resume  ·  Q quit to title', W / 2, H / 2 + 28, 16, NEON.cyan);
  }

  if (state === 'entry') {
    overlay(0.8);
    chromeTitle(game.won ? 'MISSION COMPLETE' : 'GAME OVER', W / 2, 110, 52);
    neonText(isNewBest ? 'NEW HIGH SCORE!' : 'YOU MADE THE BOARD!', W / 2, 160, 18, NEON.yellow);
    neonText(String(Math.floor(game.score)), W / 2, 210, 32, '#fff');
    neonText('ENTER YOUR CALLSIGN', W / 2, 270, 16, NEON.cyan);
    const shown = (entryName + (Math.floor(clock * 3) % 2 ? '_' : ' ')).padEnd(3, ' ').slice(0, 3);
    neonText(shown.split('').join(' '), W / 2, 325, 40, NEON.yellow);
    text('type letters · ENTER to confirm', W / 2, 385, 14, NEON.dim);
    drawQuote(432);
  }

  if (state === 'gameover') {
    overlay(0.82);
    chromeTitle(game.won ? 'MISSION COMPLETE' : 'GAME OVER', W / 2, 46, 52);
    neonText(game.won ? 'NIGHT CLEARED · THE AI CORE IS DOWN AND THE PILOT IS HOME' : game.pressedRed ? 'YOU PRESSED THE BIG RED BUTTON' : game.crashed ? 'CRASHED INTO THE TREES' : 'SHOT DOWN', W / 2, 86, 16, game.won ? NEON.yellow : NEON.magenta);
    neonText(`Airborne ${fmtTime(game.time)}  ·  ${game.kills} bandits splashed  ·  level ${game.level}  ·  ${Math.floor(game.score)} pts`, W / 2, 110, 15, NEON.cyan);
    if (game.testRun) text('TEST RUN · not logged in the high scores', W / 2, H - 12, 11, '#ffb703');
    const boardRows = Math.max(2, Math.min(highscores.list.length, CONFIG.highscoreCount));
    neonPanel(W / 2 - 220, 128, 440, 64 + boardRows * 20, NEON.magenta);
    drawPilotLog(W / 2 - 200, 150, 400);
    drawQuote(422);
    if (Math.floor(clock * 2) % 2 === 0) neonText('ENTER choose aircraft & fly again   ·   ESC title', W / 2, H - 30, 18, NEON.yellow);
  }

  if (sfx.muted) text('MUTED', W - 16, H - 22, 12, '#8a7a9a', 'right');
}

// ---------- Fixed-timestep loop ----------
const STEP = 1 / 60;
let acc = 0, last = performance.now();
function frame(now) {
  acc += Math.min(0.25, (now - last) / 1000);
  last = now;
  while (acc >= STEP) {
    update(STEP);
    input.endFrame();
    acc -= STEP;
  }
  draw();
  requestAnimationFrame(frame);
}

// Auto-pause when the tab loses focus.
addEventListener('blur', () => { if (state === 'playing') state = 'paused'; });
canvas.focus();
window.__debug = () => ({ state, game });
requestAnimationFrame(frame);
