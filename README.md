# Feather V2

A playable first-person badminton prototype for desktop browsers. Built with React 19, Vite, TypeScript, Three.js, React Three Fiber, drei, and Zustand. The menu is a live view of the same court used in gameplay—not a background image.

## V2 improvements

- Blended service-to-rally grip and damped follow-through; rotational contact uses both endpoint poses.
- Net tape grazes can remain live, mesh impacts fall naturally, and the visual/physical tape heights agree.
- AI plans net-safe returns before impact, adds execution error afterward, and can leave likely out shots.
- Point results precede a short hidden repositioning transition instead of an immediate camera jump.
- Shot-specific training zones, actual landing assessment, accuracy/streak tracking and E-to-refeed.
- String-bed contact map, actionable practice feedback, landing status and feed countdown.
- Session summaries, completed-game scores, robust saved preferences and clean rematch resets.
- Refined procedural hands/forearms and sportswear, deforming racket strings, and separate cached graphics/runtime bundles.

## Run

```sh
npm install
npm run dev       # 0.0.0.0:5173; supports the Arena preview host
npm run build     # type-check + production bundle
npm run preview
npm test          # 43 simulation/rules/integration tests
```

Desktop keyboard, mouse, WebGL 2 and hardware acceleration are required for gameplay. The menus adapt to small screens; touch gameplay is not implemented. Fonts and procedural assets are bundled locally. There are no asset CDN, backend, account, or API-key requirements.

## Controls

| Input | Action |
|---|---|
| WASD | Athletic movement with acceleration, braking and reduced backward speed |
| Shift + movement | Sprint / extend into a lunge |
| Space | Jump; air control is reduced |
| Mouse | Look |
| Hold left mouse + mouse movement | Guide the racket; up raises it, down lowers it, lateral movement reaches sideways |
| Release left mouse | Recover the arm and wrist |
| E | Release your serve; restart the feed in practice/training |
| Escape | Pause and release the cursor |

**Start in free practice.** The shuttle is small because the court and equipment use real-world scale. Read its flight, move your feet, then hold click and trace a short swing. Swinging reduces camera sensitivity so your wrist can move without losing sight of the shuttle. Contact uses the actual racket reach: there is no magnet, auto-hit, or shot button.

For a serve, the racket starts in a low, inverted underhand grip and the view is aimed at the diagonal service box. Press E, then make a brisk upward mouse motion while holding left click. Contact must stay below 1.15 m. Adjust sensitivity in Settings if the swing envelope feels too large or small.

## Modes

- **Match:** singles against a predictive opponent; three difficulties; rally scoring to 21, win by two, cap at 30, best of three; diagonal service, automatic opponent service, double-contact/net/out faults, changing ends, and match results.
- **Free practice:** unscored AI rallies with automatic feeds. Toggle the shuttle trail, landing prediction and live contact metrics.
- **Shot training:** select clear, drop, smash or net shot. Repeated feeds and starting positions are tuned to the selected shot. Each drill highlights its own landing zone. The HUD separately tracks matched shot classifications, completed attempts, successful shot-plus-target landings, accuracy and streaks. A matching classification alone does **not** count as a successful drill. Press E to start a fresh feed without recording a failed attempt.
- **Settings:** performance/balanced/ultra rendering, volume, sensitivity, head motion and practice aids. Preferences persist locally.

## Architecture

```text
src/
  components/
    Menus/          Main menu, setup, settings, controls
    HUD/            Match HUD, pause/results, practice metrics
    UI/             Shared dialogs, branding, pointer-lock actions
  game/
    GameEngine.ts   Fixed-step orchestration; no React physics state
    rendering/      Scene, reusable racket, practice visualizations
    player/         Bounded acceleration, head model, procedural arm & wrist
    input/          Keyboard/mouse capture, focus and cleanup
    shuttle/        Specialized flight integrator and feather/cork model
    physics/        Quadratic aerodynamics, swept string-bed/net collision
    ai/             Trajectory prediction, drag-aware aiming, tactical choices
    match/          Pure scoring, service rules, rally transitions and adjudication
    training/       Shot-specific feeds, target zones and landing assessment
    audio/          Procedural Web Audio with HRTF panning
    world/          Regulation court, hall, procedural textures, instanced seating
  state/            Zustand: discrete match state, settings, throttled telemetry
```

### Simulation

