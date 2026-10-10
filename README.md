# 🏓 NEON SMASH — Arena Table Tennis

A fast, juicy arcade table-tennis game in a synthwave arena. Charge smashes, bend shots with spin, enter **Flow State**, and duel machines that fight back. Built with **Vite + React + TypeScript + Three.js (react-three-fiber)**.

![stack](https://img.shields.io/badge/Vite-7-646cff) ![stack](https://img.shields.io/badge/React-18-149eca) ![stack](https://img.shields.io/badge/Three.js-r170-black)

## Run it

```bash
npm install
npm run dev      # → http://localhost:5173
npm run build    # type-check + production build
```

## Game modes

| Mode | What it is |
|---|---|
| **Quick Match** | First to 11 (win by 2) vs. an AI of your choice. |
| **Gauntlet** | Five machines in a row, no continues. Clear all five to unlock the **MIDAS** paddle. |
| **Trick Shot** | 60 seconds of target practice — bounce the ball into gold rings on the far side, chain combos. |
| **Local Duel** | Two humans, one keyboard, one table. |

The main menu runs a live AI-vs-AI demo rally behind the UI.

## Controls

| Action | Input |
|---|---|
| Move paddle | Mouse (or `◀ ▶` / `A D`) |
| Charge smash | Hold **click** or **Space**, release timing matters |
| Serve | Click / Space on your serve |
| Sidespin | Move the paddle *while* striking — swipe to curve the ball |
| Pause | `Esc` / `P` |
| Mute | `M` |

**Local Duel:** P1 = `A`/`D` + `W` (charge/serve) · P2 = `◀`/`▶` + `▲` (charge/serve)

## Mechanics worth knowing

- **Angle shots** — contact with the *edge* of the paddle sends the ball cross-court. Corner placement is how you move a machine out of position.
- **Spin** — paddle velocity at contact curves the flight. Weaker machines misread spin badly (`curveRead` stat).
- **Flow State** — every successful return fills the FLOW meter. When full, your next hit slows the opponent's world for 3.5 s.
- **Smash recovery** — machines that smash are sluggish for a moment afterwards. Survive the smash, counter to the open corner.
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
    engine.ts     # fixed-step (120 Hz) simulation: ballistics, spin, AI, scoring
    constants.ts  # geometry + physics tuning + tier/skin definitions
    store.ts      # zustand UI/game-flow store (+ localStorage save)
    audio.ts      # procedural Web-Audio SFX + adaptive synthwave loop
  three/
    Scene.tsx     # Canvas assembly + sim loop
    CameraRig.tsx # mode-aware camera (behind / broadcast / orbit / cinematic)
    Arena.tsx     # synthwave set: grid, pillars, sun, dust
    TableMesh.tsx # neon table + net
    Paddles.tsx   # paddles, swing animation, serve aim ghost
    BallFX.tsx    # ball + heat color + instanced light trail
    ImpactFX.tsx  # pooled spark particles + shockwave rings
    Targets.tsx   # trick-shot rings
    Effects.tsx   # bloom / chromatic aberration / vignette / grain
  ui/             # HUD, menus, banners (DOM overlay)
  App.tsx         # screens + global input
scripts/          # headless engine smoke tests (run via esbuild + node)
```

- **Deterministic physics** — gravity, drag, Magnus-style spin curves, table restitution, net collisions; decoupled from render rate.
- **AI model** — reaction delay + prediction error + spin-read quality + movement speed per tier; smashes cost recovery time.
- **Juice** — hit-stop, screen shake, particle bursts, shockwave rings, slow-mo finishers, adaptive music layers driven by rally length.
- **Persistence** — skins, OVERDRIVE unlock, gauntlet completion and trick-shot best saved to `localStorage`.

## Headless tests

```bash
npx esbuild scripts/smoke.ts --bundle --platform=node --format=cjs | node
```

`scripts/smoke*.ts` simulate full matches (serve → rally → scoring → match end) for every mode without a browser.
