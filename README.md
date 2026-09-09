# Pitchside

A full-team 11 v 11 football game that runs in the browser. Twenty-two players,
each with their own attributes, read the game and make their own decisions in
real time. You control one of them.

Built with React + Vite + three.js.

> The repository is named `badmintongame` for historical reasons. It is
> unrelated to the contents; this is a football game built from scratch.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
```

```bash
npm run build    # production bundle
npm run preview  # serve the production bundle
```

## Architecture

The single most important decision: **the simulation is completely headless and
knows nothing about rendering.** Everything under `src/sim` and `src/ai` runs on
a fixed 1/60 s timestep against a seeded RNG, with no reference to three.js, the
DOM or React. The renderer is a pure consumer that reads simulation state once
per animation frame.

This is what makes the game testable. The full match engine runs at roughly
**200× realtime** headless, so a 90-minute match simulates in well under a
second and the test suite can play thousands of matches to check that the
statistics it produces look like football.

```
src/
  sim/          headless deterministic simulation
    constants.js    pitch dimensions, ball, rules
    math.js         seeded RNG (mulberry32), vector/angle helpers
    ball.js         3D rigid body: drag, Magnus lift from spin, bounces
    player.js       momentum locomotion, stamina, animation state
    attributes.js   25 attributes, positional templates, overall rating
    formations.js   6 formations with per-slot roles, 8 tactical presets
    analysis.js     perception layer: pressure, space, passing lanes, xG, offside line
    actions.js      execution layer: passes, shots, clearances, first touch, tackles
    setpieces.js    throw-ins, corners, free kicks, goal kicks, penalties
    match.js        the main loop and every rule
  ai/
    teamBrain.js    team layer: phase, defensive block, pressing, marking, overloads
    decisions.js    individual utility choice, on and off the ball
    goalkeeper.js   geometry-driven shot stopping
  render/         three.js — a pure consumer of sim state
    pitch.js        procedural grass texture, stadium, instanced crowd, lighting
    playerMesh.js   articulated player rigs driven procedurally from sim state
    camera.js       five camera modes
    renderer.js     scene assembly and the per-frame update
  game/
    gameLoop.js     fixed-timestep accumulator, decoupled from rendering
    input.js        keyboard + mouse + gamepad + touch, one uniform input struct
    audio.js        Web Audio synthesis — no audio assets
  career/
    career.js       progression, training, selection, transfers, league
  ui/             React chrome
```

### The AI is three layers, not a script

1. **Perception** (`analysis.js`) — measurable facts about the current state:
   how much pressure a player is under, how much space exists at a point, how
   risky a passing lane is, where the offside line is, the xG of a shot.
2. **Team plan** (`teamBrain.js`, re-evaluated every 0.09 s) — the match phase,
   where the defensive block sits, who presses, who marks whom, where the
   overload is.
3. **Individual choice** (`decisions.js`) — every player scores the options
   available to them and picks the best one, then `actions.js` executes it with
   an error model based on their attributes.

Nothing is a scripted behaviour. Emergent play falls out of the interaction
between those layers, which is why no two matches are the same.

**Decision noise is applied per action category, not per option.** This matters
more than it sounds: if the AI pushes ten pass candidates and one dribble
candidate, and you add independent noise to each, then passing gets ten draws
from the distribution and dribbling gets one — the maximum of ten samples beats
the maximum of one almost always, and the AI will pass constantly for reasons
that have nothing to do with football. Each category gets one shared draw plus a
small per-option draw to choose within it.

### Difficulty does not cheat

Difficulty scales the **decision noise** of the opposition — how often they pick
a worse option than the best one available. It never touches their attributes,
their top speed, their reaction times or the physics. An "Elite" opponent is a
team that makes better choices, not a team that has been given a hidden bonus.

## Testing

```bash
npm run test         # 14 simulation tests (node:test)
npm run test:render  # 27 renderer/game-loop checks against a mocked WebGL context
npm run test:ui      # 9 React screens rendered server-side
npm run test:all     # all of the above
npm run diag 5       # play 5 matches, print statistics against real-world targets
```

`npm run diag` is the most useful tool in the repo. It plays complete matches
and compares the output against the rates a real football match produces —
goals, shots, pass completion, fouls, cards, corners, offsides, saves, tackles.
Tuning the game means running it, finding the number that is wrong, tracing the
cause, and fixing the underlying model rather than the number.

There is no browser in CI, so `test:render` stands up enough of the DOM and a
WebGL context for three.js to build a real scene graph, then drives the whole
GameLoop for 18,000 frames. It catches what SSR cannot: bad three.js API usage,
NaN transforms reaching the GPU, cameras ending up underground, and scene-graph
growth that would indicate a per-frame leak.

## Controls

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Move | `W A S D` / arrows | Left stick |
| Sprint (hold) | `Shift` | RT / R2 |
| Pass | `Space` | B / Circle |
| Through ball | `E` | X / Square |
| Lofted pass (hold to charge) | `Q` | Y / Triangle |
| Cross | `C` | RB / R1 |
| Shoot (hold to charge) | `F` | A / Cross |
| Tackle | `J` | B / Circle |
| Slide tackle | `K` | A / Cross |
| Call for the ball (hold) | `G` | LB / L1 |
| Switch player | `V` | Select |
| Change camera | `B` | — |
| Toggle radar | `M` | — |
| Pause | `Esc` | Start |

Movement is camera-relative, and passes go where you are aiming — the game picks
the best teammate in that direction rather than choosing for you.

## Career mode

There is no experience bar. Attributes move because of what you did on the
pitch: passes you completed train passing and vision, tackles you won train
tackling, sprints you made build stamina. Training between matches targets
specific areas but costs fatigue, and a tired player trains badly and gets
injured.

Every attribute has its own ceiling derived from your potential and how central
that attribute is to your position, so a centre-back never develops a striker's
finishing, and the positional overall is hard-capped at your potential. Your
manager picks the side on trust, form and fitness — probabilistically, so a bad
run never becomes a permanent exile. Reputation chases a target set by your
actual ability, your level and your output rather than accumulating forever.

## Known state

The realism diagnostics currently sit at roughly:

| Metric | Sim | Real |
| --- | --- | --- |
| Goals | 3.4 | 2.7 |
| Shots | 28 | 24 |
| Offsides | 1.8 | 2.7 |
| Tackles | 32 | 30 |
| Throw-ins | 32 | 40 |
| Pass completion | ~42% | 80% |
| Corners | 3 | 10 |
| Fouls | 3–7 | 22 |

Pass completion is the main outstanding gap and is being actively traced: the
ball reaches the intended receiver on only about 18% of passes over 14 m, while
short passes land reliably. The cause is receiver movement relative to the
target point rather than the passing error model or the pass weighting, both of
which have been measured and ruled out.
