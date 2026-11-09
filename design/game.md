# Our game

This is the team's description of the game. Claude reads it before working on the game, so keep it current: when you change your minds, change it here first.

## Pitch

**Blood Diary** (working title). A survivors-like arcade game: you are a vampire caught out at night while mobs of vampire hunters close in from every side. Your powers attack on their own; you just move, collect blood and choose upgrades. Every run is one night in your diary. How long can you last, and how high can you score?

Genre inspiration: "survivors-likes" / "bullet heaven" (e.g. Vampire Survivors). We use the genre's mechanics but our own theme, art and names. Don't copy any existing game or show: "The Vampire Diaries" is a TV series, so we don't use that name or its characters.

## How to play

- You are the vampire. Hunters (villagers with torches, fast hunters, tough priests) swarm towards you.
- Your powers attack automatically. Killed hunters drop blood drops (XP).
- Collect blood to level up. Each level-up you pick 1 of 3 random upgrades: new powers or stronger ones.
- Hunters touching you drain your health. Health at 0 ends the night (game over).
- The longer you survive, the more and tougher the hunters.
- Goal: highest score. Score comes from kills (with a kill-streak multiplier) and survival time.

## Controls

- Arrow keys or WASD: move
- 1 / 2 / 3, or arrows + Enter: pick an upgrade
- P or Esc: pause · M: mute · R: restart after game over

## Core loop

Move to dodge the swarm → powers kill hunters → collect blood → level up → choose an upgrade → swarm gets bigger → repeat until you fall. Then try again for a better diary entry.

## Look and sound

- Dark night palette: near-black purple background, blood red, pale moonlight accents. Simple shapes are fine.
- Short synth sound effects (generated in the browser).
- Music: TBD.

## Scope for the jam

**Must have:** the smallest version that's playable and fun.

- Vampire always in the centre of the screen, walking around an endless scrolling world; hunters always chase from all sides
- Auto-attacking powers: Blood Bolt (shoots nearest hunter), Bat Swarm (orbiting bats), Mist Aura (damage around you)
- Blood drops (XP), level-up with a choice of 3 upgrades
- Health bar, game over, score with kill-streak multiplier
- Local top-10 high scores ("the diary") with initials

**Nice to have:** only if there's time.

- More powers and hunter types, boss hunter every few minutes
- Dawn: surviving to a set time ends the night with a big bonus
- Diary-style game-over screen ("Night 12: lasted 4:32, drained 210 hunters")
- Nicer graphics (sprites), music

**Out of scope:** things we've decided not to do.

- Online high-score list (no backend)
- Meta progression between runs, shops, saves
- Mobile/touch controls

## Tech

Plain HTML, JavaScript modules and canvas. No libraries, no build step. Gameplay is in `js/game.js`, tunables in `js/config.js`, menus/high scores in `js/main.js`.

## Decisions and changes

- 2026-11-09: Arcade, high-score focused, survivors-like genre. Vampire theme with a diary framing; working title "Blood Diary" (not "The Vampire Diaries", which is an existing TV series).
- 2026-11-09: Camera follows the vampire, who stays centred while the world scrolls (like Vampire Survivors). Hunters spawn just off-screen and always chase.
