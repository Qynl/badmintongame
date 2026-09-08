import type { Vector3 } from 'three';
// Procedural samples: no network latency, no unlicensed audio assets.
export class AudioManager {
  private context: AudioContext | null = null; private master: GainNode | null = null;
  private ambience: AudioBufferSourceNode | null = null; private footTimer = 0;
  async unlock() {
    if (!this.context) {
      this.context = new AudioContext(); this.master = this.context.createGain(); this.master.connect(this.context.destination);
      const buffer = this.noise(3); const source = this.context.createBufferSource(); source.buffer = buffer; source.loop = true;
      const filter = this.context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 260;
      const gain = this.context.createGain(); gain.gain.value = 0.012; source.connect(filter); filter.connect(gain); gain.connect(this.master); source.start(); this.ambience = source;
    }
    await this.context.resume();
  }
  private noise(duration: number) { const ctx = this.context!; const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate); const data = buffer.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1; return buffer; }
  volume(volume: number) { if (this.master && this.context) this.master.gain.setTargetAtTime(volume, this.context.currentTime, 0.1); }
  listener(position: Vector3, forward: Vector3) {
    if (!this.context) return; const l = this.context.listener;
    if (l.positionX) { l.positionX.value = position.x; l.positionY.value = position.y; l.positionZ.value = position.z; l.forwardX.value = forward.x; l.forwardY.value = forward.y; l.forwardZ.value = forward.z; l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0; }
  }
  sound(kind: 'hit' | 'smash' | 'step' | 'squeak' | 'net' | 'land' | 'flight', power: number, position: Vector3) {
    const ctx = this.context; if (!ctx || !this.master || ctx.state !== 'running') return;
    const impact = kind === 'hit' || kind === 'smash';
    const t = ctx.currentTime, duration = impact ? 0.13 : kind === 'squeak' ? 0.15 : kind === 'flight' ? 0.1 : 0.09;
    const source = ctx.createBufferSource(); source.buffer = this.noise(duration);
    const filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = kind === 'smash' ? 3000 + power * 10 : kind === 'hit' ? 1700 + power * 15 : kind === 'squeak' ? 2400 : kind === 'flight' ? 4300 : 260;
    filter.Q.value = kind === 'squeak' ? 16 : 0.7;
    const gain = ctx.createGain(); const volume = impact ? Math.min(0.8, 0.16 + power / 65) : kind === 'flight' ? 0.025 : kind === 'net' ? 0.07 : 0.16;
    gain.gain.setValueAtTime(volume, t); gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    const panner = ctx.createPanner(); panner.panningModel = 'HRTF'; panner.distanceModel = 'inverse'; panner.refDistance = 3; panner.positionX.value = position.x; panner.positionY.value = position.y; panner.positionZ.value = position.z;
    source.connect(filter); filter.connect(gain); gain.connect(panner); panner.connect(this.master); source.start(); source.stop(t + duration);
    if (kind === 'smash') {
      // A short string-bed body underneath the feather/cork crack, spatialized at contact.
      const body = ctx.createOscillator(), bodyGain = ctx.createGain();
      body.type = 'sine'; body.frequency.setValueAtTime(370, t); body.frequency.exponentialRampToValueAtTime(160, t + 0.065);
      bodyGain.gain.setValueAtTime(0.17, t); bodyGain.gain.exponentialRampToValueAtTime(0.001, t + 0.085);
      body.connect(bodyGain); bodyGain.connect(panner); body.start(t); body.stop(t + 0.09);
      body.onended = () => { body.disconnect(); bodyGain.disconnect(); };
    }
    // A quiet delayed reflection suggests the large sports hall.
    if (impact) { const delay = ctx.createDelay(); delay.delayTime.value = 0.085; const echo = ctx.createGain(); echo.gain.value = 0.12; gain.connect(delay); delay.connect(echo); echo.connect(this.master); source.onended = () => { setTimeout(() => { source.disconnect(); filter.disconnect(); gain.disconnect(); panner.disconnect(); delay.disconnect(); echo.disconnect(); }, 200); }; }
    else source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); panner.disconnect(); };
  }
  footsteps(dt: number, speed: number, position: Vector3) { this.footTimer += dt * speed; if (this.footTimer > 1.65) { this.footTimer = 0; this.sound('step', speed, position); } }
  suspend() { void this.context?.suspend(); }
  dispose() { this.ambience?.stop(); void this.context?.close(); this.context = null; }
}
export const audio = new AudioManager();
