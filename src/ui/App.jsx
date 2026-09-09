import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Match } from '../sim/match.js';
import { makeTeam } from '../sim/teamFactory.js';
import { makeRng } from '../sim/math.js';
import { RULES } from '../sim/constants.js';
import { GameLoop } from '../game/gameLoop.js';
import { MatchAudio } from '../game/audio.js';
import { Career } from '../career/career.js';
import { makeAttributes, overall } from '../sim/attributes.js';
import { CLUBS } from '../data/names.js';
import { MainMenu } from './MainMenu.jsx';
import { Hud } from './Hud.jsx';
import { PauseMenu, StatsPanel } from './PauseMenu.jsx';
import { CareerHub } from './CareerHub.jsx';
import { TouchControls } from './TouchControls.jsx';

const SAVE_KEY = 'pitchside.career.v1';
const SETTINGS_KEY = 'pitchside.settings.v1';

const DEFAULT_SETTINGS = {
  quality: 'high',
  camera: 'player',
  volume: 0.7,
  audio: true,
  autoSwitch: true,
  radar: true,
  perf: false,
  touch: isTouchDevice(),
};

function isTouchDevice() {
  return typeof window !== 'undefined' &&
    ('ontouchstart' in window || navigator.maxTouchPoints > 0) &&
    window.innerWidth < 1100;
}

