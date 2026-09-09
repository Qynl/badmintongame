// ---------------------------------------------------------------------------
// AUDIO
//
// Everything is synthesised with the Web Audio API -- no asset downloads. The
// crowd is filtered noise whose gain and brightness track match tension, so
// the stadium genuinely swells during attacks and erupts at goals.
// ---------------------------------------------------------------------------

export class MatchAudio {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.volume = 0.7;
    this.nodes = {};
    this.started = false;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const master = this.ctx.createGain();
    master.gain.value = this.volume;
    master.connect(this.ctx.destination);
    this.nodes.master = master;

    // --- Crowd bed: pink-ish noise through a resonant bandpass ---
    const noise = this.ctx.createBufferSource();
    const len = this.ctx.sampleRate * 4;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.0990460;
      b1 = 0.96300 * b1 + white * 0.2965164;
      b2 = 0.57000 * b2 + white * 1.0526913;
      d[i] = (b0 + b1 + b2 + white * 0.1848) * 0.16;
    }
    noise.buffer = buf;
    noise.loop = true;

    const crowdFilter = this.ctx.createBiquadFilter();
    crowdFilter.type = 'bandpass';
    crowdFilter.frequency.value = 620;
    crowdFilter.Q.value = 0.7;

    const crowdGain = this.ctx.createGain();
    crowdGain.gain.value = 0.0;

    // A slow amplitude wobble makes it feel like a real crowd, not static.
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.19;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.035;
    lfo.connect(lfoGain).connect(crowdGain.gain);
    lfo.start();

    noise.connect(crowdFilter).connect(crowdGain).connect(master);
    noise.start();

    this.nodes.crowdGain = crowdGain;
    this.nodes.crowdFilter = crowdFilter;
    this.enabled = true;
    this.started = true;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolume(v) {
    this.volume = v;
    if (this.nodes.master) this.nodes.master.gain.value = v;
  }

  setMuted(m) {
    if (this.nodes.master) {
      this.nodes.master.gain.value = m ? 0 : this.volume;
    }
  }

  // Called every frame with 0..1 excitement.
  updateCrowd(intensity, dt) {
    if (!this.enabled) return;
    const g = this.nodes.crowdGain;
    const f = this.nodes.crowdFilter;
    const target = 0.05 + intensity * 0.42;
    g.gain.value += (target - g.gain.value) * Math.min(1, dt * 2.2);
    // Excited crowds are brighter.
    const ft = 480 + intensity * 900;
    f.frequency.value += (ft - f.frequency.value) * Math.min(1, dt * 1.4);
  }

  _env(dur, peak = 1, attack = 0.004) {
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return g;
  }

  // --- Ball strike: a short filtered thump whose pitch tracks power ---
  kick(power = 0.6) {
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180 + power * 140, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.09);
    const g = this._env(0.14, 0.22 + power * 0.3);
    osc.connect(g).connect(this.nodes.master);
    osc.start(t); osc.stop(t + 0.16);

    // Click transient
    const nb = this.ctx.createBufferSource();
    const n = this.ctx.sampleRate * 0.03;
    const b = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const dd = b.getChannelData(0);
    for (let i = 0; i < n; i++) dd[i] = (Math.random() * 2 - 1) * (1 - i / n);
    nb.buffer = b;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 1400;
    const ng = this._env(0.05, 0.14 + power * 0.2);
    nb.connect(hp).connect(ng).connect(this.nodes.master);
    nb.start(t);
  }

  whistle(kind = 'short') {
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    const dur = kind === 'long' ? 1.15 : kind === 'double' ? 0.5 : 0.32;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(2650, t);
    const trill = this.ctx.createOscillator();
    trill.frequency.value = 42;
    const trillGain = this.ctx.createGain();
    trillGain.gain.value = 190;
    trill.connect(trillGain).connect(osc.frequency);
    trill.start(t);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 5200;
    const g = this._env(dur, 0.20, 0.012);
    osc.connect(lp).connect(g).connect(this.nodes.master);
    osc.start(t); osc.stop(t + dur + 0.05);
    trill.stop(t + dur + 0.05);
    if (kind === 'double' || kind === 'long') {
      setTimeout(() => this.whistle('short'), kind === 'long' ? 1300 : 620);
    }
  }

  // --- Crowd roar for a goal ---
  roar(size = 1) {
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    const g = this.nodes.crowdGain;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(0.85 * size, t + 0.28);
    g.gain.linearRampToValueAtTime(0.55 * size, t + 3.5);
    g.gain.linearRampToValueAtTime(0.25, t + 9);
    const f = this.nodes.crowdFilter;
    f.frequency.cancelScheduledValues(t);
    f.frequency.setValueAtTime(f.frequency.value, t);
    f.frequency.linearRampToValueAtTime(1550, t + 0.4);
    f.frequency.linearRampToValueAtTime(700, t + 7);
  }

  // Sharp collective gasp / "oooh" for a near miss.
  gasp() {
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    const g = this.nodes.crowdGain;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(0.52, t + 0.12);
    g.gain.linearRampToValueAtTime(0.16, t + 1.8);
  }

  post() {
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(420, t + 0.5);
    const g = this._env(0.7, 0.3, 0.002);
    osc.connect(g).connect(this.nodes.master);
    osc.start(t); osc.stop(t + 0.75);
    this.gasp();
  }

  tackleHit() {
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    const nb = this.ctx.createBufferSource();
    const n = this.ctx.sampleRate * 0.12;
    const b = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const dd = b.getChannelData(0);
    for (let i = 0; i < n; i++) dd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.2);
    nb.buffer = b;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 900;
    const g = this._env(0.16, 0.22);
    nb.connect(lp).connect(g).connect(this.nodes.master);
    nb.start(t);
  }

  netRipple() {
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    const nb = this.ctx.createBufferSource();
    const n = this.ctx.sampleRate * 0.35;
    const b = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const dd = b.getChannelData(0);
    for (let i = 0; i < n; i++) dd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 1.4);
    nb.buffer = b;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 1.6;
    const g = this._env(0.4, 0.14);
    nb.connect(bp).connect(g).connect(this.nodes.master);
    nb.start(t);
  }

  dispose() {
    if (this.ctx) { try { this.ctx.close(); } catch (e) { /* ignore */ } }
    this.ctx = null;
    this.enabled = false;
  }
}
