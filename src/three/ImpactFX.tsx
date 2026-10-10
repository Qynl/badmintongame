import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { engine } from '../game/engine'

const MAX_PARTICLES = 260
const MAX_RINGS = 10
const MAX_PILLARS = 4
const tmpObj = new THREE.Object3D()
const tmpColor = new THREE.Color()
const tmpVec = new THREE.Vector3()

interface Particle {
  alive: boolean
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  life: number
  maxLife: number
  big: boolean
}

interface Ring {
  alive: boolean
  x: number
  y: number
  z: number
  t: number
  color: string
}

interface Pillar {
  alive: boolean
  x: number
  y: number
  z: number
  t: number
  color: string
}

const PILLAR_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec3 uColor;
uniform float uFade;
void main() {
  float g = 1.0 - vUv.y;
  float a = g * g * uFade * 0.85;
  gl_FragColor = vec4(uColor * (0.8 + g), a);
}
`
const PILLAR_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export function ImpactFX() {
  const inst = useRef<THREE.InstancedMesh>(null)
  const particles = useMemo<Particle[]>(
    () =>
      Array.from({ length: MAX_PARTICLES }, () => ({
        alive: false,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1,
        big: false,
      })),
    []
  )
  const rings = useMemo<Ring[]>(
    () => Array.from({ length: MAX_RINGS }, () => ({ alive: false, x: 0, y: 0, z: 0, t: 0, color: '#ffffff' })),
    []
  )
  const pillars = useMemo<Pillar[]>(
    () => Array.from({ length: MAX_PILLARS }, () => ({ alive: false, x: 0, y: 0, z: 0, t: 0, color: '#ffffff' })),
    []
  )
  const ringRefs = useRef<(THREE.Mesh | null)[]>([])
  const pillarRefs = useRef<(THREE.Mesh | null)[]>([])
  const ringMats = useMemo(
    () =>
      Array.from(
        { length: MAX_RINGS },
        () =>
          new THREE.MeshBasicMaterial({
            color: '#ffffff',
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
          })
      ),
    []
  )
  const pillarMats = useMemo(
    () =>
      Array.from({ length: MAX_PILLARS }, (_, i) => {
        const m = new THREE.ShaderMaterial({
          vertexShader: PILLAR_VERT,
          fragmentShader: PILLAR_FRAG,
          uniforms: { uColor: { value: new THREE.Color('#ffffff') }, uFade: { value: 0 } },
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        })
        void i
        return m
      }),
    []
  )

  // hide all instances before the first frame
  useEffect(() => {
    const mesh = inst.current
    if (!mesh) return
    tmpObj.scale.setScalar(0.0001)
    tmpObj.position.set(0, -50, 0)
    tmpObj.updateMatrix()
    for (let i = 0; i < MAX_PARTICLES; i++) mesh.setMatrixAt(i, tmpObj.matrix)
    mesh.instanceMatrix.needsUpdate = true
  }, [])

  useFrame((_, dt) => {
    dt = Math.min(dt, 0.05)

    // drain engine fx events
    const events = engine.fx.splice(0, engine.fx.length)
    for (const ev of events) {
      if (ev.kind === 'spark') {
        for (let i = 0; i < ev.count; i++) {
          const p = particles.find((q) => !q.alive)
          if (!p) break
          p.alive = true
          p.x = ev.pos.x
          p.y = ev.pos.y
          p.z = ev.pos.z
          const ang = Math.random() * Math.PI * 2
          const up = Math.random() * 0.9 + 0.15
          const spd = ev.speed * (0.35 + Math.random() * 0.75)
          p.vx = Math.cos(ang) * spd * 0.7
          p.vz = Math.sin(ang) * spd * 0.7
          p.vy = up * spd * 0.75
          p.maxLife = p.life = (ev.big ? 0.75 : 0.45) + Math.random() * 0.25
          p.big = !!ev.big
          if (inst.current) {
            const idx = particles.indexOf(p)
            inst.current.setColorAt(idx, tmpColor.set(ev.color))
          }
        }
      } else if (ev.kind === 'ring') {
        const r = rings.find((q) => !q.alive)
        if (r) {
          r.alive = true
          r.x = ev.pos.x
          r.y = ev.pos.y
          r.z = ev.pos.z
          r.t = 0
          r.color = ev.color
        }
      } else if (ev.kind === 'pillar') {
        const p = pillars.find((q) => !q.alive)
        if (p) {
          p.alive = true
          p.x = ev.pos.x
          p.y = ev.pos.y
          p.z = ev.pos.z
          p.t = 0
          p.color = ev.color
        }
      }
    }
    if (inst.current?.instanceColor) inst.current.instanceColor.needsUpdate = true

    // integrate particles (stretched along velocity)
    const mesh = inst.current
    if (mesh) {
      for (let i = 0; i < MAX_PARTICLES; i++) {
        const p = particles[i]
        if (!p.alive) {
          tmpObj.scale.setScalar(0.0001)
          tmpObj.position.set(0, -50, 0)
          tmpObj.rotation.set(0, 0, 0)
        } else {
          p.life -= dt
          if (p.life <= 0) {
            p.alive = false
            tmpObj.scale.setScalar(0.0001)
            tmpObj.position.set(0, -50, 0)
          } else {
            p.vy -= 7.5 * dt
            p.x += p.vx * dt
            p.y += p.vy * dt
            p.z += p.vz * dt
            const f = p.life / p.maxLife
            const spd = Math.hypot(p.vx, p.vy, p.vz)
            tmpObj.position.set(p.x, p.y, p.z)
            tmpVec.set(p.x + p.vx, p.y + p.vy, p.z + p.vz)
            tmpObj.lookAt(tmpVec)
            const w = (p.big ? 0.05 : 0.035) * f + 0.008
            const len = Math.max(0.05, spd * 0.035 * f)
            tmpObj.scale.set(w, w, len)
          }
        }
        tmpObj.updateMatrix()
        mesh.setMatrixAt(i, tmpObj.matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
    }

    // rings
    for (let i = 0; i < MAX_RINGS; i++) {
      const r = rings[i]
      const m = ringRefs.current[i]
      if (!m) continue
      if (!r.alive) {
        m.visible = false
        continue
      }
      r.t += dt * 2.1
      if (r.t >= 1) {
        r.alive = false
        m.visible = false
        continue
      }
      m.visible = true
      m.position.set(r.x, r.y, r.z)
      const s = 0.25 + r.t * (2.6 + r.t)
      m.scale.set(s, s, s)
      const mat = ringMats[i]
      mat.opacity = (1 - r.t) * 0.85
      mat.color.set(r.color)
    }

    // pillars
    for (let i = 0; i < MAX_PILLARS; i++) {
      const p = pillars[i]
      const m = pillarRefs.current[i]
      const mat = pillarMats[i]
      if (!m) continue
      if (!p.alive) {
        m.visible = false
        continue
      }
      p.t += dt / 0.9
      if (p.t >= 1) {
        p.alive = false
        m.visible = false
        continue
      }
      m.visible = true
      m.position.set(p.x, p.y + 2.2, p.z)
      const grow = 1 - Math.pow(1 - Math.min(1, p.t * 3), 3)
      m.scale.set(1 - p.t * 0.4, grow, 1 - p.t * 0.4)
      mat.uniforms.uFade.value = (1 - p.t) * (1 - p.t)
      ;(mat.uniforms.uColor.value as THREE.Color).set(p.color)
    }
  })

  return (
    <group>
      <instancedMesh ref={inst} args={[undefined, undefined, MAX_PARTICLES]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial transparent opacity={0.95} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </instancedMesh>
      {Array.from({ length: MAX_RINGS }, (_, i) => (
        <mesh
          key={`r${i}`}
          ref={(el) => {
            ringRefs.current[i] = el
          }}
          rotation={[-Math.PI / 2, 0, 0]}
          visible={false}
          material={ringMats[i]}
        >
          <ringGeometry args={[0.82, 1, 40]} />
        </mesh>
      ))}
      {Array.from({ length: MAX_PILLARS }, (_, i) => (
        <mesh
          key={`p${i}`}
          ref={(el) => {
            pillarRefs.current[i] = el
          }}
          visible={false}
          material={pillarMats[i]}
        >
          <cylinderGeometry args={[0.5, 0.72, 4.4, 18, 1, true]} />
        </mesh>
      ))}
    </group>
  )
}
