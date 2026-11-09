// Game shell: state machine (title / playing / paused / name entry / game over),
// fixed-timestep loop, HUD, high scores ("the diary") and screen shake.
import { CONFIG } from './config.js';
import { input } from './input.js';
import { highscores } from './highscores.js';
import { sfx } from './audio.js';
import { Game } from './game.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = CONFIG.width, H = CONFIG.height;

let state = 'title';      // 'title' | 'playing' | 'paused' | 'entry' | 'gameover'
let game = null;
let shake = 0;
let clock = 0;            // for blinking text
let entryName = '';
let lastRank = -1;
let isNewBest = false;
let soundBudget = 0;      // limits kill/pickup sounds per frame when many happen at once

const START = ['Enter', 'Space', 'NumpadEnter'];
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function startGame() {
  game = new Game();
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
      if (input.wasPressed(...START)) startGame();
      break;

    case 'playing':
      if (input.wasPressed('KeyP', 'Escape')) { state = 'paused'; break; }
      game.update(dt, input);
      soundBudget = 2;
      for (const e of game.events) {
        if (e === 'kill' && soundBudget-- > 0) sfx.kill(game.multiplier);
        if (e === 'pickup' && soundBudget-- > 0) sfx.pickup();
        if (e === 'hit') { sfx.hit(); shake = Math.max(shake, 6); }
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
      if (input.wasPressed('KeyR', ...START)) startGame();
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

function panel(x, y, w, h) {
  ctx.fillStyle = 'rgba(20,10,28,0.85)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#4a2a4a';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
}

// A keyboard key cap, returns its width.
function keycap(label, x, y) {
  ctx.font = 'bold 13px monospace';
  const w = Math.max(24, ctx.measureText(label).width + 12);
  ctx.fillStyle = '#2e1f3a';
  ctx.fillRect(x, y - 12, w, 24);
  ctx.strokeStyle = '#8a6aa0';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y - 12, w, 24);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + 1);
  return w;
}

// One controls line: a label, then key caps. 'or' is drawn as plain text.
function controlRow(label, keys, x, y) {
  text(label, x, y, 14, '#d8cce6', 'left', 'normal');
  let cx = x + 110;
  for (const k of keys) {
    if (k === 'or') { text('or', cx + 4, y, 12, '#8a7a9a', 'left', 'normal'); cx += 26; continue; }
    cx += keycap(k, cx, y) + 4;
  }
}

function drawBackground() {
  const g = ctx.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, W * 0.7);
  g.addColorStop(0, '#1d1028');
  g.addColorStop(1, '#0a0610');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Moon
  ctx.fillStyle = 'rgba(240,230,210,0.08)';
  ctx.beginPath(); ctx.arc(W - 120, 90, 50, 0, Math.PI * 2); ctx.fill();
  // Ground detail scrolls with the camera; it's drawn in game.js.
}

function drawHud() {
  const score = Math.floor(game.score);
  text(`SCORE ${String(score).padStart(7, '0')}`, 16, 22, 18, '#fff', 'left');
  text(`HI ${String(Math.max(score, highscores.best())).padStart(7, '0')}`, W / 2, 22, 16, '#ffb3c1');
  text(fmtTime(game.time), W / 2, 44, 18, '#fff');
  text(`LV ${game.level}`, W - 16, 22, 18, '#ff4d6d', 'right');
  text(`☠ ${game.kills}`, W - 16, 44, 14, '#b8a9c9', 'right');
  if (game.multiplier > 1) {
    text(`x${game.multiplier} STREAK`, 16, 46, 16, '#ff4d6d', 'left');
    ctx.fillStyle = '#ff4d6d';
    ctx.fillRect(16, 58, 110 * (game.streakTimer / CONFIG.streakWindow), 4);
  }
}

function drawDiary(x, y, w, rows = CONFIG.highscoreCount) {
  text('THE DIARY · BEST NIGHTS', x + w / 2, y, 16, '#ff4d6d');
  if (!highscores.list.length) {
    text('The pages are empty.', x + w / 2, y + 34, 14, '#8a7a9a', 'center', 'normal');
    text('Survive a night to write the first entry.', x + w / 2, y + 54, 14, '#8a7a9a', 'center', 'normal');
    return;
  }
  text('#  NAME    SCORE   TIME  LV', x + w / 2, y + 26, 12, '#8a7a9a');
  highscores.list.slice(0, rows).forEach((e, i) => {
    const color = i === lastRank ? '#ffd166' : i === 0 ? '#fff' : '#d8cce6';
    const line = `${String(i + 1).padStart(2)} ${e.name.padEnd(3)} ${String(e.score).padStart(8)}  ${fmtTime(e.time ?? 0).padStart(5)} ${String(e.level).padStart(3)}`;
    text(line, x + w / 2, y + 48 + i * 20, 14, color);
  });
}

