export class InputManager {
  keys = new Set<string>();
  dx = 0; dy = 0; swinging = false; serve = false; jump = false; locked = false;
  private suppressUntil = 0;
  private disposers: (() => void)[] = [];
  constructor(element: HTMLElement, onUnlock: () => void) {
    const on = <K extends keyof DocumentEventMap>(type: K, handler: (event: DocumentEventMap[K]) => void) => { document.addEventListener(type, handler); this.disposers.push(() => document.removeEventListener(type, handler)); };
    on('keydown', (e) => { if (!this.locked) return; if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE'].includes(e.code)) e.preventDefault(); if (!e.repeat && e.code === 'Space') this.jump = true; if (!e.repeat && e.code === 'KeyE') this.serve = true; this.keys.add(e.code); });
    on('keyup', (e) => this.keys.delete(e.code));
    on('mousemove', (e) => { if (this.locked && performance.now() > this.suppressUntil && Math.abs(e.movementX) < 250 && Math.abs(e.movementY) < 250) { this.dx += e.movementX; this.dy += e.movementY; } });
    on('mousedown', (e) => { if (this.locked && e.button === 0) this.swinging = true; });
    on('mouseup', (e) => { if (e.button === 0) this.swinging = false; });
    on('pointerlockchange', () => { const before = this.locked; this.locked = document.pointerLockElement === element; if (this.locked) { this.dx = 0; this.dy = 0; this.suppressUntil = performance.now() + 180; } if (!this.locked) { this.reset(); if (before) onUnlock(); } });
    const blur = () => { this.reset(); if (this.locked) document.exitPointerLock(); };
    window.addEventListener('blur', blur); this.disposers.push(() => window.removeEventListener('blur', blur));
  }
  reset() { this.keys.clear(); this.dx = 0; this.dy = 0; this.swinging = false; this.jump = false; this.serve = false; }
  dispose() { this.disposers.forEach((d) => d()); }
}
