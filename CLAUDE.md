# Team 5 game jam

We're a team building a web game in a few hours.

## Game context

- Before working on the game, read `design/game.md`. It's the team's description of the game and the source of truth for what to build.
- If a request conflicts with `design/game.md`, point out the conflict and ask which one wins.
- Edit `design/game.md` only when asked to.
- Build the "Must have" list first. Get something playable early, then add to it.

## Constraints

- The site is static files served by GitHub Pages under `/team-5/`. Use relative paths. There's no server or backend.
- The game starts from `index.html` at the top of the repo. Keep `instructions.html`.
- Load libraries from a CDN or commit them to the repo. If you use a build tool, commit the built output (see `README.md`).
- Keep the game working in a desktop browser.

## How the team works

- The team works only in the claude.ai/code web client. They can't install or run anything locally (no git clone, no local server).
- To test, the team plays the live GitHub Pages site. Don't suggest running things on their machines. To get changes live, open a pull request; the team merges it on github.com.

## Branch names

- Name each branch after what it does: short, lowercase, words joined by hyphens, e.g. `add-score`, `fix-jump`, `branch-naming`.
- No random or generated names (like `claude/admiring-euler-xobsbn`) and no `claude/` prefix. Keep it to two to four words.
- If the session assigns a generated branch name, create a short descriptive branch instead and push to that.
