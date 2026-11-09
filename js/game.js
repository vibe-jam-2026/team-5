// Gameplay: survivor-style. The player walks around an endless world and the
// camera keeps them in the centre of the screen. Enemies spawn just outside the
// view and always chase the player.
// main.js only relies on:
//   new Game(), game.update(dt, input), game.draw(ctx),
//   game.score, game.level, game.lives, game.multiplier, game.over, game.events
// `events` is a list of strings the shell reacts to (sounds, shake): 'pickup', 'hit', 'level', 'over'.
import { CONFIG } from './config.js';

const W = CONFIG.width, H = CONFIG.height;
const rand = (a, b) => a + Math.random() * (b - a);
const SPAWN_RADIUS = Math.hypot(W, H) / 2 + 40;   // just outside the visible area
const DESPAWN_RADIUS = SPAWN_RADIUS * 2;          // enemies left far behind are recycled
const TILE = 64;                                   // ground tile size

// Deterministic per-tile noise so ground decoration stays put as you walk.
function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class Game {
  constructor() {
    this.player = { x: 0, y: 0, r: 12, speed: 200, face: 1 };
    this.cam = { x: 0, y: 0 };
    this.enemies = [];
    this.pickups = [];
    this.particles = [];
    this.floaters = [];
    this.score = 0;
    this.lives = CONFIG.startLives;
    this.level = 1;
    this.time = 0;
    this.multiplier = 1;
    this.comboTimer = 0;
    this.invuln = 0;
    this.spawnTimer = 1;
    this.over = false;
    this.events = [];
    for (let i = 0; i < 6; i++) this.spawnPickup();
  }

  // Point on a ring around the player, at distance d.
  around(d) {
    const a = rand(0, Math.PI * 2);
    return { x: this.player.x + Math.cos(a) * d, y: this.player.y + Math.sin(a) * d };
  }

  spawnPickup() {
    const pos = this.around(rand(120, SPAWN_RADIUS * 1.3));
    this.pickups.push({ ...pos, r: 8, t: rand(0, 6) });
  }

  spawnEnemy() {
    const pos = this.around(SPAWN_RADIUS + rand(0, 60));
    const big = Math.random() < 0.15;
    this.enemies.push({
      ...pos,
      r: big ? 18 : rand(9, 13),
      speed: (big ? 55 : rand(70, 100)) + this.level * 6,
      wobble: rand(0, 6),
    });
  }

  burst(x, y, color, n = 12) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), s = rand(60, 260);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.7), color });
    }
  }

  update(dt, input) {
    this.events.length = 0;
    if (this.over) return;
    this.time += dt;

    // Difficulty ramp
    const newLevel = 1 + Math.floor(this.time / CONFIG.levelSeconds);
    if (newLevel > this.level) { this.level = newLevel; this.events.push('level'); }

    // Player walks freely; the camera follows so the player stays centred.
    const p = this.player, ax = input.axis();
    p.x += ax.x * p.speed * dt;
    p.y += ax.y * p.speed * dt;
    if (ax.x) p.face = Math.sign(ax.x);
    p.moving = ax.x || ax.y;
    this.cam.x = p.x;
    this.cam.y = p.y;

    this.score += CONFIG.survivalPointsPerSecond * dt;

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.multiplier = 1;
    }
    if (this.invuln > 0) this.invuln -= dt;

    // Spawning: faster and in bigger groups as the level rises
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.enemies.length < 250) {
      const n = 1 + Math.floor(this.level / 3);
      for (let i = 0; i < n; i++) this.spawnEnemy();
      this.spawnTimer = Math.max(0.2, 1.1 - this.level * 0.08);
    }

    // Enemies always chase the player, and push apart so they don't stack.
    const es = this.enemies;
    for (const e of es) {
      const dx = p.x - e.x, dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      e.x += (dx / d) * e.speed * dt;
      e.y += (dy / d) * e.speed * dt;
      e.wobble += dt * 10;
      e.face = dx < 0 ? -1 : 1;
    }
    for (let i = 0; i < es.length; i++) {
      for (let j = i + 1; j < es.length; j++) {
        const a = es[i], b = es[j];
        const dx = b.x - a.x, dy = b.y - a.y, min = a.r + b.r;
        if (Math.abs(dx) > min || Math.abs(dy) > min) continue;
        const d = Math.hypot(dx, dy) || 0.01;
        if (d < min) {
          const push = (min - d) / 2, nx = dx / d, ny = dy / d;
          a.x -= nx * push; a.y -= ny * push;
          b.x += nx * push; b.y += ny * push;
        }
      }
    }
    // Recycle enemies the player has left far behind (respawn them ahead).
    for (const e of es) {
      if (Math.hypot(e.x - p.x, e.y - p.y) > DESPAWN_RADIUS) Object.assign(e, this.around(SPAWN_RADIUS));
    }

    // Contact damage
    if (this.invuln <= 0) {
      const hit = es.find((e) => Math.hypot(e.x - p.x, e.y - p.y) < e.r + p.r);
      if (hit) {
        es.splice(es.indexOf(hit), 1);
        this.lives--;
        this.multiplier = 1;
        this.comboTimer = 0;
        this.invuln = CONFIG.invulnSeconds;
        this.burst(p.x, p.y, '#ff4d6d', 24);
        this.events.push('hit');
        if (this.lives <= 0) { this.over = true; this.events.push('over'); }
      }
    }

    // Pickups (scattered around the world near the player)
    for (const k of this.pickups) k.t += dt;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const k = this.pickups[i];
      const d = Math.hypot(k.x - p.x, k.y - p.y);
      if (d < k.r + p.r) {
        const pts = CONFIG.pickupPoints * this.multiplier;
        this.score += pts;
        this.floaters.push({ x: k.x, y: k.y, text: `+${pts}`, life: 0.8 });
        this.multiplier = Math.min(CONFIG.maxMultiplier, this.multiplier + 1);
        this.comboTimer = CONFIG.comboWindow;
        this.burst(k.x, k.y, '#ffd166');
        this.pickups.splice(i, 1);
        this.spawnPickup();
        this.events.push('pickup');
      } else if (d > DESPAWN_RADIUS) {
        this.pickups.splice(i, 1);
        this.spawnPickup();
      }
    }

    // Effects
    for (const q of this.particles) { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.94; q.vy *= 0.94; q.life -= dt; }
    this.particles = this.particles.filter((q) => q.life > 0);
    for (const f of this.floaters) { f.y -= 40 * dt; f.life -= dt; }
    this.floaters = this.floaters.filter((f) => f.life > 0);
  }

  drawGround(ctx) {
    const x0 = Math.floor((this.cam.x - W / 2) / TILE), x1 = Math.ceil((this.cam.x + W / 2) / TILE);
    const y0 = Math.floor((this.cam.y - H / 2) / TILE), y1 = Math.ceil((this.cam.y + H / 2) / TILE);
    ctx.fillStyle = '#16182a';
    ctx.fillRect(this.cam.x - W / 2, this.cam.y - H / 2, W, H);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const h = hash(tx, ty), wx = tx * TILE, wy = ty * TILE;
        if (h < 0.25) { ctx.fillStyle = '#1a1d33'; ctx.fillRect(wx, wy, TILE, TILE); }
        if (h > 0.8) {          // grass tuft
          ctx.fillStyle = '#25304a';
          const gx = wx + hash(tx + 7, ty) * TILE, gy = wy + hash(tx, ty + 7) * TILE;
          ctx.fillRect(gx, gy, 2, 6); ctx.fillRect(gx + 4, gy + 1, 2, 5); ctx.fillRect(gx - 4, gy + 2, 2, 4);
        } else if (h > 0.74) {  // pebble
          ctx.fillStyle = '#2a2c44';
          ctx.beginPath();
          ctx.arc(wx + hash(tx + 3, ty) * TILE, wy + hash(tx, ty + 3) * TILE, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  draw(ctx) {
    ctx.save();
    // World space: the camera (player) sits at the centre of the screen.
    ctx.translate(Math.round(W / 2 - this.cam.x), Math.round(H / 2 - this.cam.y));
    this.drawGround(ctx);

    // Pickups
    for (const k of this.pickups) {
      const pulse = 1 + Math.sin(k.t * 6) * 0.15;
      ctx.fillStyle = '#ffd166';
      ctx.beginPath(); ctx.arc(k.x, k.y, k.r * pulse, 0, Math.PI * 2); ctx.fill();
    }

    // Enemies (bobbing blobs with eyes looking at the player)
    for (const e of this.enemies) {
      const bob = Math.sin(e.wobble) * 1.5;
      ctx.fillStyle = '#ff4d6d';
      ctx.beginPath(); ctx.arc(e.x, e.y + bob, e.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2b0a14';
      ctx.fillRect(e.x + e.face * e.r * 0.3 - 2, e.y + bob - e.r * 0.3, 3, 3);
      ctx.fillRect(e.x + e.face * e.r * 0.65 - 2, e.y + bob - e.r * 0.3, 3, 3);
    }

    // Player (blinks while invulnerable, bobs while walking)
    const p = this.player;
    if (!(this.invuln > 0 && Math.floor(this.invuln * 12) % 2)) {
      const bob = p.moving ? Math.abs(Math.sin(this.time * 14)) * -3 : 0;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(p.x, p.y + p.r, p.r, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4cc9f0';
      ctx.fillRect(p.x - p.r, p.y - p.r + bob, p.r * 2, p.r * 2);
      ctx.fillStyle = '#0b2533';
      ctx.fillRect(p.x + p.face * 5 - 2, p.y - 5 + bob, 3, 4);
    }

    // Particles
    for (const q of this.particles) {
      ctx.globalAlpha = Math.max(0, q.life * 1.5);
      ctx.fillStyle = q.color;
      ctx.fillRect(q.x - 2, q.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;

    // Floating score text
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    for (const f of this.floaters) {
      ctx.globalAlpha = Math.min(1, f.life * 2);
      ctx.fillStyle = '#fff';
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}
