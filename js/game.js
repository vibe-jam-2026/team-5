// Survivors-like gameplay: the jet flies, weapons fire automatically,
// downed hostiles drop pickups (XP), level-ups offer a choice of 3 upgrades.
// main.js only relies on:
//   new Game(aircraft), game.update(dt, input), game.draw(ctx), game.drawUi(ctx),
//   game.score, game.level, game.time, game.kills, game.multiplier, game.streakTimer,
//   game.over, game.choosing, game.events
// `events` are strings the shell reacts to: 'pickup', 'kill', 'hit', 'levelup', 'choose', 'over'.
import { CONFIG as C } from './config.js';

const W = C.width, H = C.height;
const rand = (a, b) => a + Math.random() * (b - a);
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

// Camera: the world is endless and the jet always stays in the centre of
// the screen. Hunters spawn just outside the view, in every direction.
const SPAWN_RADIUS = Math.hypot(W, H) / 2 + 40;
const DESPAWN_RADIUS = SPAWN_RADIUS * 1.8;   // hunters left this far behind respawn ahead
const TILE = 64;                              // ground decoration grid

// Foreground forest: a strip of pine silhouettes on the ground. The ground
// is at a fixed world height (GROUND_Y); at the start it sits along the bottom
// of the screen. The camera follows the jet up, but never below the ground,
// so diving down brings the jet towards the trees. Hitting them is game over.
const GROUND_Y = H / 2;                       // world y of the bottom edge of the forest strip
const CAM_MAX_Y = GROUND_Y - H / 2;           // lowest camera centre: ground at the screen bottom
const FOREST_TOP = H - 78;                    // tallest trees reach about here (screen y with the camera at its lowest)
const CRASH_Y = GROUND_Y - C.crashHeight;     // jet centre below this world y = crashed into the trees
const CEIL_Y = GROUND_Y - C.maxAltitude;      // jet centre can't go above this world y (max height)
const AA_SLOT = 520;                          // at most one gun per this many px of world x
const AA_Y = H - 34;                          // screen y of a gun's turret
const AA_CHANCE = 0.65;                       // share of slots that hold a gun

// Deterministic per-tile noise so ground decoration stays put as you walk.
function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// 80s neon palette (same as the title screen in main.js) for the level-up picker.
const NEON = { magenta: '#ff71ce', cyan: '#05d9e8', yellow: '#fffb96', ink: '#e8dcff', dim: '#9a86c4' };

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
// ---------- Power-ups ----------
// Temporary special weapons, picked up from crates that kills sometimes drop.
const POWERUPS = {
  spread: { name: 'SCATTER CANNON', letter: 'S', color: '#ffd166' },  // rings of tracers in every direction
  laser:  { name: 'PULSE LASER',    letter: 'L', color: '#4cc9f0' },  // twin beams sweeping round the jet
  rocket: { name: 'ROCKET SWARM',   letter: 'R', color: '#ff4d6d' },  // homing rockets that blow up on impact
};
const LASER_LEN = 260;

// Shown when every upgrade is maxed.
const FLYBY = { name: 'Tower Flyby', desc: 'Heal 30, +500 points' };
// Trap card: looks like an upgrade, ends the game if picked.
const RED_BUTTON = { name: 'Big Red Button', desc: 'Do not press. Seriously. Do NOT press it.' };

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

