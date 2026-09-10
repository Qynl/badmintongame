# Feather 2.5 — Timing, eyes on the ball, opponents

A playable first-person badminton prototype for desktop browsers. Built with React 19, Vite, TypeScript, Three.js, React Three Fiber, drei, and Zustand. The menu is a live view of the same court used in gameplay—not a background image.

## 2.5: the swing is the skill, and the opponent has a personality

**Assisted mode stops being a button you can hold. A shrinking ring around the shuttle marks the strike window: swing inside it and the shot is full power, swing early or late and it comes back short and attackable, and mashing the control only costs you.**

- **Eyes on the ball:** an assisted swing only connects with a shuttle that is inside your view. Stare at the floor or turn away and the racket stays down, however hard you mash — measured on a bot that never looks at the shuttle, the gate refuses **69–73 %** of the moments the shuttle was inside arm's reach. The serve is exempt, because you aim it by looking at the far service box. The HUD says "the shuttle is out of view" instead of failing silently, and the cone follows the real camera (72° vertical, horizontal scaled to your viewport, with a 20 % margin so a shuttle at the edge of the frame is still hittable).
- **Aim, then look:** because your gaze now has two jobs, the placement commits when you tap and stays committed while you look back at the shuttle. Pick the corner, tap, watch the ball arrive, swing.
- **One strike window:** the ring closes on the shuttle and lights up 0.42 s before contact, staying open for 0.06 s past it. The prediction is a real integration of the live flight — measured mean error 0.034 s across clears, drives, drops and smashes, so the cue is not decoration.
- **Power comes from timing, not from pressing:** a press inside the window is full power; a rushed jab, a held button, or a stale press each bleed power down toward a 0.42 floor, and a weak swing cannot be sold as a smash (F falls back to a rally and says so).
- **A miss costs a moment:** a swing that ends without contact puts the racket down for 0.22 s close in, 0.32 s when the shuttle was nowhere near — long enough to feel it, short enough to keep the rally. A swing that connects takes the normal follow-through instead, so hitting is never delayed. The coach says "you swung at nothing" while it resets.
- **Mashing is punished:** every extra press inside 0.55 s adds flail, which cuts power and stretches your recovery before the next swing. The HUD shows live power and turns red while you are mashing.
- **Simulation is exact, but no longer cruel:** the catch ellipse is **40 % larger in area** (a wider bed plus a frame band out to 1.45×) and a frame hit now returns the shuttle at 0.82–0.50 efficiency graded by how deep into the frame it caught, instead of a flat, near-useless block. A miss is still a miss. The service toss is lower and slower, hanging inside the legal 1.15 m strike zone instead of dropping through it, and it no longer spawns on the strings. The shuttle tracker now shows in Simulation too.
- **Four opponent personalities,** layered on top of the difficulty: **Steady** (balanced club play), **Attacker** (faster hands, hits down constantly, gives more away), **Retriever** (quicker feet, nothing free, rarely attacks), **Tactician** (remembers your corners far longer and keeps hitting the one you left). Choose it on the setup screen next to the difficulty.
- Verified by 21 new tests: window reward, stale-hold and rushed-click penalties, mash cost, smash refusal, whiff lockout, frame contacts versus real misses, a legal slow serve, and the personality effect on attack rate, drop rate and raw attributes. A further 13 cover the view gate (cone geometry, aspect, refused swings while mashing at the floor, the exempt serve), the widened catch band, the miss recovery, and — mounted in jsdom, reading the real DOM — the HUD readouts.

## 2.4: the shuttle goes where you aim

**Assisted mode no longer sends every return to the same default spot on the other side of the court. Look at a point on the opponent's court and click: a ring on the floor marks the landing spot, and that is where the shuttle goes.**

