import type { AssistedShot } from '../player/ShotPlanner';
/**
 * Look-input bounds. A fast flick legitimately covers several hundred pixels in one event or one
 * frame, so those are left alone. What is not legitimate is the browser handing back a warp — a
 * pointer-lock re-engage or a stalled frame releasing a pile of queued moves — which unbounded
 * slams the camera to its pitch limit and reads as the view snapping up or down by itself.
 * WARP_EVENT drops a single impossible jump; MAX_FRAME_LOOK bounds what one frame can turn.
 */
export const WARP_EVENT = 1200; export const MAX_FRAME_LOOK = 900;

export class InputManager {
  keys = new Set<string>();
  dx = 0; dy = 0; swinging = false; swingPressed = false; serve = false; jump = false; locked = false;
  pendingShot: AssistedShot | null = null; dropHeld = false;
  private suppressUntil = 0;
  private captureMoves = 0;
  private disposers: (() => void)[] = [];
  constructor(element: HTMLElement, onUnlock: () => void) {
    const on = <K extends keyof DocumentEventMap>(type: K, handler: (event: DocumentEventMap[K]) => void) => { document.addEventListener(type, handler); this.disposers.push(() => document.removeEventListener(type, handler)); };
    on('keydown', (e) => { if (!this.locked || e.ctrlKey || e.metaKey || e.altKey) return; if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE'].includes(e.code)) e.preventDefault(); if (!e.repeat && e.code === 'Space') this.jump = true; if (!e.repeat && e.code === 'KeyF' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); this.pendingShot = 'smash'; } if (!e.repeat && e.code === 'KeyE') this.serve = true; this.keys.add(e.code); });
    on('keyup', (e) => this.keys.delete(e.code));
    on('mousemove', (e) => {
      if (!this.locked) return;
      // Pointer capture can emit delayed cursor-warp deltas. Ignore the initial events,
      // not fast legitimate strokes later in the rally.
      if (this.captureMoves > 0) { this.captureMoves--; return; }
      if (performance.now() <= this.suppressUntil) return;
      if (!Number.isFinite(e.movementX) || !Number.isFinite(e.movementY)) return;
      // A single impossible jump is dropped outright rather than clamped into a very fast turn.
      if (Math.abs(e.movementX) > WARP_EVENT || Math.abs(e.movementY) > WARP_EVENT) return;
      this.dx += e.movementX; this.dy += e.movementY;
    });
    on('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) { this.swinging = true; this.swingPressed = true; this.pendingShot = 'rally'; }
      if (e.button === 2) { this.dropHeld = true; this.pendingShot = 'drop'; e.preventDefault(); }
    });
    on('contextmenu', (e) => { if (this.locked) e.preventDefault(); });
    on('mouseup', (e) => { if (e.button === 0) this.swinging = false; if (e.button === 2) this.dropHeld = false; });
    on('pointerlockchange', () => { const before = this.locked; this.locked = document.pointerLockElement === element; if (this.locked) { this.dx = 0; this.dy = 0; this.suppressUntil = performance.now() + 250; this.captureMoves = 3; } if (!this.locked) { this.reset(); if (before) onUnlock(); } });
    const blur = () => { this.reset(); if (this.locked) document.exitPointerLock(); };
    window.addEventListener('blur', blur); this.disposers.push(() => window.removeEventListener('blur', blur));
  }
  reset() { this.keys.clear(); this.dx = 0; this.dy = 0; this.swinging = false; this.swingPressed = false; this.dropHeld = false; this.pendingShot = null; this.jump = false; this.serve = false; }
  dispose() { this.disposers.forEach((d) => d()); }
}
