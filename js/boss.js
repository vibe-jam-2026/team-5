// Final boss. Just before sunrise the Mothership arrives: the hive carrier the
// drones have been coming from all night. Shoot off its turrets and break its
// hull, then its AI core breaks loose for a short, frantic last fight. Beat the
// core and dawn breaks: big bonus, full heal, and Overtime at double points.
//
// game.js calls Boss.update / Boss.draw / Boss.drawUi and asks Boss.parts()
// for things its weapons can hit. The boss state lives in game.boss.
import { CONFIG } from './config.js';

const C = CONFIG, B = CONFIG.boss, W = C.width, H = C.height;
const rand = (a, b) => a + Math.random() * (b - a);
const NEON = { pink: '#ff2a6d', magenta: '#ff71ce', cyan: '#05d9e8', yellow: '#fffb96', ink: '#e8dcff' };

// Turret mounts under the hull, relative to its centre.
const MOUNTS = [[-104, 16], [-50, 30], [50, 30], [104, 16]];
// Mothership outline (long armoured hexagon).
const HULL = [-160, 0, -118, -34, -44, -48, 44, -48, 118, -34, 160, 0, 118, 26, 44, 40, -44, 40, -118, 26];

function part(kind, hp, r, extra = {}) {
  return { kind, hp, maxHp: hp, r, x: 0, y: 0, flash: 0, batCd: 0, dead: false, boss: true, ...extra };
}

function setPhase(b, phase) { b.phase = phase; b.t = 0; }

function start(g) {
  g.boss = {
    phase: 'warning', t: 0, x: g.player.x, y: g.camY - H,
    hull: part('hull', B.hullHp, 44, { rx: 150, ry: 40 }),
    turrets: MOUNTS.map(([ox, oy]) => part('turret', B.turretHp, 14, { ox, oy, cd: rand(1.5, 3), muzzle: 0 })),
    core: null, barrageCd: B.barrageEvery, ring2: 0, launchCd: 4, bonus: 0,
  };
  g.events.push('bossWarn');
}

function shoot(g, x, y, a, speed, dmg = B.bulletDamage) {
  g.bullets.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 4.5, dmg, boss: true });
}

function ring(g, b, offset) {
  for (let i = 0; i < B.ringBullets; i++) shoot(g, b.x, b.y, offset + (i / B.ringBullets) * Math.PI * 2, B.bulletSpeed * 0.8);
  g.events.push('boom');
}

// Hang near the top of the screen, drifting side to side over the jet.
function hover(g, b, dt, k) {
  const tx = g.player.x + Math.sin(g.time * 0.35) * 200, ty = g.camY - H / 2 + 100;
  b.x += (tx - b.x) * Math.min(1, dt * k);
  b.y += (ty - b.y) * Math.min(1, dt * k);
  b.hull.x = b.x; b.hull.y = b.y;
  for (const t of b.turrets) { t.x = b.x + t.ox; t.y = b.y + t.oy; }
}

function hurt(g, dmg) {
  const p = g.player;
  if (g.hurtCd > 0) return;
  p.hp -= dmg;
  g.hurtCd = 0.4;
  g.events.push('hit');
}

