// Tunables in one place. Change these freely while balancing the game.
export const CONFIG = {
  width: 960,
  height: 540,
  title: 'NIGHT ACE', // shown on the start screen
  subtitle: 'a neon sortie',
  highscoreCount: 10,
  highscoreKey: 'team5.highscores.v2',
  deathQuotes: 'war',            // quote set on the game-over screen: 'war' | 'pilot' | 'doc' | 'mix' (Q cycles in game)

  // Player
  playerSpeed: 190,
  playerMaxHp: 100,
  lowHpWarning: 0.3,             // red pulse round the screen edges below this share of max HP
  magnetRange: 90,               // SSD cards fly to you inside this range
  crashHeight: 40,               // flying lower than this above the ground crashes into the trees
  pullUpWarning: 90,
  maxAltitude: 990,              // the jet can't climb higher than this above the ground
  ceilingWarning: 90,            // "MAX ALTITUDE" shows when this close to the ceiling
  stallDuration: 1.8,            // touching the ceiling stalls the jet for this many seconds
  stallSink: 170,                // top sinking speed (px/s) during a stall; it builds up slowly
  stallControl: 0.35,            // share of normal steering left while stalled (can't climb)

  // Aircraft picked before each round. Stats are 0..1 (shown as %, 100% max)
  // and multiply playerSpeed, playerMaxHp and all weapon damage.
  // `gun` is the aircraft's own cannon: seconds between shots, damage per
  // shell, shell speed, shells that pass through extra targets, shell size.
  aircraft: [
    { id: 'interceptor', name: 'Interceptor', desc: 'Fast but fragile',
      speed: 1.0, health: 0.6, damage: 0.7, body: '#c9d2e3', wing: '#4cc9f0', size: 0.9,
      gun: { name: 'Twin Vulcan', desc: 'Rapid twin guns', interval: 0.28, dmg: 6, speed: 660, pierce: 0, size: 2, twin: true, color: '#4cc9f0' } },
    { id: 'striker', name: 'Striker', desc: 'All-rounder',
      speed: 0.85, health: 0.85, damage: 0.85, body: '#a7b0c2', wing: '#6b7488', size: 1.0,
      gun: { name: 'Guns, Guns, Guns', desc: 'Cannon at nearest threat', interval: 0.55, dmg: 11, speed: 480, pierce: 0, size: 3, color: '#ffb703' } },
    { id: 'gunship', name: 'Gunship', desc: 'Slow, tough, hits hard',
      speed: 0.65, health: 1.0, damage: 1.0, body: '#b8a27a', wing: '#6b5a3a', size: 1.2,
      gun: { name: 'Heavy Cannon', desc: 'Big shells punch through', interval: 1.0, dmg: 26, speed: 380, pierce: 1, size: 6, color: '#ff4d6d' } },
  ],

  // Scoring
  survivalPointsPerSecond: 5,
  killPoints: 10,                // x enemy xp value x streak multiplier
  streakWindow: 1.5,             // seconds between kills to keep the streak
  killsPerMultiplier: 10,        // +1 multiplier per this many streak kills
  maxMultiplier: 8,

  // Difficulty. Everything ramps with time survived (t, in seconds).
  // Spawning: hunters per second = spawnBase + t / spawnRamp + (t / spawnCurve)^2
  spawnBase: 1.6,
  spawnRamp: 20,
  spawnCurve: 100,               // quadratic term: the swarm keeps accelerating
  hpScaleSeconds: 80,            // hunter health +100% every this many seconds
  speedScaleSeconds: 300,        // hunter speed +100% every this many seconds...
  maxSpeedScale: 1.5,            // ...capped so you can still outrun them
  dpsScaleSeconds: 150,          // hunter contact damage +100% every this many seconds
  basicShareStart: 0.6,          // chance a spawn is a plain quadcopter drone at the start...
  basicShareEnd: 0.2,            // ...falling to this...
  basicShareSeconds: 300,        // ...over this many seconds
  maxEnemies: 400,

  // XP needed for next level = xpBase + (level - 1) * xpPerLevel
  xpBase: 3,
  xpPerLevel: 3,

  // Armed drones. Hexacopters always shoot; some quadcopters carry a gun too.
  // Darts are kamikaze drones and never shoot.
  armedQuadFrom: 45,             // seconds into the night before armed quads appear
  armedQuadShare: 0.25,          // share of quad spawns that carry a gun after that
  droneBulletSpeed: 170,
  droneRange: 380,               // drones only fire when on screen and this close
  droneWarn: 0.45,               // seconds of red glow before a drone fires
  droneGuns: {
    quad:  { interval: 2.8, damage: 6, shots: 1, spread: 0 },
    heavy: { interval: 3.4, damage: 8, shots: 3, spread: 0.22 },
  },

  // Anti-aircraft guns hidden in the forest at the bottom of the screen
  aaFrom: 20,                    // seconds into the night before they open fire
  aaInterval: 3.2,               // seconds between shots per gun at the start...
  aaMinInterval: 1.3,            // ...shrinking to this as the night goes on
  aaShellSpeed: 300,
  aaDamage: 14,                  // flak burst damage to the jet
  aaBlast: 34,                   // flak burst radius (also hurts hunters!)
  aaHp: 60,                      // cannon tracers can destroy a gun
  aaPoints: 250,

  // Power-ups: glowing crates that grant a special weapon for a short time.
  powerupChance: 0.0162,         // drop chance per drone kill...
  powerupChanceHeavy: 0.1296,    // ...per hexacopter kill
  powerupFromGun: 1 / 3,          // ...per destroyed anti-aircraft gun
  powerupLife: 14,               // seconds a crate stays before it fades
  powerupDuration: 6,            // seconds the special weapon lasts
  powerupFromLevel: 10,          // no crates drop before the player reaches this level

  // Big red button: a trap card that sometimes sneaks into the level-up
  // choices. Picking it ends the night on the spot.
  redButtonFromLevel: 3,         // first level-up it can appear on
  redButtonChance: 0.5,          // chance per level-up after that
  ejectDuration: 7,
  // Flares (F or Space): a salvo of smoking flares shot out behind the jet; nothing hurts you for a moment.
  flareShield: 2,                // seconds of protection
  flareCooldown: 60,             // seconds before flares can be used again
  flareSpeedBoost: 2,            // speed multiplier while the flares cover you (flames shoot out behind)
            // seconds of the pilot-ejecting animation before game over (ENTER skips)

  // Soundtrack: which of the three tracks plays when (in-game clock hours).
  // "Neon Sunset" from 6 PM, "Midnight Drive" from midnight, and
  // "Dawn Strike" from bossMusicHour through the boss fight.
  music: {
    midnightHour: 0,             // 12:00 AM (2:30 into the run). Shift+M jumps to just before it.
    bossMusicHour: 4.5,          // 4:30 AM, ~40 s before the Mothership
  },

  // Final boss, just before sunrise: the Mothership, then its AI core.
  // Beat the core and dawn breaks: big bonus, full heal, then Overtime.
  // Testing: Shift+B jumps to the boss, Shift+M to just before midnight, Shift+N skips the current boss phase,
  // or open the page with ?boss to start every run at the boss. Test runs
  // aren't saved to the high scores.
  boss: {
    at: 300,                     // seconds into the run when the Mothership arrives. The in-game
                                 // clock maps 6 PM (start) to 6 AM (boss) over this time.
    warnTime: 3.5,               // seconds of WARNING banner while it descends
    spawnScale: 0.2,             // normal drone spawns are cut to this during the fight
    hullHp: 22000,
    turretHp: 1500,
    coreHp: 9000,
    contactDps: 40,              // touching the Mothership hull
    bulletSpeed: 190,
    bulletDamage: 7,
    turretEvery: 2.4,            // seconds between each turret's 3-shot bursts
    barrageEvery: 7,             // seconds between rings of bullets from the hull
    ringBullets: 18,
    launchEvery: 8,              // seconds between drone launches from the hangar
    launchCount: 5,
    coreOrbit: 200,              // the core circles the jet at this distance...
    coreFireEvery: 0.14,         // ...spraying a bullet spiral...
    coreBulletSpeed: 160,
    coreDashEvery: 3.2,          // ...and every so often charges straight at it
    coreDashSpeed: 560,
    coreContact: 20,             // damage when the core rams you
    points: { turret: 2000, hull: 15000, core: 20000 },
    dawnBonus: 25000,            // for clearing the night...
    dawnHpBonus: 25000,          // ...plus up to this much for health left
    dawnTime: 6,                 // seconds of sunrise celebration (no spawns)
    overtimeMult: 2,             // all points are worth this much more after dawn
  },
};
