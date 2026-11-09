// Tunables in one place. Change these freely while balancing the game.
export const CONFIG = {
  width: 960,
  height: 540,
  title: 'BLOOD DIARY',          // working title, see design/game.md
  subtitle: 'survive the night',
  highscoreCount: 10,
  highscoreKey: 'team5.highscores.v2',

  // Player
  playerSpeed: 190,
  playerMaxHp: 100,
  magnetRange: 90,               // blood drops fly to you inside this range

  // Aircraft picked before each round. Stats multiply the player values above
  // (speed x playerSpeed, health x playerMaxHp) and all weapon damage.
  aircraft: [
    { id: 'interceptor', name: 'Interceptor', desc: 'Fast but fragile',
      speed: 1.3, health: 0.7, damage: 0.9, body: '#c9d2e3', wing: '#4cc9f0', size: 0.9 },
    { id: 'striker', name: 'Striker', desc: 'All-rounder',
      speed: 1.0, health: 1.0, damage: 1.0, body: '#a7b0c2', wing: '#6b7488', size: 1.0 },
    { id: 'gunship', name: 'Gunship', desc: 'Slow, tough, hits hard',
      speed: 0.75, health: 1.5, damage: 1.35, body: '#b8a27a', wing: '#6b5a3a', size: 1.2 },
  ],

  // Scoring
  survivalPointsPerSecond: 5,
  killPoints: 10,                // x enemy xp value x streak multiplier
  streakWindow: 1.5,             // seconds between kills to keep the streak
  killsPerMultiplier: 10,        // +1 multiplier per this many streak kills
  maxMultiplier: 8,

  // Spawning: hunters per second = spawnBase + seconds / spawnRamp
  spawnBase: 1.0,
  spawnRamp: 25,
  hpScaleSeconds: 120,           // hunter health +100% every this many seconds
  maxEnemies: 400,

  // XP needed for next level = xpBase + (level - 1) * xpPerLevel
  xpBase: 3,
  xpPerLevel: 3,
};