// Neon afterburner out of the tail nozzle (at x = -12): a hot pink glow,
// then magenta, orange and white-hot flame layers with shock diamonds.
function drawAfterburner(ctx, burner) {
  const len = burner * 2.6, flick = 0.85 + Math.random() * 0.3;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const glow = ctx.createRadialGradient(-12 - len * 0.35, 0, 0, -12 - len * 0.35, 0, len * 0.9 + 6);
  glow.addColorStop(0, 'rgba(255,113,206,0.55)');
  glow.addColorStop(0.5, 'rgba(255,42,109,0.18)');
  glow.addColorStop(1, 'rgba(255,42,109,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(-12 - len * 0.35, 0, len * 0.9 + 6, 0, Math.PI * 2); ctx.fill();
  poly(ctx, [-12, -4, -12 - len * flick, 0, -12, 4], 'rgba(255,42,109,0.75)', 0);
  poly(ctx, [-12, -3, -12 - len * 0.75 * flick, 0, -12, 3], '#ff71ce', 0);
  poly(ctx, [-12, -2.2, -12 - len * 0.5 * flick, 0, -12, 2.2], '#ff9e3d', 0);
  poly(ctx, [-12, -1.3, -12 - len * 0.3, 0, -12, 1.3], '#fffbe0', 0);
  if (burner > 4) {   // shock diamonds in the full-power plume
    ctx.fillStyle = 'rgba(255,251,150,0.8)';
    for (let i = 1; i <= 3; i++) {
      const x = -12 - len * 0.18 * i, r = 1.3 - i * 0.25;
      ctx.beginPath(); ctx.moveTo(x - r * 1.6, 0); ctx.lineTo(x, -r); ctx.lineTo(x + r * 1.6, 0); ctx.lineTo(x, r); ctx.fill();
    }
  }
  ctx.restore();
}

// Draw an aircraft at the origin pointing along +x (callers translate/rotate).
function drawJet(ctx, a, burner = 0) {
  ctx.save();
  ctx.scale(a.size, a.size);
  const lw = 0.9 / a.size;
  if (burner) drawAfterburner(ctx, burner);
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
    this.crates = [];         // power-up pickups lying in the world
    this.power = null;        // active special weapon: { kind, t }
    this.powerCd = 0;
    this.powerSpin = 0;
    this.rockets = [];
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
    this.crashed = false;     // true if the night ended by flying into the ground
    this.pressedRed = false;  // true if the night ended by picking the big red button
    this.events = [];
  }

  // Camera centre y: follows the jet, but never shows below the ground.
  get camY() { return Math.min(this.player.y, CAM_MAX_Y); }
  // How far the forest strip is pushed down the screen while the jet is high.
  get groundOffset() { return CAM_MAX_Y - this.camY; }

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
    this.powerups(dt);
    this.updateEffects(dt);

    if (this.streakTimer > 0) {
      this.streakTimer -= dt;
      if (this.streakTimer <= 0) { this.streak = 0; this.multiplier = 1; }
    }

    if (this.player.y >= CRASH_Y) {   // flew into the trees
      this.player.y = CRASH_Y;
      this.player.hp = 0;
      this.crashed = true;
      this.burst(this.player.x, this.player.y, '#ffb703', 50);
      this.burst(this.player.x, this.player.y, '#ff4d6d', 30);
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
    } else {
      // No input: level out so the jet holds its altitude instead of
      // drifting down into the trees.
      const right = Math.abs(Math.cos(p.heading)) > 0.05 ? Math.cos(p.heading) > 0 : p.face > 0;
      let d = (right ? 0 : Math.PI) - p.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      p.heading += d * Math.min(1, dt * 6);
    }
    // The jet never stops: it always flies forward along its heading, and
    // the arrow keys only steer it.
    p.vx = Math.cos(p.heading) * speed; p.vy = Math.sin(p.heading) * speed;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.y <= CEIL_Y) {      // max height: level out and nose slightly down
      p.y = CEIL_Y;
      if (Math.sin(p.heading) < 0) {
        const right = Math.abs(Math.cos(p.heading)) > 0.05 ? Math.cos(p.heading) > 0 : p.face > 0;
        p.heading = right ? 0.15 : Math.PI - 0.15;
      }
    }
    p.moving = true;
    // Neon exhaust trail left behind the nozzle.
    const back = 12 * this.aircraft.size;
    p.trail = (p.trail || []).filter((q) => (q.life -= dt) > 0);
    p.trail.push({ x: p.x - Math.cos(p.heading) * back, y: p.y - Math.sin(p.heading) * back, life: p.moving ? 0.45 : 0.15, max: p.moving ? 0.45 : 0.15 });
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
      e.y = Math.min(e.y + (dy / d) * e.speed * dt, CRASH_Y - 10);   // drones skim over the treetops
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
      if (Math.random() < (e.kind === 'heavy' ? C.powerupChanceHeavy : C.powerupChance)) this.dropCrate(e.x, e.y);
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
      const onScreen = Math.abs(e.x - p.x) < W / 2 - 10 && Math.abs(e.y - this.camY) < H / 2 - 10;
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
  // Guns live at fixed world positions in the forest strip on the ground.
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
      g.y = GROUND_Y - (H - AA_Y);
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
      if (this.time < C.aaFrom || g.sx < 20 || g.sx > W - 20 || AA_Y + this.groundOffset > H - 10) continue;
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
    // Its SSD cards tumble up out of the trees towards the jet.
    for (let i = 0; i < 3; i++) this.gems.push({ x: g.x + rand(-20, 20), y: g.y - 30 - i * 14, v: 5, big: true });
    if (Math.random() < C.powerupFromGun) this.dropCrate(g.x, g.y - 70);
    this.events.push('boom', 'kill');
  }

  // ---------- Power-ups ----------
  dropCrate(x, y) {
    if (this.level < C.powerupFromLevel) return;
    const kinds = Object.keys(POWERUPS);
    this.crates.push({ x, y, kind: kinds[Math.floor(Math.random() * kinds.length)], life: C.powerupLife });
  }

  powerups(dt) {
    const p = this.player, m = this.might;
    // Pick up crates (they drift towards you a little, like SSD cards).
    for (const c of this.crates) {
      c.life -= dt;
      const dx = p.x - c.x, dy = p.y - c.y, d = Math.hypot(dx, dy) || 1;
      if (d < 60) { const s = 200 * dt; c.x += (dx / d) * s; c.y += (dy / d) * s; }
      if (d < p.r + 12) {
        c.life = 0;
        this.power = { kind: c.kind, t: C.powerupDuration };
        this.powerCd = 0;
        this.floaters.push({ x: p.x, y: p.y - 30, text: POWERUPS[c.kind].name + '!', life: 1.4 });
        this.burst(p.x, p.y, POWERUPS[c.kind].color, 20);
        this.events.push('power');
      }
    }
    this.crates = this.crates.filter((c) => c.life > 0 && dist2(c, p) < (DESPAWN_RADIUS * 2) ** 2);

    if (this.power) {
      const pw = this.power;
      pw.t -= dt;
      this.powerCd -= dt;
      this.powerSpin += dt * 2.4;
      if (pw.kind === 'spread' && this.powerCd <= 0) {
        // A ring of 12 tracers, rotating a little each volley.
        this.powerCd = 0.16;
        for (let i = 0; i < 12; i++) {
          const a = this.powerSpin + (i / 12) * Math.PI * 2;
          this.bolts.push({ x: p.x, y: p.y, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, dmg: 12 * m, pierce: 1, life: 1.1 });
        }
      } else if (pw.kind === 'laser') {
        // Two opposite beams sweep round, burning everything they touch.
        const dps = 70 * m;
        for (const a of this.laserAngles()) {
          const ux = Math.cos(a), uy = Math.sin(a);
          for (const e of this.enemies) {
            if (e.dead) continue;
            const rx = e.x - p.x, ry = e.y - p.y, along = rx * ux + ry * uy;
            if (along > 0 && along < LASER_LEN && Math.abs(rx * uy - ry * ux) < e.r + 5) this.damage(e, dps * dt);
          }
          for (const g of this.liveGuns()) {
            const rx = g.x - p.x, ry = g.y - p.y, along = rx * ux + ry * uy;
            if (along > 0 && along < LASER_LEN && Math.abs(rx * uy - ry * ux) < g.r + 5) this.damageGun(g, dps * dt);
          }
        }
      } else if (pw.kind === 'rocket' && this.powerCd <= 0) {
        // Two rockets every volley, each locking onto a random nearby target.
        this.powerCd = 0.22;
        const near = [...this.enemies, ...this.liveGuns()].filter((e) => dist2(e, p) < 420 ** 2);
        for (let i = 0; i < 2; i++) {
          const a = rand(0, Math.PI * 2);
          this.rockets.push({ x: p.x, y: p.y, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160, life: 2.5,
            target: near.length ? near[Math.floor(Math.random() * near.length)] : null });
        }
        this.events.push('rocket');
      }
      if (pw.t <= 0) this.power = null;
    }

    for (const r of this.rockets) {
      r.life -= dt;
      if (r.target && r.target.dead) r.target = null;
      if (!r.target) {
        let best = 300 ** 2;
        for (const e of this.enemies) { const d = dist2(e, r); if (!e.dead && d < best) { best = d; r.target = e; } }
      }
      if (r.target) {
        const a = Math.atan2(r.target.y - r.y, r.target.x - r.x);
        r.vx += Math.cos(a) * 1400 * dt; r.vy += Math.sin(a) * 1400 * dt;
      }
      const sp = Math.hypot(r.vx, r.vy), max = 460;
      if (sp > max) { r.vx *= max / sp; r.vy *= max / sp; }
      r.x += r.vx * dt; r.y += r.vy * dt;
      if (Math.random() < 0.6) this.particles.push({ x: r.x, y: r.y, vx: rand(-20, 20), vy: rand(-20, 20), life: 0.25, color: '#8a7a9a' });
      const hit = this.enemies.some((e) => !e.dead && dist2(e, r) < (e.r + 5) ** 2)
        || this.liveGuns().some((g) => dist2(g, r) < (g.r + 5) ** 2);
      if (hit || r.life <= 0) {
        r.done = true;
        const blast = 48, dmg = 22 * m;
        this.flak.push({ x: r.x, y: r.y, t: 0, r: blast * 0.7 });
        this.burst(r.x, r.y, '#ffb703', 8);
        for (const e of this.enemies) if (!e.dead && dist2(e, r) < (blast + e.r) ** 2) this.damage(e, dmg);
        for (const g of this.liveGuns()) if (dist2(g, r) < (blast + g.r) ** 2) this.damageGun(g, dmg);
        this.events.push('pop');
      }
    }
    this.rockets = this.rockets.filter((r) => !r.done);
    this.enemies = this.enemies.filter((e) => !e.dead);
  }

  laserAngles() { return [this.powerSpin, this.powerSpin + Math.PI]; }

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
    // Drop SSD cards left far behind so the list doesn't grow forever.
    this.gems = this.gems.filter((g) => !g.taken && dist2(g, p) < (DESPAWN_RADIUS * 2) ** 2);
  }

  // ---------- Level-up choice ----------
  openChoice() {
    const pool = Object.keys(UPGRADES).filter((k) => this.lv[k] < UPGRADES[k].max);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    this.choosing = pool.slice(0, 3);
    if (!this.choosing.length) this.choosing = ['feast'];
    // Sometimes the big red button sneaks in, replacing one of the cards.
    if (this.level >= C.redButtonFromLevel && Math.random() < C.redButtonChance) {
      const slot = Math.floor(Math.random() * Math.max(this.choosing.length, 2));
      this.choosing[Math.min(slot, this.choosing.length)] = 'redbutton';
    }
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
    if (key === 'redbutton') {   // told you so
      this.player.hp = 0;
      this.pressedRed = true;
      this.burst(this.player.x, this.player.y, '#e01b2f', 60);
      this.burst(this.player.x, this.player.y, '#fff1c1', 30);
    } else if (key === 'feast') { this.player.hp = Math.min(this.player.maxHp, this.player.hp + 30); this.score += 500; }
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
  // Scrolling ground: grass tufts and stones fixed in the world.
  drawGround(ctx) {
    const p = this.player;
    const x0 = Math.floor((p.x - W / 2) / TILE), x1 = Math.floor((p.x + W / 2) / TILE);
    const y0 = Math.floor((this.camY - H / 2) / TILE), y1 = Math.floor((this.camY + H / 2) / TILE);
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
        } else {                  // stone
          ctx.fillStyle = 'rgba(150,130,170,0.14)';
          ctx.beginPath(); ctx.ellipse(x, y, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
  }

  draw(ctx) {
    const p = this.player;
    ctx.save();
    // World space: the camera is centred on the jet.
    ctx.translate(Math.round(W / 2 - p.x), Math.round(H / 2 - this.camY));
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
    // XP pickups: SSD cards (circuit board with a chip and gold contacts)
    for (const g of this.gems) {
      const s = g.big ? 1.4 : 1, w = 14 * s, h = 9 * s;
      ctx.save();
      ctx.translate(g.x, g.y); ctx.rotate(Math.sin(this.time * 3 + g.x * 0.1) * 0.25);
      ctx.fillStyle = g.big ? '#05d9e8' : '#1f8a5b';                 // board
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.fillStyle = '#1a1a24';                                       // NAND chips
      ctx.fillRect(-w / 2 + 2 * s, -h / 2 + 2 * s, 4 * s, h - 4 * s);
      ctx.fillRect(-w / 2 + 7 * s, -h / 2 + 2 * s, 3 * s, h - 4 * s);
      ctx.fillStyle = '#ffd166';                                       // gold contacts
      for (let i = 0; i < 3; i++) ctx.fillRect(w / 2 - 2 * s, -h / 2 + (1 + i * 2.6) * s, 2 * s, 1.6 * s);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
      ctx.strokeRect(-w / 2 + 0.5, -h / 2 + 0.5, w - 1, h - 1);
      ctx.restore();
    }
    // Power-up crates: spinning glowing boxes with a letter, blinking before they fade
    for (const c of this.crates) {
      if (c.life < 3 && Math.floor(c.life * 8) % 2) continue;
      const pu = POWERUPS[c.kind], bob = Math.sin(this.time * 4 + c.x) * 3;
      ctx.save();
      ctx.translate(c.x, c.y + bob);
      ctx.fillStyle = pu.color; ctx.globalAlpha = 0.25 + 0.15 * Math.sin(this.time * 8);
      ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.rotate(Math.sin(this.time * 2) * 0.3);
      ctx.fillStyle = '#1c1226'; ctx.fillRect(-10, -10, 20, 20);
      ctx.strokeStyle = pu.color; ctx.lineWidth = 2; ctx.strokeRect(-10, -10, 20, 20);
      ctx.fillStyle = pu.color; ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(pu.letter, 0, 1);
      ctx.restore();
    }
    ctx.textBaseline = 'alphabetic';
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
    // Pulse laser beams
    if (this.power && this.power.kind === 'laser') {
      ctx.lineCap = 'round';
      for (const a of this.laserAngles()) {
        const ex = p.x + Math.cos(a) * LASER_LEN, ey = p.y + Math.sin(a) * LASER_LEN;
        const flick = 1 + Math.sin(this.time * 60) * 0.25;
        ctx.strokeStyle = 'rgba(76,201,240,0.3)'; ctx.lineWidth = 14 * flick;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.strokeStyle = '#4cc9f0'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.strokeStyle = '#e8fbff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(ex, ey); ctx.stroke();
      }
      ctx.lineCap = 'butt';
    }
    // Homing rockets
    for (const r of this.rockets) {
      ctx.save();
      ctx.translate(r.x, r.y); ctx.rotate(Math.atan2(r.vy, r.vx));
      ctx.fillStyle = '#ffb703';
      ctx.beginPath(); ctx.moveTo(-5, -1.5); ctx.lineTo(-10 - Math.random() * 4, 0); ctx.lineTo(-5, 1.5); ctx.fill();
      poly(ctx, [-5, -1.5, 4, -1.5, 7, 0, 4, 1.5, -5, 1.5], '#ff4d6d', 0.8);
      ctx.restore();
    }
    // Afterburner trail: a fading ribbon from hot pink to cyan
    const trail = p.trail || [];
    if (trail.length > 1) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (let i = 1; i < trail.length; i++) {
        const a = trail[i - 1], b = trail[i], k = b.life / b.max;
        ctx.strokeStyle = `rgba(${Math.round(5 + 250 * k)},${Math.round(217 - 170 * k)},${Math.round(232 - 30 * k)},${(0.55 * k).toFixed(3)})`;
        ctx.lineWidth = (1 + 5 * k) * this.aircraft.size;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      ctx.restore();
    }
    // Fighter jet, pointing where it flies
    if (!(this.hurtCd > 0.2 && Math.floor(this.hurtCd * 30) % 2)) {
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.heading);
      drawJet(ctx, this.aircraft, p.moving ? 6 + Math.sin(this.time * 50) * 2 : 2.5 + Math.sin(this.time * 40) * 0.5);
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
    const oy = this.groundOffset;
    if (oy < H) {             // forest strip, pushed down while the jet is high
      ctx.save();
      ctx.translate(0, Math.round(oy));
      this.drawForest(ctx);
      ctx.restore();
    }
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
    // Health and XP bars, top left (the score sits top middle, the streak below the bars)
    const bx = 44, bw = 170;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = 'bold 12px monospace';
    const hpK = Math.max(0, p.hp / p.maxHp), low = hpK <= 0.3;
    ctx.fillStyle = NEON.ink; ctx.fillText('HP', 16, 22);
    ctx.fillStyle = '#1a0838'; ctx.fillRect(bx, 17, bw, 10);
    ctx.fillStyle = low ? '#ff4d6d' : '#7ae582'; ctx.fillRect(bx, 17, bw * hpK, 10);
    ctx.fillStyle = NEON.ink; ctx.fillText('XP', 16, 38);
    ctx.fillStyle = '#1a0838'; ctx.fillRect(bx, 34, bw, 8);
    const xpGrad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    xpGrad.addColorStop(0, NEON.magenta); xpGrad.addColorStop(1, NEON.cyan);
    ctx.fillStyle = xpGrad; ctx.fillRect(bx, 34, bw * Math.min(1, this.xp / this.xpToNext), 8);
    ctx.strokeStyle = 'rgba(232,220,255,0.35)'; ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, 17.5, bw - 1, 9); ctx.strokeRect(bx + 0.5, 34.5, bw - 1, 7);
    // Low-altitude warning when the jet nears the treetops
    const alt = CRASH_Y - p.y;
    if (!this.over && alt < C.pullUpWarning && Math.floor(this.time * 6) % 2 === 0) {
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'italic 900 28px Impact, "Arial Black", sans-serif';
      ctx.shadowColor = '#ff4d6d'; ctx.shadowBlur = 12;
      ctx.fillStyle = '#ff4d6d';
      ctx.fillText('PULL UP!', W / 2, H / 2 - 120);
      ctx.restore();
    }
    // Ceiling notice when the jet nears its max height
    if (!this.over && p.y - CEIL_Y < C.ceilingWarning && Math.floor(this.time * 4) % 2 === 0) {
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'italic 900 24px Impact, "Arial Black", sans-serif';
      ctx.shadowColor = NEON.cyan; ctx.shadowBlur = 12;
      ctx.fillStyle = NEON.cyan;
      ctx.fillText('MAX ALTITUDE', W / 2, H / 2 - 120);
      ctx.restore();
    }
    // Active power-up: name and time left, top centre
    if (this.power) {
      const pu = POWERUPS[this.power.kind], k = this.power.t / C.powerupDuration;
      if (k > 0.25 || Math.floor(this.time * 8) % 2) {
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = pu.color; ctx.font = 'bold 16px monospace';
        ctx.fillText(pu.name, W / 2, 92);
      }
      ctx.fillStyle = '#000'; ctx.fillRect(W / 2 - 70, 100, 140, 5);
      ctx.fillStyle = pu.color; ctx.fillRect(W / 2 - 70, 100, 140 * k, 5);
    }

    if (!this.choosing) return;
    ctx.fillStyle = 'rgba(9,2,28,0.78)'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.save();
    ctx.shadowColor = NEON.magenta; ctx.shadowBlur = 14;
    ctx.fillStyle = NEON.magenta; ctx.font = 'italic 900 40px Impact, "Arial Black", sans-serif';
    ctx.fillText(`LEVEL ${this.level - this.pendingLevels} · WEAPONS UPGRADE`, W / 2, 120);
    ctx.restore();
    ctx.fillStyle = NEON.cyan; ctx.font = 'bold 14px monospace';
    ctx.fillText('Arm your jet:  1 / 2 / 3   or   ← → and ENTER', W / 2, 160);
    const n = this.choosing.length, cw = 240, ch = 230, gap = 26, x0 = W / 2 - (n * cw + (n - 1) * gap) / 2;
    this.choosing.forEach((key, i) => {
      const sel = i === this.choiceIndex;
      const x = x0 + i * (cw + gap), y = 196 - (sel ? 6 : 0);
      drawUpgradeCard(ctx, key, i, x, y, cw, ch, sel, this.lv[key] ?? 0, performance.now() / 1000);
    });
  }
}

