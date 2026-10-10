// Procedural Web-Audio engine: SFX + an adaptive synthwave backing track.
let ctx: AudioContext | null = null
let master: GainNode | null = null
let sfxBus: GainNode | null = null
let musicBus: GainNode | null = null
let noiseBuf: AudioBuffer | null = null
let muted = false

function ensure(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = muted ? 0 : 0.9
    master.connect(ctx.destination)
    sfxBus = ctx.createGain()
    sfxBus.gain.value = 0.75
    sfxBus.connect(master)
    musicBus = ctx.createGain()
    musicBus.gain.value = 0.5
    musicBus.connect(master)

    // shared white-noise buffer
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

export function initAudio() {
  ensure()
}

export function setMuted(m: boolean) {
  muted = m
  if (ctx && master) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.05)
}
export function isMuted() {
  return muted
}

function tone(
  freq: number,
  dur: number,
  type: OscillatorType,
  gain: number,
  opts: { slideTo?: number; attack?: number; bus?: GainNode } = {}
) {
  const c = ensure()
  if (!c || !sfxBus) return
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  const t0 = c.currentTime
  o.frequency.setValueAtTime(freq, t0)
  if (opts.slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slideTo), t0 + dur)
  const atk = opts.attack ?? 0.004
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(gain, t0 + atk)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  o.connect(g)
  g.connect(opts.bus ?? sfxBus)
  o.start(t0)
  o.stop(t0 + dur + 0.05)
}

function noiseHit(dur: number, gain: number, filterFreq: number, q = 1.2) {
  const c = ensure()
  if (!c || !sfxBus || !noiseBuf) return
  const src = c.createBufferSource()
  src.buffer = noiseBuf
  const f = c.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = filterFreq
  f.Q.value = q
  const g = c.createGain()
  const t0 = c.currentTime
  g.gain.setValueAtTime(gain, t0)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  src.connect(f)
  f.connect(g)
  g.connect(sfxBus)
  src.start(t0)
  src.stop(t0 + dur + 0.05)
}

// ── SFX ─────────────────────────────────────────────────────────────────────
export const sfx = {
  ui() {
    tone(660, 0.07, 'square', 0.12)
    tone(990, 0.09, 'square', 0.08)
  },
  uiBack() {
    tone(520, 0.07, 'square', 0.1)
    tone(330, 0.1, 'square', 0.08)
  },
  paddleHit(power: number) {
    // layered "pock": low thump + mid body + high crack
    const p = Math.min(1, Math.max(0, power))
    tone(120, 0.1, 'sine', 0.5, { slideTo: 70 })
    tone(220 + p * 300, 0.08, 'triangle', 0.42, { slideTo: 140 })
    noiseHit(0.05, 0.3 + p * 0.2, 2400 + p * 2800, 2)
  },
  wallHit(power: number) {
    const p = Math.min(1, Math.max(0, power))
    tone(150 + p * 180, 0.1, 'triangle', 0.5, { slideTo: 100 })
    noiseHit(0.06, 0.3, 1800, 2)
  },
  tableBounce() {
    tone(240, 0.07, 'sine', 0.4, { slideTo: 160 })
    noiseHit(0.04, 0.18, 900, 1.5)
  },
  smash() {
    tone(90, 0.22, 'sawtooth', 0.5, { slideTo: 40 })
    noiseHit(0.18, 0.5, 1400, 0.8)
    tone(1400, 0.12, 'square', 0.12, { slideTo: 300 })
    // whoosh
    noiseSweep(0.28, 0.3, 5000, 400)
  },
  perfect(combo: number) {
    const base = 880 * Math.pow(1.12, Math.min(combo, 6))
    tone(base, 0.12, 'triangle', 0.3)
    setTimeout(() => tone(base * 1.5, 0.18, 'triangle', 0.26), 60)
    noiseHit(0.08, 0.14, 6000, 1)
  },
  chargeUp() {
    tone(200, 0.3, 'sawtooth', 0.1, { slideTo: 700 })
  },
  net() {
    tone(120, 0.16, 'sawtooth', 0.35, { slideTo: 60 })
    noiseHit(0.12, 0.25, 500, 1)
  },
  point(win: boolean) {
    if (win) {
      tone(523, 0.1, 'square', 0.16)
      setTimeout(() => tone(784, 0.12, 'square', 0.16), 90)
      setTimeout(() => tone(1046, 0.2, 'square', 0.18), 180)
      sfx.crowdCheer()
    } else {
      tone(392, 0.12, 'square', 0.14)
      setTimeout(() => tone(261, 0.22, 'square', 0.14), 110)
    }
  },
  crowdCheer() {
    noiseSweep(0.9, 0.22, 900, 2400)
  },
  flow() {
    tone(300, 0.5, 'sawtooth', 0.14, { slideTo: 1200 })
    noiseHit(0.4, 0.12, 3000, 0.7)
  },
  serve() {
    tone(440, 0.08, 'triangle', 0.2, { slideTo: 660 })
  },
  matchWin() {
    const seq = [523, 659, 784, 1046, 1318]
    seq.forEach((f, i) => setTimeout(() => tone(f, 0.24, 'square', 0.16), i * 130))
    setTimeout(() => sfx.crowdCheer(), 200)
    setTimeout(() => sfx.crowdCheer(), 700)
  },
  matchLose() {
    const seq = [392, 349, 311, 261]
    seq.forEach((f, i) => setTimeout(() => tone(f, 0.28, 'square', 0.13), i * 160))
  },
  target() {
    tone(880, 0.09, 'square', 0.2, { slideTo: 1320 })
    setTimeout(() => tone(1760, 0.14, 'triangle', 0.16), 60)
  },
}

