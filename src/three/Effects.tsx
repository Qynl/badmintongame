import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { EffectComposer, Bloom, ChromaticAberration, Vignette, Noise } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import * as THREE from 'three'
import { engine } from '../game/engine'

export function Effects() {
  const ca = useRef<any>(null)
  const offset = useRef(new THREE.Vector2(0.0007, 0.0005))

  useFrame(() => {
    if (!ca.current) return
    const target = engine.flowActive ? 0.0032 : 0.0007 + engine.shake * 0.002
    offset.current.x = THREE.MathUtils.damp(offset.current.x, target, 8, 0.016)
    offset.current.y = THREE.MathUtils.damp(offset.current.y, target * 0.7, 8, 0.016)
    ca.current.offset = offset.current
  })

  return (
    <EffectComposer>
      <Bloom intensity={1.05} luminanceThreshold={0.22} luminanceSmoothing={0.65} mipmapBlur radius={0.72} />
      <ChromaticAberration
        ref={ca}
        offset={offset.current}
        radialModulation={false}
        modulationOffset={0}
        blendFunction={BlendFunction.NORMAL}
      />
      <Vignette eskil={false} offset={0.18} darkness={0.72} />
      <Noise premultiply blendFunction={BlendFunction.OVERLAY} opacity={0.5} />
    </EffectComposer>
  )
}
