import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InputManager } from '../src/game/input/InputManager';
let input: InputManager;
let doc: EventTarget & { pointerLockElement: HTMLElement | null };
let unlocked: ReturnType<typeof vi.fn>;
const canvas = {} as HTMLElement;
function mouse(type: string, dx = 0, dy = 0) { doc.dispatchEvent(Object.assign(new Event(type), { movementX: dx, movementY: dy, button: 0 })); }
beforeEach(() => {
  doc = Object.assign(new EventTarget(), { pointerLockElement: canvas as HTMLElement | null });
  vi.stubGlobal('document', doc); vi.stubGlobal('window', new EventTarget());
  vi.spyOn(performance, 'now').mockReturnValue(1000); unlocked = vi.fn(); input = new InputManager(canvas, unlocked);
  doc.dispatchEvent(new Event('pointerlockchange')); vi.mocked(performance.now).mockReturnValue(2000);
});
afterEach(() => { input.dispose(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('pointer capture and click intent', () => {
  it('ignores delayed capture warps instead of snapping the view at game start', () => {
    mouse('mousemove', 1200, -800); mouse('mousemove', -600, 700); mouse('mousemove', 400, -400);
    expect(input.dx).toBe(0); expect(input.dy).toBe(0);
    mouse('mousemove', 6, -4); expect(input.dx).toBe(6); expect(input.dy).toBe(-4);
  });
  it('drops a single impossible jump instead of turning it into a snap', () => {
    for (let i = 0; i < 3; i++) mouse('mousemove'); // let pointer capture settle first
    mouse('mousemove', 0, 9000);
    expect(input.dx).toBe(0); expect(input.dy).toBe(0);
    mouse('mousemove', 6, -4); // the hand is still there afterwards
    expect(input.dx).toBe(6); expect(input.dy).toBe(-4);
  });
  it('does not discard a legitimate fast mouse flick after capture has settled', () => {
    for (let i = 0; i < 3; i++) mouse('mousemove');
    mouse('mousemove', 350, -400); expect(input.dx).toBe(350); expect(input.dy).toBe(-400);
  });
  it('retains a quick click even when mouseup arrives before the next physics step', () => {
    mouse('mousedown'); mouse('mouseup'); expect(input.swinging).toBe(false); expect(input.swingPressed).toBe(true);
  });
  it('clears queued swings and movement when the pointer is released', () => {
    mouse('mousedown'); input.keys.add('KeyW'); doc.pointerLockElement = null;
    doc.dispatchEvent(new Event('pointerlockchange'));
    expect(input.swingPressed).toBe(false); expect(input.keys.size).toBe(0); expect(unlocked).toHaveBeenCalledOnce();
  });
});
describe('dedicated assisted shot inputs', () => {
  it('queues F without requiring a mouse click', () => {
    doc.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { code: 'KeyF', repeat: false }));
    expect(input.pendingShot).toBe('smash'); expect(input.swinging).toBe(false);
  });
  it('keeps browser find shortcuts intact', () => {
    const e = Object.assign(new Event('keydown', { cancelable: true }), { code: 'KeyF', repeat: false, ctrlKey: true });
    doc.dispatchEvent(e); expect(input.pendingShot).toBeNull(); expect(input.keys.has('KeyF')).toBe(false); expect(e.defaultPrevented).toBe(false);
  });
  it('queues a right-click touch and suppresses the context menu only in game', () => {
    doc.dispatchEvent(Object.assign(new Event('mousedown'), { button: 2 }));
    expect(input.pendingShot).toBe('drop'); expect(input.dropHeld).toBe(true);
    const context = new Event('contextmenu', { cancelable: true }); doc.dispatchEvent(context); expect(context.defaultPrevented).toBe(true);
    doc.dispatchEvent(Object.assign(new Event('mouseup'), { button: 2 })); expect(input.dropHeld).toBe(false);
    doc.pointerLockElement = null; doc.dispatchEvent(new Event('pointerlockchange'));
    const menuContext = new Event('contextmenu', { cancelable: true }); doc.dispatchEvent(menuContext); expect(menuContext.defaultPrevented).toBe(false);
    expect(input.pendingShot).toBeNull();
  });
});