function noiseSweep(dur: number, gain: number, f0: number, f1: number) {
  const c = ensure()
  if (!c || !sfxBus || !noiseBuf) return
  const src = c.createBufferSource()
  src.buffer = noiseBuf
  src.loop = true
  const f = c.createBiquadFilter()
  f.type = 'bandpass'
  f.Q.value = 1.4
  const t0 = c.currentTime
  f.frequency.setValueAtTime(f0, t0)
  f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.25)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  src.connect(f)
  f.connect(g)
  g.connect(sfxBus)
  src.start(t0)
  src.stop(t0 + dur + 0.05)
}

// ── player charge riser (polled every frame from the render loop) ──────────
let chargeOsc: OscillatorNode | null = null
let chargeGain: GainNode | null = null

export function updateChargeAudio(charging: boolean, charge: number) {
  const c = ensure()
  if (!c || !sfxBus) return
  if (charging && charge > 0.02) {
    if (!chargeOsc) {
      chargeOsc = c.createOscillator()
      chargeGain = c.createGain()
      chargeOsc.type = 'sawtooth'
      chargeOsc.frequency.value = 160
      chargeGain.gain.value = 0.0001
      const f = c.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = 1600
      chargeOsc.connect(f)
      f.connect(chargeGain)
      chargeGain.connect(sfxBus)
      chargeOsc.start()
    }
    chargeOsc.frequency.setTargetAtTime(160 + charge * 640, c.currentTime, 0.03)
    chargeGain!.gain.setTargetAtTime(0.028 + charge * 0.03, c.currentTime, 0.04)
  } else if (chargeOsc) {
    chargeGain!.gain.setTargetAtTime(0.0001, c.currentTime, 0.03)
    const osc = chargeOsc
    setTimeout(() => {
      try {
        osc.stop()
      } catch {
        /* already stopped */
      }
    }, 120)
    chargeOsc = null
    chargeGain = null
  }
}

// ── Adaptive synthwave backing track ─────────────────────────────────────────
// A simple generative loop: kick, bass, arps. Intensity layers join in as the
// rally heats up (energy 0..3).
const BPM = 100
const STEP_DUR = 60 / BPM / 2 // 8th notes
let musicOn = false
let intensity = 0
let step = 0
let nextTime = 0
let timer: number | null = null

const A = 110
const scale = [A, A * 1.1892, A * 1.3348, A * 1.4983, A * 1.7818, A * 2] // A minor-ish
const bassline = [0, 0, 3, 0, 4, 0, 3, 2]
const arpline = [5, 4, 3, 2, 3, 4, 5, 4]

function scheduleStep(t: number, s: number) {
  const c = ctx
  if (!c || !musicBus) return
  const beat = s % 8

  // kick on every beat when intensity>=1
  if (intensity >= 1 && beat % 2 === 0) {
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(120, t)
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12)
    g.gain.setValueAtTime(0.5, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14)
    o.connect(g)
    g.connect(musicBus)
    o.start(t)
    o.stop(t + 0.2)
  }

  // hats always (subtle)
  if (noiseBuf) {
    const src = c.createBufferSource()
    src.buffer = noiseBuf
    const f = c.createBiquadFilter()
    f.type = 'highpass'
    f.frequency.value = 7000
    const g = c.createGain()
    const acc = beat % 2 === 1 ? 0.05 : 0.02
    g.gain.setValueAtTime(acc, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04)
    src.connect(f)
    f.connect(g)
    g.connect(musicBus)
    src.start(t)
    src.stop(t + 0.06)
  }

  // bass drone from intensity 0
  if (beat % 2 === 0) {
    const idx = bassline[(s / 2) % 8 | 0]
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = 'sawtooth'
    o.frequency.value = scale[idx] / 2
    const f = c.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 400
    g.gain.setValueAtTime(0.001, t)
    g.gain.exponentialRampToValueAtTime(0.14, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.001, t + STEP_DUR * 1.8)
    o.connect(f)
    f.connect(g)
    g.connect(musicBus)
    o.start(t)
    o.stop(t + STEP_DUR * 2)
  }

  // arps from intensity 2
  if (intensity >= 2) {
    const idx = arpline[beat]
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = 'square'
    o.frequency.value = scale[idx] * 2
    g.gain.setValueAtTime(0.001, t)
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.001, t + STEP_DUR * 0.9)
    o.connect(g)
    g.connect(musicBus)
    o.start(t)
    o.stop(t + STEP_DUR)
  }
}

function tick() {
  const c = ctx
  if (!c) return
  while (nextTime < c.currentTime + 0.15) {
    scheduleStep(nextTime, step)
    nextTime += STEP_DUR
    step++
  }
}

export function startMusic() {
  const c = ensure()
  if (!c) return
  if (musicOn) return
  musicOn = true
  step = 0
  nextTime = c.currentTime + 0.1
  timer = window.setInterval(tick, 60)
}

export function stopMusic() {
  musicOn = false
  if (timer !== null) {
    clearInterval(timer)
    timer = null
  }
}

export function setMusicIntensity(i: number) {
  intensity = Math.max(0, Math.min(3, Math.round(i)))
}
