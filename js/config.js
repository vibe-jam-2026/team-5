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
  basicShareStart: 0.6,          // chance a spawn is a plain villager at the start...
  basicShareEnd: 0.2,            // ...falling to this...
  basicShareSeconds: 300,        // ...over this many seconds
  maxEnemies: 400,

  // XP needed for next level = xpBase + (level - 1) * xpPerLevel
  xpBase: 3,
  xpPerLevel: 3,
};
