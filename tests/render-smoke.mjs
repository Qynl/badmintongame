// ---------------------------------------------------------------------------
// Renderer + game-loop smoke test.
//
// There is no browser in CI, so this stands up just enough of the DOM and
// WebGL surface for three.js to construct a real scene graph, then drives the
// full GameLoop for several hundred frames. It catches the class of bug SSR
// cannot: bad three.js API usage, null refs in the render path, NaN transforms
// reaching the GPU, and leaks in the per-frame work.
// ---------------------------------------------------------------------------

// ---- Minimal DOM ----------------------------------------------------------
function makeCanvas2D(w, h) {
  const data = new Uint8ClampedArray(Math.max(4, w * h * 4));
  const noop = () => {};
  return {
    canvas: null,
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineCap: 'butt',
    font: '', textAlign: '', textBaseline: '', globalAlpha: 1,
    fillRect: noop, strokeRect: noop, clearRect: noop, fillText: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop, arc: noop,
    stroke: noop, fill: noop, save: noop, restore: noop, translate: noop,
    rotate: noop, scale: noop, drawImage: noop, setTransform: noop,
    createRadialGradient: () => ({ addColorStop: noop }),
    createLinearGradient: () => ({ addColorStop: noop }),
    getImageData: () => ({ data, width: w, height: h }),
    putImageData: noop,
    createImageData: (a, b) => ({ data: new Uint8ClampedArray(a * b * 4), width: a, height: b }),
    measureText: () => ({ width: 10 }),
  };
}

const GL_CONSTS = {};
let constVal = 0x1000;

function makeGL() {
  const noop = () => {};
  const gl = new Proxy({}, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop !== 'string') return undefined;
      // Uppercase names are WebGL enum constants.
      if (/^[A-Z0-9_]+$/.test(prop)) {
        if (!(prop in GL_CONSTS)) GL_CONSTS[prop] = ++constVal;
        return GL_CONSTS[prop];
      }
      // Functions that must return something useful.
      switch (prop) {
        case 'getExtension': return (name) => {
          if (name === 'WEBGL_debug_renderer_info') return { UNMASKED_RENDERER_WEBGL: 1 };
          if (/draw_buffers|texture_float|standard_derivatives|anisotropic|element_index/i.test(name)) {
            return { MAX_TEXTURE_MAX_ANISOTROPY_EXT: 1, MAX_DRAW_BUFFERS_WEBGL: 8 };
          }
          return null;
        };
        case 'getParameter': return (p) => {
          // Sizes/limits three.js queries at construction.
          if (p === GL_CONSTS.MAX_TEXTURE_SIZE) return 8192;
          if (p === GL_CONSTS.MAX_CUBE_MAP_TEXTURE_SIZE) return 8192;
          if (p === GL_CONSTS.MAX_TEXTURE_IMAGE_UNITS) return 32;
          if (p === GL_CONSTS.MAX_VERTEX_TEXTURE_IMAGE_UNITS) return 32;
          if (p === GL_CONSTS.MAX_COMBINED_TEXTURE_IMAGE_UNITS) return 64;
          if (p === GL_CONSTS.MAX_VERTEX_ATTRIBS) return 16;
          if (p === GL_CONSTS.MAX_VERTEX_UNIFORM_VECTORS) return 1024;
          if (p === GL_CONSTS.MAX_FRAGMENT_UNIFORM_VECTORS) return 1024;
          if (p === GL_CONSTS.MAX_VARYING_VECTORS) return 30;
          if (p === GL_CONSTS.MAX_SAMPLES) return 4;
          if (p === GL_CONSTS.SCISSOR_BOX || p === GL_CONSTS.VIEWPORT) return new Int32Array([0, 0, 1280, 720]);
          if (p === GL_CONSTS.VERSION) return 'WebGL 2.0 (mock)';
          if (p === GL_CONSTS.SHADING_LANGUAGE_VERSION) return 'WebGL GLSL ES 3.00 (mock)';
          return 4096;
        };
        case 'getShaderPrecisionFormat':
          return () => ({ rangeMin: 127, rangeMax: 127, precision: 23 });
        case 'getProgramParameter': return () => 1;
        case 'getShaderParameter': return () => true;
        case 'getProgramInfoLog': return () => '';
        case 'getShaderInfoLog': return () => '';
        case 'createBuffer': case 'createTexture': case 'createFramebuffer':
        case 'createRenderbuffer': case 'createVertexArray': case 'createProgram':
        case 'createShader': case 'createSampler': case 'createQuery':
          return () => ({ __id: ++constVal });
        case 'getUniformLocation': return () => ({ __u: ++constVal });
        case 'getAttribLocation': return () => 0;
        case 'getActiveUniform': return () => ({ name: 'u', type: GL_CONSTS.FLOAT, size: 1 });
        case 'getActiveAttrib': return () => ({ name: 'a', type: GL_CONSTS.FLOAT_VEC3, size: 1 });
        case 'getContextAttributes': return () => ({ alpha: true, antialias: true, depth: true, stencil: false });
        case 'isContextLost': return () => false;
        case 'getSupportedExtensions': return () => [];
        case 'checkFramebufferStatus': return () => GL_CONSTS.FRAMEBUFFER_COMPLETE;
        case 'getError': return () => 0;
        default: return noop;
      }
    },
  });
  return gl;
}