// ---------- Level-up cards ----------
// Card outline with two cut corners (top-left, bottom-right), like an 80s arcade panel.
function cardPath(ctx, x, y, w, h, c) {
  ctx.beginPath();
  ctx.moveTo(x + c, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h - c);
  ctx.lineTo(x + w - c, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + c);
  ctx.closePath();
}

// Shared neon card frame (also used by the aircraft picker in main.js):
// body, synthwave grid, scanlines, light sweep, header band, border and a key badge.
function drawNeonCard(ctx, x, y, w, h, sel, t, keyLabel) {
  const accent = sel ? NEON.magenta : NEON.cyan;
  const pulse = 0.5 + 0.5 * Math.sin(t * 5);
  ctx.save();
  // Body: deep purple gradient with a soft neon glow round the edge
  const bg = ctx.createLinearGradient(0, y, 0, y + h);
  bg.addColorStop(0, sel ? '#3a0a52' : '#1a0838');
  bg.addColorStop(0.6, sel ? '#1c0636' : '#0e0424');
  bg.addColorStop(1, '#09021c');
  cardPath(ctx, x, y, w, h, 18);
  ctx.shadowColor = accent; ctx.shadowBlur = sel ? 18 + pulse * 10 : 6;
  ctx.fillStyle = bg; ctx.fill();
  ctx.shadowBlur = 0;
  // Clip the inner details to the card shape
  ctx.save();
  cardPath(ctx, x, y, w, h, 18); ctx.clip();
  // Synthwave grid fading up from the bottom
  ctx.strokeStyle = sel ? 'rgba(255,113,206,0.22)' : 'rgba(5,217,232,0.12)'; ctx.lineWidth = 1;
  const gy = y + h * 0.62, cx = x + w / 2;
  for (let k = -6; k <= 6; k++) {
    ctx.beginPath(); ctx.moveTo(cx + k * 14, gy); ctx.lineTo(cx + k * 60, y + h); ctx.stroke();
  }
  const scroll = (t * 18) % 12;
  for (let k = 0; k < 6; k++) {
    const yy = gy + Math.pow((k * 12 + scroll) / 72, 1.7) * (h * 0.38);
    ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke();
  }
  // CRT scanlines
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let yy = y; yy < y + h; yy += 3) ctx.fillRect(x, yy, w, 1);
  // Light sweep across the selected card
  if (sel) {
    const sx = x - 80 + ((t * 160) % (w + 220));
    const sw = ctx.createLinearGradient(sx, 0, sx + 60, 0);
    sw.addColorStop(0, 'rgba(255,255,255,0)'); sw.addColorStop(0.5, 'rgba(255,255,255,0.10)'); sw.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sw;
    ctx.beginPath(); ctx.moveTo(sx, y); ctx.lineTo(sx + 60, y); ctx.lineTo(sx + 20, y + h); ctx.lineTo(sx - 40, y + h); ctx.fill();
  }
  // Header band
  const hb = ctx.createLinearGradient(x, 0, x + w, 0);
  hb.addColorStop(0, sel ? 'rgba(255,113,206,0.55)' : 'rgba(5,217,232,0.30)');
  hb.addColorStop(1, 'rgba(185,103,255,0.05)');
  ctx.fillStyle = hb; ctx.fillRect(x, y, w, 30);
  ctx.restore();
  // Neon border (double line)
  ctx.lineJoin = 'miter';
  ctx.shadowColor = accent; ctx.shadowBlur = sel ? 14 : 6;
  ctx.strokeStyle = accent; ctx.lineWidth = sel ? 2.5 : 1.5;
  cardPath(ctx, x, y, w, h, 18); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = sel ? 'rgba(255,113,206,0.35)' : 'rgba(5,217,232,0.2)'; ctx.lineWidth = 1;
  cardPath(ctx, x + 5, y + 5, w - 10, h - 10, 14); ctx.stroke();

  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  // Keycap badge, top right
  const kx = x + w - 34, ky = y + 6;
  ctx.fillStyle = sel ? NEON.magenta : '#1a0838'; ctx.fillRect(kx, ky, 24, 20);
  ctx.strokeStyle = sel ? '#fff' : NEON.cyan; ctx.lineWidth = 1.2; ctx.strokeRect(kx, ky, 24, 20);
  ctx.fillStyle = sel ? '#1a0838' : '#fff'; ctx.font = 'bold 13px monospace';
  ctx.fillText(keyLabel, kx + 12, ky + 11);
  ctx.restore();
}

