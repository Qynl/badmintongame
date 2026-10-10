import { useStore, unlockedSkins } from '../game/store'
import { engine } from '../game/engine'
import { TIERS, GAUNTLET, SKINS } from '../game/constants'
import { sfx, initAudio } from '../game/audio'

function click(fn: () => void) {
  return () => {
    initAudio()
    sfx.ui()
    fn()
  }
}

function back(fn: () => void) {
  return () => {
    initAudio()
    sfx.uiBack()
    fn()
  }
}

export function MainMenu() {
  const skin = useStore((s) => s.skin)
  const setSkin = useStore((s) => s.setSkin)
  const gauntletCleared = useStore((s) => s.gauntletCleared)
  const overdriveUnlocked = useStore((s) => s.overdriveUnlocked)
  const trickBest = useStore((s) => s.trickBest)
  const muted = useStore((s) => s.muted)
  const toggleMute = useStore((s) => s.toggleMute)
  const setScreen = useStore((s) => s.setScreen)
  const startTrick = useStore((s) => s.startTrick)
  const startDuel = useStore((s) => s.startDuel)
  const skins = unlockedSkins(gauntletCleared)

  return (
    <div className="screen menu-screen">
      <div className="title-block">
        <div className="title-eyebrow">ARENA TABLE TENNIS</div>
        <h1 className="title">
          NEON<span>SMASH</span>
        </h1>
        <div className="title-tagline">charge it · curve it · smash it</div>
      </div>

      <div className="menu-buttons">
        <button className="btn primary" onClick={click(() => setScreen('difficulty'))}>
          QUICK MATCH
        </button>
        <button className="btn" onClick={click(() => setScreen('gauntletIntro'))}>
          GAUNTLET
        </button>
        <button
          className="btn"
          onClick={click(() => {
            startTrick()
            engine.startTrick()
          })}
        >
          TRICK SHOT
        </button>
        <button
          className="btn"
          onClick={click(() => {
            startDuel()
            engine.startDuel()
          })}
        >
          LOCAL DUEL
        </button>
      </div>

      <div className="menu-meta">
        <div className="skin-row">
          <span className="skin-title">PADDLE</span>
          {SKINS.map((sk, i) => (
            <button
              key={sk.name}
              className={`skin-dot ${i === skin ? 'selected' : ''} ${!skins[i] ? 'locked' : ''}`}
              style={{ ['--c' as any]: sk.color }}
              title={skins[i] ? sk.name : `${sk.name} — ${sk.unlock}`}
              onClick={
                skins[i]
                  ? click(() => setSkin(i))
                  : click(() => useStore.getState().showBanner('LOCKED', 'bad', sk.unlock))
              }
            />
          ))}
        </div>
        <div className="menu-stats">
          {trickBest > 0 && <span>TRICK SHOT BEST: {trickBest.toLocaleString()}</span>}
          {overdriveUnlocked && <span className="unlocked-tag">OVERDRIVE UNLOCKED</span>}
          {gauntletCleared && <span className="unlocked-tag">GAUNTLET CHAMPION</span>}
        </div>
        <button className="mute-btn" onClick={click(() => toggleMute())}>
          {muted ? '🔇 SOUND OFF' : '🔊 SOUND ON'}
        </button>
      </div>
    </div>
  )
}

export function DifficultyScreen() {
  const startQuick = useStore((s) => s.startQuick)
  const setScreen = useStore((s) => s.setScreen)
  const overdriveUnlocked = useStore((s) => s.overdriveUnlocked)

  return (
    <div className="screen">
      <h2 className="screen-title">SELECT OPPONENT</h2>
      <div className="tier-cards">
        {TIERS.map((t, i) => {
          const locked = i === 2 && !overdriveUnlocked
          return (
            <button
              key={t.name}
              className={`tier-card ${locked ? 'locked' : ''}`}
              style={{ ['--tc' as any]: t.color }}
              onClick={
                locked
                  ? click(() => useStore.getState().showBanner('LOCKED', 'bad', 'Beat VECTOR to unlock OVERDRIVE'))
                  : click(() => {
                      startQuick(i)
                      engine.startQuick(i)
                    })
              }
            >
              <div className="tier-name">{t.name}</div>
              <div className="tier-tagline">{locked ? '??? Defeat VECTOR to reveal ???' : t.tagline}</div>
              <div className="tier-pips">
                {'▲'.repeat(i + 1)}
                {'△'.repeat(2 - i)}
              </div>
            </button>
          )
        })}
      </div>
      <button className="btn ghost" onClick={back(() => setScreen('menu'))}>
        ◀ BACK
      </button>
    </div>
  )
}

