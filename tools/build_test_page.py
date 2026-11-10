#!/usr/bin/env python3
"""Bundle the game into one self-contained HTML file for a claude.ai test page.

Usage: python3 tools/build_test_page.py OUTPUT.html [BRANCH-NAME]

Inlines every module in js/ (in dependency order) into a single <script>,
since a claude.ai artifact is one page. Run from the repo root.
"""
import os, re, sys

out = sys.argv[1]
branch = sys.argv[2] if len(sys.argv) > 2 else 'this branch'

# Module order matters: each file may only use modules listed before it.
MODS = [('config', 'CONFIG'), ('input', 'input'), ('voice', 'voice'), ('highscores', 'highscores'),
        ('audio', 'sfx'), ('boss', 'Boss'), ('game', 'Game'), ('main', None)]
known = {f'{m}.js' for m, _ in MODS}
extra = sorted(set(os.listdir('js')) - known)
if extra:
    sys.exit(f'New js files {extra}: add them to MODS in {__file__}')

parts = []
for f, name in MODS:
    src = open(f'js/{f}.js').read()
    aliases = ''.join(f'const {a} = {n};\n' for n, a in re.findall(r'import \{ *(\w+) as (\w+) *\}', src))
    src = '\n'.join(l for l in src.split('\n') if not l.startswith('import '))
    src = re.sub(r'^export ', '', src, flags=re.M)
    if name:
        parts.append(f'// ---- js/{f}.js\nconst {name} = (() => {{\n{aliases}{src}\nreturn {name};\n}})();')
    else:
        parts.append(f'// ---- js/{f}.js\n{{\n{aliases}{src}\n'
                     'canvas.addEventListener("pointerdown", () => canvas.focus());\n}')

head = f'''<title>Midnight Afterburner Test</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
:root {{ --bg: #050308; --ink: #8a8aa0; --canvas: #0a0610; color-scheme: dark; }}
html, body {{ height: 100%; background: var(--bg); color: var(--ink); font: 13px system-ui, sans-serif; }}
body {{ display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; overflow: hidden;
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); box-sizing: border-box; }}
canvas {{ display: block; background: var(--canvas); outline: none; max-width: 100%; max-height: calc(100% - 30px);
  aspect-ratio: 16 / 9; width: 100%; height: auto; }}
p {{ margin: 0; }}
</style>
<canvas id="game" width="960" height="540" tabindex="0"></canvas>
<p>Test build of the <code>{branch}</code> branch. Click the game first, then press Enter.</p>
'''
open(out, 'w').write(head + '<script type="module">\n' + '\n'.join(parts) + '\n</script>\n')
print('wrote', out)