function drawUpgradeCard(ctx, key, i, x, y, w, h, sel, l, t) {
  const u = UPGRADES[key];
  const accent = sel ? NEON.magenta : NEON.cyan;
  const pulse = 0.5 + 0.5 * Math.sin(t * 5);
  drawNeonCard(ctx, x, y, w, h, sel, t, String(i + 1));
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  // Status tag, top left
  ctx.textAlign = 'left'; ctx.font = 'bold 12px monospace';
  const trap = key === 'redbutton';
  const tag = trap ? '⚠ DANGER' : !u ? 'BONUS' : l === 0 ? '★ NEW' : `LV ${l} → ${l + 1}`;
  ctx.shadowColor = trap ? '#ff2a3a' : NEON.yellow; ctx.shadowBlur = l === 0 || !u ? 8 : 0;
  ctx.fillStyle = trap ? '#ff4d5a' : l === 0 || !u ? NEON.yellow : '#fff';
  ctx.fillText(tag, x + 22, y + 16);
  ctx.shadowBlur = 0;
  // Icon in a glowing ring
  const ix = x + w / 2, iy = y + 72;
  ctx.save();
  ctx.translate(ix, iy);
  if (sel) ctx.scale(1 + pulse * 0.06, 1 + pulse * 0.06);
  const ring = ctx.createRadialGradient(0, 0, 4, 0, 0, 30);
  ring.addColorStop(0, sel ? 'rgba(255,113,206,0.35)' : 'rgba(5,217,232,0.18)'); ring.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = ring; ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fill();
  ctx.shadowColor = accent; ctx.shadowBlur = 10;
  ctx.strokeStyle = accent; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.stroke();
  drawUpgradeIcon(ctx, key, t, sel);
  ctx.restore();
  // Name: chrome gradient on the selected card
  ctx.textAlign = 'center';
  ctx.font = 'italic 900 21px Impact, "Arial Black", sans-serif';
  const name = (u ? u.name : trap ? RED_BUTTON.name : FLYBY.name).toUpperCase();
  if (sel) {
    const chrome = ctx.createLinearGradient(0, y + 114, 0, y + 136);
    chrome.addColorStop(0, '#f4fdff'); chrome.addColorStop(0.45, '#5fd3ff');
    chrome.addColorStop(0.55, '#ff71ce'); chrome.addColorStop(1, '#fff0fa');
    ctx.shadowColor = NEON.pink; ctx.shadowBlur = 12; ctx.fillStyle = chrome;
  } else ctx.fillStyle = '#fff';
  ctx.fillText(name, x + w / 2, y + 125);
  ctx.shadowBlur = 0;
  // Description, wrapped
  ctx.fillStyle = NEON.ink; ctx.font = '13px monospace';
  wrapText(ctx, u ? u.desc(l) : trap ? RED_BUTTON.desc : FLYBY.desc, x + w / 2, y + 154, w - 30, 16);
  // Level pips along the bottom: filled = owned, blinking = the level you'd get
  if (u) {
    const pw = 14, pg = 6, total = u.max * pw + (u.max - 1) * pg;
    let px = x + w / 2 - total / 2;
    const py = y + h - 26;
    for (let k = 0; k < u.max; k++, px += pw + pg) {
      ctx.beginPath();
      ctx.moveTo(px + 3, py); ctx.lineTo(px + pw, py); ctx.lineTo(px + pw - 3, py + 8); ctx.lineTo(px, py + 8); ctx.closePath();
      if (k < l) { ctx.fillStyle = NEON.cyan; ctx.shadowColor = NEON.cyan; ctx.shadowBlur = 6; ctx.fill(); }
      else if (k === l) {
        ctx.fillStyle = `rgba(255,251,150,${(0.35 + 0.65 * pulse).toFixed(3)})`;
        ctx.shadowColor = NEON.yellow; ctx.shadowBlur = 8; ctx.fill();
      } else { ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(154,134,196,0.6)'; ctx.lineWidth = 1; ctx.stroke(); }
      ctx.shadowBlur = 0;
    }
  }
  ctx.restore();
}

function wrapText(ctx, str, x, y, maxW, lh) {
  const words = str.split(' '), lines = [];
  let line = '';
  for (const wd of words) {
    const test = line ? line + ' ' + wd : wd;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = wd; } else line = test;
  }
  lines.push(line);
  lines.forEach((ln, k) => ctx.fillText(ln, x, y + k * lh));
}

