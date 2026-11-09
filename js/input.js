// Keyboard input: held keys plus "pressed this frame" edge detection.
const down = new Set();
const pressed = new Set();

addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (!down.has(e.code)) {
    pressed.add(e.code);
    if (e.shiftKey) pressed.add('Shift+' + e.code);   // e.g. 'Shift+KeyB' for test shortcuts
  }
  down.add(e.code);
  typed.push(e.key);
});
addEventListener('keyup', (e) => down.delete(e.code));
addEventListener('blur', () => down.clear());

// Raw typed characters, used for name entry.
const typed = [];

export const input = {
  isDown: (...codes) => codes.some((c) => down.has(c)),
  wasPressed: (...codes) => codes.some((c) => pressed.has(c)),
  takeTyped: () => typed.splice(0),
  // Movement axis in [-1, 1] from arrows or WASD.
  axis() {
    const x = (this.isDown('ArrowRight', 'KeyD') ? 1 : 0) - (this.isDown('ArrowLeft', 'KeyA') ? 1 : 0);
    const y = (this.isDown('ArrowDown', 'KeyS') ? 1 : 0) - (this.isDown('ArrowUp', 'KeyW') ? 1 : 0);
    const len = Math.hypot(x, y) || 1;
    return { x: x / len, y: y / len };
  },
  endFrame() { pressed.clear(); typed.length = 0; },
};
