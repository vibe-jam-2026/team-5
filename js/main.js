// Game shell: state machine (title / playing / paused / name entry / game over),
// fixed-timestep loop, HUD, high scores ("top pilots") and screen shake.
import { CONFIG } from './config.js';
import { input } from './input.js';
import { highscores } from './highscores.js';
import { sfx } from './audio.js';
import { Game } from './game.js';

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
let soundBudget = 0;      // limits kill/pickup sounds per frame when many happen at once

const START = ['Enter', 'Space', 'NumpadEnter'];
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function openSelect() {
  state = 'select';
  sfx.unlock();
  sfx.select();
}

function startGame() {
  game = new Game(CONFIG.aircraft[aircraftIndex]);
  state = 'playing';
  lastRank = -1;
  sfx.unlock();
  sfx.select();
}

function endGame() {
  const score = Math.floor(game.score);
  isNewBest = score > highscores.best();
  if (highscores.qualifies(score)) {
    state = 'entry';
    entryName = '';
    input.takeTyped();
  } else {
    state = 'gameover';
  }
}

function update(dt) {
  clock += dt;
  shake = Math.max(0, shake - dt * 30);
  if (input.wasPressed('KeyM')) sfx.toggleMute();

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
      if (input.wasPressed('KeyP', 'Escape')) { state = 'paused'; break; }
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
        if (e === 'over') { sfx.gameOver(); shake = 20; endGame(); }
      }
      break;

    case 'paused':
      if (input.wasPressed('KeyP', 'Escape')) state = 'playing';
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
      if (input.wasPressed('KeyR', ...START)) openSelect();
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
function controlRow(label, keys, x, y) {
  text(label, x, y, 14, NEON.ink, 'left', 'normal');
  let cx = x + 110;
  for (const k of keys) {
    if (k === 'or') { text('or', cx + 4, y, 12, NEON.dim, 'left', 'normal'); cx += 26; continue; }
    cx += keycap(k, cx, y) + 4;
  }
}

// Fixed star positions, shared by the title and in-game skies.
const STARS = Array.from({ length: 45 }, (_, i) => {
  const r = (n) => { const x = Math.sin(i * 127.1 + n * 311.7) * 43758.5453; return x - Math.floor(x); };
  return { x: r(1) * W, y: r(2) * H * 0.6, s: 0.6 + r(3) * 1.2, phase: r(4) * 6.28, speed: 0.6 + r(5) * 1.6 };
});

// In-game sky with a day cycle driven by the run's clock: sunset → night →
// sunrise → day → sunset again. The horizon sits behind the forest and sinks
// out of view as the jet climbs, so the sky darkens up high.
const SUNSET_SUN = { x: W * 0.68, r: 90 };
const MOON = { x: W * 0.28, y: H * 0.22, r: 34 };
const DAY_LENGTH = 180;   // seconds for one full cycle

// Sky gradient stops (top → horizon) for each time of day.
const SKIES = {
  sunset:  ['#07011a', '#2a0a52', '#8a1f78', '#e0407a', '#ff9e3d'],
  night:   ['#020008', '#0a0420', '#150a36', '#1f0f44', '#2a1650'],
  sunrise: ['#0e0b3c', '#3a2a7a', '#b8559c', '#ff8a80', '#ffd27a'],
  day:     ['#1b4fa6', '#3b7fd6', '#6fb2ec', '#a8d8f5', '#e8f6ff'],
};
// Keyframes over the cycle (u in 0..1): sky, sun height above the horizon
// (in sun radii; negative = set), star brightness and moon brightness.
const CYCLE = [
  { u: 0.00, sky: 'sunset',  sun: 0.2,  stars: 0.3, moon: 0 },
  { u: 0.12, sky: 'night',   sun: -2.6, stars: 1,   moon: 1 },
  { u: 0.40, sky: 'night',   sun: -2.6, stars: 1,   moon: 1 },
  { u: 0.52, sky: 'sunrise', sun: 0.2,  stars: 0.3, moon: 0 },
  { u: 0.64, sky: 'day',     sun: 2.6,  stars: 0,   moon: 0 },
  { u: 0.88, sky: 'day',     sun: 2.6,  stars: 0,   moon: 0 },
  { u: 1.00, sky: 'sunset',  sun: 0.2,  stars: 0.3, moon: 0 },
];