function fight(g, b, dt) {
  const p = g.player, hull = b.hull;
  // Turrets: aimed three-shot bursts, glowing red just before they fire.
  for (const t of b.turrets) {
    if (t.dead) continue;
    if (t.muzzle > 0) t.muzzle -= dt;
    t.cd -= dt;
    if (t.cd > 0) continue;
    t.cd = B.turretEvery * rand(0.85, 1.15);
    t.muzzle = 0.08;
    const a = Math.atan2(p.y - t.y, p.x - t.x);
    for (let i = -1; i <= 1; i++) shoot(g, t.x, t.y, a + i * 0.18, B.bulletSpeed);
    g.events.push('zap');
  }
  // Barrage: the core eye charges up, then a ring of bullets (two when badly hurt).
  const angry = hull.hp < hull.maxHp / 2;
  b.barrageCd -= dt;
  if (b.barrageCd <= 0) {
    b.barrageCd = B.barrageEvery * (angry ? 0.7 : 1);
    const off = rand(0, 1);
    ring(g, b, off);
    if (angry) b.ring2 = 0.3;
    b.ringOff = off + Math.PI / B.ringBullets;
  }
  if (b.ring2 > 0 && (b.ring2 -= dt) <= 0) ring(g, b, b.ringOff);
  // Hangar launches a fresh wave of drones.
  b.launchCd -= dt;
  if (b.launchCd <= 0) {
    b.launchCd = B.launchEvery;
    for (let i = 0; i < B.launchCount; i++) g.addEnemy(Math.random() < 0.5 ? 'quad' : 'dart', b.x + rand(-30, 30), b.y + 44);
    g.events.push('rocket');
  }
  // Ramming the hull hurts.
  if (inside(hull, p, p.r)) { p.hp -= B.contactDps * dt; if (g.hurtCd <= 0) { g.hurtCd = 0.4; g.events.push('hit'); } }
}

function breakup(g, b) {
  // Chain of explosions across the hull, then the core breaks free.
  if (Math.random() < 0.35) {
    const x = b.x + rand(-140, 140), y = b.y + rand(-35, 35);
    g.burst(x, y, Math.random() < 0.5 ? '#ffb703' : NEON.magenta, 14);
    g.flak.push({ x, y, t: 0, r: rand(20, 40) });
    if (Math.random() < 0.3) g.events.push('boom');
  }
  if (b.t >= 2.2) {
    b.core = part('core', B.coreHp, 22, { mode: 'orbit', mt: 0, ang: -Math.PI / 2, spin: 0, fireCd: 0.5, dir: 0 });
    b.core.x = b.x; b.core.y = b.y;
    b.core.ang = Math.atan2(b.y - g.player.y, b.x - g.player.x);
    g.burst(b.x, b.y, '#fff', 60);
    g.burst(b.x, b.y, NEON.magenta, 40);
    g.events.push('bossDown');
    setPhase(b, 'core');
  }
}

function core(g, b, dt) {
  const c = b.core, p = g.player;
  c.spin += dt * 3;
  c.mt += dt;
  if (c.mode === 'orbit') {
    c.ang += dt * 0.9;
    const tx = p.x + Math.cos(c.ang) * B.coreOrbit, ty = p.y + Math.sin(c.ang) * B.coreOrbit;
    c.x += (tx - c.x) * Math.min(1, dt * 3);
    c.y += (ty - c.y) * Math.min(1, dt * 3);
    c.fireCd -= dt;
    if (c.fireCd <= 0) {
      c.fireCd = B.coreFireEvery * (c.hp < c.maxHp / 2 ? 0.7 : 1);
      for (let k = 0; k < 3; k++) shoot(g, c.x, c.y, c.spin + (k / 3) * Math.PI * 2, B.coreBulletSpeed);
    }
    if (c.mt >= B.coreDashEvery) { c.mode = 'aim'; c.mt = 0; g.events.push('zap'); }
  } else if (c.mode === 'aim') {
    c.dir = Math.atan2(p.y - c.y, p.x - c.x);     // keeps tracking until it lunges
    if (c.mt >= 0.75) { c.mode = 'dash'; c.mt = 0; g.events.push('rocket'); }
  } else {
    c.x += Math.cos(c.dir) * B.coreDashSpeed * dt;
    c.y += Math.sin(c.dir) * B.coreDashSpeed * dt;
    if (Math.random() < 0.8) g.particles.push({ x: c.x, y: c.y, vx: rand(-30, 30), vy: rand(-30, 30), life: 0.35, color: NEON.magenta });
    if (c.mt >= 0.6) { c.mode = 'orbit'; c.mt = 0; c.ang = Math.atan2(c.y - p.y, c.x - p.x); }
  }
  c.y = Math.min(c.y, g.floorY - 20);   // never dives into the trees
  if ((c.x - p.x) ** 2 + (c.y - p.y) ** 2 < (c.r + p.r) ** 2) hurt(g, B.coreContact);
}