export default function App() {
  const [screen, setScreen] = useState('menu'); // menu | match | career | fulltime
  const [settings, setSettings] = useState(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
    } catch { return DEFAULT_SETTINGS; }
  });
  const [match, setMatch] = useState(null);
  const [paused, setPaused] = useState(false);
  const [career, setCareer] = useState(null);
  const [careerAttrs, setCareerAttrs] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [fullTime, setFullTime] = useState(null);
  const [hasSave, setHasSave] = useState(() => !!localStorage.getItem(SAVE_KEY));

  const canvasRef = useRef(null);
  const loopRef = useRef(null);
  const audioRef = useRef(null);
  const careerCtxRef = useRef(null); // { selection, fixture }

  // Persist settings
  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* quota */ }
    if (loopRef.current) {
      loopRef.current.setQuality(settings.quality);
      loopRef.current.autoSwitch = settings.autoSwitch;
    }
    if (audioRef.current) {
      audioRef.current.setVolume(settings.volume);
      audioRef.current.setMuted(!settings.audio);
    }
  }, [settings]);

  // ---- Build and start a match -------------------------------------------
  const startMatch = useCallback((cfg) => {
    const rng = makeRng(cfg.seed ?? (Date.now() & 0xffffffff));
    RULES.halfLengthMinutes = cfg.halfMinutes ?? 5;

    const home = makeTeam(cfg.homeClub, 0, rng, {
      formation: cfg.formation, preset: cfg.preset, isHumanControlled: !cfg.spectate,
    });
    const away = makeTeam(cfg.awayClub, 1, rng, { formation: cfg.awayFormation });

    // Difficulty tunes the *opposition's* decision quality, never their bodies.
    const diffMap = { amateur: 1.9, semipro: 1.35, pro: 1.0, elite: 0.72 };
    const noiseMul = diffMap[cfg.difficulty] ?? 1;

    const m = new Match({
      seed: cfg.seed, homeTeam: home, awayTeam: away, weather: cfg.weather,
      humanTeam: cfg.spectate ? -1 : 0,
    });
    m.difficultyNoise = noiseMul;
    m.aiNoiseByTeam = [1, noiseMul];

    // Inject the career player, or pick the requested position.
    let humanId = -1;
    if (!cfg.spectate) {
      if (cfg.careerPlayer) {
        humanId = cfg.careerPlayer.id;
      } else {
        const pick = home.players.find(p => p.position === cfg.position) ??
                     home.players.find(p => !p.isGK);
        humanId = pick?.id ?? -1;
      }
      m.setHumanPlayer(humanId);
      if (cfg.benchStart) {
        // Start on the bench: control the AI-nearest player until you come on.
        m.setHumanPlayer(-1);
        m.humanTeam = 0;
      }
    } else {
      m.setHumanPlayer(-1);
      m.humanTeam = 0;
    }

    m.running = true;
    setMatch(m);
    setFullTime(null);
    setPaused(false);
    setScreen('match');
    return m;
  }, []);

  // Attach the game loop once the canvas exists for this match.
  useEffect(() => {
    if (screen !== 'match' || !match || !canvasRef.current) return;
    // Audio
    if (!audioRef.current) audioRef.current = new MatchAudio();
    const audio = audioRef.current;
    if (settings.audio) { audio.init(); audio.resume(); audio.setVolume(settings.volume); }

    const loop = new GameLoop(canvasRef.current, match, {
      quality: settings.quality,
      autoSwitch: settings.autoSwitch,
      onUiEvent: (e) => {
        if (e.type === 'pauseToggle') setPaused(p => !p);
        if (e.type === 'goal') { audio.roar(1); audio.netRipple(); audio.whistle('short'); }
        if (e.type === 'save') audio.gasp();
        if (e.type === 'foul') audio.whistle('short');
        if (e.type === 'halfTime') audio.whistle('double');
        if (e.type === 'fullTime') {
          audio.whistle('long');
          setFullTime(snapshotResult(match));
        }
        if (e.type === 'kickoff') audio.whistle('short');
        if (e.type === 'offside') audio.whistle('short');
        if (e.type === 'toggleRadar') setSettings(s => ({ ...s, radar: !s.radar }));
      },
      onFrame: (dt) => {
        audio.updateCrowd(match.commentary?.crowdIntensity ?? 0.25, dt);
      },
    });
    loop.setCameraMode(settings.camera);
    loopRef.current = loop;

    // Kick sounds from the sim.
    const offPass = match.events.on('pass', () => audio.kick(0.5));
    const offShot = match.events.on('shot', (d) => audio.kick(0.9));
    const offClear = match.events.on('clearance', () => audio.kick(0.8));
    const offTackle = match.events.on('tackle', () => audio.tackleHit());
    const offSlide = match.events.on('slide', () => audio.tackleHit());

    loop.start();
    return () => {
      offPass(); offShot(); offClear(); offTackle(); offSlide();
      loop.dispose();
      loopRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, match]);

  // Pause propagation
  useEffect(() => {
    if (match) match.paused = paused || !!fullTime;
  }, [paused, fullTime, match]);

  // ---- Career -------------------------------------------------------------
  const startCareer = useCallback((cfg) => {
    const c = new Career(cfg);
    const rng = makeRng(cfg.seed ^ 0x9e37);
    const q = (cfg.startingLevel - 72) - (cfg.age <= 18 ? 9 : cfg.age <= 21 ? 5 : 0);
    const attrs = makeAttributes(cfg.position, q, rng);
    c.attachAttributes(attrs);
    c.difficulty = cfg.difficulty ?? 'pro';
    setCareer(c);
    setCareerAttrs(attrs);
    setLastResult(null);
    setScreen('career');
    saveCareer(c, attrs);
  }, []);

  const saveCareer = useCallback((c = career, a = careerAttrs) => {
    if (!c || !a) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ career: c.toJSON(), attributes: a }));
      setHasSave(true);
    } catch { /* quota */ }
  }, [career, careerAttrs]);

  const loadCareer = useCallback(() => {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      const c = Career.fromJSON(data.career);
      setCareer(c);
      setCareerAttrs(data.attributes);
      setLastResult(null);
      setScreen('career');
    } catch (e) {
      console.error('Failed to load career', e);
    }
  }, []);

  // Play (or simulate) the career fixture.
  const playCareerMatch = useCallback((selection, simulate) => {
    const fx = career.currentFixture();
    if (!fx) return;
    const isHome = fx.home === career.club;
    const oppClub = isHome ? fx.away : fx.home;
    const seed = (career.seed ^ (career.season * 7919) ^ (career.week * 104729)) >>> 0;
    const rng = makeRng(seed);

    const myClub = career.club;
    const myTeam = makeTeam(myClub, isHome ? 0 : 1, rng, { isHumanControlled: true });
    const oppTeam = makeTeam(oppClub, isHome ? 1 : 0, rng);

    // Replace one squad member with the career player.
    const p = career.player;
    const target = myTeam.players.find(x => x.position === p.position && !x.isGK) ??
                   myTeam.players.find(x => x.position === p.position) ??
                   myTeam.players.find(x => !x.isGK);
    let careerPlayer = target;
    if (target) {
      target.name = career.fullName;
      target.attrs = { ...careerAttrs };
      target.isCareerPlayer = true;
    }
    if (!selection.starting) {
      // Move them to the bench and bring a squad player in.
      const idx = myTeam.players.indexOf(target);
      const replacement = myTeam.bench.find(b => b.position === p.position) ?? myTeam.bench[0];
      if (idx >= 0 && replacement) {
        myTeam.players[idx] = replacement;
        myTeam.bench[myTeam.bench.indexOf(replacement)] = target;
      }
    }

    RULES.halfLengthMinutes = 5;
    const diffMap = { amateur: 1.9, semipro: 1.35, pro: 1.0, elite: 0.72 };
    const noiseMul = diffMap[career.difficulty] ?? 1;

    const m = new Match({
      seed,
      homeTeam: isHome ? myTeam : oppTeam,
      awayTeam: isHome ? oppTeam : myTeam,
      weather: rng.pick(['clear', 'clear', 'cloudy', 'wet', 'rain', 'windy', 'night']),
      humanTeam: isHome ? 0 : 1,
    });
    m.aiNoiseByTeam = isHome ? [1, noiseMul] : [noiseMul, 1];
    m.careerPlayerId = careerPlayer?.id ?? -1;
    m.careerContext = { career, isHome, oppClub, selection, simulate };

    if (simulate || !selection.starting) {
      m.setHumanPlayer(-1);
    } else {
      m.setHumanPlayer(careerPlayer.id);
    }
    careerCtxRef.current = { career, isHome, oppClub, selection, simulate, careerPlayer };

    if (simulate) {
      // Run the real engine headlessly at max speed, then show the result.
      const dt = 1 / 60;
      let guard = 0;
      while (!m.finished && guard++ < 400000) m.step(dt);
      finishCareerMatch(m);
      return;
    }

    m.running = true;
    setMatch(m);
    setFullTime(null);
    setPaused(false);
    setScreen('match');
  }, [career, careerAttrs]);

  const finishCareerMatch = useCallback((m) => {
    const ctx = careerCtxRef.current;
    if (!ctx) return;
    const { career: c, isHome, oppClub, selection, careerPlayer } = ctx;
    const myIdx = isHome ? 0 : 1;
    const score = isHome ? [...m.score] : [m.score[1], m.score[0]];
    const result = score[0] > score[1] ? 'W' : score[0] < score[1] ? 'L' : 'D';
    const cp = careerPlayer ? m.playersById.get(careerPlayer.id) : null;
    const played = !!cp && (cp.onPitch || cp.stats.touches > 0 || selection.starting);
    const minutes = played ? (selection.starting ? 90 : Math.round(20 + Math.random() * 25)) : 0;

    // Man of the match: highest rating on the pitch.
    const best = m.allPlayers.reduce((a, b) => (b.stats.rating > a.stats.rating ? b : a), m.allPlayers[0]);

    const record = c.recordMatch({
      opponent: oppClub.name, home: isHome, score, result,
      played, started: selection.starting, minutes,
      motm: played && cp && best === cp,
      cleanSheet: score[1] === 0 && played,
      playerStats: played && cp ? { ...cp.stats } : null,
    }, careerAttrs);

    setLastResult(record);
    setCareerAttrs({ ...careerAttrs });
    saveCareer(c, careerAttrs);
    setFullTime(null);
    setMatch(null);
    setScreen('career');
    careerCtxRef.current = null;
  }, [careerAttrs, saveCareer]);

  const exitMatch = useCallback(() => {
    if (careerCtxRef.current && match) {
      finishCareerMatch(match);
    } else {
      setMatch(null);
      setFullTime(null);
      setScreen('menu');
    }
    setPaused(false);
  }, [match, finishCareerMatch]);

  // ---- Render -------------------------------------------------------------
  return (
    <div className="app">
      {(screen === 'match') && (
        <>
          <canvas ref={canvasRef} className="game-canvas" />
          <Hud match={match} gameLoopRef={loopRef} showRadar={settings.radar}
               showPerf={settings.perf} touch={settings.touch}
               onPause={() => setPaused(true)} />
          {settings.touch && loopRef.current &&
            <TouchControls controller={loopRef.current.input} />}
          {paused && !fullTime && (
            <PauseMenu match={match} settings={settings} setSettings={setSettings}
                       gameLoopRef={loopRef}
                       onResume={() => setPaused(false)} onQuit={exitMatch} />
          )}
          {fullTime && (
            <FullTimeScreen match={match} result={fullTime}
                            career={careerCtxRef.current ? career : null}
                            onContinue={exitMatch} />
          )}
        </>
      )}

      {screen === 'menu' && (
        <MainMenu onStart={startMatch} onCareer={startCareer} onResumeCareer={loadCareer}
                  hasSave={hasSave} settings={settings} setSettings={setSettings} />
      )}

      {screen === 'career' && career && (
        <CareerHub career={career} attributes={careerAttrs} lastResult={lastResult}
                   onPlayMatch={(sel) => playCareerMatch(sel, false)}
                   onSimMatch={(sel) => playCareerMatch(sel, true)}
                   onSave={() => saveCareer()}
                   onQuit={() => { saveCareer(); setScreen('menu'); }} />
      )}
    </div>
  );
}

