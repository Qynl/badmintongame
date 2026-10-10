import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { EffectComposer, Bloom, ChromaticAberration, Vignette, Noise, ToneMapping } from '@react-three/postprocessing'
import { BlendFunction, ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'
import { engine } from '../game/engine'

export function Effects() {
  const ca = useRef<any>(null)
  const offset = useRef(new THREE.Vector2(0.0007, 0.0005))

  useFrame(() => {
    if (!ca.current) return
    const g = engine.glitchT
    let tx: number
    let ty: number
    if (g > 0.01) {
      // hard digital glitch — jittered directional offsets
      const a = g * g * 0.011
      tx = (Math.random() - 0.5) * 2 * a
      ty = (Math.random() - 0.5) * 1.2 * a
    } else if (engine.flowActive) {
      tx = 0.0032
      ty = 0.0022
    } else {
      tx = 0.0007 + engine.shake * 0.002
      ty = 0.0005
    }
    offset.current.x = THREE.MathUtils.damp(offset.current.x, tx, 40, 0.016)
    offset.current.y = THREE.MathUtils.damp(offset.current.y, ty, 40, 0.016)
    ca.current.offset = offset.current
  })

  return (
    <EffectComposer>
      <Bloom intensity={1.3} luminanceThreshold={0.18} luminanceSmoothing={0.6} mipmapBlur radius={0.8} />
      <ChromaticAberration
        ref={ca}
        offset={offset.current}
        radialModulation={false}
        modulationOffset={0}
        blendFunction={BlendFunction.NORMAL}
      />
      <Vignette eskil={false} offset={0.18} darkness={0.78} />
      <Noise premultiply blendFunction={BlendFunction.OVERLAY} opacity={0.5} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  )
}
