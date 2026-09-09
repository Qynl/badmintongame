import * as THREE from 'three';
import { PITCH } from '../sim/constants.js';
import { clamp, lerp, angleDiff } from '../sim/math.js';

// ---------------------------------------------------------------------------
// CAMERAS
//
// Several modes, all smoothed. The default "player" camera sits behind and
// above your footballer and frames the ball -- close enough to feel like you
// are in the match, wide enough to actually read the game.
// ---------------------------------------------------------------------------

export const CAMERA_MODES = ['player', 'firstPerson', 'broadcast', 'tactical', 'ballCam'];

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.mode = 'player';
    this.pos = new THREE.Vector3(0, 25, 45);
    this.look = new THREE.Vector3(0, 0, 0);
    this.yaw = 0;          // user camera orbit (player mode)
    this.pitchAngle = 0;
    this.shakeAmount = 0;
    this.shakeTime = 0;
    this.fov = 62;
    this.targetFov = 62;
    this.distance = 9.5;
    this.height = 4.2;
  }

  setMode(m) {
    this.mode = m;
    if (m === 'firstPerson') { this.targetFov = 82; }
    else if (m === 'tactical') { this.targetFov = 52; }
    else if (m === 'broadcast') { this.targetFov = 40; }
    else { this.targetFov = 62; }
  }

  shake(amount) {
    this.shakeAmount = Math.min(1.2, this.shakeAmount + amount);
  }

  update(dt, match, humanPlayer) {
    const ball = match.ball;
    const cam = this.camera;
    let px, py, pz, lx, ly, lz;

    switch (this.mode) {
      case 'firstPerson': {
        const p = humanPlayer;
        if (!p) return this.update(dt, match, null, 'broadcast');
        // Eye level, looking where the player faces but biased toward the ball
        // so you can actually see what matters.
        const eyeH = 1.62;
        px = p.x - Math.cos(p.facing) * 0.10;
        py = eyeH - Math.abs(Math.sin(p.anim.phase * Math.PI * 2)) * 0.035;
        pz = p.z - Math.sin(p.facing) * 0.10;
        // Look direction: player facing, blended toward the ball.
        const toBall = Math.atan2(ball.z - p.z, ball.x - p.x);
        const blend = clamp(1 - Math.hypot(ball.x - p.x, ball.z - p.z) / 40, 0.15, 0.55);
        const dir = p.facing + angleDiff(toBall, p.facing) * blend + this.yaw;
        const lookDist = 14;
        lx = px + Math.cos(dir) * lookDist;
        lz = pz + Math.sin(dir) * lookDist;
        const ballLift = clamp((ball.y - 0.5) * 0.35, -0.3, 2.5);
        ly = eyeH - 1.4 + ballLift;
        break;
      }
      case 'broadcast': {
        // Classic side-on camera that tracks the ball along the touchline.
        const t = clamp(ball.x / PITCH.halfLength, -1, 1);
        px = t * PITCH.halfLength * 0.55;
        py = 30;
        pz = -(PITCH.halfWidth + 30);
        lx = ball.x * 0.85;
        ly = 0;
        lz = ball.z * 0.5;
        break;
      }
      case 'tactical': {
        // High angled view, showing the whole shape.
        px = ball.x * 0.35;
        py = 58;
        pz = ball.z * 0.3 - 34;
        lx = ball.x * 0.6;
        ly = 0;
        lz = ball.z * 0.6;
        break;
      }
      case 'ballCam': {
        const speed = Math.hypot(ball.vx, ball.vz);
        const dir = speed > 1 ? Math.atan2(ball.vz, ball.vx) : 0;
        px = ball.x - Math.cos(dir) * 8;
        py = ball.y + 3.2;
        pz = ball.z - Math.sin(dir) * 8;
        lx = ball.x + Math.cos(dir) * 6;
        ly = ball.y;
        lz = ball.z + Math.sin(dir) * 6;
        break;
      }
      case 'player':
      default: {
        const p = humanPlayer;
        if (!p) {
          px = ball.x * 0.4; py = 34; pz = ball.z * 0.4 - 34;
          lx = ball.x; ly = 0; lz = ball.z;
          break;
        }
        // Behind the player, oriented along the axis from player to ball so
        // the ball is always framed. This is the key to an immersive but
        // playable single-player camera.
        const toBallX = ball.x - p.x;
        const toBallZ = ball.z - p.z;
        const dBall = Math.hypot(toBallX, toBallZ);
        // Blend the "behind the player" axis with the "player -> ball" axis.
        const runDir = p.speed > 1.2 ? Math.atan2(p.vz, p.vx) : p.facing;
        const ballDir = dBall > 1.5 ? Math.atan2(toBallZ, toBallX) : runDir;
        const w = clamp(1 - dBall / 34, 0.25, 0.78);
        let axis = runDir + angleDiff(ballDir, runDir) * w + this.yaw;

        // Pull back further when the ball is far away so you can see the play.
        const dist = this.distance + clamp(dBall * 0.30, 0, 11);
        const hgt = this.height + clamp(dBall * 0.14, 0, 5.5);
        px = p.x - Math.cos(axis) * dist;
        py = hgt;
        pz = p.z - Math.sin(axis) * dist;

        // Look at a point between the player and the ball.
        const lookW = clamp(0.42 - dBall * 0.004, 0.18, 0.42);
        lx = lerp(p.x, ball.x, lookW);
        lz = lerp(p.z, ball.z, lookW);
        ly = 1.0 + clamp(ball.y * 0.2, 0, 1.4);
        break;
      }
    }

    // Keep the camera above the ground and inside sensible bounds.
    py = Math.max(py, this.mode === 'firstPerson' ? 0.6 : 1.6);

    // Smoothing: snappier in first person, smoother in broadcast.
    const posK = this.mode === 'firstPerson' ? 1 - Math.pow(0.0001, dt)
      : this.mode === 'player' ? 1 - Math.pow(0.0015, dt)
      : 1 - Math.pow(0.02, dt);
    this.pos.lerp(new THREE.Vector3(px, py, pz), posK);
    this.look.lerp(new THREE.Vector3(lx, ly, lz), 1 - Math.pow(0.0008, dt));

    // Camera shake (goals, big hits)
    let sx = 0; let sy = 0;
    if (this.shakeAmount > 0.001) {
      this.shakeTime += dt * 34;
      sx = Math.sin(this.shakeTime * 1.7) * this.shakeAmount * 0.22;
      sy = Math.cos(this.shakeTime * 2.3) * this.shakeAmount * 0.18;
      this.shakeAmount *= Math.pow(0.06, dt);
    }

    cam.position.set(this.pos.x + sx, this.pos.y + sy, this.pos.z);
    cam.lookAt(this.look);

    // FOV: widens slightly at speed for a sense of pace.
    let fovBoost = 0;
    if (humanPlayer && (this.mode === 'player' || this.mode === 'firstPerson')) {
      fovBoost = clamp(humanPlayer.speed / humanPlayer.maxSpeed, 0, 1) * 7;
    }
    this.fov += ((this.targetFov + fovBoost) - this.fov) * (1 - Math.pow(0.01, dt));
    if (Math.abs(cam.fov - this.fov) > 0.05) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
  }

  // Convert a world-space movement input into camera-relative axes so "up" on
  // the stick always means "away from the camera".
  cameraRelative(inX, inZ) {
    const cam = this.camera;
    const forward = new THREE.Vector3();
    cam.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, 1);
    forward.normalize();
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    const x = forward.x * -inZ + right.x * inX;
    const z = forward.z * -inZ + right.z * inX;
    return [x, z];
  }
}