function snapshotResult(match) {
  return {
    score: [...match.score],
    teams: [match.teams[0].name, match.teams[1].name],
  };
}

function FullTimeScreen({ match, result, career, onContinue }) {
  const [tab, setTab] = useState('stats');
  const human = match.human ?? match.allPlayers.find(p => p.isCareerPlayer);
  return (
    <div className="overlay">
      <div className="box">
        <div className="center mb">
          <div className="brand">Full Time</div>
          <div style={{ fontSize: 40, fontWeight: 900, letterSpacing: '-.03em' }}>
            {match.teams[0].shortName} {result.score[0]} – {result.score[1]} {match.teams[1].shortName}
          </div>
          <div className="dim small">{match.teams[0].name} vs {match.teams[1].name}</div>
        </div>

        {human && (
          <div className="card mb" style={{ borderColor: 'rgba(53,212,122,.3)' }}>
            <div className="spread">
              <div>
                <div className="tiny dim2" style={{ letterSpacing: '.1em', textTransform: 'uppercase' }}>Your performance</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{human.name}</div>
              </div>
              <div style={{ fontSize: 32, fontWeight: 900, color: human.stats.rating >= 7 ? '#35d47a' : human.stats.rating >= 6 ? '#e8edf4' : '#ff4d5e' }}>
                {human.stats.rating.toFixed(1)}
              </div>
            </div>
            <div className="row mt-s" style={{ gap: 5 }}>
              {human.stats.goals > 0 && <span className="pill good">{human.stats.goals} goals</span>}
              {human.stats.assists > 0 && <span className="pill good">{human.stats.assists} assists</span>}
              <span className="pill">{human.stats.passesCompleted}/{human.stats.passes} passes</span>
              <span className="pill">{human.stats.shots} shots</span>
              <span className="pill">{human.stats.tacklesWon}/{human.stats.tackles} tackles</span>
              <span className="pill">{human.stats.interceptions} interceptions</span>
              <span className="pill">{(human.stats.distance / 1000).toFixed(1)} km</span>
              <span className="pill">{Math.round(human.stamina)}% stamina left</span>
            </div>
          </div>
        )}

        <StatsPanel match={match} />

        <div className="row mt-l">
          <button className="btn primary lg" onClick={onContinue}>
            {career ? 'Continue Career' : 'Back to Menu'}
          </button>
        </div>
      </div>
    </div>
  );
}
