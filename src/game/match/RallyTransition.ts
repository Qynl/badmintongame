import { MathUtils } from 'three';
/** Simulation-clock transition: pauses, resets and background tabs cannot leave a timer behind. */
export class RallyTransition {
  elapsed = -1;
  private prepared = false;
  get active() { return this.elapsed >= 0; }
  get opacity() {
    if (!this.active) return 0;
    const fadeIn = MathUtils.smoothstep(this.elapsed, 1.05, 1.35);
    const fadeOut = 1 - MathUtils.smoothstep(this.elapsed, 1.55, 1.95);
    return fadeIn * fadeOut;
  }
  begin() { this.elapsed = 0; this.prepared = false; }
  reset() { this.elapsed = -1; this.prepared = false; }
  step(dt: number) {
    if (!this.active) return { prepare: false, complete: false };
    this.elapsed += dt;
    const prepare = !this.prepared && this.elapsed >= 1.4;
    if (prepare) this.prepared = true;
    const complete = this.elapsed >= 2.0;
    if (complete) this.reset();
    return { prepare, complete };
  }
}
