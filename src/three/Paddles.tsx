import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { engine } from '../game/engine'
import { useStore } from '../game/store'
import { SKINS, PLAYER_Z, AI_Z, TABLE, HALF_L, clamp } from '../game/constants'

const FACE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const FACE_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec3 uColor;
uniform float uCharge;
uniform float uSwing;
uniform float uFlash;
uniform float uTime;

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float ang = atan(p.y, p.x);

  // concentric circuit rings
  float rr = fract(r * 4.5);
  float ring = smoothstep(0.09, 0.0, min(rr, 1.0 - rr));
  // radial spokes
  float ss = fract(ang / 6.28318 * 16.0);
  float spoke = smoothstep(0.07, 0.0, min(ss, 1.0 - ss)) * smoothstep(0.18, 0.5, r);
  // rotating energy sweep
  float sweep = pow(0.5 + 0.5 * cos(ang - uTime * 2.4), 10.0);
  // edge rim
  float rim = smoothstep(0.82, 1.0, r);

  float base = 0.30 + uCharge * 1.0;
  float pattern = ring * (0.45 + uCharge * 1.3) + spoke * (0.3 + uCharge * 0.9);
  float b = base + pattern + sweep * (0.35 + uCharge * 0.8) + rim * (0.9 + uCharge) + uSwing * 0.9 + uFlash * 2.4;

  // charge overheat shimmer
  b += uCharge * uCharge * 0.25 * sin(uTime * 22.0 + r * 30.0);

  vec3 white = vec3(1.0);
  vec3 col = mix(uColor, white, clamp(uFlash * 0.8 + max(0.0, uCharge - 0.85) * 0.6, 0.0, 1.0));
  gl_FragColor = vec4(col * b, 1.0);
}
`

const CHARGE_N = 22

function PaddleMesh({ side }: { side: 'player' | 'ai' }) {
  const group = useRef<THREE.Group>(null)
  const faceMat = useRef<THREE.ShaderMaterial>(null)
  const glow = useRef<THREE.PointLight>(null)
  const chargePts = useRef<THREE.Points>(null)
  const chargeMat = useRef<THREE.PointsMaterial>(null)
  const skin = useStore((s) => s.skin)
  const skinDef = SKINS[skin]

  const faceUniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color('#22d3ee') },
      uCharge: { value: 0 },
      uSwing: { value: 0 },
      uFlash: { value: 0 },
      uTime: { value: 0 },
    }),
    []
  )

  const chargeGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(CHARGE_N * 3), 3))
    return g
  }, [])

  useFrame(({ clock }) => {
    const g = group.current
    if (!g) return
    const pad = side === 'player' ? engine.player : engine.ai
    const z = side === 'player' ? PLAYER_Z : AI_Z
    const t = clock.elapsedTime
    const bob = Math.sin(t * 2.2 + (side === 'ai' ? 1.7 : 0)) * 0.04

    const lunge = pad.swingAnim * pad.swingAnim * 0.42
    g.position.x = pad.x + (pad.charge >= 1 ? Math.sin(t * 40) * 0.025 : 0)
    g.position.y = 1.5 + bob + pad.charge * 0.18
    g.position.z = z - (side === 'player' ? lunge : -lunge)

    const windUp = -0.22 - pad.charge * 0.68
    const snap = pad.swingAnim * 1.4
    g.rotation.x = (side === 'player' ? 1 : -1) * (windUp + snap)
    g.rotation.z = clamp(-pad.vx * 0.04, -0.5, 0.5)

    const pulse = pad.charge >= 1 ? 1 + Math.sin(t * 18) * 0.05 : 1
    g.scale.setScalar(pulse)

    // face shader uniforms
    const color = side === 'player' ? skinDef.color : engine.tier.color
    faceUniforms.uColor.value.set(color)
    faceUniforms.uCharge.value = pad.charge
    faceUniforms.uSwing.value = pad.swingAnim
    faceUniforms.uTime.value = t
    faceUniforms.uFlash.value = side === 'ai' ? (Math.sin(t * 30) > 0 ? engine.aiSmashFlash : 0) : 0

    if (glow.current) {
      glow.current.intensity = pad.charge * 18 + 0.8 + pad.swingAnim * 10 + faceUniforms.uFlash.value * 14
      glow.current.color.set(faceUniforms.uFlash.value > 0.3 ? '#ffffff' : side === 'player' ? skinDef.glow : color)
    }

    // charge particles spiral into the blade
    const pts = chargePts.current
    if (pts) {
      const show = pad.charge > 0.04
      pts.visible = show
      if (show) {
        const pos = chargeGeo.getAttribute('position') as THREE.BufferAttribute
        for (let i = 0; i < CHARGE_N; i++) {
          const ph = i * 0.71 + t * (3 + (i % 4))
          const rad = 0.85 - pad.charge * 0.5 - ((t * 1.5 + i * 0.13) % 0.3)
          pos.setXYZ(i, Math.cos(ph) * rad, Math.sin(ph) * rad, -0.1 - (i % 3) * 0.08)
        }
        pos.needsUpdate = true
        if (chargeMat.current) {
          chargeMat.current.opacity = 0.25 + pad.charge * 0.75
          chargeMat.current.size = 0.035 + pad.charge * 0.045
        }
      }
    }
  })

  return (
    <group ref={group}>
      <group rotation={[0, side === 'player' ? Math.PI : 0, 0]}>
        {/* blade face (shader) */}
        <mesh position={[0, 0, 0.05]}>
          <circleGeometry args={[0.44, 40]} />
          <shaderMaterial ref={faceMat} vertexShader={FACE_VERT} fragmentShader={FACE_FRAG} uniforms={faceUniforms} toneMapped={false} />
        </mesh>
        {/* back plate */}
        <mesh position={[0, 0, -0.03]} rotation={[0, Math.PI, 0]}>
          <circleGeometry args={[0.45, 40]} />
          <meshStandardMaterial color="#100d2c" roughness={0.4} metalness={0.7} />
        </mesh>
        {/* metallic rim */}
        <mesh>
          <torusGeometry args={[0.445, 0.038, 12, 44]} />
          <meshStandardMaterial color="#2a2560" roughness={0.25} metalness={0.9} />
        </mesh>
        {/* handle */}
        <mesh position={[0, -0.62, 0.02]} rotation={[0.28, 0, 0]}>
          <cylinderGeometry args={[0.055, 0.075, 0.46, 12]} />
          <meshStandardMaterial color="#1e1b4b" roughness={0.45} metalness={0.65} />
        </mesh>
        <mesh position={[0, -0.85, 0.08]}>
          <sphereGeometry args={[0.075, 10, 10]} />
          <meshStandardMaterial color="#312e81" roughness={0.3} metalness={0.8} />
        </mesh>
      </group>
      {/* charge particles */}
      <points ref={chargePts} geometry={chargeGeo} visible={false}>
        <pointsMaterial
          ref={chargeMat}
          color={side === 'player' ? skinDef.glow : '#ffffff'}
          size={0.05}
          transparent
          opacity={0.6}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          sizeAttenuation
        />
      </points>
      <pointLight ref={glow} position={[0, 0, side === 'player' ? -0.55 : 0.55]} color="#22d3ee" distance={3.6} />
    </group>
  )
}

function ServeGhost() {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    const m = ref.current
    if (!m) return
    const showing = engine.phase === 'serve' && engine.mode !== 'demo'
    if (!showing) {
      m.visible = false
      return
    }
    m.visible = true
    const mat = m.material as THREE.MeshBasicMaterial
    if (engine.server === 'player') {
      const aimX = clamp(engine.player.tx * 0.62, -1.95, 1.95)
      m.position.set(aimX, TABLE.H + 0.03, -(HALF_L - 1.4))
      mat.color.set('#67e8f9')
    } else {
      const aimX = clamp(engine.ai.tx * 0.62, -1.95, 1.95)
      m.position.set(aimX, TABLE.H + 0.03, HALF_L - 1.4)
      mat.color.set('#f0abfc')
    }
    const s = 1 + Math.sin(clock.elapsedTime * 6) * 0.12
    m.scale.set(s, s, 1)
    mat.opacity = 0.4 + Math.sin(clock.elapsedTime * 6) * 0.15
  })
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.22, 0.34, 32]} />
      <meshBasicMaterial color="#67e8f9" transparent opacity={0.4} side={2} toneMapped={false} />
    </mesh>
  )
}

export function Paddles() {
  return (
    <group>
      <PaddleMesh side="player" />
      <PaddleMesh side="ai" />
      <ServeGhost />
    </group>
  )
}
