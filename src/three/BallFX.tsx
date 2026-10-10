import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { engine } from '../game/engine'
import { BALL_R, TABLE, HALF_W, HALF_L } from '../game/constants'

const RIBBON_N = 30
const TRAIL_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
const TRAIL_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uHeat;
uniform float uOpacity;
void main() {
  float f = vUv.x; // 0 tail → 1 head
  float edge = 1.0 - abs(vUv.y - 0.5) * 2.0;
  edge = pow(edge, 1.4);
  float alpha = f * f * edge * uOpacity;
  vec3 col = mix(uColorA, uColorB, uHeat) * (0.7 + f * 1.3);
  gl_FragColor = vec4(col, alpha);
}
`

const tmpVec = new THREE.Vector3()
const dirVec = new THREE.Vector3()
const sideVec = new THREE.Vector3()
const upVec = new THREE.Vector3(0, 1, 0)

export function BallFX() {
  const mesh = useRef<THREE.Mesh>(null)
  const mat = useRef<THREE.MeshStandardMaterial>(null)
  const light = useRef<THREE.PointLight>(null)
  const shadow = useRef<THREE.Mesh>(null)
  const shadowMat = useRef<THREE.MeshBasicMaterial>(null)

  const history = useMemo(() => [] as THREE.Vector3[], [])
  const cool = useMemo(() => new THREE.Color('#ffffff'), [])
  const hot = useMemo(() => new THREE.Color('#ffb347'), [])

  // ribbon geometry (positions updated per frame)
  const ribbon = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const positions = new Float32Array(RIBBON_N * 2 * 3)
    const uvs = new Float32Array(RIBBON_N * 2 * 2)
    const indices: number[] = []
    for (let i = 0; i < RIBBON_N; i++) {
      const f = i / (RIBBON_N - 1)
      uvs[i * 4] = f
      uvs[i * 4 + 1] = 0
      uvs[i * 4 + 2] = f
      uvs[i * 4 + 3] = 1
      if (i < RIBBON_N - 1) {
        const a = i * 2
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
      }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
    geo.setIndex(indices)
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1000)
    return geo
  }, [])

  const trailUniforms = useMemo(
    () => ({
      uColorA: { value: new THREE.Color('#38bdf8') },
      uColorB: { value: new THREE.Color('#ffb347') },
      uHeat: { value: 0 },
      uOpacity: { value: 0.85 },
    }),
    []
  )

  useFrame(() => {
    const b = engine.ball
    const m = mesh.current
    if (!m) return
    m.visible = b.visible
    m.position.set(b.pos.x, b.pos.y, b.pos.z)

    // stretch along velocity / squash on bounce
    if (b.squash > 0) {
      m.rotation.set(0, 0, 0)
      m.scale.set(1 + b.squash * 0.35, 1 - b.squash * 0.45, 1 + b.squash * 0.35)
    } else {
      const speed = Math.hypot(b.vel.x, b.vel.y, b.vel.z)
      const stretch = Math.min(0.9, Math.max(0, (speed - 8) / 10))
      if (speed > 0.5 && b.active) {
        tmpVec.set(b.pos.x + b.vel.x, b.pos.y + b.vel.y, b.pos.z + b.vel.z)
        m.lookAt(tmpVec)
        m.scale.set(1 - stretch * 0.25, 1 - stretch * 0.25, 1 + stretch)
      } else {
        m.scale.set(1, 1, 1)
      }
    }

    if (mat.current) {
      tmpVec.set(0, 0, 0)
      const c = cool.clone().lerp(hot, b.heat)
      mat.current.emissive.copy(c)
      mat.current.emissiveIntensity = 1.7 + b.heat * 2.6
      mat.current.color.copy(c)
    }
    if (light.current) {
      light.current.position.copy(m.position)
      light.current.intensity = b.visible ? 4 + b.heat * 12 : 0
      light.current.color.copy(cool).lerp(hot, b.heat)
    }

    // blob shadow
    const sh = shadow.current
    if (sh && shadowMat.current) {
      if (!b.visible) {
        sh.visible = false
      } else {
        sh.visible = true
        const overTable = Math.abs(b.pos.x) <= HALF_W + 0.3 && Math.abs(b.pos.z) <= HALF_L + 0.3
        sh.position.set(b.pos.x, overTable ? TABLE.H + 0.018 : 0.02, b.pos.z)
        const h = Math.max(0, b.pos.y - (overTable ? TABLE.H : 0))
        const f = Math.max(0.15, 1 - h / 3.2)
        sh.scale.setScalar(0.8 + h * 0.25)
        shadowMat.current.opacity = 0.4 * f
      }
    }

    // ── ribbon trail ──
    if (b.visible && b.active) {
      const last = history[history.length - 1]
      // ball teleported (serve reset / point) → restart the trail
      if (last && (Math.abs(last.x - b.pos.x) > 0.9 || Math.abs(last.y - b.pos.y) > 0.9 || Math.abs(last.z - b.pos.z) > 0.9)) {
        history.length = 0
      }
      history.push(new THREE.Vector3(b.pos.x, b.pos.y, b.pos.z))
      if (history.length > RIBBON_N) history.shift()
    } else if (history.length) {
      history.shift()
    }

    const posAttr = ribbon.getAttribute('position') as THREE.BufferAttribute
    const n = history.length
    for (let i = 0; i < RIBBON_N; i++) {
      const f = i / (RIBBON_N - 1)
      let px = 0
      let py = -100
      let pz = 0
      let width = 0
      if (i < n && b.visible) {
        const p = history[i]
        px = p.x
        py = p.y
        pz = p.z
        // direction for side vector
        const q = history[Math.min(i + 1, n - 1)]
        dirVec.set(q.x - p.x, q.y - p.y, q.z - p.z)
        if (dirVec.lengthSq() < 1e-8) dirVec.set(0, 0, 1)
        dirVec.normalize()
        sideVec.crossVectors(dirVec, upVec)
        if (sideVec.lengthSq() < 1e-6) sideVec.set(1, 0, 0)
        sideVec.normalize()
        width = 0.05 + f * f * 0.3
      }
      posAttr.setXYZ(i * 2, px - sideVec.x * width, py - sideVec.y * width, pz - sideVec.z * width)
      posAttr.setXYZ(i * 2 + 1, px + sideVec.x * width, py + sideVec.y * width, pz + sideVec.z * width)
    }
    posAttr.needsUpdate = true
    trailUniforms.uHeat.value = b.heat
    trailUniforms.uOpacity.value = b.visible && b.active ? 0.85 : Math.max(0, trailUniforms.uOpacity.value - 0.1)
  })

  return (
    <group>
      <mesh ref={mesh} castShadow>
        <sphereGeometry args={[BALL_R, 24, 24]} />
        <meshStandardMaterial ref={mat} color="#ffffff" emissive="#ffffff" emissiveIntensity={1.8} roughness={0.2} metalness={0.1} />
      </mesh>
      {/* outer glow shell */}
      <pointLight ref={light} distance={6.5} decay={2} />
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[BALL_R * 1.7, 20]} />
        <meshBasicMaterial ref={shadowMat} color="#000000" transparent opacity={0.35} depthWrite={false} />
      </mesh>
      <mesh geometry={ribbon} frustumCulled={false}>
        <shaderMaterial
          vertexShader={TRAIL_VERT}
          fragmentShader={TRAIL_FRAG}
          uniforms={trailUniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}