The custom physics solution runs at **120 Hz** with bounded frame catch-up. A feather shuttle uses gravity plus velocity-dependent quadratic drag (terminal falling speed approximately 6.7 m/s). Drag is integrated with a stable exact decay term. Feather orientation relaxes towards the relative airflow direction and includes spin. This is an engineering approximation, not CFD or a calibrated commercial shuttle model.

Racket translation, wrist orientation and angular velocity come from mouse input and the player transform. Collision checks sweep the shuttle relative to the elliptical string bed between substeps. Restitution, local contact-point velocity, face angle, tangential movement and distance from the sweet spot determine the outgoing velocity. Contact coordinates are resolved using both previous and current racket orientations and exposed on the practice string-bed display. Grip changes blend gradually after service instead of generating an instantaneous flip impulse. Release recovery uses a critically damped follow-through. A classifier labels the resulting shot **after** contact. Early/late are heuristic incidence classifications, not measured against a canned timing window. The racket and hand share a transform; forearms connect the wrist to a procedural elbow/shoulder chain.

The opponent predicts a descending intercept with the same aerodynamic model, moves with bounded response, judges likely out shots with difficulty-dependent uncertainty, chooses targets based on player position, and solves a drag-compensated launch. Return planning increases loft when a proposed trajectory would hit the net; execution error is applied afterward, and the shuttle is never steered in flight. Difficulty changes reaction, pace, error and miss probability. AI hits currently use a reachable contact volume with procedural racket alignment, rather than the player's full swept collision model.

The court uses metres. Singles scoring uses player-relative coordinates; the hall rotates on end changes to keep the camera strictly first-person on the receiving side of the local coordinate system. Points, game wins, completed-game history, service and end state live in the match manager. Repositioning and end changes happen behind a short fade after the point result, with transition timing driven by the simulation clock. Pausing freezes the transition. A net-mesh impact continues falling rather than instantly disappearing; upper-tape grazes can deflect over legally. Rendered tape height and collision height share the same sag profile.

### Rendering and sound

PBR materials, procedural wood/sports textures, local fonts, shadow quality settings, an environment light probe, ceiling fixtures, acoustic wall detail, equipment and instanced seating. The racket has a carbon-like frame, individual strings with impact deflection, a wrapped grip and impact vibration. Contoured forearms, flattened palms, finger details, skin microtexture and trimmed opponent sportswear improve the procedural player models. The shuttle has sixteen individual feather shapes and cork. Player/opponent meshes are procedural, not scanned human assets.

Spatial impacts, flight noise, steps, squeaks, landing and net sounds are synthesized through Web Audio. A quiet low-frequency room bed and delayed impact reflections suggest a hall. Audio starts only after an explicit game interaction and suspends on pause. Recorded crowd/opponent voice samples are not included.

### Performance

High-frequency simulation stays in mutable engine objects and R3F frame callbacks. React receives discrete scoring events and approximately 12 Hz telemetry. Chairs are instanced; the net/strings are batched line geometry. Shadows and pixel ratio are adjustable. Smooth frame rates depend on the device; no universal 60 FPS claim is made. Balanced is the default. Choose Performance on integrated GPUs or software-rendered environments.

## Tests

`npm test` runs 43 tests covering deuce, the 30-point cap, best-of-three, end changes, boundary/service rules, drag stability, terminal velocity, substep consistency, trajectory prediction, launch solving, swept contact, off-center energy loss, contact cooldown, net crossing, shot classification, momentum, jumping, and a motion-driven legal serve through the full engine. V2 adds tape/mesh/under-net distinctions, grip continuity, damped recovery, hidden repositioning, pause/reset isolation, target-zone assessment, AI net clearance, final-game history, malformed settings, feed restarts and rematch state resets.

Browser smoke tests:

```sh
npx playwright install --with-deps chromium
npm run test:browser
```

Five passing browser smoke tests check mode/difficulty selection, mouse capture, pause/return, settings persistence, small-screen overflow, and V2 training progress and string-bed feedback. Software-rendered Chromium may require longer timeouts than a hardware-accelerated desktop browser.

## Scope and next steps

This is a substantial playable **prototype**, not a finished photorealistic sports title. The most valuable next work is real-player swing/AI calibration, anatomical skinned character assets, more accurate string-bed deformation and rotational contact, human motion capture, recorded hall/crowd sound, full service foot-fault enforcement and accessibility/input alternatives. There is no multiplayer, mobile/touch controller, replay camera or VR support. Normal gameplay never switches to third person.
