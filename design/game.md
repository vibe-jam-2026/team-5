# Our game

This is the team's description of the game. Claude reads it before working on the game, so keep it current: when you change your minds, change it here first. Claude also updates it whenever a feature is added or changed.

## Pitch

**Night Ace**: a neon sortie. A survivors-like arcade game in an 80s synthwave style: you fly a fighter jet through the night while swarms of drones close in from every side and anti-aircraft guns fire up from the forest. Your weapons fire on their own; you just fly, collect pickups and choose upgrades. Hold out until just before sunrise, beat the Mothership and its AI core, and dawn breaks. Then keep going in Overtime for the high score.

Genre inspiration: "survivors-likes" / "bullet heaven" (e.g. Vampire Survivors). We use the genre's mechanics, with our own theme, art and names. The 80s jet-movie mood is fine, but we don't copy any existing game or film (no real names, characters or logos).

## How to play

- Pick one of three aircraft before each round: Interceptor (fast, fragile), Striker (all-rounder) or Gunship (slow, tough, hits hard).
- Drones swarm towards you: quadcopters, fast kamikaze darts and armoured hexacopters. Some drones carry guns and fire at you (they glow red first).
- Anti-aircraft guns in the forest at the bottom of the screen fire flak at the jet. Your cannon can destroy them. Flying into the trees is a crash (game over); "PULL UP!" warns you. When you crash, the jet explodes in the trees and the pilot ejects out of the fireball and floats down under the parachute (the same zoomed-in ejection scene as the Big Red Button, ENTER skips; in all ejections the jet's afterburner trail fades out instead of staying in the sky), then the game-over screen says "CRASHED INTO THE TREES".
- Weapons fire automatically. Downed drones drop SSD cards (XP). Each level-up you pick 1 of 3 upgrades: new weapons or stronger ones. Trap: from level 3, each level-up has a 50% chance that one card is a **Big Red Button** ("Do not press"). Picking it ends the run: "EJECT! EJECT! EJECT!" flashes, the canopy blows off, the pilot rockets out on the ejection seat and floats down under a synthwave parachute (striped like the sunset sun, with a neon glow) while the empty jet spirals down and explodes. The camera zooms in to follow it. After about 7 seconds (ENTER skips) comes the high-score name entry / game-over screen ("YOU PRESSED THE BIG RED BUTTON"). Tunable in `js/config.js` (`redButtonFromLevel`, `redButtonChance`, `ejectDuration`). Once every upgrade is maxed, if the Big Red Button is the only card left, an **Autopilot** card appears next to it ("No more upgrades. Just fight until the Mothership."): picking it skips all level-up screens until the boss arrives.
- The jet only moves while you hold WASD or the arrow keys; let go and it hovers in place. It can't climb more than 900 px above the ground ("MAX ALTITUDE" warns you).
- **Flares** (F or Space): the jet fires a salvo of burning flares that shoot out backwards in pairs, trailing smoke, and for 2 seconds nothing hurts you (drones, bullets, flak, the boss). While it lasts, the jet flies at double speed with flames blasting out of its tail, and its contours glow blue (flickering just before it ends). It can only be used once a minute; the FL bar under XP shows the time left, the cooldown, or READY. Crashing into the trees still ends the run. Tunable in `js/config.js` (`flareShield`, `flareCooldown`, `flareSpeedBoost`).
- **Voice command:** say **"flares"** to fire flares (same cooldown). The microphone turns on by itself when a run starts (the browser asks for permission the first time); V turns it off or on again, and once you switch it off it stays off for later runs until you press V again. The mic status shows bottom right. On the live site it uses the browser's speech recognition (best in Chrome or Edge; browsers without it show "no voice in this browser"); on claude.ai test pages it uses the page's dictation. Code in `js/voice.js`.
- From level 10, power-up crates sometimes drop and give a special weapon for 6 seconds: Scatter Cannon, Pulse Laser or Rocket Swarm.
- Health at 0 ends the run: the jet is shot down and catches fire, the pilot ejects right away and parachutes down while the burning jet spirals into the forest and explodes (the same zoomed-in ejection scene, ENTER skips), then the game-over screen says "SHOT DOWN". The longer you survive, the more and tougher the drones.
- **Death quotes:** every time you go down, the name-entry and game-over screens show a short quote. There are three sets: **War books** (Sun Tzu, Clausewitz, Moltke, Wellington, Churchill, Wilfred Owen and others), **Pilot sayings** (old aviation folklore) and **Documentary** (our own lines in the voice of an 80s war-documentary narrator; some only appear for a crash, the Big Red Button, being shot down or dying in Overtime). Q on the game-over screen switches to the next set (War books → Pilot sayings → Documentary → Mix) and shows a new quote. The default set is `deathQuotes` in `js/config.js` (currently War books); the quotes are in `js/quotes.js`. Only public-domain texts, folk sayings and our own lines, no quotes from modern copyrighted books or documentaries.
- Score comes from kills (with a kill-streak multiplier), destroyed guns, pickups and survival time.

## The final boss: survive until dawn

Every run builds towards a climax just before sunrise.

An in-game clock under the score maps the run to one night: **6:00 PM at the start, 6:00 AM when the boss arrives at 5:00 of play** (12 in-game hours in 5 minutes; `CONFIG.boss.at`).

1. **Sunset to night (6 PM):** each run starts at sunset. The striped neon sun sinks behind the forest, the sky fades to deep night by about 8:30 PM, and the stars come out. The moon is the sun's night twin, striped in the same synthwave style but in white, lavender and cyan. It rises from the forest on the left at about 6:45 PM, arcs across the night and sets on the right around 5:30 AM, where the sun will later rise. Its lit side always faces the sun.
2. **Twilight (4:30–6 AM):** the night sky starts to glow with twilight.
3. **WARNING (6:00 AM):** at 5:00 of play a flashing warning banner and siren appear, and the **Mothership** descends: the hive carrier the drones have been coming from all night. Normal drone spawns drop to a trickle.
4. **Mothership fight:** it hovers near the top of the screen and drifts over the jet.
   - Four turrets fire aimed 3-shot bursts (red glow first). Shooting them off earns points and drops a power-up crate.
   - Its core eye charges up, then fires a ring of bullets (two rings once it's below half health).
   - The hangar launches waves of drones.
   - Ramming the hull hurts.
5. **"Final final" boss:** when the hull breaks, it explodes in a chain, and the glowing **AI core** breaks loose. The core circles the jet spraying a bullet spiral, and every few seconds it charges straight at you (a red dashed line shows where).
6. **Dawn breaks:** the clock holds at 6:00 AM (blinking) until the boss is beaten. Beating the core shoots down every drone in the sky, the striped sun rises again on the other side of the sky, and you get a big **Dawn Bonus** (more for health left) plus a full heal.
7. **Overtime:** the run continues with all points worth x2 until you go down. The clock runs on: full daylight by about 8:30 AM, and sunset again at 6 PM. The game-over screen says "NIGHT CLEARED".

Losing during the boss keeps everything you scored before it. All boss numbers (arrival time, health, attack rates, bonuses) are in `CONFIG.boss` in `js/config.js`.

### Testing shortcuts

- **Shift+M** during a run jumps to just before midnight (2:28 of play), so you hear the switch to the Midnight Drive music. Gives a level 8 loadout.
- **Shift+B** during a run jumps straight to the boss with a mid-game loadout (level 15 weapons).
- **Shift+I** toggles invisibility: the jet turns see-through and nothing can hurt it (drones, bullets, flak, the boss). Flying into the trees still crashes. Press again to turn it off.
- **Shift+N** skips the current boss phase (warning → fight → breakup → core → dawn).
- Opening the page with **`?boss`** at the end of the address starts every run at the boss.
- Runs that use any of these show "TEST RUN" and are not saved to the high scores.

## Controls

- Arrow keys or WASD: fly
- F or Space: flares (2 s of cover and double speed, once a minute)
- V: microphone on/off (it turns on by itself when a run starts); say "flares" to fire flares
- 1 / 2 / 3, or arrows + Enter: pick an upgrade or aircraft
- Esc: pause and resume · M: mute · Enter: fly again after game over · Q on the game-over screen: next quote set

## Core loop

Fly to dodge the swarm → weapons shoot drones down → collect pickups → level up → choose an upgrade → swarm gets bigger → the Mothership arrives before sunrise → beat it for dawn → Overtime until you fall. Then try again for a better score.

## Look and sound

- 80s neon synthwave: a neon sky that goes from sunset (striped sun on the horizon) to deep purple night with stars, and back to sunrise at dawn; neon magenta, cyan and yellow, chrome titles, a pine-forest silhouette along the bottom.
- Title and aircraft screens: striped synthwave sun and a neon perspective grid.
- In-game scene in the same neon style as the menus: a dense twinkling star field with sparkles and the odd shooting star, long cloud streaks lit by the sun (pink at dusk, moonlit lavender at night, white by day), neon wireframe mountains on the horizon, and faint sky dust that drifts past as you fly.
- Forest: three rows of pines (misty far row, middle row, black near row) rim-lit by the sun or moon, drifting ground mist and fireflies at night.
- AA trucks: dark hulls with magenta neon trim, a glowing cab, headlights, a cyan-lit radar panel and a searchlight that sweeps the night sky, follows the jet and turns red just before the gun fires. Flak is glowing tracers that burst into a flash, a neon shock ring and dark smoke.
- Jets: shaded metal with a neon leading edge in each aircraft's colour (Interceptor cyan, Striker magenta, Gunship yellow), panel lines, a glass canopy, wing missiles or gun pods and blinking wing-tip lights. On the aircraft screen the model banks from side to side over its shadow with a hologram scan.
- Ejection: a detailed seat with a neon rocket flame and smoke trail, the pilot in a harness and a white helmet with a mirrored sunset visor, and the jet blowing up in a fireball with a neon shockwave.
- Sound effects are synth tones generated in the browser. Music: three very cheesy 80s neon tracks, also generated in the browser, that crossfade (with a noise whoosh) as the night goes on:
  - **Neon Sunset** (title, start of the run at 6 PM, and daytime after dawn): laid-back synthwave with octave-bouncing bass, gated snare, lush pad, sparkly arp and a vibrato lead.
  - **Midnight Drive** (from 12:00 AM): darker and faster, four-on-the-floor, rolling bass, a rolling arp and brass stabs.
  - **Dawn Strike** (from 4:30 AM, about 40 s before the Mothership, through the whole boss fight): power chords, orchestra hits, a heroic lead and a key change up.
  - Switch times are in `CONFIG.music` in `js/config.js`.

## Scope for the jam

**Done:**

- Endless scrolling sky with the jet centred; drones chase from all sides
- Three aircraft to choose from
- Auto-firing weapons and upgrades (Guns Guns Guns, Fox Two missiles, Danger Zone, Weapons Hot, Afterburner, Wingman, Radar Lock)
- Three drone types, armed drones, anti-aircraft guns in the forest, crashing into the trees
- Power-up crates with timed special weapons
- Health, game over, score with kill-streak multiplier, local top-10 high scores with initials
- Music (three tracks that change with the time of night) and sound effects
- Final boss before dawn (Mothership → AI core → dawn bonus → Overtime)
- Day cycle sky tied to an in-game clock: 6 PM sunset at the start, night with moon and stars, twilight at the 6 AM boss, sunrise after the boss, then day and sunset again in Overtime
- Big red button trap card in the level-up choices
- Flares: 2 seconds of cover on F/Space, once a minute
- A war/pilot/documentary quote on the game-over screen each death

**Nice to have:** only if there's time.

- More weapons and drone types, mini-bosses earlier in the night
- Debrief-style game-over screen with more stats
- Nicer graphics

**Out of scope:** things we've decided not to do.

- Online high-score list (no backend)
- Meta progression between runs, shops, saves
- Mobile/touch controls

## Tech

Plain HTML, JavaScript modules and canvas. No libraries, no build step. Gameplay is in `js/game.js`, the final boss in `js/boss.js`, tunables in `js/config.js`, menus/HUD/high scores in `js/main.js`, death quotes in `js/quotes.js`, sound and music in `js/audio.js`, voice commands in `js/voice.js`.

## Decisions and changes

- 2026-11-09: Arcade, high-score focused, survivors-like genre. Started with a vampire theme ("Blood Diary").
- 2026-11-09: Camera follows the player, who stays centred while the world scrolls. Enemies spawn just off-screen and always chase.
- 2026-11-09: Theme changed to an 80s neon night sortie, "Midnight Afterburner": fighter jet, drones, anti-aircraft guns, forest you can crash into, aircraft selection, power-ups, 80s music.
- 2026-11-09: New requirement: a final final boss. To fit the endless genre, it's a timed climax just before sunrise (Mothership, then its AI core). Beating it gives a dawn bonus and Overtime at double points, so the high-score chase continues. Test shortcuts: Shift+B, Shift+N, `?boss`.
- 2026-11-09: The in-game sky became a neon sunset (from main). Merged with the dawn concept: runs start at sunset, the sun sinks into night, and it rises again on the other side when the boss is beaten.
- 2026-11-09 (from main): the jet always flies forward and you steer it, with a max altitude; power-ups last 6 s and only drop from level 10; big red button trap card added to the level-ups.
- 2026-11-09: Back to direct WASD/arrow flight: the jet only moves while a key is held (no more always flying forward).
- 2026-11-09: Merged the teammate's day cycle (moon, sunrise and blue daytime sky) with the boss: an in-game clock runs 6 PM → 6 AM over the 5 minutes before the boss, holds at 6 AM during the fight, and the sun rises when the boss is beaten. The boss now arrives at 5:00 instead of 6:00.
- 2026-11-09 (from main): the Big Red Button shows up more often (50% of level-ups from level 3); the end screen title is now GAME OVER with the reason underneath.
- 2026-11-09: Redesigned the moon to match the sun: a striped neon moon with a cyan glow that rises after sunset, arcs over the night and sets before dawn, with its lit side turned toward the sun.
- 2026-11-09: Cleaned up the keys: only Esc pauses (P no longer does) and only Enter flies again after game over (R and Space no longer do).
- 2026-11-09: Pressing the Big Red Button now plays a pilot-ejection animation (canopy off, seat rocket, parachute, jet explodes) before the high-score name entry and game-over screen.
- 2026-11-09: The ejection animation is bigger, slower (about 7 s) and zoomed in, with the camera following the pilot.
- 2026-11-09: Crashing into the ground now also plays the ejection: the jet explodes on impact and the pilot rockets out and parachutes down before game over.
- 2026-11-09: Added flares (F or Space): a 3 s shield that blocks all damage and burns up enemy bullets, usable once every 60 s. The streak counter moved down a little to make room for the flare bar.
- 2026-11-09: Flares tweaked: no blue shield circle, protection lasts 2 s instead of 3 s, and the flares now fly out backwards trailing smoke.
- 2026-11-09: The jet's outline glows blue while the flare protection is active.
- 2026-11-09: Running out of health now also plays the ejection: the burning jet is abandoned, the pilot parachutes down, then game over.
- 2026-11-09: The single jet-rock music loop became three cheesy 80s neon tracks that crossfade: Neon Sunset at the start, Midnight Drive from midnight, and Dawn Strike from 4:30 AM through the boss.
- 2026-11-09: Added a Shift+M test shortcut that jumps to just before midnight to hear the Midnight Drive music. Plain M still mutes.
- 2026-11-09: The ejection parachute (big red button, crash and shot down) now matches the synthwave theme: a sunset-gradient dome with sun slats, a glowing magenta rim and cyan lines.
- 2026-11-10: During the 2 s flare cover the jet also flies at double speed, with flames shooting out behind it.
- 2026-11-10: Made the game screen look more advanced and match the menus: neon sky (stars, clouds, wireframe mountains), layered rim-lit forest with mist and fireflies, neon AA trucks with searchlights, glowing flak, detailed jets (also on the aircraft screen, which now banks the model with a hologram scan) and a more detailed ejection with a fireball and shockwave. Gameplay is unchanged.
- 2026-11-10: Fixed the start-screen layout: the last briefing line no longer runs into FLIGHT CONTROLS, the "(after you go down)" note no longer overlaps the Enter key, and every control row fits inside its panel.
- 2026-11-10: Shortened the start-screen mission briefing from eight lines to four (swarm and auto-fire, level up, AA flak, beat the Mothership by sunrise), with more room between the controls.
- 2026-11-10: Renamed the game from Midnight Afterburner to the shorter **Night Ace** (start screen logo, page title), with the subtitle "a neon sortie".
- 2026-11-10: The start-screen prompt now reads "PRESS ENTER TO START" (Enter still opens the aircraft screen).
- 2026-11-10: Added a Shift+I developer shortcut that makes the jet invisible and immune to damage, for easier testing (marks the run as TEST RUN).
- 2026-11-10: Every death now shows a short quote on the name-entry and game-over screens. Three sets to compare (War books, Pilot sayings, Documentary narrator, plus Mix); Q cycles them. Default is War books until the team picks one.
- 2026-11-10: During the ejection scene the jet's afterburner trail fades away right after the pilot ejects. It used to hang frozen in the sky until the end of the scene.
- 2026-11-10: Voice command: press V to turn on the mic, then say "flares" to fire flares.
- 2026-11-10: The microphone turns on automatically when a run starts (V still switches it off).
- 2026-11-10: When the Big Red Button is the only level-up card left (everything maxed), an Autopilot card is offered next to it: no more upgrade screens until the boss.
