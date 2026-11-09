# team-5

Vibe Jam 2026 – lag 5. Team 5's repo for the Claude Code exercise at Saab, 9–10 November 2026.

- **Live site:** <https://vibe-jam-2026.github.io/team-5/>
- **Exercise instructions:** <https://vibe-jam-2026.github.io/team-5/instructions.html>
- **Build at:** <https://claude.ai/code>

## How publishing works

1. Claude pushes its work to a branch of its own.
2. Ask Claude to open a pull request, then click **Merge** on github.com so the change lands in `main`.
3. The [Publish workflow](.github/workflows/publish.yml) deploys `main` to GitHub Pages on every push. The new version is live about a minute later. If a newer push arrives while a deploy is still running, the older one is cancelled.

The site is served as static files, so everything the browser needs (HTML, JavaScript, CSS, images, sound) must be committed to the repo.

## Repo layout

| Path | What it is |
| --- | --- |
| `index.html` | The site's start page. It's a copy of the instructions for now; replace it with what the team builds. |
| `instructions.html` | The exercise instructions. Keep this file so they stay reachable. |
| `.github/workflows/publish.yml` | Deploys the site to GitHub Pages on every push to `main`. |

## Using a build tool

If you build with a tool such as Vite, commit the finished output either at the top of the repo or in `docs/`. The workflow publishes `docs/` only when there's no `index.html` at the top. Use relative paths, because the site is served under `/team-5/`.

## Running locally

No build step is needed. Serve the folder and open <http://localhost:8000>:

```bash
python3 -m http.server 8000
```

## Questions

Ask Adrian during the exercise.
