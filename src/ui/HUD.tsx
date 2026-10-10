import { useEffect } from 'react'
import { useStore } from '../game/store'

const FLASH_COLORS: Record<string, string> = {
  gold: 'rgba(251, 191, 36, 0.32)',
  cyan: 'rgba(34, 211, 238, 0.25)',
  red: 'rgba(244, 63, 94, 0.28)',
  white: 'rgba(255, 255, 255, 0.3)',
}

export function FlashView() {
  const flash = useStore((s) => s.flash)
  if (!flash) return null
  return (
    <div
      key={flash.id}
      className="flash-overlay"
      style={{ background: `radial-gradient(ellipse at center, transparent 30%, ${FLASH_COLORS[flash.color] ?? 'rgba(255,255,255,0.25)'})` }}
    />
  )
}

export function BannerView() {
  const banner = useStore((s) => s.banner)
  const clearBanner = useStore((s) => s.clearBanner)

  useEffect(() => {
    if (!banner) return
    const t = setTimeout(() => clearBanner(), 1500)
    return () => clearTimeout(t)
  }, [banner?.id])

  if (!banner) return null
  return (
    <div className={`banner banner-${banner.tone}`} key={banner.id}>
      <div className="banner-text">{banner.text}</div>
      {banner.sub && <div className="banner-sub">{banner.sub}</div>}
    </div>
  )
}

export function HUD() {
  const mode = useStore((s) => s.mode)
  const pScore = useStore((s) => s.pScore)
  const aScore = useStore((s) => s.aScore)
  const opponentName = useStore((s) => s.opponentName)
  const server = useStore((s) => s.server)
  const rally = useStore((s) => s.rally)
  const flow = useStore((s) => s.flow)
  const flowActive = useStore((s) => s.flowActive)
  const charge = useStore((s) => s.charge)
  const matchPoint = useStore((s) => s.matchPoint)
  const momentum = useStore((s) => s.momentum)
  const perfectCombo = useStore((s) => s.perfectCombo)
  const trickScore = useStore((s) => s.trickScore)
  const trickTime = useStore((s) => s.trickTime)
  const trickCombo = useStore((s) => s.trickCombo)

  const pName = mode === 'duel' ? 'P1' : 'YOU'

  return (
    <div className="hud">
      {mode === 'trick' ? (
        <div className="trick-hud">
          <div className={`trick-time ${trickTime <= 10 ? 'danger' : ''}`}>{trickTime}</div>
          <div className="trick-score">{trickScore.toLocaleString()}</div>
          {trickCombo > 1 && <div className="trick-combo">COMBO ×{trickCombo}</div>}
        </div>
      ) : (
        <>
          <div className="scoreboard">
            <div className={`score-side ${server === 'player' ? 'serving' : ''}`}>
              <span className="score-name">{pName}</span>
              <span className="score-num cyan">{pScore}</span>
            </div>
            <div className="score-dash">—</div>
            <div className={`score-side right ${server === 'ai' ? 'serving' : ''}`}>
              <span className="score-num magenta">{aScore}</span>
              <span className="score-name">{opponentName}</span>
            </div>
          </div>
          <div className="momentum-bar">
            <div className="momentum-fill" style={{ left: '50%', width: `${Math.max(0, momentum) * 50}%` }} />
            <div className="momentum-fill neg" style={{ right: '50%', width: `${Math.max(0, -momentum) * 50}%` }} />
          </div>
        </>
      )}

      {perfectCombo >= 2 && <div className="perfect-chip">PERFECT ×{perfectCombo}</div>}

      {matchPoint && (
        <div className={`mp-chip ${matchPoint === 'player' ? 'good' : 'bad'}`}>
          MATCH POINT — {matchPoint === 'player' ? pName : opponentName}
        </div>
      )}

      {mode !== 'trick' && rally >= 3 && <div className="rally-counter">RALLY ×{rally}</div>}
      {mode === 'trick' && rally >= 4 && <div className="rally-counter">RALLY ×{rally}</div>}

      {(mode === 'quick' || mode === 'gauntlet') && (
        <div className={`flow-wrap ${flowActive ? 'active' : ''}`}>
          <div className="flow-label">{flowActive ? 'FLOW STATE' : 'FLOW'}</div>
          <div className="flow-bar">
            <div className="flow-fill" style={{ width: `${(flowActive ? 1 : flow) * 100}%` }} />
          </div>
        </div>
      )}

      <div className="charge-wrap">
        <div className="charge-bar">
          <div className={`charge-fill ${charge >= 1 ? 'full' : ''}`} style={{ width: `${charge * 100}%` }} />
        </div>
        <div className="charge-label">HOLD TO CHARGE · RELEASE ON IMPACT</div>
      </div>

      <div className="controls-hint">
        {mode === 'duel'
          ? 'P1: A/D + W · P2: ◀/▶ + ▲'
          : mode === 'trick'
            ? 'bounce the ball into the gold rings'
            : 'move: mouse · click exactly when the ring closes for a PERFECT'}
      </div>
    </div>
  )
}