const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function mixHex(a, b, k) {
  const A = hexRgb(a), B = hexRgb(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(',')})`;
}

// Current time-of-day state from the run's clock.
function timeOfDay(seconds) {
  const u = ((seconds / DAY_LENGTH) % 1 + 1) % 1;
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
  const tod = timeOfDay(inRun ? game.time : 0);
  const sky = ctx.createLinearGradient(0, horizon - H * 1.6, 0, horizon);
  [0, 0.5, 0.8, 0.93, 1].forEach((at, j) => sky.addColorStop(at, tod.stops[j]));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Stars fade in towards the top, where the sky is darkest, and only at night.
  for (const st of STARS) {
    const fade = tod.stars * Math.max(0, Math.min(1, (horizon - st.y - H * 0.2) / (H * 0.5)));
    if (fade <= 0) continue;
    const a = fade * (0.2 + 0.4 * (0.5 + 0.5 * Math.sin(t * st.speed + st.phase)));
    ctx.fillStyle = `rgba(255,235,255,${a.toFixed(3)})`;
    ctx.fillRect(st.x, st.y, st.s, st.s);
  }

  // Moon: a pale crescent that shows up at night.
  if (tod.moon > 0.01) {
    const my = MOON.y + (horizon - (H - 50)) * 0.3;
    ctx.save();
    ctx.globalAlpha = tod.moon;
    const mg = ctx.createRadialGradient(MOON.x, my, MOON.r * 0.8, MOON.x, my, MOON.r * 3);
    mg.addColorStop(0, 'rgba(200,210,255,0.25)');
    mg.addColorStop(1, 'rgba(200,210,255,0)');
    ctx.fillStyle = mg;
    ctx.fillRect(MOON.x - MOON.r * 3, my - MOON.r * 3, MOON.r * 6, MOON.r * 6);
    // Crescent: the moon disc minus an offset disc (even-odd fill inside the moon).
    ctx.beginPath(); ctx.arc(MOON.x, my, MOON.r, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#e8e6ff';
    ctx.beginPath();
    ctx.arc(MOON.x, my, MOON.r, 0, Math.PI * 2);
    ctx.arc(MOON.x + MOON.r * 0.45, my - MOON.r * 0.2, MOON.r * 0.9, 0, Math.PI * 2);
    ctx.fill('evenodd');
    ctx.restore();
  }

  const { x, r } = SUNSET_SUN;
  const cy = horizon - tod.sun * r;                 // sun centre
  if (cy - r > H || tod.sun < -1.05) return;        // sun is below the horizon or the screen
  // Pink glow when the sun is low, a soft white one when it's high.
  const low = Math.max(0, Math.min(1, 1 - tod.sun / 2));
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
    const y = horizon - r * 0.6 + i * gap + drift;
    const h = 1 + ((y - (horizon - r * 0.6)) / (r * 0.6)) * 6;
    ctx.fillRect(x - r, y, r * 2, h);
  }
  ctx.restore();
  // Ground detail scrolls with the camera; it's drawn in game.js.
}

function drawHud() {
  const score = Math.floor(game.score);
  // Top middle: score, high score and time. Top left holds the HP/XP bars (game.js).
  text(`SCORE ${String(score).padStart(7, '0')}`, W / 2, 22, 18, '#fff');
  neonText(`HI ${String(Math.max(score, highscores.best())).padStart(7, '0')}`, W / 2, 42, 14, NEON.cyan);
  text(fmtTime(game.time), W / 2, 62, 16, '#fff');
  neonText(`LV ${game.level}`, W - 16, 22, 18, NEON.magenta, 'right');
  text(`SPLASH ${game.kills}`, W - 16, 44, 14, NEON.ink, 'right');
  if (game.multiplier > 1) {
    neonText(`x${game.multiplier} STREAK`, 16, 62, 16, NEON.yellow, 'left');
    ctx.fillStyle = NEON.yellow;
    ctx.fillRect(16, 74, 110 * (game.streakTimer / CONFIG.streakWindow), 4);
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

  chromeTitle(CONFIG.title, W / 2, 58, 58);
  ctx.fillStyle = 'rgba(9,2,28,0.85)';
  ctx.fillRect(W / 2 - 150, 94, 300, 24);
  neonText(`★  ${CONFIG.subtitle.toUpperCase()}  ★`, W / 2, 106, 14, NEON.cyan);

  // Left: mission briefing + controls
  const lx = 30, ly = 136, lw = 490, lh = 344;
  neonPanel(lx, ly, lw, lh, NEON.magenta);
  neonText('MISSION BRIEFING', lx + 20, ly + 24, 16, NEON.magenta, 'left');
  const how = [
    'Pick your jet, then fly it through the neon night.',
    'Hostiles swarm in from every side of the sky.',
    'Your weapons fire on their own: you just fly.',
    'Shoot them down, grab the SSD cards to level up.',
    'Each level: pick 1 of 3 new or stronger weapons.',
    'AA guns in the forest fire flak. Dodge or destroy!',
    'Quick kills build a streak multiplier. Stay airborne!',
  ];
  how.forEach((l, i) => text('▸ ' + l, lx + 20, ly + 50 + i * 19, 13, NEON.ink, 'left', 'normal'));

  neonText('FLIGHT CONTROLS', lx + 20, ly + 196, 16, NEON.magenta, 'left');
  const cy = ly + 222;
  controlRow('Steer', ['↑', '↓', '←', '→', 'or', 'W', 'A', 'S', 'D'], lx + 20, cy);
  controlRow('Pick upgrade', ['1', '2', '3', 'or', '←', '→', 'Enter'], lx + 20, cy + 26);
  controlRow('Pause', ['P', 'or', 'Esc'], lx + 20, cy + 52);
  controlRow('Sound', ['M'], lx + 20, cy + 78);
  controlRow('Fly again', ['R'], lx + 20, cy + 104);
  text('(after you go down)', lx + 160, cy + 104, 12, NEON.dim, 'left', 'normal');

  // Right: high scores
  const rx = 540, rw = 390;
  neonPanel(rx, ly, rw, lh, NEON.cyan);
  drawPilotLog(rx, ly + 24, rw, CONFIG.highscoreCount, PILOT_LOG);

  if (Math.floor(clock * 2) % 2 === 0) neonText('PRESS ENTER TO CHOOSE YOUR AIRCRAFT', W / 2, H - 28, 22, NEON.yellow);
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
  const maxOf = (k) => Math.max(...list.map((a) => a[k]));
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
    ctx.save();
    ctx.translate(px, py + (sel ? Math.sin(clock * 4) * 3 : 0));
    ctx.rotate(-Math.PI / 2);
    ctx.scale(2.4, 2.4);
    Game.drawJet(ctx, a, (sel ? 6 : 4.5) + Math.sin(clock * 50 + i) * 2);
    ctx.restore();
    // Name: chrome on the selected card
    cardName(a.name.toUpperCase(), x + cw / 2, y + 166, sel);
    text(a.desc, x + cw / 2, y + 190, 13, NEON.ink, 'center', 'normal');
    // Stat bars: segmented neon meters
    stats.forEach(([label, k], j) => {
      const sy = y + 220 + j * 24;
      text(label, x + 20, sy, 12, NEON.ink, 'left');
      const segs = 10, bx = x + 92, bw = cw - 148, sw = bw / segs;
      const filled = Math.round(segs * a[k] / maxOf(k));
      const col = a[k] > 1 ? NEON.cyan : a[k] < 1 ? NEON.pink : NEON.yellow;
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

  if (state === 'paused') {
    overlay();
    chromeTitle('PAUSED', W / 2, H / 2 - 20, 48);
    neonText('P resume  ·  Q quit to title', W / 2, H / 2 + 28, 16, NEON.cyan);
  }

  if (state === 'entry') {
    overlay(0.8);
    chromeTitle(isNewBest ? 'TOP ACE!' : 'YOU MADE THE BOARD!', W / 2, 140, 48);
    neonText(String(Math.floor(game.score)), W / 2, 205, 32, '#fff');
    neonText('ENTER YOUR CALLSIGN', W / 2, 270, 16, NEON.cyan);
    const shown = (entryName + (Math.floor(clock * 3) % 2 ? '_' : ' ')).padEnd(3, ' ').slice(0, 3);
    neonText(shown.split('').join(' '), W / 2, 325, 40, NEON.yellow);
    text('type letters · ENTER to confirm', W / 2, 385, 14, NEON.dim);
  }

  if (state === 'gameover') {
    overlay(0.82);
    chromeTitle(game.pressedRed ? 'YOU PRESSED IT' : game.crashed ? 'CRASHED' : 'SHOT DOWN', W / 2, 52, 52);
    neonText(`Airborne ${fmtTime(game.time)}  ·  ${game.kills} bandits splashed  ·  level ${game.level}  ·  ${Math.floor(game.score)} pts`, W / 2, 96, 15, NEON.cyan);
    const boardRows = Math.max(2, Math.min(highscores.list.length, CONFIG.highscoreCount));
    neonPanel(W / 2 - 220, 116, 440, 64 + boardRows * 20, NEON.magenta);
    drawPilotLog(W / 2 - 200, 138, 400);
    if (Math.floor(clock * 2) % 2 === 0) neonText('R / ENTER choose aircraft & fly again   ·   ESC title', W / 2, H - 30, 18, NEON.yellow);
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