// Neon line-art icon for each upgrade, centred on the origin (about 40px across).
function drawUpgradeIcon(ctx, key, t, sel) {
  const c = sel ? NEON.yellow : '#fff';
  ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.shadowColor = sel ? NEON.yellow : NEON.cyan; ctx.shadowBlur = 8;
  const line = (a, b, cc, d) => { ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(cc, d); ctx.stroke(); };
  switch (key) {
    case 'bolt': {      // three tracer rounds
      for (let k = -1; k <= 1; k++) {
        const o = ((t * 30 + k * 7) % 14) - 7;
        line(-14 + o, k * 7, -2 + o, k * 7);
        ctx.beginPath(); ctx.arc(2 + o, k * 7, 2.2, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'bats': {      // missile circling the ring
      ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      const a = t * 2.5;
      ctx.save(); ctx.translate(Math.cos(a) * 15, Math.sin(a) * 15); ctx.rotate(a + Math.PI / 2);
      line(-7, 0, 6, 0); line(6, 0, 9, 0);
      line(-7, 0, -10, -3); line(-7, 0, -10, 3);
      ctx.restore();
      ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'aura': {      // pulsing danger rings
      for (let k = 0; k < 3; k++) {
        const r = 5 + ((t * 12 + k * 6) % 18);
        ctx.globalAlpha = 1 - (r - 5) / 18;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'might': {     // crosshair
      ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.stroke();
      line(0, -18, 0, -6); line(0, 6, 0, 18); line(-18, 0, -6, 0); line(6, 0, 18, 0);
      ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'speed': {     // afterburner chevrons
      for (let k = 0; k < 3; k++) {
        ctx.globalAlpha = 0.4 + 0.6 * ((Math.sin(t * 8 - k) + 1) / 2);
        const ox = -10 + k * 8;
        ctx.beginPath(); ctx.moveTo(ox, -10); ctx.lineTo(ox + 8, 0); ctx.lineTo(ox, 10); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'vigor': {     // shield with a plus
      ctx.beginPath();
      ctx.moveTo(0, -16); ctx.lineTo(13, -10); ctx.lineTo(11, 6); ctx.lineTo(0, 16); ctx.lineTo(-11, 6); ctx.lineTo(-13, -10); ctx.closePath();
      ctx.stroke();
      ctx.lineWidth = 3; line(0, -7, 0, 7); line(-7, 0, 7, 0);
      break;
    }
    case 'magnet': {    // radar sweep
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.stroke();
      const a = t * 3;
      ctx.lineWidth = 2; line(0, 0, Math.cos(a) * 16, Math.sin(a) * 16);
      ctx.globalAlpha = 0.25;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 16, a - 0.9, a); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(7, -6, 2, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'redbutton': { // big glossy red button on a yellow-black base
      ctx.shadowColor = '#ff2a3a'; ctx.shadowBlur = 14 + 6 * Math.sin(t * 6);
      ctx.fillStyle = '#ffd400'; ctx.fillRect(-18, 4, 36, 10);
      ctx.fillStyle = '#111';
      for (let k = -18; k < 18; k += 8) { ctx.beginPath(); ctx.moveTo(k, 14); ctx.lineTo(k + 4, 14); ctx.lineTo(k + 8, 4); ctx.lineTo(k + 4, 4); ctx.fill(); }
      ctx.fillStyle = '#7a0a14'; ctx.beginPath(); ctx.ellipse(0, 4, 14, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e01b2f'; ctx.beginPath(); ctx.ellipse(0, -2, 14, 9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.ellipse(-5, -5, 4, 2.5, -0.3, 0, Math.PI * 2); ctx.fill();
      break;
    }
    default: {          // flyby bonus: star
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const r = k % 2 ? 7 : 17, a = -Math.PI / 2 + k * Math.PI / 5;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath(); ctx.stroke();
    }
  }
  ctx.shadowBlur = 0; ctx.lineCap = 'butt';
}

// main.js uses this to preview aircraft on the selection screen.
Game.drawJet = drawJet;
Game.drawNeonCard = drawNeonCard;