function drawTitle() {
  ctx.fillStyle = 'rgba(8,4,14,0.55)';
  ctx.fillRect(0, 0, W, H);
  text(CONFIG.title, W / 2, 62, 52, '#c1121f');
  text(CONFIG.subtitle.toUpperCase(), W / 2, 104, 14, '#b8a9c9');

  // Left: how to play + controls
  const lx = 30, ly = 130, lw = 490, lh = 350;
  panel(lx, ly, lw, lh);
  text('HOW TO PLAY', lx + 20, ly + 24, 16, '#ff4d6d', 'left');
  const how = [
    'You are a vampire. Hunters swarm from every side.',
    'Your powers attack by themselves: just move.',
    'Kill hunters, collect their blood to level up.',
    'Each level: pick 1 of 3 new or stronger powers.',
    'Fast kills build a streak multiplier for points.',
    'Hunters touching you drain health. Survive!',
  ];
  how.forEach((l, i) => text('• ' + l, lx + 20, ly + 52 + i * 20, 13, '#d8cce6', 'left', 'normal'));

  text('CONTROLS', lx + 20, ly + 180, 16, '#ff4d6d', 'left');
  const cy = ly + 206;
  controlRow('Move', ['↑', '↓', '←', '→', 'or', 'W', 'A', 'S', 'D'], lx + 20, cy);
  controlRow('Pick power', ['1', '2', '3', 'or', '←', '→', 'Enter'], lx + 20, cy + 28);
  controlRow('Pause', ['P', 'or', 'Esc'], lx + 20, cy + 56);
  controlRow('Sound', ['M'], lx + 20, cy + 84);
  controlRow('Restart', ['R'], lx + 20, cy + 112);
  text('(after game over)', lx + 160, cy + 112, 12, '#8a7a9a', 'left', 'normal');

  // Right: high scores
  const rx = 540, rw = 390;
  panel(rx, ly, rw, lh);
  drawDiary(rx, ly + 24, rw);

  blink('PRESS ENTER TO BEGIN THE NIGHT', W / 2, H - 30, 20, '#fff');
}

function overlay(alpha = 0.6) {
  ctx.fillStyle = `rgba(8,4,14,${alpha})`;
  ctx.fillRect(0, 0, W, H);
}

function draw() {
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  drawBackground();
  if (game) game.draw(ctx);
  ctx.restore();

  if (state === 'title') {
    drawTitle();
  } else if (game) {
    drawHud();
    game.drawUi(ctx);
  }

  if (state === 'paused') {
    overlay();
    text('PAUSED', W / 2, H / 2 - 20, 40);
    text('P resume  ·  Q quit to title', W / 2, H / 2 + 24, 16, '#b8a9c9');
  }

  if (state === 'entry') {
    overlay(0.8);
    text(isNewBest ? 'BEST NIGHT EVER!' : 'A NIGHT FOR THE DIARY!', W / 2, 140, 36, '#ff4d6d');
    text(String(Math.floor(game.score)), W / 2, 200, 32);
    text('SIGN THE DIARY WITH YOUR INITIALS', W / 2, 270, 16, '#b8a9c9');
    const shown = (entryName + (Math.floor(clock * 3) % 2 ? '_' : ' ')).padEnd(3, ' ').slice(0, 3);
    text(shown.split('').join(' '), W / 2, 325, 40, '#ffd166');
    text('type letters · ENTER to confirm', W / 2, 385, 14, '#b8a9c9');
  }

  if (state === 'gameover') {
    overlay(0.82);
    text('THE NIGHT IS OVER', W / 2, 50, 40, '#c1121f');
    text(`Lasted ${fmtTime(game.time)}  ·  ${game.kills} hunters drained  ·  level ${game.level}  ·  ${Math.floor(game.score)} pts`, W / 2, 92, 15, '#fff', 'center', 'normal');
    drawDiary(W / 2 - 200, 135, 400);
    blink('R / ENTER play again   ·   ESC title', W / 2, H - 30, 18, '#fff');
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
