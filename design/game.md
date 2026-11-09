# Our game

This is the team's description of the game. Claude reads it before working on the game, so keep it current: when you change your minds, change it here first. Claude also updates it whenever a feature is added or changed.

## Pitch

**Midnight Afterburner**: a neon night sortie. A survivors-like arcade game in an 80s synthwave style: you fly a fighter jet through the night while swarms of drones close in from every side and anti-aircraft guns fire up from the forest. Your weapons fire on their own; you just fly, collect pickups and choose upgrades. Hold out until just before sunrise, beat the Mothership and its AI core, and dawn breaks. Then keep going in Overtime for the high score.

Genre inspiration: "survivors-likes" / "bullet heaven" (e.g. Vampire Survivors). We use the genre's mechanics, with our own theme, art and names. The 80s jet-movie mood is fine, but we don't copy any existing game or film (no real names, characters or logos).

## How to play

- Pick one of three aircraft before each round: Interceptor (fast, fragile), Striker (all-rounder) or Gunship (slow, tough, hits hard).
- Drones swarm towards you: quadcopters, fast kamikaze darts and armoured hexacopters. Some drones carry guns and fire at you (they glow red first).
- Anti-aircraft guns in the forest at the bottom of the screen fire flak at the jet. Your cannon can destroy them. Flying into the trees is a crash (game over); "PULL UP!" warns you.
- Weapons fire automatically. Downed drones drop pickups (XP). Each level-up you pick 1 of 3 upgrades: new weapons or stronger ones. Watch out for the big red button trap card: picking it ends the run on the spot.
- The jet always flies forward at full speed; you steer it. It can't climb more than 900 px above the ground ("MAX ALTITUDE" warns you).
- From level 10, power-up crates sometimes drop and give a special weapon for 6 seconds: Scatter Cannon, Pulse Laser or Rocket Swarm.
- Health at 0 ends the run. The longer you survive, the more and tougher the drones.
- Score comes from kills (with a kill-streak multiplier), destroyed guns, pickups and survival time.

## The final boss: survive until dawn

Every run builds towards a climax just before sunrise.

1. **Sunset to night:** each run starts at sunset. The striped neon sun sinks behind the forest and the sky fades to deep night over the first ~50 seconds (`sunsetTime` in `js/config.js`) while the stars come out.
2. **Sky lightens:** in the last minute before the boss, the night sky starts to warm up.
3. **WARNING:** at 6:00 a flashing warning banner and siren appear, and the **Mothership** descends: the hive carrier the drones have been coming from all night. Normal drone spawns drop to a trickle.
4. **Mothership fight:** it hovers near the top of the screen and drifts over the jet.
   - Four turrets fire aimed 3-shot bursts (red glow first). Shooting them off earns points and drops a power-up crate.
   - Its core eye charges up, then fires a ring of bullets (two rings once it's below half health).
   - The hangar launches waves of drones.
   - Ramming the hull hurts.
5. **"Final final" boss:** when the hull breaks, it explodes in a chain, and the glowing **AI core** breaks loose. The core circles the jet spraying a bullet spiral, and every few seconds it charges straight at you (a red dashed line shows where).
6. **Dawn breaks:** beating the core shoots down every drone in the sky, the striped sun rises again on the other side of the sky, and you get a big **Dawn Bonus** (more for health left) plus a full heal.
7. **Overtime:** the run continues with all points worth x2 until you go down. The game-over screen says "NIGHT CLEARED".

Losing during the boss keeps everything you scored before it. All boss numbers (arrival time, health, attack rates, bonuses) are in `CONFIG.boss` in `js/config.js`.

### Testing the boss

- **Shift+B** during a run jumps straight to the boss with a mid-game loadout (level 15 weapons).
- **Shift+N** skips the current boss phase (warning → fight → breakup → core → dawn).
- Opening the page with **`?boss`** at the end of the address starts every run at the boss.
- Runs that use any of these show "TEST RUN" and are not saved to the high scores.

## Controls

- Arrow keys or WASD: steer
- 1 / 2 / 3, or arrows + Enter: pick an upgrade or aircraft
- P or Esc: pause · M: mute · R: fly again after game over

## Core loop

Fly to dodge the swarm → weapons shoot drones down → collect pickups → level up → choose an upgrade → swarm gets bigger → the Mothership arrives before sunrise → beat it for dawn → Overtime until you fall. Then try again for a better score.

## Look and sound

- 80s neon synthwave: a neon sky that goes from sunset (striped sun on the horizon) to deep purple night with stars, and back to sunrise at dawn; neon magenta, cyan and yellow, chrome titles, a pine-forest silhouette along the bottom.
- Title and aircraft screens: striped synthwave sun and a neon perspective grid.
- Sound effects are synth tones generated in the browser. Music: a driving 80s jet-rock track, also generated in the browser.

## Scope for the jam

**Done:**

- Endless scrolling sky with the jet centred; drones chase from all sides
- Three aircraft to choose from
- Auto-firing weapons and upgrades (Guns Guns Guns, Fox Two missiles, Danger Zone, Weapons Hot, Afterburner, Wingman, Radar Lock)
- Three drone types, armed drones, anti-aircraft guns in the forest, crashing into the trees
- Power-up crates with timed special weapons
- Health, game over, score with kill-streak multiplier, local top-10 high scores with initials
- Music and sound effects
- Final boss before dawn (Mothership → AI core → dawn bonus → Overtime)
- Day cycle sky: sunset at the start, night, pre-dawn glow, sunrise after the boss
- Big red button trap card in the level-up choices

**Nice to have:** only if there's time.

- More weapons and drone types, mini-bosses earlier in the night
- Debrief-style game-over screen with more stats
- Nicer graphics

**Out of scope:** things we've decided not to do.

- Online high-score list (no backend)
- Meta progression between runs, shops, saves
- Mobile/touch controls

## Tech

Plain HTML, JavaScript modules and canvas. No libraries, no build step. Gameplay is in `js/game.js`, the final boss in `js/boss.js`, tunables in `js/config.js`, menus/HUD/high scores in `js/main.js`, sound and music in `js/audio.js`.

## Decisions and changes

- 2026-11-09: Arcade, high-score focused, survivors-like genre. Started with a vampire theme ("Blood Diary").
- 2026-11-09: Camera follows the player, who stays centred while the world scrolls. Enemies spawn just off-screen and always chase.
- 2026-11-09: Theme changed to an 80s neon night sortie, "Midnight Afterburner": fighter jet, drones, anti-aircraft guns, forest you can crash into, aircraft selection, power-ups, 80s music.
- 2026-11-09: New requirement: a final final boss. To fit the endless genre, it's a timed climax just before sunrise (Mothership, then its AI core). Beating it gives a dawn bonus and Overtime at double points, so the high-score chase continues. Test shortcuts: Shift+B, Shift+N, `?boss`.
- 2026-11-09: The in-game sky became a neon sunset (from main). Merged with the dawn concept: runs start at sunset, the sun sinks into night, and it rises again on the other side when the boss is beaten.
- 2026-11-09 (from main): the jet always flies forward and you steer it, with a max altitude; power-ups last 6 s and only drop from level 10; big red button trap card added to the level-ups.
