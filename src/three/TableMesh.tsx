import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { TABLE, HALF_L, HALF_W, NET_H } from '../game/constants'
import { engine } from '../game/engine'

const TABLE_VERT = /* glsl */ `
varying vec2 vPos;
void main() {
  vPos = vec2(position.x, -position.y);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const TABLE_FRAG = /* glsl */ `
precision highp float;
varying vec2 vPos;
uniform float uTime;
uniform float uSimTime;
uniform float uPulse;
uniform vec3 uBall;   // x, z, visible
uniform vec4 uRip0;   // x, z, startTime, strength
uniform vec4 uRip1;
uniform vec4 uRip2;
uniform vec4 uRip3;

float gridLines(vec2 p, float scale, float w) {
  vec2 c = abs(fract(p / scale) - 0.5) * scale;
  float d = min(c.x, c.y);
  return 1.0 - smoothstep(0.0, w, d);
}

float rippleWave(vec4 r) {
  if (r.z < 0.0) return 0.0;
  float age = uSimTime - r.z;
  if (age < 0.0 || age > 1.4) return 0.0;
  float dist = distance(vPos, r.xy);
  float ring = exp(-abs(dist - age * 4.2) * 2.6);
  float fade = 1.0 - age / 1.4;
  return ring * fade * fade * r.w;
}

void main() {
  vec2 hw = vec2(${HALF_W.toFixed(2)}, ${HALF_L.toFixed(2)});
  vec2 uv = vPos / hw; // -1..1

  // base: deep metallic navy with soft radial falloff
  float rad = length(uv);
  vec3 base = mix(vec3(0.055, 0.075, 0.24), vec3(0.024, 0.032, 0.125), smoothstep(0.1, 1.5, rad));

  // faint moving sheen
  float sheen = sin(vPos.x * 0.9 + vPos.y * 0.45 - uTime * 1.1) * 0.5 + 0.5;
  base += vec3(0.012, 0.02, 0.05) * sheen;

  // energy grid
  float grid = gridLines(vPos + hw, 0.62, 0.022);
  float gridGlow = 0.16 + uPulse * 0.85;
  vec3 lineCol = vec3(0.13, 0.83, 0.93);
  base += lineCol * grid * gridGlow;

  // center line (magenta)
  float center = 1.0 - smoothstep(0.0, 0.028, abs(vPos.x));
  float dash = step(0.5, fract(vPos.y * 0.8 - uTime * 0.6));
  base += vec3(0.91, 0.47, 0.98) * center * (0.5 + dash * 0.35 + uPulse * 0.8);

  // boundary glow
  vec2 edgeDist = hw - abs(vPos);
  float edge = 1.0 - smoothstep(0.0, 0.09, min(edgeDist.x, edgeDist.y));
  float race = 0.65 + 0.35 * sin((vPos.x + vPos.y) * 1.2 - uTime * 3.0);
  base += lineCol * edge * (0.9 + uPulse * 1.6) * race;

  // ball hover glow
  if (uBall.z > 0.5) {
    float d = distance(vPos, uBall.xy);
    base += vec3(1.0, 0.95, 0.8) * exp(-d * d * 1.6) * 0.30;
    base += lineCol * exp(-d * d * 5.0) * 0.22;
  }

  // bounce ripples
  float rip = rippleWave(uRip0) + rippleWave(uRip1) + rippleWave(uRip2) + rippleWave(uRip3);
  base += vec3(0.35, 0.9, 1.0) * rip * 0.9;
  base += vec3(0.9, 0.5, 1.0) * rip * rip * 0.8;

  gl_FragColor = vec4(base, 1.0);
}
`

const NET_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uPulse;
void main() {
  vec2 g = vUv * vec2(64.0, 10.0);
  vec2 f = abs(fract(g) - 0.5);
  float line = smoothstep(0.36, 0.5, max(f.x, f.y));
  float shimmer = 0.75 + 0.25 * sin(uTime * 2.0 + vUv.x * 24.0);
  vec3 col = vec3(0.72, 0.8, 0.98) * shimmer;
  float alpha = line * (0.30 + uPulse * 0.25);
  gl_FragColor = vec4(col, alpha);
}
`