- **Look-driven placement:** your view direction picks the landing point — a level or upward look clears deep, looking down brings it into the front court, and a sideways look swings it across to the sidelines. Every selectable point stays just inside the singles lines; a scraped contact can still scatter it out, so aiming at the tape is a real risk.
- **Committed aim:** a tap locks the placement, so you can pick a corner, click, and then look back at the shuttle to time the contact. Holding a control keeps steering the marker instead.
- **Shot families bound the depth, aim picks the spot:** left-click covers the deep half (a hard downward flick turns it into a flat push), right-click owns the front court and the net shot, and F attacks anywhere from the tape to the baseline. The serve now lands where you aim inside the legal diagonal service box.
- **Contact quality is placement quality:** clean, timed contact lands on the mark; an off-centre scrape drifts up to ~0.3 m around it. Every shot reports its distance from the mark, and the session tracks average placement and on-the-mark count.
- **Honest planning:** if a very short touch from a low contact cannot both clear the tape and stop in time, the planner deepens the landing and tells you how far off the mark it went, instead of lobbing it and labelling it a drop.
- **Placement has consequences:** the opponent remembers a repeated corner across points, drifts its recovery toward it, and answers one-sided placement by using the open side.
- **Rally Run adds a placement challenge:** a fourth rotating objective lights a zone on the court; land a validated return inside it for the bonus. Free practice only — badminton scoring is untouched.
- Simulation mode keeps no aim marker and no guided reach.

## 2.3: a smash starts a fight, not an automatic point

**Try Assisted + Quick Duel. Aim away from the defender, follow a block forward, and recover for the next shot.** Quick Duel is the default match format; Club Match preserves regulation 21-point, best-of-three play.

- **Positional smash defense:** the AI searches descending contact windows with an acceleration/reach budget, reacts sooner to fast attacks, and can dig out low shots. Removed the blanket extra random miss penalty for smash speed. A timed lunge has finite stamina and slower recovery; there is no teleport or across-court hit. Body attacks are returnable; wide attacks against a displaced defender remain winners. All difficulties retain execution mistakes.
- **Counterplay:** opponents absorb smashes into short blocks or defensive lifts, and can attack a short high reply with a physically checked downward smash. Readable racket preparation, lunge poses, and brief reply cues help you react. Neutral free-practice feeds remain forgiving.
- **Quick Duel:** first to seven, win by two, cap at eleven, one game, change ends at four. Choose **Club Match** in setup for 21 points / cap 30 / best of three. Game/match-point and deciding-point cues, correct result scores and same-format rematches are included.
- **Rally Run in Free Practice:** build a chain of legal returns, complete four rotating challenges (including a lit placement zone), mix shot families for bonuses, and finish a rally for +100. Only an opponent return or a legal winning landing validates a stroke—not pressing a button or selecting a shot. A rally ends the run; your personal best is stored locally on the device. Practice points never alter badminton scoring. Hide the challenge with readability guides if you want an uncluttered practice court.
- Simulation remains mouse-driven. No strength nerf, new camera shake, flight steering, or change to player contact reach.
- Updated Vitest to a patched release; clean dependency install, production build, and audit verified.

The automated defense fixtures test centered and displaced defenders, several difficulties, seeded misses, valid net crossings, counterattacks, and an entire smash → block → moving-player-return exchange. These establish mechanics, not a claim that subjective fun or every opponent matchup is fully calibrated.

## 2.2: build a point, not just a rally

**Assisted: left-click rallies, right-click drops, F smashes a high ball.** Hold a control for forgiving timing, or tap close to contact for extra smash pace. Mouse-driven Simulation remains separate.

