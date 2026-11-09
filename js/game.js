// Survivors-like gameplay: the vampire moves, powers attack automatically,
// hunters drop blood (XP), level-ups offer a choice of 3 upgrades.
// main.js only relies on:
//   new Game(aircraft), game.update(dt, input), game.draw(ctx), game.drawUi(ctx),
//   game.score, game.level, game.time, game.kills, game.multiplier, game.streakTimer,
//   game.over, game.choosing, game.events
// `events` are strings the shell reacts to: 'pickup', 'kill', 'hit', 'levelup', 'choose', 'over'.
import { CONFIG as C } from './config.js';

const W = C.width, H = C.height;
const rand = (a, b) => a + Math.random() * (b - a);
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

// Camera: the world is endless and the vampire always stays in the centre of
// the screen. Hunters spawn just outside the view, in every direction.
const SPAWN_RADIUS = Math.hypot(W, H) / 2 + 40;
const DESPAWN_RADIUS = SPAWN_RADIUS * 1.8;   // hunters left this far behind respawn ahead
const TILE = 64;                              // ground decoration grid

// Deterministic per-tile noise so ground decoration stays put as you walk.
function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ---------- Hunter types ----------
const ENEMIES = {
  villager: { r: 10, hp: 10, speed: 60, dps: 12, xp: 1, color: '#d98b3a', from: 0 },
  hunter:   { r: 8,  hp: 8,  speed: 115, dps: 10, xp: 1, color: '#9fb4c7', from: 45 },
  priest:   { r: 16, hp: 70, speed: 40, dps: 25, xp: 5, color: '#f2efe6', from: 100 },
};

// ---------- Upgrades ----------
// Each upgrade has a max level; `apply` runs when picked.
const UPGRADES = {
  bolt:   { name: 'Blood Bolt', max: 8, desc: (l) => l === 0 ? 'Shoot the nearest hunter' : 'Faster, harder, more bolts' },
  bats:   { name: 'Missile Swarm', max: 6, desc: (l) => l === 0 ? 'A missile circles you, hitting hunters' : '+1 missile, faster orbit' },
  aura:   { name: 'Mist Aura',  max: 5, desc: (l) => l === 0 ? 'Damage hunters close to you' : 'Bigger, stronger mist' },
  might:  { name: 'Bloodlust',  max: 5, desc: () => '+20% damage' },
  speed:  { name: 'Shadow Step', max: 5, desc: () => '+10% move speed' },
  vigor:  { name: 'Old Blood',  max: 5, desc: () => '+25 max health, heal 25' },
  magnet: { name: 'Thirst',     max: 4, desc: () => '+40% blood pickup range' },
};

