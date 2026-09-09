// ---------------------------------------------------------------------------
// INPUT
//
// Keyboard + mouse + gamepad, mapped into the neutral `match.input` struct.
// Movement is converted to camera-relative axes by the caller so "forward"
// always means "away from the camera".
// ---------------------------------------------------------------------------

export const DEFAULT_BINDINGS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  pass: ['Space'],
  through: ['KeyE'],
  lofted: ['KeyQ'],
  cross: ['KeyC'],
  shoot: ['KeyF'],
  tackle: ['KeyJ'],
  slide: ['KeyK'],
  call: ['KeyG'],
  switch: ['KeyV'],
  camera: ['KeyB'],
  pause: ['Escape'],
  radar: ['KeyM'],
};

export class InputController {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();   // edge-triggered this frame
    this.released = new Set();
    this.bindings = { ...DEFAULT_BINDINGS };
    this.gamepadIndex = null;
    this.mouseAimX = 0;
    this.mouseAimZ = 0;
    this.enabled = true;
    this.usingGamepad = false;
    this.lastDevice = 'keyboard';
    // Touch layer: an on-screen stick writes axes here and buttons register as
    // virtual key presses, so every consumer sees one uniform input state.
    this.touchAxes = null;
    this.touchButtons = new Set();
    this.touchPressed = new Set();

    this._onKeyDown = (e) => {
      if (!this.enabled) return;
      if (e.repeat) return;
      // Don't swallow browser shortcuts / typing in inputs.
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      this.lastDevice = 'keyboard';
      if (this._isGameKey(e.code)) e.preventDefault();
    };
    this._onKeyUp = (e) => {
      this.keys.delete(e.code);
      this.released.add(e.code);
    };
    this._onBlur = () => { this.keys.clear(); };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    window.addEventListener('gamepadconnected', (e) => {
      this.gamepadIndex = e.gamepad.index;
    });
    window.addEventListener('gamepaddisconnected', () => {
      this.gamepadIndex = null;
      this.usingGamepad = false;
    });
  }

  _isGameKey(code) {
    for (const list of Object.values(this.bindings)) {
      if (list.includes(code)) return true;
    }
    return false;
  }

  down(action) {
    if (this.touchButtons.has(action)) return true;
    const list = this.bindings[action];
    if (!list) return false;
    for (const c of list) if (this.keys.has(c)) return true;
    return false;
  }

  justPressed(action) {
    if (this.touchPressed.has(action)) return true;
    const list = this.bindings[action];
    if (!list) return false;
    for (const c of list) if (this.pressed.has(c)) return true;
    return false;
  }

  justReleased(action) {
    const list = this.bindings[action];
    if (!list) return false;
    for (const c of list) if (this.released.has(c)) return true;
    return false;
  }

  // Raw axes in screen space: x = right, z = up(forward).
  axes() {
    if (this.touchAxes && (this.touchAxes[0] || this.touchAxes[1])) {
      this.lastDevice = 'touch';
      return this.touchAxes;
    }
    let x = 0; let z = 0;
    if (this.down('left')) x -= 1;
    if (this.down('right')) x += 1;
    if (this.down('up')) z += 1;
    if (this.down('down')) z -= 1;

    const gp = this.gamepad();
    if (gp) {
      const gx = deadzone(gp.axes[0]);
      const gy = deadzone(gp.axes[1]);
      if (Math.abs(gx) > 0 || Math.abs(gy) > 0) {
        x = gx; z = -gy;
        this.usingGamepad = true;
        this.lastDevice = 'gamepad';
      }
    }
    const m = Math.hypot(x, z);
    if (m > 1) { x /= m; z /= m; }
    return [x, z];
  }

  // Right stick / mouse aim, screen space.
  aimAxes() {
    const gp = this.gamepad();
    if (gp) {
      const ax = deadzone(gp.axes[2]);
      const ay = deadzone(gp.axes[3]);
      if (Math.abs(ax) > 0 || Math.abs(ay) > 0) return [ax, -ay];
    }
    if (Math.hypot(this.mouseAimX, this.mouseAimZ) > 0.15) {
      return [this.mouseAimX, this.mouseAimZ];
    }
    return [0, 0];
  }

  gamepad() {
    if (!navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    if (this.gamepadIndex != null && pads[this.gamepadIndex]) return pads[this.gamepadIndex];
    for (const p of pads) if (p && p.connected) { this.gamepadIndex = p.index; return p; }
    return null;
  }

  gpButton(i) {
    const gp = this.gamepad();
    return !!(gp && gp.buttons[i] && gp.buttons[i].pressed);
  }

  // Call once per frame AFTER reading edge state.
  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.touchPressed.clear();
    // Gamepad edge tracking
    const gp = this.gamepad();
    if (gp) {
      this._prevButtons = gp.buttons.map(b => b.pressed);
    }
  }

  gpJustPressed(i) {
    const gp = this.gamepad();
    if (!gp || !gp.buttons[i]) return false;
    const now = gp.buttons[i].pressed;
    const before = this._prevButtons?.[i] ?? false;
    return now && !before;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
  }
}

function deadzone(v, dz = 0.18) {
  if (v == null) return 0;
  const a = Math.abs(v);
  if (a < dz) return 0;
  return Math.sign(v) * ((a - dz) / (1 - dz));
}

// ---------------------------------------------------------------------------
// Map the controller into match.input for one frame.
// `toWorld(x, z)` converts screen axes into world axes via the camera.
// Returns extra one-shot UI intents the game loop should handle.
// ---------------------------------------------------------------------------
export function applyInput(input, controller, matchInput, toWorld) {
  const [rx, rz] = controller.axes();
  const [wx, wz] = toWorld(rx, rz);
  matchInput.moveX = wx;
  matchInput.moveZ = wz;

  const [arx, arz] = controller.aimAxes();
  if (Math.hypot(arx, arz) > 0.15) {
    const [awx, awz] = toWorld(arx, arz);
    matchInput.aimX = awx;
    matchInput.aimZ = awz;
  } else {
    // Default aim: where you're running.
    matchInput.aimX = wx;
    matchInput.aimZ = wz;
  }

  matchInput.sprint = controller.down('sprint') || controller.gpButton(7);
  // Held buttons drive the charge system in the sim.
  matchInput.shoot = controller.down('shoot') || controller.gpButton(0);
  matchInput.lofted = controller.down('lofted') || controller.gpButton(3);
  // Edge-triggered actions. The sim clears these itself once consumed.
  if (controller.justPressed('pass') || controller.gpJustPressed(1)) matchInput.pass = true;
  if (controller.justPressed('through') || controller.gpJustPressed(2)) matchInput.throughBall = true;
  if (controller.justPressed('cross') || controller.gpJustPressed(5)) matchInput.cross = true;
  if (controller.justPressed('tackle') || controller.gpJustPressed(1)) matchInput.tackle = true;
  if (controller.justPressed('slide') || controller.gpJustPressed(0)) matchInput.slide = true;
  matchInput.callForBall = controller.down('call') || controller.gpButton(4);

  return {
    switchPlayer: controller.justPressed('switch') || controller.gpJustPressed(6),
    cycleCamera: controller.justPressed('camera'),
    pause: controller.justPressed('pause') || controller.gpJustPressed(9),
    toggleRadar: controller.justPressed('radar'),
  };
}
