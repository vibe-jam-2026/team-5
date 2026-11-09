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

// Foreground forest: a strip of pine silhouettes along the bottom of the
// screen. It scrolls sideways with the camera; anti-aircraft guns sit in it.
const FOREST_TOP = H - 78;                    // tallest trees reach about here
const AA_SLOT = 520;                          // at most one gun per this many px of world x
const AA_Y = H - 34;                          // screen y of a gun's turret
const AA_CHANCE = 0.65;                       // share of slots that hold a gun

// Deterministic per-tile noise so ground decoration stays put as you walk.
function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ---------- Enemy drone types ----------
// The first entry is the "basic" spawn (see basicShare* in config.js).
const ENEMIES = {
  quad:  { r: 10, hp: 10, speed: 60, dps: 12, xp: 1, color: '#d98b3a', from: 0 },   // quadcopter swarm drone
  dart:  { r: 8,  hp: 8,  speed: 115, dps: 10, xp: 1, color: '#9fb4c7', from: 30 }, // fast fixed-wing kamikaze drone
  heavy: { r: 16, hp: 70, speed: 40, dps: 25, xp: 5, color: '#8a8f6a', from: 80 },  // armoured hexacopter
};

// Draw a drone at the origin facing +x (callers translate/rotate).
function drawDrone(ctx, e, t) {
  const r = e.r, body = e.flash > 0 ? '#fff' : e.color;
  const blink = Math.floor(t * 4 + e.seed * 4) % 2 === 0;
  if (e.kind === 'dart') {
    // Delta-wing kamikaze drone with a pusher prop
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.moveTo(r * 1.5, 0); ctx.lineTo(-r, -r * 1.2); ctx.lineTo(-r * 0.6, 0); ctx.lineTo(-r, r * 1.2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3a3f4b';
    ctx.fillRect(-r * 0.8, -1.5, r * 1.9, 3);
    ctx.strokeStyle = 'rgba(220,220,230,0.6)'; ctx.lineWidth = 1.5;
    const s = Math.sin(t * 60 + e.seed * 9) * r * 0.7;
    ctx.beginPath(); ctx.moveTo(-r * 0.9, -s); ctx.lineTo(-r * 0.9, s); ctx.stroke();
    ctx.fillStyle = '#e63946';
    ctx.beginPath(); ctx.arc(r * 1.1, 0, 1.8, 0, Math.PI * 2); ctx.fill();
    return;
  }
  // Multirotors: quad = 4 arms, heavy = 6 arms
  const arms = e.kind === 'heavy' ? 6 : 4, reach = r * 1.15, rotor = r * (arms === 6 ? 0.45 : 0.55);
  ctx.strokeStyle = '#3a3f4b'; ctx.lineWidth = arms === 6 ? 3 : 2;
  for (let i = 0; i < arms; i++) {
    const a = (i + 0.5) / arms * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * reach, Math.sin(a) * reach); ctx.stroke();
  }
  // Spinning rotor discs
  for (let i = 0; i < arms; i++) {
    const a = (i + 0.5) / arms * Math.PI * 2, x = Math.cos(a) * reach, y = Math.sin(a) * reach;
    ctx.fillStyle = 'rgba(200,205,220,0.22)';
    ctx.beginPath(); ctx.arc(x, y, rotor, 0, Math.PI * 2); ctx.fill();
    const b = t * 40 * (i % 2 ? 1 : -1) + e.seed * 7;
    ctx.strokeStyle = 'rgba(230,230,240,0.7)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x - Math.cos(b) * rotor, y - Math.sin(b) * rotor); ctx.lineTo(x + Math.cos(b) * rotor, y + Math.sin(b) * rotor); ctx.stroke();
  }
  // Body
  ctx.fillStyle = body;
  if (arms === 6) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; ctx.lineTo(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6); }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#4a4f3a'; ctx.fillRect(-r * 0.15, -r * 0.45, r * 0.3, r * 0.9); // armour plate
  } else {
    ctx.fillRect(-r * 0.45, -r * 0.35, r * 0.9, r * 0.7);
  }
  // Gun barrel under the nose; glows red while charging a shot
  if (e.gun) {
    ctx.fillStyle = '#222'; ctx.fillRect(r * 0.3, -1.5, r * 0.9, 3);
    const tip = r * 1.25;
    if (e.gunCd < C.droneWarn) {
      const k = 1 - Math.max(0, e.gunCd) / C.droneWarn;
      ctx.fillStyle = `rgba(255,60,80,${(0.25 + 0.5 * k).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(tip, 0, 2 + k * 4, 0, Math.PI * 2); ctx.fill();
    }
    if (e.muzzle > 0) { ctx.fillStyle = '#fff1c1'; ctx.beginPath(); ctx.arc(tip, 0, 5, 0, Math.PI * 2); ctx.fill(); }
  }
  // Camera eye facing the player, and a blinking nav light
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(r * 0.35, 0, r * 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e63946'; ctx.beginPath(); ctx.arc(r * 0.35, 0, r * 0.09, 0, Math.PI * 2); ctx.fill();
  if (blink) { ctx.fillStyle = arms === 6 ? '#ffb703' : '#4cc9f0'; ctx.beginPath(); ctx.arc(-r * 0.4, 0, 1.6, 0, Math.PI * 2); ctx.fill(); }
}

// ---------- Upgrades ----------
// Each upgrade has a max level; `apply` runs when picked.
const UPGRADES = {
  bolt:   { name: 'Guns, Guns, Guns', max: 8, desc: (l) => l === 0 ? 'Cannon fire at nearest threat' : 'Faster, harder, more tracers' },
  bats:   { name: 'Fox Two',        max: 6, desc: (l) => l === 0 ? 'A Sidewinder circles you' : '+1 missile, faster orbit' },
  aura:   { name: 'Danger Zone',    max: 5, desc: (l) => l === 0 ? 'Shreds anything up close' : 'Bigger, deadlier zone' },
  might:  { name: 'Weapons Hot',    max: 5, desc: () => '+20% damage' },
  speed:  { name: 'Afterburner',    max: 5, desc: () => '+10% flight speed' },
  vigor:  { name: 'Wingman',        max: 5, desc: () => 'Got your six: +25 HP, heal 25' },
  magnet: { name: 'Radar Lock',     max: 4, desc: () => '+40% pickup range' },
};
// Shown when every upgrade is maxed.
const FLYBY = { name: 'Tower Flyby', desc: 'Heal 30, +500 points' };

// Fill a polygon and give it a crisp dark outline (mitred corners keep it sharp).
const OUTLINE = '#07040b';
function poly(ctx, pts, fill, lw = 1) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  ctx.lineJoin = 'miter'; ctx.lineWidth = lw; ctx.strokeStyle = OUTLINE; ctx.stroke();
}

// Draw an aircraft at the origin pointing along +x (callers translate/rotate).
function drawJet(ctx, a, burner = 0) {
  ctx.save();
  ctx.scale(a.size, a.size);
  const lw = 0.9 / a.size;
  if (burner) {   // two-tone afterburner cone
    poly(ctx, [-12, -3, -12 - burner * 1.3, 0, -12, 3], '#ffb703', 0);
    poly(ctx, [-12, -1.5, -12 - burner * 0.7, 0, -12, 1.5], '#fff1c1', 0);
  }
  if (a.id === 'interceptor') {        // slim delta wing
    poly(ctx, [9, -2, -10, -13, -12, -12, -11, -2, -11, 2, -12, 12, -10, 13, 9, 2], a.wing, lw);
  } else if (a.id === 'gunship') {     // broad straight wings with pointed tips, twin engines
    poly(ctx, [5, -3, 3, -18, -3, -18, -5, -3, -5, 3, -3, 18, 3, 18, 5, 3], a.wing, lw);
    poly(ctx, [-9, -3, -12, -9, -15, -9, -14, -3, -14, 3, -15, 9, -12, 9, -9, 3], a.wing, lw);
    poly(ctx, [6, -12.5, -3, -11, -3, -8.5, 6, -9.5], '#3a3226', lw);
    poly(ctx, [6, 12.5, -3, 11, -3, 8.5, 6, 9.5], '#3a3226', lw);
  } else {                             // swept wings
    poly(ctx, [5, -2, -6, -16, -10, -16, -5, -2, -5, 2, -10, 16, -6, 16, 5, 2], a.wing, lw);
  }
  // Tail fins
  poly(ctx, [-7, -2, -14, -8, -12, -2], a.wing, lw);
  poly(ctx, [-7, 2, -14, 8, -12, 2], a.wing, lw);
  // Fuselage with a needle nose
  const nose = a.id === 'interceptor' ? 21 : 18, w = a.id === 'gunship' ? 4.5 : 3.5;
  poly(ctx, [nose, 0, 6, -w, -12, -3, -12, 3, 6, w], a.body, lw);
  // Spine highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 0.6 / a.size;
  ctx.beginPath(); ctx.moveTo(nose - 2, 0); ctx.lineTo(-11, 0); ctx.stroke();
  // Angular canopy
  poly(ctx, [10, 0, 6, -1.8, 1, -1.5, 1, 1.5, 6, 1.8], '#4cc9f0', lw * 0.7);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillRect(5, -1, 3, 0.8);
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
    this.guns = new Map();    // anti-aircraft guns by forest slot
    this.shells = [];
    this.flak = [];           // flak bursts
    this.bullets = [];        // shots from armed drones
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
    this.droneGuns(dt);
    this.antiAircraft(dt);
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
    p.vx = ax.x * speed; p.vy = ax.y * speed;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.moving = !!(ax.x || ax.y);
    if (this.hurtCd > 0) this.hurtCd -= dt;
  }

  spawn(dt) {
    const T = this.time;
    this.spawnAcc += (C.spawnBase + T / C.spawnRamp + (T / C.spawnCurve) ** 2) * dt;
    const types = Object.entries(ENEMIES).filter(([, t]) => T >= t.from);
    const hpScale = 1 + T / C.hpScaleSeconds;
    const speedScale = Math.min(C.maxSpeedScale, 1 + T / C.speedScaleSeconds);
    const dpsScale = 1 + T / C.dpsScaleSeconds;
    // Plain quadcopters get rarer as the night goes on; tougher types take over.
    const basic = C.basicShareStart + (C.basicShareEnd - C.basicShareStart) * Math.min(1, T / C.basicShareSeconds);
    while (this.spawnAcc >= 1) {
      this.spawnAcc--;
      if (this.enemies.length >= C.maxEnemies) continue;
      const [kind, t] = types[Math.random() < basic ? 0 : Math.floor(Math.random() * types.length)];
      const { x, y } = this.around(SPAWN_RADIUS + rand(0, 60));
      const armed = kind === 'heavy' || (kind === 'quad' && T >= C.armedQuadFrom && Math.random() < C.armedQuadShare);
      const gun = armed ? C.droneGuns[kind] : null;
      this.enemies.push({ kind, x, y, r: t.r, hp: t.hp * hpScale, maxHp: t.hp * hpScale,
        speed: t.speed * speedScale * rand(0.85, 1.15), dps: t.dps * dpsScale, xp: t.xp, color: t.color, flash: 0, batCd: 0, seed: Math.random(),
        gun, gunCd: gun ? gun.interval * rand(0.6, 1.2) : 0, muzzle: 0 });
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
    const p = this.player, m = this.might, guns = this.liveGuns();

    // Guns, Guns, Guns: fire at the nearest hunters.
    if (this.lv.bolt > 0) {
      this.boltTimer -= dt;
      if (this.boltTimer <= 0 && (this.enemies.length || guns.length)) {
        const l = this.lv.bolt;
        this.boltTimer = 0.65 * Math.pow(0.88, l - 1);
        const count = 1 + Math.floor(l / 3);
        const targets = [...this.enemies, ...guns].sort((a, b) => dist2(a, p) - dist2(b, p)).slice(0, count);
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
      for (const g of guns) {
        if (b.life > 0 && dist2(b, g) < (g.r + 4) ** 2) {
          this.damageGun(g, b.dmg);
          if (b.pierce-- <= 0) b.life = 0;
        }
      }
    }
    this.bolts = this.bolts.filter((b) => b.life > 0 && dist2(b, p) < SPAWN_RADIUS ** 2);

    // Fox Two: missiles orbit the player.
    this.batAngle += dt * (2.5 + this.lv.bats * 0.3);
    for (const bat of this.batPositions()) {
      for (const e of this.enemies) {
        if (!e.dead && e.batCd <= 0 && dist2(bat, e) < (e.r + 9) ** 2) {
          this.damage(e, 8 * m);
          e.batCd = 0.35;
        }
      }
    }

    // Danger Zone: steady damage around the player.
    if (this.lv.aura > 0) {
      const r = this.auraRadius(), dps = 6 * this.lv.aura * m;
      for (const e of this.enemies) if (!e.dead && dist2(e, p) < (r + e.r) ** 2) this.damage(e, dps * dt);
    }

    this.enemies = this.enemies.filter((e) => !e.dead);
  }

  // ---------- Armed drones ----------
  droneGuns(dt) {
    const p = this.player, range2 = C.droneRange ** 2;
    for (const e of this.enemies) {
      if (!e.gun || e.dead) continue;
      if (e.muzzle > 0) e.muzzle -= dt;
      const onScreen = Math.abs(e.x - p.x) < W / 2 - 10 && Math.abs(e.y - p.y) < H / 2 - 10;
      // Only count down while in view and in range, so shots never come from off-screen.
      if (!onScreen || dist2(e, p) > range2) { e.gunCd = Math.max(e.gunCd, C.droneWarn); continue; }
      e.gunCd -= dt;
      if (e.gunCd > 0) continue;
      e.gunCd = e.gun.interval * rand(0.85, 1.15);
      e.muzzle = 0.08;
      const a = Math.atan2(p.y - e.y, p.x - e.x), sp = C.droneBulletSpeed, n = e.gun.shots;
      for (let i = 0; i < n; i++) {
        const b = a + (i - (n - 1) / 2) * e.gun.spread;
        this.bullets.push({ x: e.x + Math.cos(b) * e.r * 1.3, y: e.y + Math.sin(b) * e.r * 1.3,
          vx: Math.cos(b) * sp, vy: Math.sin(b) * sp, life: 3, dmg: e.gun.damage });
      }
      this.events.push('zap');
    }
    for (const b of this.bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0) b.done = true;
      else if (dist2(b, p) < (p.r + 3) ** 2) {
        b.done = true;
        p.hp -= b.dmg;
        this.hurtCd = 0.4;
        this.events.push('hit');
      }
    }
    this.bullets = this.bullets.filter((b) => !b.done);
  }

  // ---------- Anti-aircraft guns ----------
  // Guns live at fixed world x positions in the forest strip, which is always
  // at the bottom of the screen, so their world y follows the camera.
  visibleGuns() {
    const p = this.player, out = [];
    const s0 = Math.floor((p.x - W / 2 - 40) / AA_SLOT), s1 = Math.floor((p.x + W / 2 + 40) / AA_SLOT);
    for (let slot = s0; slot <= s1; slot++) {
      if (hash(slot, 991) > AA_CHANCE) continue;
      let g = this.guns.get(slot);
      if (!g) {
        g = { x: slot * AA_SLOT + 80 + hash(slot, 992) * (AA_SLOT - 160), y: 0, r: 14,
          hp: C.aaHp, maxHp: C.aaHp, cd: rand(1, C.aaInterval), aim: -Math.PI / 2, flash: 0, hitFlash: 0, dead: false, spin: hash(slot, 993) * 6.28 };
        this.guns.set(slot, g);
      }
      g.y = p.y + AA_Y - H / 2;
      g.sx = g.x - p.x + W / 2;
      if (g.sx > -30 && g.sx < W + 30) out.push(g);
    }
    return out;
  }

  liveGuns() { return this.visibleGuns().filter((g) => !g.dead && g.sx > 10 && g.sx < W - 10); }

  antiAircraft(dt) {
    const p = this.player;
    const interval = Math.max(C.aaMinInterval, C.aaInterval - (this.time - C.aaFrom) / 60);
    for (const g of this.visibleGuns()) {
      if (g.flash > 0) g.flash -= dt;
      if (g.hitFlash > 0) g.hitFlash -= dt;
      if (g.dead) continue;
      // Radar dish sweeps round and round; just before firing it snaps to
      // face the jet's side of the screen.
      if (this.time >= C.aaFrom && g.cd < 0.6) {
        const lock = p.x >= g.x ? 0 : Math.PI;
        let d = lock - g.spin; d = Math.atan2(Math.sin(d), Math.cos(d));
        g.spin += d * Math.min(1, dt * 12);
      } else g.spin = (g.spin + dt * 2.2) % (Math.PI * 2);
      // Track the jet, barrels always pointing upwards.
      let want = Math.atan2(p.y - g.y, p.x - g.x);
      want = Math.max(-Math.PI + 0.25, Math.min(-0.25, want));
      g.aim += (want - g.aim) * Math.min(1, dt * 5);
      if (this.time < C.aaFrom || g.sx < 20 || g.sx > W - 20) continue;
      g.cd -= dt;
      if (g.cd > 0) continue;
      g.cd = interval * rand(0.8, 1.2);
      g.flash = 0.12;
      // Aim where the jet is heading, a little imperfectly.
      const sp = C.aaShellSpeed, d = Math.hypot(p.x - g.x, p.y - g.y);
      const lead = (d / sp) * rand(0.4, 0.9);
      const tx = p.x + (p.vx || 0) * lead + rand(-12, 12), ty = p.y + (p.vy || 0) * lead + rand(-12, 12);
      const a = Math.atan2(ty - g.y, tx - g.x), td = Math.hypot(tx - g.x, ty - g.y);
      const mx = g.x + Math.cos(g.aim) * 18, my = g.y + Math.sin(g.aim) * 18;
      this.shells.push({ x: mx, y: my, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, fuse: td / sp });
      this.events.push('flak');
    }

    for (const s of this.shells) {
      s.x += s.vx * dt; s.y += s.vy * dt; s.fuse -= dt;
      if (s.fuse <= 0 || dist2(s, p) < (p.r + 3) ** 2) { s.done = true; this.explode(s.x, s.y); }
    }
    this.shells = this.shells.filter((s) => !s.done);
    for (const f of this.flak) f.t += dt;
    this.flak = this.flak.filter((f) => f.t < 0.9);
  }

  explode(x, y) {
    const p = this.player, r = C.aaBlast;
    this.flak.push({ x, y, t: 0, r });
    this.events.push('boom');
    if (dist2({ x, y }, p) < (r + p.r) ** 2) {
      p.hp -= C.aaDamage;
      this.hurtCd = 0.4;
      this.events.push('hit');
    }
    // Flak doesn't care whose side you're on.
    for (const e of this.enemies) if (!e.dead && dist2({ x, y }, e) < (r + e.r) ** 2) this.damage(e, 25);
  }

  damageGun(g, amount) {
    g.hp -= amount;
    g.hitFlash = 0.08;
    if (g.hp > 0 || g.dead) return;
    g.dead = true;
    const pts = C.aaPoints * this.multiplier;
    this.score += pts;
    this.kills++;
    this.floaters.push({ x: g.x, y: g.y - 24, text: `+${pts}`, life: 1 });
    this.burst(g.x, g.y, '#ffb703', 24);
    this.burst(g.x, g.y, '#c1121f', 12);
    // Its blood drops tumble up out of the trees towards the jet.
    for (let i = 0; i < 3; i++) this.gems.push({ x: g.x + rand(-20, 20), y: g.y - 30 - i * 14, v: 5, big: true });
    this.events.push('boom', 'kill');
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
    // Danger Zone
    if (this.lv.aura > 0) {   // Danger Zone: tinted disc with a crisp rotating dashed ring
      const r = this.auraRadius();
      ctx.fillStyle = 'rgba(255,77,109,0.08)';
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,77,109,0.55)'; ctx.lineWidth = 1.5;
      ctx.setLineDash([10, 8]); ctx.lineDashOffset = -this.time * 30;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Blood drops
    for (const g of this.gems) {
      ctx.fillStyle = g.big ? '#ff4d6d' : '#c1121f';
      const s = g.big ? 6 : 4;
      ctx.beginPath(); ctx.moveTo(g.x, g.y - s * 1.6); ctx.lineTo(g.x + s, g.y); ctx.arc(g.x, g.y, s, 0, Math.PI); ctx.lineTo(g.x - s, g.y); ctx.fill();
    }
    // Drones, facing the jet
    for (const e of this.enemies) {
      ctx.save();
      ctx.translate(e.x, e.y); ctx.rotate(Math.atan2(p.y - e.y, p.x - e.x));
      drawDrone(ctx, e, this.time);
      ctx.restore();
    }
    // Cannon tracers: thin bright streaks along their flight path
    ctx.lineCap = 'butt';
    for (const b of this.bolts) {
      ctx.strokeStyle = '#ffb703'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(b.x - b.vx * 0.03, b.y - b.vy * 0.03); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.strokeStyle = '#fff6d6'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(b.x - b.vx * 0.018, b.y - b.vy * 0.018); ctx.lineTo(b.x + b.vx * 0.004, b.y + b.vy * 0.004); ctx.stroke();
    }
    // Missiles (Fox Two), nose pointing along the orbit
    for (const m of this.batPositions()) {
      ctx.save();
      ctx.translate(m.x, m.y); ctx.rotate(m.a);
      // Exhaust flame
      const flick = 4 + Math.sin(this.time * 40 + m.a) * 2;
      ctx.fillStyle = '#ffb703';
      ctx.beginPath(); ctx.moveTo(-7, -2); ctx.lineTo(-7 - flick, 0); ctx.lineTo(-7, 2); ctx.fill();
      // Fins, body and nose
      poly(ctx, [-7, -2, -10, -5.5, -4, -2], '#c1121f', 0.8);
      poly(ctx, [-7, 2, -10, 5.5, -4, 2], '#c1121f', 0.8);
      poly(ctx, [-7, -2, 4, -2, 4, 2, -7, 2], '#d8d8e4', 0.8);
      poly(ctx, [4, -2, 10, 0, 4, 2], '#c1121f', 0.8);
      ctx.restore();
    }
    // Fighter jet, pointing where it flies
    if (!(this.hurtCd > 0.2 && Math.floor(this.hurtCd * 30) % 2)) {
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.heading);
      drawJet(ctx, this.aircraft, p.moving ? 6 + Math.sin(this.time * 50) * 2 : 0);
      ctx.restore();
    }
    // Drone bullets: red tracers
    for (const b of this.bullets) {
      ctx.strokeStyle = 'rgba(255,77,109,0.45)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * 0.05, b.y - b.vy * 0.05); ctx.stroke();
      ctx.fillStyle = '#ff4d6d';
      ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd6dd';
      ctx.beginPath(); ctx.arc(b.x, b.y, 1.3, 0, Math.PI * 2); ctx.fill();
    }
    // Flak shells and bursts
    ctx.fillStyle = '#ffe8a3';
    for (const s of this.shells) {
      ctx.globalAlpha = 0.35;
      ctx.fillRect(s.x - s.vx * 0.03 - 1, s.y - s.vy * 0.03 - 1, 2, 2);
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(s.x, s.y, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    for (const f of this.flak) {
      const k = f.t / 0.9;
      if (f.t < 0.12) {       // bright flash
        ctx.fillStyle = '#fff1c1';
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.4 + f.t * 5), 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = `rgba(70,60,80,${(0.55 * (1 - k)).toFixed(3)})`;
      for (let i = 0; i < 5; i++) {
        const a = i * 1.26 + f.x;
        ctx.beginPath();
        ctx.arc(f.x + Math.cos(a) * f.r * 0.45, f.y + Math.sin(a) * f.r * 0.45 - f.t * 10, f.r * (0.35 + k * 0.35), 0, Math.PI * 2);
        ctx.fill();
      }
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
    this.drawForest(ctx);
  }

  // Pine silhouettes along the bottom of the screen, in two parallax layers,
  // with the anti-aircraft guns standing in clearings between them.
  drawForest(ctx) {
    const p = this.player, guns = this.visibleGuns();
    const pine = (x, base, h, w) => {
      ctx.beginPath();
      for (let t = 0; t < 3; t++) {       // three stacked tiers
        const ty = base - h * (0.3 + t * 0.3), tw = w * (1 - t * 0.25);
        ctx.moveTo(x - tw / 2, base - h * t * 0.28); ctx.lineTo(x, ty - h * 0.12); ctx.lineTo(x + tw / 2, base - h * t * 0.28);
      }
      ctx.fill();
    };
    const layer = (parallax, spacing, minH, maxH, color, seed, clearings) => {
      ctx.fillStyle = color;
      const cam = p.x * parallax, i0 = Math.floor((cam - W / 2) / spacing) - 1, i1 = Math.floor((cam + W / 2) / spacing) + 1;
      for (let i = i0; i <= i1; i++) {
        const x = i * spacing + hash(i, seed) * spacing * 0.6 - cam + W / 2;
        if (clearings && guns.some((g) => Math.abs(g.sx - x) < 30)) continue;
        const h = minH + hash(i, seed + 1) * (maxH - minH);
        pine(x, H, h, h * 0.55);
      }
    };
    // A faint moonlit haze where the forest starts
    const haze = ctx.createLinearGradient(0, FOREST_TOP - 30, 0, H);
    haze.addColorStop(0, 'rgba(10,6,16,0)');
    haze.addColorStop(1, 'rgba(10,6,16,0.85)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, FOREST_TOP - 30, W, H - FOREST_TOP + 30);
    layer(0.5, 22, 40, 78, '#1a0f26', 31, false);
    for (const g of guns) this.drawGun(ctx, g);
    layer(1, 30, 22, 50, '#06030a', 57, true);
    ctx.fillStyle = '#06030a';
    ctx.fillRect(0, H - 10, W, 10);
  }

  drawGun(ctx, g) {
    // Drawn 1.4x around its turret so it reads clearly against the trees.
    ctx.save();
    ctx.translate(g.sx, AA_Y); ctx.scale(1.4, 1.4); ctx.translate(-g.sx, -AA_Y);
    this.drawGunShape(ctx, g);
    ctx.restore();
  }

  drawGunShape(ctx, g) {
    const x = g.sx, y = AA_Y;
    if (g.dead) {             // burnt-out wreck with a trail of smoke
      ctx.fillStyle = '#1c1620';
      ctx.fillRect(x - 18, y + 4, 36, 10);
      ctx.beginPath(); ctx.arc(x - 2, y + 4, 8, Math.PI, 0); ctx.fill();
      for (let i = 0; i < 4; i++) {
        const t = (this.time * 0.6 + i / 4) % 1;
        ctx.fillStyle = `rgba(90,80,100,${(0.3 * (1 - t)).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(x + Math.sin(t * 6 + i) * 4, y - t * 50, 4 + t * 8, 0, Math.PI * 2); ctx.fill();
      }
      return;
    }
    const lit = g.hitFlash > 0;
    this.drawRadar(ctx, x - 12, y - 10, g.spin, lit);
    // Twin barrels
    ctx.save();
    ctx.translate(x, y); ctx.rotate(g.aim);
    ctx.fillStyle = lit ? '#fff' : '#6b745e';
    ctx.fillRect(0, -4, 20, 2.5); ctx.fillRect(0, 1.5, 20, 2.5);
    if (g.flash > 0) {
      ctx.fillStyle = '#ffd166';
      ctx.beginPath(); ctx.moveTo(20, -6); ctx.lineTo(30, 0); ctx.lineTo(20, 6); ctx.fill();
    }
    ctx.restore();
    // Turret and tracked body
    ctx.fillStyle = lit ? '#fff' : '#4a5240';
    ctx.beginPath(); ctx.arc(x, y + 2, 9, Math.PI, 0); ctx.fill();
    ctx.fillRect(x - 18, y + 2, 36, 10);
    ctx.fillStyle = '#15171a';
    ctx.fillRect(x - 20, y + 10, 40, 6);
    // Moonlight on the edge, and a warning light that blinks before it fires
    ctx.fillStyle = 'rgba(200,190,230,0.25)';
    ctx.fillRect(x - 18, y + 2, 36, 1.5);
    const armed = this.time >= C.aaFrom;
    ctx.fillStyle = armed && g.cd < 0.5 && Math.floor(this.time * 12) % 2 ? '#ff4d6d' : armed ? '#5a1020' : '#222';
    ctx.fillRect(x + 10, y + 4, 3, 3);
    // Damage bar once hit
    if (g.hp < g.maxHp) {
      ctx.fillStyle = '#000'; ctx.fillRect(x - 14, y - 25, 28, 3);
      ctx.fillStyle = '#ffb703'; ctx.fillRect(x - 14, y - 25, 28 * (g.hp / g.maxHp), 3);
    }
  }

  // Radar dish on a short mast at the back of the gun. It's seen side-on:
  // squashing the dish by cos(spin) makes it look like it turns, and its
  // darker back shows while it faces away.
  drawRadar(ctx, x, y, spin, lit) {
    ctx.fillStyle = lit ? '#fff' : '#3a4034';
    ctx.fillRect(x - 1, y, 2, 13);                    // mast
    const c = Math.cos(spin), sx = Math.sign(c || 1) * Math.max(0.12, Math.abs(c));
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sx, 1);
    ctx.fillStyle = lit ? '#fff' : c >= 0 ? '#a3ad92' : '#4f5845';
    ctx.strokeStyle = '#07040b'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.ellipse(0, 0, 4.5, 9, 0, -Math.PI / 2, Math.PI / 2); ctx.closePath();
    ctx.fill(); ctx.stroke();
    // Feed horn on struts in front of the dish, with a red tip
    ctx.strokeStyle = lit ? '#fff' : '#6b745e'; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(8, 0); ctx.lineTo(0, 6); ctx.stroke();
    ctx.fillStyle = '#ff4d6d'; ctx.fillRect(7, -1.2, 2.5, 2.5);
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
    ctx.fillText('Choose an upgrade:  1 / 2 / 3   or   ← → and ENTER', W / 2, 160);
    const n = this.choosing.length, cw = 240, gap = 24, x0 = W / 2 - (n * cw + (n - 1) * gap) / 2;
    this.choosing.forEach((key, i) => {
      const x = x0 + i * (cw + gap), y = 200, sel = i === this.choiceIndex;
      ctx.fillStyle = sel ? '#3a1530' : '#1c1226'; ctx.fillRect(x, y, cw, 170);
      ctx.strokeStyle = sel ? '#ff4d6d' : '#4a3a5a'; ctx.lineWidth = sel ? 3 : 1.5; ctx.strokeRect(x, y, cw, 170);
      const u = UPGRADES[key], l = this.lv[key] ?? 0;
      ctx.fillStyle = '#8a7a9a'; ctx.font = 'bold 14px monospace'; ctx.fillText(`[${i + 1}]`, x + cw / 2, y + 24);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 20px monospace';
      ctx.fillText(u ? u.name : FLYBY.name, x + cw / 2, y + 62);
      ctx.fillStyle = '#ffd6de'; ctx.font = '14px monospace';
      ctx.fillText(u ? (l === 0 ? 'NEW' : `Lv ${l} → ${l + 1}`) : 'All upgrades maxed', x + cw / 2, y + 92);
      ctx.fillStyle = '#b8a9c9'; ctx.font = '13px monospace';
      ctx.fillText(u ? u.desc(l) : FLYBY.desc, x + cw / 2, y + 125);
    });
  }
}

// main.js uses this to preview aircraft on the selection screen.
Game.drawJet = drawJet;