- Dedicated attack and touch intents: a genuine downward smash planner, front-court drops, and delicate net shots up close. High-speed candidates are checked against the net and court before contact. Low/unviable attacks explain their defensive fallback instead of showing a fake Smash label.
- An early high-ball cue and visible LMB / RMB / F controls make the options discoverable. Fresh strikes within 300 ms of the request get extra attacking pace; held controls still connect. Inputs during follow-through are buffered rather than discarded.
- Casual/Club assisted matches now mix attackable lifts, short placement and open-side returns. Reaching under pressure produces a higher defensive reply. Opponents remember repeated short shots across points and recover farther forward; a new session resets that memory. Free practice retains forgiving neutral rallies.
- Distinct smash sound, stronger racket follow-through, shot/speed feedback, smash/touch winner counts and actual winner announcements. No added aggressive camera shake.
- Fixed the Assisted smash-training feed sailing behind the player's head. Each of the four drills now has a full-engine regression verifying contact and a successful target landing with its corresponding control.
- These are deliberately accessible assisted controls, not physical shot buttons added to Simulation. Launch assistance happens only at contact; normal feather aerodynamics govern the outgoing flight.

## 2.1: easier to hit, easier to read

**Start with Assisted + Casual. Click when the shuttle gets close, or hold click for extra timing help. No mouse flick is needed to return it.**

