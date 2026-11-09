// PLACEHOLDER GAMEPLAY. Theme and systems are TBD (see design/game.md).
// Swap the contents of this file for the real game; main.js only relies on:
//   new Game(), game.update(dt, input), game.draw(ctx),
//   game.score, game.level, game.lives, game.multiplier, game.over, game.events
// `events` is a list of strings the shell reacts to (sounds, shake): 'pickup', 'hit', 'level', 'over'.
import { CONFIG } from './config.js';

const W = CONFIG.width, H = CONFIG.height;
const rand = (a, b) => a + Math.random() * (b - a);

export class Game {
  constructor() {
    this.player = { x: W / 2, y: H / 2, r: 12, speed: 280 };
    this.hazards = [];
    this.pickups = [];
    this.particles = [];
    this.score = 0;
    this.lives = CONFIG.startLives;
    this.level = 1;
    this.time = 0;
    this.multiplier = 1;
    this.comboTimer = 0;
    this.invuln = 0;
    this.spawnTimer = 0;
    this.over = false;
    this.events = [];
    this.floaters = []; // floating score text
    for (let i = 0; i < 3; i++) this.spawnPickup();
  }

  spawnPickup() {
    this.pickups.push({ x: rand(40, W - 40), y: rand(60, H - 40), r: 8, t: 0 });
  }

  spawnHazard() {
    // Enter from a random edge, aimed roughly at the player.
    const side = Math.floor(Math.random() * 4);
    const x = side === 0 ? -20 : side === 1 ? W + 20 : rand(0, W);
    const y = side === 2 ? -20 : side === 3 ? H + 20 : rand(0, H);
    const ang = Math.atan2(this.player.y - y, this.player.x - x) + rand(-0.4, 0.4);
    const speed = rand(120, 180) + this.level * 20;
    this.hazards.push({ x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r: rand(8, 16) });
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

    // Player movement
    const p = this.player, ax = input.axis();
    p.x = Math.max(p.r, Math.min(W - p.r, p.x + ax.x * p.speed * dt));
    p.y = Math.max(p.r, Math.min(H - p.r, p.y + ax.y * p.speed * dt));

    // Survival points
    this.score += CONFIG.survivalPointsPerSecond * dt;

    // Combo decay
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.multiplier = 1;
    }
    if (this.invuln > 0) this.invuln -= dt;

    // Spawning: faster with level
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnHazard();
      this.spawnTimer = Math.max(0.15, 0.9 - this.level * 0.08);
    }

    // Hazards
    for (const h of this.hazards) { h.x += h.vx * dt; h.y += h.vy * dt; }
    this.hazards = this.hazards.filter((h) => h.x > -60 && h.x < W + 60 && h.y > -60 && h.y < H + 60);
    if (this.invuln <= 0) {
      const hit = this.hazards.find((h) => Math.hypot(h.x - p.x, h.y - p.y) < h.r + p.r);
      if (hit) {
        this.hazards.splice(this.hazards.indexOf(hit), 1);
        this.lives--;
        this.multiplier = 1;
        this.comboTimer = 0;
        this.invuln = CONFIG.invulnSeconds;
        this.burst(p.x, p.y, '#ff4d6d', 24);
        this.events.push('hit');
        if (this.lives <= 0) { this.over = true; this.events.push('over'); }
      }
    }

    // Pickups
    for (const k of this.pickups) k.t += dt;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const k = this.pickups[i];
      if (Math.hypot(k.x - p.x, k.y - p.y) < k.r + p.r) {
        const pts = CONFIG.pickupPoints * this.multiplier;
        this.score += pts;
        this.floaters.push({ x: k.x, y: k.y, text: `+${pts}`, life: 0.8 });
        this.multiplier = Math.min(CONFIG.maxMultiplier, this.multiplier + 1);
        this.comboTimer = CONFIG.comboWindow;
        this.burst(k.x, k.y, '#ffd166');
        this.pickups.splice(i, 1);
        this.spawnPickup();
        this.events.push('pickup');
      }
    }

    // Effects
    for (const q of this.particles) { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.94; q.vy *= 0.94; q.life -= dt; }
    this.particles = this.particles.filter((q) => q.life > 0);
    for (const f of this.floaters) { f.y -= 40 * dt; f.life -= dt; }
    this.floaters = this.floaters.filter((f) => f.life > 0);
  }

  draw(ctx) {
    // Pickups
    for (const k of this.pickups) {
      const pulse = 1 + Math.sin(k.t * 6) * 0.15;
      ctx.fillStyle = '#ffd166';
      ctx.beginPath(); ctx.arc(k.x, k.y, k.r * pulse, 0, Math.PI * 2); ctx.fill();
    }
    // Hazards
    ctx.fillStyle = '#ff4d6d';
    for (const h of this.hazards) { ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2); ctx.fill(); }
    // Player (blinks while invulnerable)
    const p = this.player;
    if (!(this.invuln > 0 && Math.floor(this.invuln * 12) % 2)) {
      ctx.fillStyle = '#4cc9f0';
      ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
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
  }
}