// Draw an aircraft at the origin pointing along +x (callers translate/rotate).
function drawJet(ctx, a, burner = 0) {
  ctx.save();
  ctx.scale(a.size, a.size);
  if (burner) {
    ctx.fillStyle = '#ffb703';
    ctx.beginPath(); ctx.moveTo(-12, -3); ctx.lineTo(-12 - burner, 0); ctx.lineTo(-12, 3); ctx.fill();
  }
  ctx.fillStyle = a.wing;
  if (a.id === 'interceptor') {        // slim delta wing
    ctx.beginPath(); ctx.moveTo(8, -2); ctx.lineTo(-10, -12); ctx.lineTo(-11, -2);
    ctx.lineTo(-11, 2); ctx.lineTo(-10, 12); ctx.lineTo(8, 2); ctx.fill();
  } else if (a.id === 'gunship') {     // broad straight wings, twin engines
    ctx.fillRect(-4, -17, 9, 34);
    ctx.fillRect(-13, -8, 4, 16);
    ctx.fillStyle = '#3a3226';
    ctx.fillRect(-2, -12, 7, 3); ctx.fillRect(-2, 9, 7, 3);
    ctx.fillStyle = a.wing;
  } else {                             // swept wings
    ctx.beginPath(); ctx.moveTo(4, -2); ctx.lineTo(-6, -15); ctx.lineTo(-9, -15); ctx.lineTo(-5, -2);
    ctx.lineTo(-5, 2); ctx.lineTo(-9, 15); ctx.lineTo(-6, 15); ctx.lineTo(4, 2); ctx.fill();
  }
  // Tail fins
  ctx.beginPath(); ctx.moveTo(-8, -2); ctx.lineTo(-13, -7); ctx.lineTo(-12, -2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-8, 2); ctx.lineTo(-13, 7); ctx.lineTo(-12, 2); ctx.fill();
  // Fuselage
  ctx.fillStyle = a.body;
  const nose = a.id === 'interceptor' ? 19 : 16, w = a.id === 'gunship' ? 4.5 : 3.5;
  ctx.beginPath(); ctx.moveTo(nose, 0); ctx.lineTo(6, -w); ctx.lineTo(-12, -3); ctx.lineTo(-12, 3); ctx.lineTo(6, w); ctx.closePath(); ctx.fill();
  // Cockpit
  ctx.fillStyle = '#4cc9f0';
  ctx.beginPath(); ctx.ellipse(5, 0, 4, 1.8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export class Game {
  constructor(aircraft = C.aircraft[1]) {
    this.aircraft = aircraft;
    const maxHp = Math.round(C.playerMaxHp * aircraft.health);
    this.player = { x: 0, y: 0, r: 11 * aircraft.size, hp: maxHp, maxHp, face: 1, heading: -Math.PI / 2 };
    this.lv = { bolt: 1, bats: 0, aura: 0, might: 0, speed: 0, vigor: 0, magnet: 0 };
    this.enemies = [];
    this.bolts = [];
    this.gems = [];
    this.particles = [];
    this.floaters = [];
    this.score = 0;
    this.time = 0;
    this.kills = 0;
    this.level = 1;
    this.xp = 0;
    this.streak = 0;
    this.multiplier = 1;
    this.streakTimer = 0;
    this.spawnAcc = 0;
    this.boltTimer = 0.5;
    this.batAngle = 0;
    this.hurtCd = 0;
    this.pendingLevels = 0;
    this.choosing = null;     // array of upgrade keys while picking
    this.choiceIndex = 0;
    this.over = false;
    this.events = [];
  }

  get xpToNext() { return C.xpBase + (this.level - 1) * C.xpPerLevel; }
  get might() { return this.aircraft.damage * (1 + this.lv.might * 0.2); }

  // ---------- Update ----------
  update(dt, input) {
    this.events.length = 0;
    if (this.over) return;
    if (this.choosing) { this.updateChoice(input); return; }

    this.time += dt;
    this.score += C.survivalPointsPerSecond * dt;
    this.movePlayer(dt, input);
    this.spawn(dt);
    this.moveEnemies(dt);
    this.weapons(dt);
    this.collectGems(dt);
    this.updateEffects(dt);

    if (this.streakTimer > 0) {
      this.streakTimer -= dt;
      if (this.streakTimer <= 0) { this.streak = 0; this.multiplier = 1; }
    }

    if (this.player.hp <= 0) {
      this.player.hp = 0;
      this.over = true;
      this.burst(this.player.x, this.player.y, '#c1121f', 40);
      this.events.push('over');
    } else if (this.pendingLevels > 0) {
      this.openChoice();
    }
  }

  movePlayer(dt, input) {
    const p = this.player, ax = input.axis();
    const speed = C.playerSpeed * this.aircraft.speed * (1 + this.lv.speed * 0.1);
    if (ax.x) p.face = Math.sign(ax.x);
    if (ax.x || ax.y) {
      // Turn the jet smoothly towards the direction of travel.
      let d = Math.atan2(ax.y, ax.x) - p.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      p.heading += d * Math.min(1, dt * 12);
    }
    p.x += ax.x * speed * dt;
    p.y += ax.y * speed * dt;
    p.moving = !!(ax.x || ax.y);
    if (this.hurtCd > 0) this.hurtCd -= dt;
  }

  spawn(dt) {
    this.spawnAcc += (C.spawnBase + this.time / C.spawnRamp) * dt;
    const types = Object.entries(ENEMIES).filter(([, t]) => this.time >= t.from);
    const hpScale = 1 + this.time / C.hpScaleSeconds;
    while (this.spawnAcc >= 1) {
      this.spawnAcc--;
      if (this.enemies.length >= C.maxEnemies) continue;
      // Weighted pick: later types are rarer.
      const [kind, t] = types[Math.random() < 0.6 ? 0 : Math.floor(Math.random() * types.length)];
      const { x, y } = this.around(SPAWN_RADIUS + rand(0, 60));
      this.enemies.push({ kind, x, y, r: t.r, hp: t.hp * hpScale, maxHp: t.hp * hpScale,
        speed: t.speed * rand(0.85, 1.15), dps: t.dps, xp: t.xp, color: t.color, flash: 0, batCd: 0 });
    }
  }

  // Random point on a ring of radius d around the player.
  around(d) {
    const a = rand(0, Math.PI * 2), p = this.player;
    return { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d };
  }

  moveEnemies(dt) {
    const p = this.player;
    for (const e of this.enemies) {
      let dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
      if (d > DESPAWN_RADIUS) {   // outran it: bring it back from just off-screen
        Object.assign(e, this.around(SPAWN_RADIUS));
        dx = p.x - e.x; dy = p.y - e.y; d = Math.hypot(dx, dy);
      }
      e.x += (dx / d) * e.speed * dt;
      e.y += (dy / d) * e.speed * dt;
      if (e.flash > 0) e.flash -= dt;
      if (e.batCd > 0) e.batCd -= dt;
      // Contact damage
      if (d < e.r + p.r) {
        p.hp -= e.dps * dt;
        if (this.hurtCd <= 0) { this.hurtCd = 0.4; this.events.push('hit'); }
      }
    }
    // Light separation so hunters don't stack into one blob (only neighbours in the list, cheap).
    const es = this.enemies;
    for (let i = 0; i < es.length; i++) {
      for (let j = i + 1; j < Math.min(es.length, i + 12); j++) {
        const a = es[i], b = es[j];
        const dx = b.x - a.x, dy = b.y - a.y, min = a.r + b.r, d2 = dx * dx + dy * dy;
        if (d2 > 0 && d2 < min * min) {
          const d = Math.sqrt(d2), push = (min - d) / 2;
          a.x -= (dx / d) * push; a.y -= (dy / d) * push;
          b.x += (dx / d) * push; b.y += (dy / d) * push;
        }
      }
    }
  }

  damage(e, amount) {
    e.hp -= amount;
    e.flash = 0.08;
    if (e.hp <= 0 && !e.dead) {
      e.dead = true;
      this.kills++;
      this.streak++;
      this.streakTimer = C.streakWindow;
      this.multiplier = Math.min(C.maxMultiplier, 1 + Math.floor(this.streak / C.killsPerMultiplier));
      const pts = C.killPoints * e.xp * this.multiplier;
      this.score += pts;
      if (e.xp > 1 || this.multiplier > 1) this.floaters.push({ x: e.x, y: e.y - 10, text: `+${pts}`, life: 0.7 });
      this.gems.push({ x: e.x, y: e.y, v: e.xp, big: e.xp > 1 });
      this.burst(e.x, e.y, '#c1121f', 6);
      this.events.push('kill');
    }
  }

  weapons(dt) {
    const p = this.player, m = this.might;

    // Blood Bolt: fire at the nearest hunters.
    if (this.lv.bolt > 0) {
      this.boltTimer -= dt;
      if (this.boltTimer <= 0 && this.enemies.length) {
        const l = this.lv.bolt;
        this.boltTimer = 0.65 * Math.pow(0.88, l - 1);
        const count = 1 + Math.floor(l / 3);
        const targets = [...this.enemies].sort((a, b) => dist2(a, p) - dist2(b, p)).slice(0, count);
        for (const t of targets) {
          const a = Math.atan2(t.y - p.y, t.x - p.x);
          this.bolts.push({ x: p.x, y: p.y, vx: Math.cos(a) * 480, vy: Math.sin(a) * 480,
            dmg: 10 * m * (1 + 0.25 * (l - 1)), pierce: l >= 6 ? 2 : 0, life: 1.5 });
        }
      }
    }
    for (const b of this.bolts) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      for (const e of this.enemies) {
        if (e.dead || b.life <= 0) continue;
        if (dist2(b, e) < (e.r + 4) ** 2) {
          this.damage(e, b.dmg);
          if (b.pierce-- <= 0) b.life = 0;
        }
      }
    }
    this.bolts = this.bolts.filter((b) => b.life > 0 && dist2(b, p) < SPAWN_RADIUS ** 2);

    // Bat Swarm: bats orbit the player.
    this.batAngle += dt * (2.5 + this.lv.bats * 0.3);
    for (const bat of this.batPositions()) {
      for (const e of this.enemies) {
        if (!e.dead && e.batCd <= 0 && dist2(bat, e) < (e.r + 9) ** 2) {
          this.damage(e, 8 * m);
          e.batCd = 0.35;
        }
      }
    }

    // Mist Aura: steady damage around the player.
    if (this.lv.aura > 0) {
      const r = this.auraRadius(), dps = 6 * this.lv.aura * m;
      for (const e of this.enemies) if (!e.dead && dist2(e, p) < (r + e.r) ** 2) this.damage(e, dps * dt);
    }

    this.enemies = this.enemies.filter((e) => !e.dead);
  }

  batPositions() {
    const n = this.lv.bats, p = this.player, out = [];
    for (let i = 0; i < n; i++) {
      const a = this.batAngle + (i / n) * Math.PI * 2;
      out.push({ x: p.x + Math.cos(a) * 70, y: p.y + Math.sin(a) * 70, a: a + Math.PI / 2 });
    }
    return out;
  }

  auraRadius() { return 45 + this.lv.aura * 12; }

  collectGems(dt) {
    const p = this.player, range = C.magnetRange * (1 + this.lv.magnet * 0.4);
    for (const g of this.gems) {
      const dx = p.x - g.x, dy = p.y - g.y, d = Math.hypot(dx, dy);
      if (d < range) { const s = 420 * dt; g.x += (dx / d) * s; g.y += (dy / d) * s; }
      if (d < p.r + 6) {
        g.taken = true;
        this.xp += g.v;
        this.score += g.v;
        this.events.push('pickup');
        while (this.xp >= this.xpToNext) {
          this.xp -= this.xpToNext;
          this.level++;
          this.pendingLevels++;
        }
      }
    }
    // Drop blood left far behind so the list doesn't grow forever.
    this.gems = this.gems.filter((g) => !g.taken && dist2(g, p) < (DESPAWN_RADIUS * 2) ** 2);
  }

  // ---------- Level-up choice ----------
  openChoice() {
    const pool = Object.keys(UPGRADES).filter((k) => this.lv[k] < UPGRADES[k].max);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    this.choosing = pool.slice(0, 3);
    if (!this.choosing.length) this.choosing = ['feast'];
    this.choiceIndex = 0;
    this.pendingLevels--;
    this.events.push('levelup');
  }

  updateChoice(input) {
    const n = this.choosing.length;
    if (input.wasPressed('ArrowLeft', 'KeyA', 'ArrowUp', 'KeyW')) this.choiceIndex = (this.choiceIndex + n - 1) % n;
    if (input.wasPressed('ArrowRight', 'KeyD', 'ArrowDown', 'KeyS')) this.choiceIndex = (this.choiceIndex + 1) % n;
    let pick = -1;
    ['Digit1', 'Digit2', 'Digit3'].forEach((k, i) => { if (i < n && input.wasPressed(k, 'Numpad' + (i + 1))) pick = i; });
    if (input.wasPressed('Enter', 'Space', 'NumpadEnter')) pick = this.choiceIndex;
    if (pick < 0) return;

    const key = this.choosing[pick];
    if (key === 'feast') { this.player.hp = Math.min(this.player.maxHp, this.player.hp + 30); this.score += 500; }
    else {
      this.lv[key]++;
      if (key === 'vigor') { this.player.maxHp += 25; this.player.hp = Math.min(this.player.maxHp, this.player.hp + 25); }
    }
    this.choosing = null;
    this.events.push('choose');
  }

  // ---------- Effects ----------
  burst(x, y, color, n = 12) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), s = rand(40, 220);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.2, 0.6), color });
    }
  }

  updateEffects(dt) {
    for (const q of this.particles) { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.92; q.vy *= 0.92; q.life -= dt; }
    if (this.particles.length > 600) this.particles.splice(0, this.particles.length - 600);
    this.particles = this.particles.filter((q) => q.life > 0);
    for (const f of this.floaters) { f.y -= 40 * dt; f.life -= dt; }
    this.floaters = this.floaters.filter((f) => f.life > 0);
  }

  // ---------- Drawing ----------
  // Scrolling ground: grass tufts, stones and graves fixed in the world.
  drawGround(ctx) {
    const p = this.player;
    const x0 = Math.floor((p.x - W / 2) / TILE), x1 = Math.floor((p.x + W / 2) / TILE);
    const y0 = Math.floor((p.y - H / 2) / TILE), y1 = Math.floor((p.y + H / 2) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const h = hash(tx, ty);
        if (h < 0.55) continue;
        const x = tx * TILE + hash(tx + 7, ty) * TILE, y = ty * TILE + hash(tx, ty + 7) * TILE;
        if (h < 0.8) {            // speckles
          ctx.fillStyle = 'rgba(255,255,255,0.04)';
          ctx.fillRect(x, y, 2, 2); ctx.fillRect(x + 9, y + 5, 2, 2);
        } else if (h < 0.93) {    // grass tuft
          ctx.fillStyle = 'rgba(120,90,160,0.18)';
          ctx.fillRect(x, y, 2, 6); ctx.fillRect(x + 4, y + 1, 2, 5); ctx.fillRect(x - 4, y + 2, 2, 4);
        } else if (h < 0.98) {    // stone
          ctx.fillStyle = 'rgba(150,130,170,0.14)';
          ctx.beginPath(); ctx.ellipse(x, y, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
        } else {                  // gravestone
          ctx.fillStyle = 'rgba(150,130,170,0.2)';
          ctx.beginPath(); ctx.arc(x, y - 8, 8, Math.PI, 0); ctx.fill();
          ctx.fillRect(x - 8, y - 8, 16, 16);
        }
      }
    }
  }

  draw(ctx) {
    const p = this.player;
    ctx.save();
    // World space: the camera is centred on the vampire.
    ctx.translate(Math.round(W / 2 - p.x), Math.round(H / 2 - p.y));
    this.drawGround(ctx);
    // Mist aura
    if (this.lv.aura > 0) {
      ctx.fillStyle = 'rgba(180,160,220,0.12)';
      ctx.beginPath(); ctx.arc(p.x, p.y, this.auraRadius(), 0, Math.PI * 2); ctx.fill();
    }
    // Blood drops
    for (const g of this.gems) {
      ctx.fillStyle = g.big ? '#ff4d6d' : '#c1121f';
      const s = g.big ? 6 : 4;
      ctx.beginPath(); ctx.moveTo(g.x, g.y - s * 1.6); ctx.lineTo(g.x + s, g.y); ctx.arc(g.x, g.y, s, 0, Math.PI); ctx.lineTo(g.x - s, g.y); ctx.fill();
    }
    // Hunters
    for (const e of this.enemies) {
      ctx.fillStyle = e.flash > 0 ? '#fff' : e.color;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
      if (e.kind === 'villager') { ctx.fillStyle = '#ffb703'; ctx.fillRect(e.x + e.r - 2, e.y - e.r - 6, 4, 6); } // torch
      if (e.kind === 'priest') { ctx.fillStyle = '#7a1c1c'; ctx.fillRect(e.x - 1.5, e.y - 8, 3, 16); ctx.fillRect(e.x - 6, e.y - 4, 12, 3); } // cross
    }
    // Bolts
    ctx.fillStyle = '#ff4d6d';
    for (const b of this.bolts) { ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, Math.PI * 2); ctx.fill(); }
    // Missiles (Missile Swarm), nose pointing along the orbit
    for (const m of this.batPositions()) {
      ctx.save();
      ctx.translate(m.x, m.y); ctx.rotate(m.a);
      // Exhaust flame
      const flick = 4 + Math.sin(this.time * 40 + m.a) * 2;
      ctx.fillStyle = '#ffb703';
      ctx.beginPath(); ctx.moveTo(-7, -2); ctx.lineTo(-7 - flick, 0); ctx.lineTo(-7, 2); ctx.fill();
      // Fins
      ctx.fillStyle = '#c1121f';
      ctx.beginPath(); ctx.moveTo(-7, -2); ctx.lineTo(-9, -5); ctx.lineTo(-4, -2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-7, 2); ctx.lineTo(-9, 5); ctx.lineTo(-4, 2); ctx.fill();
      // Body and nose
      ctx.fillStyle = '#d8d8e4';
      ctx.fillRect(-7, -2, 11, 4);
      ctx.fillStyle = '#c1121f';
      ctx.beginPath(); ctx.moveTo(4, -2); ctx.lineTo(9, 0); ctx.lineTo(4, 2); ctx.fill();
      ctx.restore();
    }
    // Fighter jet, pointing where it flies
    if (!(this.hurtCd > 0.2 && Math.floor(this.hurtCd * 30) % 2)) {
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.heading);
      drawJet(ctx, this.aircraft, p.moving ? 6 + Math.sin(this.time * 50) * 2 : 0);
      ctx.restore();
    }
    // Particles
    for (const q of this.particles) {
      ctx.globalAlpha = Math.max(0, q.life * 2);
      ctx.fillStyle = q.color;
      ctx.fillRect(q.x - 2, q.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    for (const f of this.floaters) {
      ctx.globalAlpha = Math.min(1, f.life * 2);
      ctx.fillStyle = '#ffd6de';
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // Bars and the level-up picker, drawn above the HUD.
  drawUi(ctx) {
    const p = this.player;
    // XP bar along the bottom
    ctx.fillStyle = '#2a1a33'; ctx.fillRect(0, H - 8, W, 8);
    ctx.fillStyle = '#c1121f'; ctx.fillRect(0, H - 8, W * (this.xp / this.xpToNext), 8);
    // Health bar under the vampire (always at the screen centre)
    const cx = W / 2, cy = H / 2;
    ctx.fillStyle = '#000'; const by = cy + Math.round(17 * this.aircraft.size);
    ctx.fillRect(cx - 16, by, 32, 4);
    ctx.fillStyle = p.hp / p.maxHp > 0.3 ? '#7ae582' : '#ff4d6d';
    ctx.fillRect(cx - 16, by, 32 * (p.hp / p.maxHp), 4);

    if (!this.choosing) return;
    ctx.fillStyle = 'rgba(8,4,14,0.75)'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ff4d6d'; ctx.font = 'bold 34px monospace';
    ctx.fillText(`LEVEL ${this.level - this.pendingLevels}!`, W / 2, 120);
    ctx.fillStyle = '#b8a9c9'; ctx.font = 'bold 14px monospace';
    ctx.fillText('Choose a power:  1 / 2 / 3   or   ← → and ENTER', W / 2, 160);
    const n = this.choosing.length, cw = 240, gap = 24, x0 = W / 2 - (n * cw + (n - 1) * gap) / 2;
    this.choosing.forEach((key, i) => {
      const x = x0 + i * (cw + gap), y = 200, sel = i === this.choiceIndex;
      ctx.fillStyle = sel ? '#3a1530' : '#1c1226'; ctx.fillRect(x, y, cw, 170);
      ctx.strokeStyle = sel ? '#ff4d6d' : '#4a3a5a'; ctx.lineWidth = sel ? 3 : 1.5; ctx.strokeRect(x, y, cw, 170);
      const u = UPGRADES[key], l = this.lv[key] ?? 0;
      ctx.fillStyle = '#8a7a9a'; ctx.font = 'bold 14px monospace'; ctx.fillText(`[${i + 1}]`, x + cw / 2, y + 24);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 20px monospace';
      ctx.fillText(u ? u.name : 'Feast', x + cw / 2, y + 62);
      ctx.fillStyle = '#ffd6de'; ctx.font = '14px monospace';
      ctx.fillText(u ? (l === 0 ? 'NEW' : `Lv ${l} → ${l + 1}`) : 'All powers maxed', x + cw / 2, y + 92);
      ctx.fillStyle = '#b8a9c9'; ctx.font = '13px monospace';
      ctx.fillText(u ? u.desc(l) : 'Heal 30, +500 points', x + cw / 2, y + 125);
    });
  }
}

// main.js uses this to preview aircraft on the selection screen.
Game.drawJet = drawJet;
