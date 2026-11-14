// Input: keyboard state, mouse look through pointer lock, and firing. The game
// only listens while the pointer is locked; losing the lock pauses the match.
export function createInput(canvas, onLockChange) {
  const state = { keys: new Set(), firing: false, lookX: 0, lookY: 0 };
  let locked = false;

  function onMouseMove(event) {
    if (!locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  }

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mousedown', (event) => {
    if (locked && event.button === 0) state.firing = true;
  });
  document.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
  });
  document.addEventListener('keydown', (event) => {
    if (event.code === 'Space') event.preventDefault();
    state.keys.add(event.code);
  });
  document.addEventListener('keyup', (event) => state.keys.delete(event.code));
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    if (!locked) state.firing = false;
    if (onLockChange) onLockChange(locked);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) state.firing = false;
  });

  return {
    state,
    isLocked() { return locked; },
    requestLock() {
      try { canvas.requestPointerLock(); } catch { /* pointer lock unavailable */ }
    },
    takeLook() {
      const look = { x: state.lookX, y: state.lookY };
      state.lookX = 0;
      state.lookY = 0;
      return look;
    },
  };
}
