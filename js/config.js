// Tunables in one place. Change these freely while balancing the game.
export const CONFIG = {
  width: 960,
  height: 540,
  title: 'TEAM 5 ARCADE',      // TBD: replace once the theme is decided
  startLives: 3,
  invulnSeconds: 1.5,           // after being hit
  highscoreCount: 10,
  highscoreKey: 'team5.highscores.v1',
  // Score / combo
  pickupPoints: 100,
  comboWindow: 2.0,             // seconds to grab the next pickup before combo resets
  maxMultiplier: 8,
  survivalPointsPerSecond: 10,
  // Difficulty ramp: level goes up every `levelSeconds`
  levelSeconds: 15,
};