const NET_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export function TableMesh() {
  const tableMat = useRef<THREE.ShaderMaterial>(null)
  const netMat = useRef<THREE.ShaderMaterial>(null)
  const edgeMats = useRef<THREE.MeshBasicMaterial[]>([])
  const ripVecs = useMemo(
    () => [new THREE.Vector4(0, 0, -10, 0), new THREE.Vector4(0, 0, -10, 0), new THREE.Vector4(0, 0, -10, 0), new THREE.Vector4(0, 0, -10, 0)],
    []
  )

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSimTime: { value: 0 },
      uPulse: { value: 0 },
      uBall: { value: new THREE.Vector3(0, 0, 0) },
      uRip0: { value: ripVecs[0] },
      uRip1: { value: ripVecs[1] },
      uRip2: { value: ripVecs[2] },
      uRip3: { value: ripVecs[3] },
    }),
    [ripVecs]
  )

  const netUniforms = useMemo(() => ({ uTime: { value: 0 }, uPulse: { value: 0 } }), [])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (tableMat.current) {
      const u = tableMat.current.uniforms
      u.uTime.value = t
      u.uSimTime.value = engine.simTime
      u.uPulse.value = engine.hitPulse
      const b = engine.ball
      const overTable = Math.abs(b.pos.x) <= HALF_W + 1 && Math.abs(b.pos.z) <= HALF_L + 1
      ;(u.uBall.value as THREE.Vector3).set(b.pos.x, b.pos.z, b.visible && overTable ? 1 : 0)
      // copy engine ripples (newest 4)
      const rips = engine.ripples.slice(-4)
      for (let i = 0; i < 4; i++) {
        const rv = ripVecs[i]
        const r = rips[i]
        if (r) rv.set(r.x, r.z, r.t, r.s)
        else rv.set(0, 0, -10, 0)
      }
    }
    if (netMat.current) {
      netMat.current.uniforms.uTime.value = t
      netMat.current.uniforms.uPulse.value = engine.hitPulse
    }
    // edge piping pulse
    const c = 0.75 + engine.hitPulse * 0.6 + Math.sin(t * 2.4) * 0.06
    for (const m of edgeMats.current) {
      if (m) m.color.setRGB(0.13 * c * 2.2, 0.83 * c, 0.93 * c)
    }
  })

  const reg = (el: THREE.MeshBasicMaterial | null, i: number) => {
    if (el) edgeMats.current[i] = el
  }

  return (
    <group>
      {/* table body */}
      <mesh position={[0, TABLE.H - TABLE.T / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[TABLE.W, TABLE.T, TABLE.L]} />
        <meshStandardMaterial color="#0a0e2a" roughness={0.4} metalness={0.6} />
      </mesh>

      {/* energy surface */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, TABLE.H + 0.004, 0]}>
        <planeGeometry args={[TABLE.W, TABLE.L]} />
        <shaderMaterial ref={tableMat} vertexShader={TABLE_VERT} fragmentShader={TABLE_FRAG} uniforms={uniforms} />
      </mesh>

      {/* metallic frame */}
      <mesh position={[0, TABLE.H - TABLE.T - 0.03, 0]}>
        <boxGeometry args={[TABLE.W + 0.16, 0.09, TABLE.L + 0.16]} />
        <meshStandardMaterial color="#141238" roughness={0.3} metalness={0.85} />
      </mesh>

      {/* glowing edge piping */}
      {([
        [0, HALF_L + 0.09, TABLE.W + 0.18, 0.05],
        [0, -HALF_L - 0.09, TABLE.W + 0.18, 0.05],
      ] as const).map(([x, z, w, d], i) => (
        <mesh key={`e${i}`} position={[x, TABLE.H + 0.005, z]}>
          <boxGeometry args={[w, 0.025, d]} />
          <meshBasicMaterial ref={(el) => reg(el, i)} color="#22d3ee" toneMapped={false} />
        </mesh>
      ))}
      {([HALF_W + 0.09, -HALF_W - 0.09] as const).map((x, i) => (
        <mesh key={`s${i}`} position={[x, TABLE.H + 0.005, 0]}>
          <boxGeometry args={[0.05, 0.025, TABLE.L + 0.24]} />
          <meshBasicMaterial ref={(el) => reg(el, i + 2)} color="#22d3ee" toneMapped={false} />
        </mesh>
      ))}

      {/* corner accent lights */}
      {([
        [HALF_W + 0.09, HALF_L + 0.09],
        [-HALF_W - 0.09, HALF_L + 0.09],
        [HALF_W + 0.09, -HALF_L - 0.09],
        [-HALF_W - 0.09, -HALF_L - 0.09],
      ] as const).map(([x, z], i) => (
        <mesh key={`c${i}`} position={[x, TABLE.H + 0.02, z]}>
          <sphereGeometry args={[0.07, 12, 12]} />
          <meshBasicMaterial color="#e879f9" toneMapped={false} />
        </mesh>
      ))}

      {/* legs with light strips */}
      {([
        [-HALF_W + 0.35, HALF_L - 0.5],
        [HALF_W - 0.35, HALF_L - 0.5],
        [-HALF_W + 0.35, -HALF_L + 0.5],
        [HALF_W - 0.35, -HALF_L + 0.5],
      ] as const).map(([x, z], i) => (
        <group key={`l${i}`} position={[x, 0, z]}>
          <mesh position={[0, (TABLE.H - TABLE.T) / 2, 0]}>
            <boxGeometry args={[0.16, TABLE.H - TABLE.T, 0.16]} />
            <meshStandardMaterial color="#0f0d28" roughness={0.5} metalness={0.7} />
          </mesh>
          <mesh position={[0, (TABLE.H - TABLE.T) / 2, 0.085]}>
            <boxGeometry args={[0.03, TABLE.H - TABLE.T - 0.1, 0.01]} />
            <meshBasicMaterial color={i % 2 ? '#e879f9' : '#22d3ee'} toneMapped={false} />
          </mesh>
        </group>
      ))}

      {/* under-table glow */}
      <pointLight position={[0, TABLE.H - 0.45, 0]} intensity={6} color="#7c3aed" distance={7} />

      {/* net */}
      <group>
        <mesh position={[0, TABLE.H + NET_H / 2, 0]}>
          <planeGeometry args={[TABLE.W + 0.36, NET_H]} />
          <shaderMaterial
            ref={netMat}
            vertexShader={NET_VERT}
            fragmentShader={NET_FRAG}
            uniforms={netUniforms}
            transparent
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
        {/* top cord */}
        <mesh position={[0, TABLE.H + NET_H + 0.01, 0]}>
          <boxGeometry args={[TABLE.W + 0.38, 0.035, 0.03]} />
          <meshBasicMaterial color="#f472b6" toneMapped={false} />
        </mesh>
        {/* posts */}
        {[-1, 1].map((s) => (
          <group key={`p${s}`} position={[s * (HALF_W + 0.19), 0, 0]}>
            <mesh position={[0, TABLE.H + NET_H / 2, 0]}>
              <cylinderGeometry args={[0.032, 0.045, NET_H + 0.06, 10]} />
              <meshStandardMaterial color="#312e81" metalness={0.8} roughness={0.25} />
            </mesh>
            <mesh position={[0, TABLE.H + NET_H + 0.05, 0]}>
              <sphereGeometry args={[0.05, 10, 10]} />
              <meshBasicMaterial color="#f472b6" toneMapped={false} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  )
}