function dawn(g) {
  const b = g.boss, p = g.player;
  setPhase(b, 'dawn');
  // With the core gone, every drone in the sky drops out of it.
  for (const e of g.enemies) if (!e.dead) g.damage(e, 1e9);
  g.enemies = g.enemies.filter((e) => !e.dead);
  g.bullets.length = 0;
  g.shells.length = 0;
  b.bonus = Math.round(B.dawnBonus + B.dawnHpBonus * Math.max(0, p.hp / p.maxHp));
  g.score += b.bonus;
  p.hp = p.maxHp;
  g.cleared = true;
  g.clearedAt = g.time;
  g.events.push('dawn');
}

function inside(pt, q, pad) {
  if (pt.rx) return ((q.x - pt.x) / (pt.rx + pad)) ** 2 + ((q.y - pt.y) / (pt.ry + pad)) ** 2 < 1;
  return (q.x - pt.x) ** 2 + (q.y - pt.y) ** 2 < (pt.r + pad) ** 2;
}

// ---------- Drawing ----------
function glow(ctx, color, blur, fn) {
  ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = blur; fn(); ctx.restore();
}

function drawMothership(ctx, g, b) {
  const t = g.time, hull = b.hull, p = g.player, lit = hull.flash > 0;
  ctx.save();
  ctx.translate(b.x, b.y);
  if (b.phase === 'breakup') ctx.translate(rand(-4, 4), rand(-3, 3));
  // Engine glow under the wings
  for (const ex of [-118, 118]) {
    const fl = 0.6 + 0.4 * Math.sin(t * 30 + ex);
    const eg = ctx.createRadialGradient(ex, 30, 2, ex, 30, 34 * fl);
    eg.addColorStop(0, 'rgba(5,217,232,0.8)'); eg.addColorStop(1, 'rgba(5,217,232,0)');
    ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(ex, 30, 34 * fl, 0, Math.PI * 2); ctx.fill();
  }
  // Armoured hull with a neon edge
  ctx.beginPath();
  ctx.moveTo(HULL[0], HULL[1]);
  for (let i = 2; i < HULL.length; i += 2) ctx.lineTo(HULL[i], HULL[i + 1]);
  ctx.closePath();
  const hg = ctx.createLinearGradient(0, -48, 0, 40);
  hg.addColorStop(0, lit ? '#5a3a86' : '#3a2458'); hg.addColorStop(0.5, lit ? '#2c1a48' : '#1c1030'); hg.addColorStop(1, '#0b0614');
  ctx.fillStyle = hg; ctx.fill();
  glow(ctx, NEON.magenta, 14, () => { ctx.strokeStyle = NEON.magenta; ctx.lineWidth = 2; ctx.stroke(); });
  // Panel lines and a running light strip
  ctx.strokeStyle = 'rgba(185,103,255,0.35)'; ctx.lineWidth = 1;
  for (const px of [-80, -30, 30, 80]) { ctx.beginPath(); ctx.moveTo(px, -44); ctx.lineTo(px * 1.1, 38); ctx.stroke(); }
  for (let i = 0; i < 14; i++) {
    const on = Math.floor(t * 8 - i) % 14 === 0;
    ctx.fillStyle = on ? NEON.cyan : 'rgba(5,217,232,0.25)';
    ctx.fillRect(-130 + i * 20, -2, 8, 3);
  }
  // Hangar bay with blinking lights
  ctx.fillStyle = '#05020a'; ctx.fillRect(-30, 30, 60, 12);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = Math.floor(t * 4 + i) % 2 ? '#ffb703' : '#4a3010';
    ctx.fillRect(-26 + i * 16, 34, 6, 3);
  }
  // Core eye: pulses, and charges up white-hot before a barrage
  const charge = b.phase === 'fight' ? Math.max(0, 1 - b.barrageCd) : 0;
  const er = 16 + charge * 10 + Math.sin(t * 5) * 1.5;
  const eye = ctx.createRadialGradient(0, -12, 2, 0, -12, er * 1.8);
  eye.addColorStop(0, charge > 0 ? '#fff' : '#ffd6f0');
  eye.addColorStop(0.35, charge > 0 ? '#ff4d6d' : NEON.magenta);
  eye.addColorStop(1, 'rgba(255,42,109,0)');
  ctx.fillStyle = eye; ctx.beginPath(); ctx.arc(0, -12, er * 1.8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#12021c'; ctx.beginPath(); ctx.ellipse(0, -12, 4, 10, 0, 0, Math.PI * 2); ctx.fill();
  // Smoke and sparks once badly damaged
  if (hull.hp < hull.maxHp / 2 || b.phase === 'breakup') {
    for (let i = 0; i < 3; i++) {
      const k = (t * 0.7 + i / 3) % 1, sx = -90 + i * 80;
      ctx.fillStyle = `rgba(70,60,80,${(0.45 * (1 - k)).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(sx + Math.sin(k * 5 + i) * 6, -40 - k * 60, 6 + k * 14, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
  // Turrets: domes with a barrel tracking the jet
  for (const tr of b.turrets) {
    ctx.save();
    ctx.translate(tr.x, tr.y);
    if (tr.dead) {
      ctx.fillStyle = '#1c1620'; ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI); ctx.fill();
      ctx.restore();
      continue;
    }
    ctx.rotate(Math.atan2(p.y - tr.y, p.x - tr.x));
    ctx.fillStyle = tr.flash > 0 ? '#fff' : '#6b5a8a'; ctx.fillRect(0, -3, 20, 6);
    if (tr.cd < 0.5) {
      const k = 1 - Math.max(0, tr.cd) / 0.5;
      ctx.fillStyle = `rgba(255,60,80,${(0.3 + 0.6 * k).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(22, 0, 3 + k * 5, 0, Math.PI * 2); ctx.fill();
    }
    if (tr.muzzle > 0) { ctx.fillStyle = '#fff1c1'; ctx.beginPath(); ctx.arc(22, 0, 7, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    ctx.fillStyle = tr.flash > 0 ? '#fff' : '#2a1a40';
    ctx.beginPath(); ctx.arc(tr.x, tr.y, 12, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = NEON.cyan; ctx.lineWidth = 1.5; ctx.stroke();
    if (tr.hp < tr.maxHp) {
      ctx.fillStyle = '#000'; ctx.fillRect(tr.x - 14, tr.y + 16, 28, 3);
      ctx.fillStyle = '#ffb703'; ctx.fillRect(tr.x - 14, tr.y + 16, 28 * (tr.hp / tr.maxHp), 3);
    }
  }
}

function drawCore(ctx, g, c) {
  const t = g.time;
  // Lunge warning: a red line along the dash
  if (c.mode === 'aim') {
    ctx.save();
    ctx.strokeStyle = `rgba(255,77,109,${(0.3 + 0.5 * (c.mt / 0.75)).toFixed(3)})`;
    ctx.lineWidth = 2 + c.mt * 6; ctx.setLineDash([14, 10]); ctx.lineDashOffset = -t * 80;
    ctx.beginPath(); ctx.moveTo(c.x, c.y);
    ctx.lineTo(c.x + Math.cos(c.dir) * B.coreDashSpeed * 0.6, c.y + Math.sin(c.dir) * B.coreDashSpeed * 0.6);
    ctx.stroke();
    ctx.restore();
  }
  const r = c.r, lit = c.flash > 0;
  const halo = ctx.createRadialGradient(c.x, c.y, r * 0.4, c.x, c.y, r * 3);
  halo.addColorStop(0, 'rgba(255,113,206,0.55)'); halo.addColorStop(1, 'rgba(255,113,206,0)');
  ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(c.x, c.y, r * 3, 0, Math.PI * 2); ctx.fill();
  // Rotating shards
  ctx.save();
  ctx.translate(c.x, c.y);
  for (let i = 0; i < 6; i++) {
    ctx.save();
    ctx.rotate(c.spin + (i / 6) * Math.PI * 2);
    ctx.fillStyle = i % 2 ? NEON.cyan : NEON.magenta;
    ctx.beginPath(); ctx.moveTo(r + 4, -4); ctx.lineTo(r + 16, 0); ctx.lineTo(r + 4, 4); ctx.fill();
    ctx.restore();
  }
  const body = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 2, 0, 0, r);
  body.addColorStop(0, '#fff'); body.addColorStop(0.4, lit ? '#fff' : NEON.magenta); body.addColorStop(1, '#5a0a4a');
  ctx.fillStyle = body; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  // Eye that watches the jet
  const a = Math.atan2(g.player.y - c.y, g.player.x - c.x);
  ctx.fillStyle = '#12021c'; ctx.beginPath(); ctx.ellipse(Math.cos(a) * 6, Math.sin(a) * 6, 4, 8 + Math.sin(t * 9), a, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function chrome(ctx, str, x, y, size) {
  ctx.font = `italic 900 ${size}px Impact, "Arial Black", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const gr = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2);
  gr.addColorStop(0, '#fff8e0'); gr.addColorStop(0.45, '#ffb703'); gr.addColorStop(0.55, '#ff2a6d'); gr.addColorStop(1, '#fff0fa');
  ctx.lineWidth = 6; ctx.strokeStyle = '#12032b'; ctx.lineJoin = 'round';
  ctx.strokeText(str, x + 3, y + 3);
  glow(ctx, NEON.pink, 20, () => { ctx.fillStyle = gr; ctx.fillText(str, x, y); });
}

function neon(ctx, str, x, y, size, color) {
  ctx.font = `bold ${size}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  glow(ctx, color, 10, () => { ctx.fillStyle = color; ctx.fillText(str, x, y); });
}

function bar(ctx, name, k, color) {
  const w = 440, x = W / 2 - w / 2, y = H - 40;
  ctx.fillStyle = 'rgba(9,2,28,0.75)'; ctx.fillRect(x - 8, y - 24, w + 16, 34);
  neon(ctx, name, W / 2, y - 12, 13, color);
  ctx.fillStyle = '#1a0838'; ctx.fillRect(x, y, w, 8);
  glow(ctx, color, 8, () => { ctx.fillStyle = color; ctx.fillRect(x, y, w * Math.max(0, k), 8); });
  ctx.strokeStyle = 'rgba(232,220,255,0.4)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 7);
}

export const Boss = {
  update(g, dt) {
    const b = g.boss;
    if (!b) { if (g.time >= B.at) start(g); return; }
    b.t += dt;
    for (const q of [b.hull, ...b.turrets, b.core]) if (q) { if (q.flash > 0) q.flash -= dt; if (q.batCd > 0) q.batCd -= dt; }
    if (b.phase === 'warning') { hover(g, b, dt, 1.4); if (b.t >= B.warnTime) setPhase(b, 'fight'); }
    else if (b.phase === 'fight') { hover(g, b, dt, 1.2); fight(g, b, dt); }
    else if (b.phase === 'breakup') { hover(g, b, dt, 0.4); breakup(g, b); }
    else if (b.phase === 'core') core(g, b, dt);
    else if (b.phase === 'dawn' && b.t >= B.dawnTime) setPhase(b, 'overtime');
  },

  // Things the jet's weapons can hit right now.
  parts(g) {
    const b = g.boss;
    if (!b) return [];
    if (b.phase === 'fight') return [...b.turrets.filter((t) => !t.dead), b.hull];
    if (b.phase === 'core' && !b.core.dead) return [b.core];
    return [];
  },

  // Does point q (with padding) touch boss part pt? The hull is an ellipse.
  touches: inside,

  damage(g, q, amount) {
    if (q.dead) return;
    q.hp -= amount;
    q.flash = 0.06;
    if (q.hp > 0) return;
    q.dead = true;
    const pts = g.addScore(B.points[q.kind]);
    g.floaters.push({ x: q.x, y: q.y - 20, text: `+${pts}`, life: 1.5 });
    g.burst(q.x, q.y, '#ffb703', q.kind === 'turret' ? 24 : 60);
    g.burst(q.x, q.y, NEON.magenta, q.kind === 'turret' ? 12 : 40);
    g.events.push('boom', 'kill');
    if (q.kind === 'turret') g.dropCrate(q.x, q.y + 40);
    if (q.kind === 'hull') { setPhase(g.boss, 'breakup'); g.events.push('bossDown'); }
    if (q.kind === 'core') dawn(g);
  },

  // Normal drone spawns are cut back while the boss fights, and paused at sunrise.
  spawnScale(g) {
    const ph = g.boss?.phase;
    if (!ph || ph === 'overtime') return 1;
    return ph === 'dawn' ? 0 : B.spawnScale;
  },

  // 0 = deep night, 1 = full sunrise. Drives the sky colour in main.js.
  daylight(g) {
    const b = g.boss;
    if (!b) return 0.3 * Math.max(0, Math.min(1, (g.time - (B.at - B.skyFrom)) / B.skyFrom));
    if (b.phase === 'dawn') return 0.3 + 0.7 * Math.min(1, b.t / 4);
    return b.phase === 'overtime' ? 1 : 0.3;
  },

  // Testing: jump forward to the next boss phase.
  skipPhase(g) {
    const b = g.boss;
    if (!b) return;
    if (b.phase === 'warning') setPhase(b, 'fight');
    else if (b.phase === 'fight') Boss.damage(g, b.hull, b.hull.hp);
    else if (b.phase === 'breakup') b.t = 99;
    else if (b.phase === 'core') Boss.damage(g, b.core, b.core.hp);
  },

  draw(ctx, g) {
    const b = g.boss;
    if (!b) return;
    if (['warning', 'fight', 'breakup'].includes(b.phase)) drawMothership(ctx, g, b);
    if (b.phase === 'core') drawCore(ctx, g, b.core);
  },

  drawUi(ctx, g) {
    const b = g.boss;
    if (!b) return;
    if (b.phase === 'warning' || (b.phase === 'core' && b.t < 2.5)) {
      ctx.save();
      ctx.fillStyle = `rgba(255,42,109,${(0.12 + 0.08 * Math.sin(b.t * 12)).toFixed(3)})`;
      ctx.fillRect(0, H / 2 - 70, W, 120);
      if (Math.floor(b.t * 4) % 2 === 0) chrome(ctx, '⚠ WARNING ⚠', W / 2, H / 2 - 30, 54);
      neon(ctx, b.phase === 'warning' ? 'MOTHERSHIP INBOUND · HOLD ON UNTIL DAWN' : 'THE AI CORE BREAKS LOOSE!', W / 2, H / 2 + 26, 18, NEON.yellow);
      ctx.restore();
    }
    if (b.phase === 'fight' || b.phase === 'warning') bar(ctx, 'MOTHERSHIP', b.hull.hp / b.hull.maxHp, NEON.magenta);
    if (b.phase === 'core') bar(ctx, 'AI CORE', b.core.hp / b.core.maxHp, NEON.cyan);
    if (b.phase === 'dawn') {
      const a = Math.min(1, b.t * 2) * Math.min(1, (B.dawnTime - b.t) * 1.5);
      ctx.save();
      ctx.globalAlpha = Math.max(0, a);
      chrome(ctx, 'DAWN BREAKS!', W / 2, H / 2 - 60, 64);
      neon(ctx, `NIGHT CLEARED  ·  +${b.bonus} DAWN BONUS`, W / 2, H / 2, 20, '#fff');
      neon(ctx, `OVERTIME: ALL POINTS x${B.overtimeMult}`, W / 2, H / 2 + 34, 18, NEON.yellow);
      ctx.restore();
    }
    if (b.phase === 'overtime') {
      neon(ctx, `OVERTIME x${B.overtimeMult}`, W - 70, 66, 14, NEON.yellow);
    }
  },
};