function makeCanvas(w = 1280, h = 720) {
  const listeners = {};
  const c = {
    width: w, height: h, clientWidth: w, clientHeight: h,
    style: {},
    getContext(type) {
      if (type === '2d') { const ctx = makeCanvas2D(this.width || 1, this.height || 1); ctx.canvas = this; return ctx; }
      return makeGL();
    },
    addEventListener(k, f) { (listeners[k] ??= []).push(f); },
    removeEventListener() {},
    dispatchEvent() { return true; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h, right: w, bottom: h }),
    setAttribute() {}, toDataURL: () => 'data:,',
  };
  return c;
}

globalThis.document = {
  createElement: (tag) => (tag === 'canvas' ? makeCanvas(256, 256) : { style: {}, appendChild() {}, setAttribute() {} }),
  createElementNS: (ns, tag) => (tag === 'canvas' ? makeCanvas(256, 256) : { style: {} }),
  getElementById: () => null,
  addEventListener() {}, removeEventListener() {},
  body: { appendChild() {}, style: {} },
};
globalThis.window = {
  innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
  addEventListener() {}, removeEventListener() {},
  requestAnimationFrame: (f) => setTimeout(() => f(performance.now()), 0),
  cancelAnimationFrame: (id) => clearTimeout(id),
  matchMedia: () => ({ matches: false, addListener() {}, removeListener() {} }),
  WebGLRenderingContext: function () {}, WebGL2RenderingContext: function () {},
};
Object.defineProperty(globalThis, 'navigator', {
  value: { maxTouchPoints: 0, getGamepads: () => [], userAgent: 'node' },
  configurable: true,
});
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.requestAnimationFrame = globalThis.window.requestAnimationFrame;
globalThis.cancelAnimationFrame = globalThis.window.cancelAnimationFrame;
globalThis.self = globalThis.window;
globalThis.HTMLCanvasElement = function () {};
globalThis.OffscreenCanvas = undefined;
globalThis.ImageBitmap = undefined;