export function GauntletIntro() {
  const setScreen = useStore((s) => s.setScreen)
  const startGauntlet = useStore((s) => s.startGauntlet)
  const gauntletRound = useStore((s) => s.gauntletRound)

  return (
    <div className="screen">
      <h2 className="screen-title">THE GAUNTLET</h2>
      <p className="screen-sub">Five machines. One paddle. No continues.</p>
      <div className="ladder">
        {GAUNTLET.map((g, i) => (
          <div key={g.name} className={`ladder-row ${i === gauntletRound ? 'current' : ''} ${i < gauntletRound ? 'done' : ''}`}>
            <span className="ladder-idx">{i + 1}</span>
            <span className="ladder-name" style={{ color: TIERS[g.tier].color }}>
              {g.name}
            </span>
            <span className="ladder-status">{i < gauntletRound ? '✓' : i === gauntletRound ? 'NEXT' : ''}</span>
          </div>
        ))}
      </div>
      <div className="menu-buttons">
        <button
          className="btn primary"
          onClick={click(() => {
            startGauntlet(gauntletRound)
            engine.startGauntlet(gauntletRound)
          })}
        >
          {gauntletRound === 0 ? 'ENTER THE GAUNTLET' : `FIGHT ROUND ${gauntletRound + 1}`}
        </button>
        {gauntletRound > 0 && (
          <button className="btn ghost" onClick={back(() => useStore.setState({ gauntletRound: 0 }))}>
            RESET LADDER
          </button>
        )}
      </div>
      <button className="btn ghost" onClick={back(() => setScreen('menu'))}>
        ◀ BACK
      </button>
    </div>
  )
}

export function ResultScreen() {
  const result = useStore((s) => s.result)
  const mode = useStore((s) => s.mode)
  const tierIndex = useStore((s) => s.tierIndex)
  const gauntletRound = useStore((s) => s.gauntletRound)
  const startQuick = useStore((s) => s.startQuick)
  const startGauntlet = useStore((s) => s.startGauntlet)
  const startTrick = useStore((s) => s.startTrick)
  const startDuel = useStore((s) => s.startDuel)
  const setScreen = useStore((s) => s.setScreen)
  const backToMenu = useStore((s) => s.backToMenu)
  const trickScore = useStore((s) => s.trickScore)
  const trickBest = useStore((s) => s.trickBest)

  if (!result) return null

  const toMenu = back(() => {
    backToMenu()
    engine.startDemo()
  })

  return (
    <div className="screen">
      <div className={`result-title ${result.won ? 'good' : 'bad'}`}>{result.title}</div>
      <div className="result-sub">{result.sub}</div>

      {mode === 'trick' && (
        <div className="trick-final">
          <div>
            SCORE <b>{trickScore.toLocaleString()}</b>
          </div>
          <div>
            BEST <b>{trickBest.toLocaleString()}</b>
          </div>
        </div>
      )}

      <div className="menu-buttons">
        {mode === 'quick' && (
          <button
            className="btn primary"
            onClick={click(() => {
              startQuick(tierIndex)
              engine.startQuick(tierIndex)
            })}
          >
            REMATCH
          </button>
        )}
        {mode === 'gauntlet' && result.won && gauntletRound < GAUNTLET.length - 1 && (
          <button
            className="btn primary"
            onClick={click(() => {
              const next = gauntletRound + 1
              useStore.setState({ gauntletRound: next })
              startGauntlet(next)
              engine.startGauntlet(next)
            })}
          >
            NEXT ROUND ▶
          </button>
        )}
        {mode === 'gauntlet' && !result.won && (
          <button
            className="btn primary"
            onClick={click(() => {
              startGauntlet(gauntletRound)
              engine.startGauntlet(gauntletRound)
            })}
          >
            RETRY ROUND
          </button>
        )}
        {mode === 'trick' && (
          <button
            className="btn primary"
            onClick={click(() => {
              startTrick()
              engine.startTrick()
            })}
          >
            RUN IT BACK
          </button>
        )}
        {mode === 'duel' && (
          <button
            className="btn primary"
            onClick={click(() => {
              startDuel()
              engine.startDuel()
            })}
          >
            REMATCH
          </button>
        )}
        {mode === 'quick' && (
          <button className="btn" onClick={back(() => setScreen('difficulty'))}>
            CHANGE OPPONENT
          </button>
        )}
        <button className="btn ghost" onClick={toMenu}>
          MAIN MENU
        </button>
      </div>
    </div>
  )
}

export function PauseOverlay() {
  const setPaused = useStore((s) => s.setPaused)
  const backToMenu = useStore((s) => s.backToMenu)

  return (
    <div className="screen dim">
      <h2 className="screen-title">PAUSED</h2>
      <div className="menu-buttons">
        <button
          className="btn primary"
          onClick={click(() => {
            setPaused(false)
            engine.paused = false
          })}
        >
          RESUME
        </button>
        <button
          className="btn ghost"
          onClick={back(() => {
            setPaused(false)
            engine.paused = false
            backToMenu()
            engine.startDemo()
          })}
        >
          QUIT TO MENU
        </button>
      </div>
      <div className="controls-hint center">ESC to resume</div>
    </div>
  )
}
