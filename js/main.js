// Game shell: state machine (title / playing / paused / name entry / game over),
// fixed-timestep loop, HUD, high scores and screen shake. Theme-agnostic.
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

const START = ['Enter', 'Space', 'NumpadEnter'];

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
      for (const e of game.events) {
        if (e === 'pickup') sfx.pickup(game.multiplier);
        if (e === 'hit') { sfx.hit(); shake = 12; }
        if (e === 'level') sfx.levelUp();
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
          lastRank = highscores.add(entryName.trim() || 'AAA', Math.floor(game.score), game.level);
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

// ---------- Drawing ----------
function text(str, x, y, size = 20, color = '#fff', align = 'center') {
  ctx.font = `bold ${size}px monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

function blink(str, x, y, size, color) {
  if (Math.floor(clock * 2) % 2 === 0) text(str, x, y, size, color);
}

function drawBackground() {
  ctx.fillStyle = '#12121f';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#1c1c30';
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
}

function drawHud() {
  const score = Math.floor(game.score);
  text(`SCORE ${String(score).padStart(7, '0')}`, 16, 22, 18, '#fff', 'left');
  text(`HI ${String(Math.max(score, highscores.best())).padStart(7, '0')}`, W / 2, 22, 18, '#ffd166');
  text(`LV ${game.level}`, W - 16, 22, 18, '#4cc9f0', 'right');
  text('♥'.repeat(Math.max(0, game.lives)), W - 16, 48, 18, '#ff4d6d', 'right');
  if (game.multiplier > 1) {
    text(`x${game.multiplier}`, 16, 48, 18, '#ffd166', 'left');
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(56, 44, 60 * (game.comboTimer / CONFIG.comboWindow), 6);
  }
}

function drawScoreTable(top) {
  text('HIGH SCORES', W / 2, top, 20, '#ffd166');
  if (!highscores.list.length) { text('no scores yet - be the first', W / 2, top + 34, 16, '#8a8aa0'); return; }
  highscores.list.forEach((e, i) => {
    const y = top + 30 + i * 22;
    const color = i === lastRank ? '#4cc9f0' : '#ddd';
    text(`${String(i + 1).padStart(2)}. ${e.name.padEnd(3)}  ${String(e.score).padStart(7)}  LV${e.level}`, W / 2, y, 16, color);
  });
}

function overlay(alpha = 0.6) {
  ctx.fillStyle = `rgba(8,8,16,${alpha})`;
  ctx.fillRect(0, 0, W, H);
}

function draw() {
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  drawBackground();
  if (game) game.draw(ctx);
  ctx.restore();

  if (state === 'title') {
    overlay(game ? 0.75 : 0.3);
    text(CONFIG.title, W / 2, 90, 48, '#4cc9f0');
    text('ARROWS / WASD move   ·   P pause   ·   M mute', W / 2, 140, 14, '#8a8aa0');
    drawScoreTable(190);
    blink('PRESS ENTER TO START', W / 2, H - 50, 22, '#fff');
  } else {
    if (game) drawHud();
  }

  if (state === 'paused') {
    overlay();
    text('PAUSED', W / 2, H / 2 - 20, 40);
    text('P resume  ·  Q quit to title', W / 2, H / 2 + 24, 16, '#8a8aa0');
  }

  if (state === 'entry') {
    overlay(0.75);
    text(isNewBest ? 'NEW HIGH SCORE!' : 'TOP 10!', W / 2, 150, 40, '#ffd166');
    text(String(Math.floor(game.score)), W / 2, 210, 32);
    text('ENTER YOUR INITIALS', W / 2, 280, 18, '#8a8aa0');
    const shown = (entryName + (Math.floor(clock * 3) % 2 ? '_' : ' ')).padEnd(3, ' ').slice(0, 3);
    text(shown.split('').join(' '), W / 2, 330, 40, '#4cc9f0');
    text('ENTER to confirm', W / 2, 390, 14, '#8a8aa0');
  }

  if (state === 'gameover') {
    overlay(0.75);
    text('GAME OVER', W / 2, 60, 44, '#ff4d6d');
    text(`SCORE ${Math.floor(game.score)}   ·   LEVEL ${game.level}`, W / 2, 110, 18);
    drawScoreTable(155);
    blink('R / ENTER play again   ·   ESC title', W / 2, H - 30, 18, '#fff');
  }

  if (sfx.muted) text('MUTED', W - 16, H - 16, 12, '#8a8aa0', 'right');
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
requestAnimationFrame(frame);
