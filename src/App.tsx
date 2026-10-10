import { useEffect } from 'react'
import { Scene } from './three/Scene'
import { HUD, BannerView } from './ui/HUD'
import { MainMenu, DifficultyScreen, GauntletIntro, ResultScreen, PauseOverlay } from './ui/Menus'
import { useStore } from './game/store'
import { engine } from './game/engine'
import { initAudio, setMuted } from './game/audio'

export default function App() {
  const screen = useStore((s) => s.screen)
  const paused = useStore((s) => s.paused)

  // boot into menu demo rally
  useEffect(() => {
    engine.startDemo()
  }, [])

  // sync mute preference to audio engine
  const muted = useStore((s) => s.muted)
  useEffect(() => {
    setMuted(muted)
  }, [muted])

  // ── global input ──
  useEffect(() => {
    const keys = new Set<string>()

    const recomputeP1 = () => {
      engine.p1Key = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0)
      if (useStore.getState().mode === 'duel') {
        engine.p1Key = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0)
      }
    }
    const recomputeP2 = () => {
      engine.p2Key = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0)
    }

    const onKeyDown = (e: KeyboardEvent) => {
      initAudio()
      const st = useStore.getState()

      if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault()

      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (st.screen === 'game' && engine.mode !== 'demo') {
          engine.togglePause()
        }
        return
      }
      if (e.code === 'KeyM') {
        st.toggleMute()
        return
      }
      if (e.repeat) return
      keys.add(e.code)

      if (st.screen !== 'game' || st.paused) return
      const mode = st.mode

      if (mode === 'duel') {
        if (e.code === 'KeyW') engine.action('player')
        if (e.code === 'ArrowUp') engine.action('ai')
        recomputeP1()
        recomputeP2()
      } else {
        if (e.code === 'Space') engine.action('player')
        recomputeP1()
      }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      keys.delete(e.code)
      const st = useStore.getState()
      if (st.screen !== 'game') return
      const mode = st.mode
      if (mode === 'duel') {
        if (e.code === 'KeyW') engine.releaseAction('player')
        if (e.code === 'ArrowUp') engine.releaseAction('ai')
        recomputeP1()
        recomputeP2()
      } else {
        if (e.code === 'Space') engine.releaseAction('player')
        recomputeP1()
      }
    }

    const onPointerMove = (e: PointerEvent) => {
      const st = useStore.getState()
      if (st.screen !== 'game' || st.paused || st.mode === 'duel') return
      const nx = (e.clientX / window.innerWidth) * 2 - 1
      engine.setAim('player', nx * 3.15)
    }

    const onPointerDown = (e: PointerEvent) => {
      initAudio()
      const st = useStore.getState()
      if (st.screen !== 'game' || st.paused) return
      // ignore clicks on UI buttons
      if ((e.target as HTMLElement).closest('button')) return
      if (st.mode === 'duel') return
      engine.action('player')
    }

    const onPointerUp = () => {
      const st = useStore.getState()
      if (st.screen !== 'game') return
      if (st.mode === 'duel') return
      engine.releaseAction('player')
    }

    const onBlur = () => {
      keys.clear()
      engine.p1Key = 0
      engine.p2Key = 0
      const st = useStore.getState()
      if (st.screen === 'game' && !st.paused && engine.mode !== 'demo') engine.togglePause()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  return (
    <div className="app-root">
      <Scene />
      <div className="ui-layer">
        <BannerView />
        {screen === 'game' && !paused && <HUD />}
        {screen === 'game' && paused && <PauseOverlay />}
        {screen === 'menu' && <MainMenu />}
        {screen === 'difficulty' && <DifficultyScreen />}
        {screen === 'gauntletIntro' && <GauntletIntro />}
        {screen === 'result' && <ResultScreen />}
      </div>
    </div>
  )
}