- Assisted is the new default, including for saved preferences that predate the control selector. Existing audio/graphics/difficulty preferences are retained.
- A click is buffered for 0.8 seconds; holding click keeps the racket ready for each incoming shuttle. Guided reach moves the visible racket, with a 30 cm swept contact tolerance inside a bounded 2.05 m horizontal reach. It cannot hit across the court, behind the player, or without swing input.
- Neutral clicks produce net-safe rally returns. Mouse flicks change aim, depth and loft. The helper acts at contact, never by steering the shuttle in flight. This is intentionally assistance, **not** the strict physical contact model.
- One click (or E) handles an assisted serve. Strict manual serving remains in Simulation mode.
- Casual/Club assisted rallies target a descending, reachable contact point instead of a deep floor point that can fly over the player's head. Expert retains its tactical targeting.
- The shuttle is visually enlarged in Assisted mode, with optional tracking, offscreen arrows, in-reach prompts, short match trails and contact confirmation. Physics dimensions are unchanged.
- Fixed capture-induced camera jumps, preserved very quick clicks between physics ticks, and stopped dropping legitimate high-speed mouse input after capture settles.
- Removed the arbitrary 18-second rally cutoff. Longest-rally statistics update while the rally is live.
- Launch buttons remain visible in the setup dialog; the canvas no longer causes horizontal overflow while resizing.

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
npm test          # 130 simulation/input/rules/aim/integration tests
```

Desktop keyboard, mouse, WebGL 2 and hardware acceleration are required for gameplay. The menus adapt to small screens; touch gameplay is not implemented. Fonts and procedural assets are bundled locally. There are no asset CDN, backend, account, or API-key requirements.

## Controls

| Input | Assisted (default) | Simulation (opt-in) |
|---|---|---|
| WASD | Move into position | Same |
| Shift + movement | Sprint / reach | Same |
| Space | Jump | Same |
| Mouse | Look, and choose where your shot lands (the floor ring is the landing spot) | Look |
| Left click | Rally return to the marked point / serve into the marked service spot | Hold and move the mouse to move the racket |
| Hold left mouse | Keep ready for forgiving contact timing | Manual wrist and swing movement |
| Right mouse | Drop; net shot near the tape. Hold to stay ready. | No assisted shot |
| F | High-contact smash. Hold to stay ready. | No assisted shot |
| Mouse flick while swinging | Fine placement nudge; fast down at high contact: attack; hard down with left click: flat push | Actual racket movement determines the shot |
| E | Serve / restart a practice feed | Release a serve / restart a practice feed |
| Escape | Pause and release the cursor | Same |

**Assisted mode:** try Free practice + Casual and hold click for your first few returns. Move for shots outside your reach. The green cue marks a reachable shuttle; a plain click makes a useful return. You can disable the screen cues separately in Settings. Free-practice rallies are deliberately forgiving. In a match, clear them back, drop them forward, then attack a high reply. Match tactics vary on Casual/Club too; Expert increases the challenge.

**Simulation mode:** the exact string bed must meet the shuttle. Hold click and trace the stroke with the mouse. There is no guided reach or trajectory correction. Serving uses the low underhand grip: press E, then swing upward through the released shuttle below 1.15 m. This is substantially harder and is no longer the default.

## Modes

- **Match:** singles against a predictive opponent; three difficulties; Quick Duel to 7 (cap 11, one game) or regulation Club Match to 21 (cap 30, best of three), both win by two; diagonal service, automatic opponent service, double-contact/net/out faults, changing ends, and match results.
- **Free practice:** AI rallies with automatic feeds and an optional Rally Run score challenge, separate from competitive scoring. Its fourth objective lights a landing zone: aim inside it for the placement bonus. Toggle the shuttle trail, landing prediction and live contact metrics.
- **Shot training:** select clear, drop, smash or net shot. Repeated feeds and starting positions are tuned to the selected shot. Each drill highlights its own landing zone. The HUD separately tracks matched shot classifications, completed attempts, successful shot-plus-target landings, accuracy and streaks. A matching classification alone does **not** count as a successful drill. Press E to start a fresh feed without recording a failed attempt.
- **Settings:** Assisted/Simulation controls, optional readability cues, performance/balanced/ultra rendering, volume, sensitivity, head motion and practice aids. Preferences persist locally.

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
    player/         Bounded acceleration, strict racket model, guided swings, aim, arm & wrist
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

**In Simulation mode**, racket translation, wrist orientation and angular velocity come from mouse input and the player transform. Collision checks sweep the shuttle relative to the elliptical string bed between substeps. Restitution, local contact-point velocity, face angle, tangential movement and distance from the sweet spot determine the outgoing velocity. Contact coordinates are resolved using both previous and current racket orientations and exposed on the practice string-bed display. Grip changes blend gradually after service instead of generating an instantaneous flip impulse. Release recovery uses a critically damped follow-through. A classifier labels the resulting shot **after** contact. Early/late are heuristic incidence classifications, not measured against a canned timing window. The racket and hand share a transform; forearms connect the wrist to a procedural elbow/shoulder chain.

Assisted contact lives separately in `GuidedSwing.ts`: input buffering, bounded reach, visible racket tracking, swept contact tolerance and a net-safe launch solver. `AimSystem.ts` maps the look direction to a landing point inside a shot-specific depth band (and the diagonal service box while serving), clamps it inside the singles lines, and names it for the HUD; contact quality then scatters the target before the launch is solved. The floor ring in `AimMarker.tsx` only visualizes that point. Assisted quality/impact-map values describe the guided contact offset, not an exact calibrated string-bed strike. Shot labels are classified from the resulting velocity and, for touch shots, predicted landing. `ShotPlanner.ts` keeps trajectory selection separate from reach and racket tracking. Both modes use the same shuttle aerodynamics, court rules, scoring and AI.

The opponent predicts a descending intercept with the same aerodynamic model, moves with bounded response, judges likely out shots with difficulty-dependent uncertainty, chooses targets based on player position, and solves a drag-compensated launch. Return planning increases loft when a proposed trajectory would hit the net; execution error is applied afterward, and the shuttle is never steered in flight. Difficulty changes reaction, pace, error and miss probability. AI hits currently use a reachable contact volume with procedural racket alignment, rather than the player's full swept collision model.

The court uses metres. Singles scoring uses player-relative coordinates; the hall rotates on end changes to keep the camera strictly first-person on the receiving side of the local coordinate system. Points, game wins, completed-game history, service and end state live in the match manager. Repositioning and end changes happen behind a short fade after the point result, with transition timing driven by the simulation clock. Pausing freezes the transition. A net-mesh impact continues falling rather than instantly disappearing; upper-tape grazes can deflect over legally. Rendered tape height and collision height share the same sag profile.

### Rendering and sound

PBR materials, procedural wood/sports textures, local fonts, shadow quality settings, an environment light probe, ceiling fixtures, acoustic wall detail, equipment and instanced seating. The racket has a carbon-like frame, individual strings with impact deflection, a wrapped grip and impact vibration. Contoured forearms, flattened palms, finger details, skin microtexture and trimmed opponent sportswear improve the procedural player models. The shuttle has sixteen individual feather shapes and cork. Player/opponent meshes are procedural, not scanned human assets.

Spatial impacts, flight noise, steps, squeaks, landing and net sounds are synthesized through Web Audio. A quiet low-frequency room bed and delayed impact reflections suggest a hall. Audio starts only after an explicit game interaction and suspends on pause. Recorded crowd/opponent voice samples are not included.

### Performance

High-frequency simulation stays in mutable engine objects and R3F frame callbacks. React receives discrete scoring events and approximately 12 Hz telemetry. Chairs are instanced; the net/strings are batched line geometry. Shadows and pixel ratio are adjustable. Smooth frame rates depend on the device; no universal 60 FPS claim is made. Balanced is the default. Choose Performance on integrated GPUs or software-rendered environments.

## Tests

`npm test` runs 163 tests covering deuce, the 30-point cap, best-of-three, end changes, boundary/service rules, drag stability, terminal velocity, substep consistency, trajectory prediction, launch solving, swept contact, off-center energy loss, contact cooldown, net crossing, shot classification, momentum, jumping, and a motion-driven legal serve through the full engine. V2 adds tape/mesh/under-net distinctions, grip continuity, damped recovery, hidden repositioning, pause/reset isolation, target-zone assessment, AI net clearance, final-game history, malformed settings, feed restarts and rematch state resets.

The 2.1 regression suite additionally verifies no-motion single-click serves and returns with 0–200 ms reaction delays, at least 8 successful connections in 10 repeated feeds, a deterministic 40-second rally without precision aiming, mouse-intent shot variety, no-input/behind-player/out-of-reach rejection, strict-mode preservation, input buffering and capture-warp filtering.

The 2.2 suite verifies net-safe downward smashes from nine court/height combinations, short-vs-deep landing separation, low-contact fallbacks, timed pace, queued intents, full-engine F/RMB returns, all four training feeds, smash winner scoring/reset, AI shot variation and short-shot memory, browser-shortcut handling and Simulation isolation.

The 2.3 suite adds positional smash defense, bounded movement, seeded placement comparisons, defensive reply variation, actual AI counterattacks, a full smash/block/return exchange, Rally Run validation and reset/storage behavior, and duel scoring/deuce/cap/end changes through the engine.

The suite (163 tests, 14 files) verifies look-to-landing mapping across a full sweep of yaw/pitch (every selectable point stays in court), shot-family depth bands, the diagonal service box, tap-committed versus held-steered aim, off-centre scatter around the mark, corner placement and deep/short separation through the live engine, aim telemetry, serve placement, Simulation isolation, opponent corner memory and open-side replies, the Rally Run placement challenge, and honest deepening of an impossible touch.

Browser smoke tests:

```sh
npx playwright install --with-deps chromium
npm run test:browser
```

Eight browser smoke tests check mode/difficulty selection, mouse capture, pause/return, settings persistence, small-screen overflow, V2 training progress and string-bed feedback, plus an actual Assisted shuttle return using browser mouse input. They also play a smash with F and a drop with right-click through real browser input, bank Rally Run points, and select Quick Duel versus Club Match. Software-rendered Chromium may require longer timeouts than a hardware-accelerated desktop browser.

## Scope and next steps

This is a substantial playable **prototype**, not a finished photorealistic sports title. The most valuable next work is real-player swing/AI calibration, anatomical skinned character assets, more accurate string-bed deformation and rotational contact, human motion capture, recorded hall/crowd sound, full service foot-fault enforcement and accessibility/input alternatives. There is no multiplayer, mobile/touch controller, replay camera or VR support. Normal gameplay never switches to third person.