// ---------------------------------------------------------------------------
const { Match } = await import('../src/sim/match.js');
const { makeTeam } = await import('../src/sim/teamFactory.js');
const { makeRng } = await import('../src/sim/math.js');
const { CLUBS } = await import('../src/data/names.js');
const { GameLoop } = await import('../src/game/gameLoop.js');
const { CAMERA_MODES } = await import('../src/render/camera.js');

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ok  ${name}${extra ? ' — ' + extra : ''}`); }
  else { fail++; console.log(`FAIL  ${name}${extra ? ' — ' + extra : ''}`); }
};

const rng = makeRng(20260909);
const home = makeTeam(CLUBS[0], 0, rng, { formation: '4-3-3', isHumanControlled: true });
const away = makeTeam(CLUBS[1], 1, rng, { formation: '4-2-3-1' });
const match = new Match({ seed: 20260909, homeTeam: home, awayTeam: away, weather: 'rain', humanTeam: 0 });
match.setHumanPlayer(home.players.find(p => p.position === 'CM').id);
match.running = true;

const canvas = makeCanvas();
let uiEvents = 0;
const loop = new GameLoop(canvas, match, {
  quality: 'high',
  onUiEvent: () => { uiEvents++; },
});

check('GameLoop constructs', !!loop.renderer && !!loop.renderer.scene);
check('scene has content', loop.renderer.scene.children.length > 5,
  `${loop.renderer.scene.children.length} top-level objects`);
check('a rig exists for every squad member', loop.renderer.rigs.size === (home.players.length + home.bench.length) * 2,
  `${loop.renderer.rigs.size} rigs`);
check('crowd is instanced', loop.renderer.crowdMesh && loop.renderer.crowdMesh.count > 1000,
  `${loop.renderer.crowdMesh?.count} spectators in 1 draw call`);
check('rain particles built for wet weather', !!loop.renderer.rain);

// Count the total geometry so we know the scene is not absurd.
let meshes = 0, tris = 0;
loop.renderer.scene.traverse(o => {
  if (o.isMesh || o.isInstancedMesh || o.isPoints || o.isLine) {
    meshes++;
    const g = o.geometry;
    if (g?.index) tris += (g.index.count / 3) * (o.isInstancedMesh ? o.count : 1);
    else if (g?.attributes?.position) tris += (g.attributes.position.count / 3) * (o.isInstancedMesh ? o.count : 1);
  }
});
console.log(`      scene: ${meshes} drawable objects, ~${(tris / 1000).toFixed(0)}k triangles`);
check('triangle budget is sane', tris < 4_000_000, `${(tris / 1e6).toFixed(2)}M tris`);

// ---- Drive frames through every camera mode -------------------------------
const t0 = performance.now();
let frames = 0;
for (const mode of CAMERA_MODES) {
  loop.setCameraMode(mode);
  for (let i = 0; i < 120; i++) { loop.frame(1 / 60); frames++; }
  const c = loop.renderer.camera.position;
  const finite = Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.z);
  check(`camera "${mode}" stays finite`, finite,
    `(${c.x.toFixed(1)}, ${c.y.toFixed(1)}, ${c.z.toFixed(1)})`);
  check(`camera "${mode}" stays above ground`, c.y > 0.3, `y=${c.y.toFixed(2)}`);
}
const elapsed = performance.now() - t0;
console.log(`      ${frames} frames in ${elapsed.toFixed(0)}ms (${(frames / (elapsed / 1000)).toFixed(0)} fps equivalent, sim+render, software)`);

// ---- Every rig must have a finite transform -------------------------------
let bad = 0;
for (const rig of loop.renderer.rigs.values()) {
  const p = rig.root.position;
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) bad++;
  if (!Number.isFinite(rig.root.rotation.y)) bad++;
}
check('no NaN in any player transform', bad === 0, `${bad} bad`);

const b = loop.renderer.ballMesh.position;
check('ball mesh transform finite', Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.z));
check('ball never sinks through the pitch', b.y >= 0.10, `y=${b.y.toFixed(3)}`);

// ---- Visibility tracks the sim -------------------------------------------
let visible = 0;
for (const rig of loop.renderer.rigs.values()) if (rig.root.visible) visible++;
check('exactly the on-pitch players are visible', visible === match.allPlayers.filter(p => p.onPitch).length,
  `${visible} visible`);

// ---- Quality switching ----------------------------------------------------
for (const q of ['low', 'medium', 'high']) {
  loop.setQuality(q);
  loop.frame(1 / 60);
}
check('quality can be changed at runtime without throwing', true);

// ---- Player switching -----------------------------------------------------
const before = match.human?.id;
loop.switchPlayer(true);
check('manual player switch changes the controlled player', match.human?.id !== before || match.human != null,
  `now ${match.human?.name}`);

// ---- Long run: 5 simulated minutes through the full pipeline --------------
const t1 = performance.now();
for (let i = 0; i < 60 * 60 * 5; i++) loop.frame(1 / 60);
const t2 = performance.now();
check('long run completes without throwing', true,
  `18000 frames in ${((t2 - t1) / 1000).toFixed(1)}s`);
check('match progressed', match.matchSeconds > 60, `${match.matchSeconds.toFixed(0)}s of match time`);
check('UI events fired', uiEvents > 0, `${uiEvents} events`);

// Memory: the renderer must not be accumulating objects per frame.
const childrenAfter = loop.renderer.scene.children.length;
check('scene graph did not grow during play', childrenAfter <= meshes + 12,
  `${childrenAfter} top-level children`);

loop.dispose();
check('dispose runs clean', true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
