# 🏓 NEON SMASH — Arena Table Tennis

A fast, juicy arcade table-tennis game in a synthwave arena. Time your swings for **PERFECT** strikes, charge smashes, bend shots with spin, enter **Flow State**, and duel machines that fight back. Built with **Vite + React + TypeScript + Three.js (react-three-fiber + drei)**.

## Run it

```bash
npm install
npm run dev      # → http://localhost:5173
npm run build    # type-check + production build
```

## Combat model

Every incoming ball gets a **timing ring** that shrinks onto a gold sweet-spot ring at your paddle plane:

| Input at contact | Result |
|---|---|
| Release **exactly** as the rings meet (≤100 ms) | **PERFECT** — extra speed, extended reach (lunge), slow-mo flash, builds a PERFECT combo |
| Release within ~260 ms | **GOOD** — full-power shot with your charge |
| Release way early | **WEAK** — slow, sprays randomly |
| Keep holding through contact | **BLOCK** — medium power, safe placement |
| Never press | **SOFT** — safe little reset shot… but the AI *punishes* soft feeds with corner attacks |

- **Hold** click/Space to charge power (watch the bar + hear the riser), **release on impact**.
- Shot **direction** comes from where on the paddle you meet the ball: edge contact = sharp cross-court angles. The **aim reticle** on the opponent's table previews where your current approach will send the ball, live.
- **Swipe while striking** to add sidespin — weaker machines misread curve.
- AI **smash telegraph**: the machine's paddle strobes white before it swings. Survive it, then counter — it's sluggish in recovery.

## Game modes

| Mode | What it is |
|---|---|
| **Quick Match** | First to 11 (win by 2) vs. an AI of your choice. |
| **Gauntlet** | Five machines in a row, no continues. Clear all five to unlock the **MIDAS** paddle. |
| **Trick Shot** | 60 seconds — bounce the ball into gold rings on the far side, chain combos. |
| **Local Duel** | Two humans, one keyboard, one table. |

The main menu runs a live AI-vs-AI demo rally behind the UI.

## Controls

| Action | Input |
|---|---|
| Move paddle | Mouse (or `◀ ▶` / `A D`) |
| Charge / swing | Hold **click** or **Space**, release on impact |
| Serve | Click / Space on your serve |
| Pause | `Esc` / `P` |
| Mute | `M` |

**Local Duel:** P1 = `A`/`D` + `W` · P2 = `◀`/`▶` + `▲`

## Mechanics worth knowing

- **Flow State** — returns fill the FLOW meter (PERFECTs fill it fastest). When full, your next hit slows the machine's world for 3.5 s.
- **Momentum bar** — under the scoreboard shows who's dominating the match.
- **PERFECT combos** — chain perfect strikes for rising-pitch chimes and bigger slow-mo bragging rights.
- **Match-point slow-mo** — game-winning points finish in cinematic slow motion.

## Opponents

| Tier | Personality |
|---|---|
| **ROOKIE-9** | Slow reactions, bad spin reading, telegraphs everything. |
| **VECTOR** | Reads spin, covers the table, smashes occasionally. *(beating it unlocks OVERDRIVE)* |
| **OVERDRIVE** | Near-perfect prediction, hunts your weak side, smashes relentlessly — but overhits under pressure. |
| **Gauntlet ladder** | RUSTBUCKET → ROOKIE-9 → VECTOR → VECTOR PRIME → OVERDRIVE-X |

## Architecture

```
src/
  game/
    engine.ts     # fixed-step (120 Hz) simulation: ballistics, spin, timing combat, AI, scoring
    constants.ts  # geometry + physics tuning + tier/skin definitions
    store.ts      # zustand UI/game-flow store (+ localStorage save)
    audio.ts      # procedural Web-Audio SFX, charge riser, adaptive synthwave loop
  three/
    Scene.tsx     # Canvas assembly + sim loop
    CameraRig.tsx # mode-aware camera + FOV punch + slow-mo cinematics
    Arena.tsx     # reflective floor, crowd of light orbs, pillars, sun, dust
    TableMesh.tsx # neon table + net with hit-pulse glow
    Paddles.tsx   # paddles, charge VFX, swing animation, AI smash telegraph
    Reticle.tsx   # live aim reticle + shrinking timing ring
    BallFX.tsx    # ball stretch/squash, heat color, light trail, blob shadow
    ImpactFX.tsx  # pooled spark particles + shockwave rings
    Targets.tsx   # trick-shot rings
    Effects.tsx   # bloom / chromatic aberration / vignette / grain
  ui/             # HUD (momentum, flow, combos), menus, banners, screen flashes
  App.tsx         # screens + global input
scripts/          # headless engine smoke tests (esbuild → node)
```

- **Deterministic physics** — gravity, drag, spin curves, table restitution, net collisions; decoupled from render rate.
- **AI model** — reaction delay + prediction error + spin-read quality + movement speed per tier; smashes cost recovery time and sometimes overhit.
- **Juice** — hit-stop, screen shake, FOV punch, particle bursts, shockwave rings, screen flashes, perfect slow-mo, ball squash & stretch, crowd that bounces to the beat, adaptive music layers.
- **Persistence** — skins, OVERDRIVE unlock, gauntlet completion and trick-shot best saved to `localStorage`.

## Headless tests

```bash
npx esbuild scripts/smoke.ts --bundle --platform=node --format=cjs | node
```

`scripts/smoke*.ts` simulate full matches (serve → timing hits → scoring → match end) for every mode without a browser.
