// SSR smoke test: catches render-time crashes in every screen.

import React from 'react';
import { renderToString } from 'react-dom/server';

globalThis.window = { innerWidth: 1400, innerHeight: 900, addEventListener(){}, removeEventListener(){}, devicePixelRatio: 1, matchMedia: () => ({matches:false}) };
Object.defineProperty(globalThis, 'navigator', { value: { maxTouchPoints: 0, getGamepads: () => [] }, configurable: true });
globalThis.localStorage = { _d:{}, getItem(k){return this._d[k]??null;}, setItem(k,v){this._d[k]=v;}, removeItem(k){delete this._d[k];} };
globalThis.document = { createElement: () => ({ getContext: () => null, width:0, height:0 }), getElementById: () => null };
globalThis.ResizeObserver = class { observe(){} disconnect(){} };
globalThis.performance = globalThis.performance ?? { now: () => Date.now() };
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};

const { MainMenu } = await import('../src/ui/MainMenu.jsx');
const { CareerHub } = await import('../src/ui/CareerHub.jsx');
const { PauseMenu, StatsPanel, TacticsPanel } = await import('../src/ui/PauseMenu.jsx');
const { Hud } = await import('../src/ui/Hud.jsx');
const { Career } = await import('../src/career/career.js');
const { Match } = await import('../src/sim/match.js');
const { makeTeam } = await import('../src/sim/teamFactory.js');
const { makeRng } = await import('../src/sim/math.js');
const { makeAttributes } = await import('../src/sim/attributes.js');
const { CLUBS } = await import('../src/data/names.js');

const settings = { quality:'high', camera:'player', volume:.7, audio:true, autoSwitch:true, radar:true, perf:false, touch:false };
let pass = 0, fail = 0;
function t(name, fn) {
  try { const html = fn(); if (typeof html !== 'string' || html.length < 20) throw new Error('empty render'); pass++; console.log('  ok  ' + name + ' (' + html.length + ' bytes)'); }
  catch (e) { fail++; console.log('FAIL  ' + name + ': ' + e.message); }
}

t('MainMenu', () => renderToString(React.createElement(MainMenu, {
  onStart(){}, onCareer(){}, onResumeCareer(){}, hasSave:false, settings, setSettings(){} })));

// Build a real match
const rng = makeRng(4242);
const home = makeTeam(CLUBS[0], 0, rng, { formation:'4-3-3', isHumanControlled:true });
const away = makeTeam(CLUBS[1], 1, rng, { formation:'4-4-2' });
const m = new Match({ seed:4242, homeTeam:home, awayTeam:away, weather:'clear', humanTeam:0 });
m.setHumanPlayer(home.players.find(p=>p.position==='CM').id);
for (let i=0;i<60*90;i++) m.step(1/60);   // 90 sim-seconds so stats are populated
console.log('  (match advanced to ' + m.clockLabel?.() + ', score ' + m.score.join('-') + ')');

t('Hud', () => renderToString(React.createElement(Hud, {
  match:m, gameLoopRef:{current:null}, showRadar:true, showPerf:false, touch:false, onPause(){} })));
t('StatsPanel', () => renderToString(React.createElement(StatsPanel, { match:m })));
t('TacticsPanel', () => renderToString(React.createElement(TacticsPanel, { match:m })));
t('PauseMenu', () => renderToString(React.createElement(PauseMenu, {
  match:m, onResume(){}, onQuit(){}, settings, setSettings(){}, gameLoopRef:{current:null} })));

// Career hub in several states
const c = new Career({ seed:7, position:'CM', age:19, startingLevel:70 });
const attrs = makeAttributes('CM', -4, makeRng(8));
c.attachAttributes(attrs);
t('CareerHub (fresh)', () => renderToString(React.createElement(CareerHub, {
  career:c, attributes:attrs, onPlayMatch(){}, onSimMatch(){}, onSave(){}, onQuit(){}, lastResult:null })));

c.runTraining(c.trainingPlan, attrs);
t('CareerHub (trained)', () => renderToString(React.createElement(CareerHub, {
  career:c, attributes:attrs, onPlayMatch(){}, onSimMatch(){}, onSave(){}, onQuit(){}, lastResult:null })));

const rec = c.recordMatch({ opponent:'Foo FC', home:true, score:[2,1], result:'W', played:true,
  started:true, minutes:90, motm:true, cleanSheet:false,
  playerStats:{ rating:7.8, goals:1, assists:1, passes:52, passesCompleted:44, shots:3, shotsOnTarget:2,
    tacklesWon:3, interceptions:2, keyPasses:2, saves:0, distance:10800, sprintDistance:900,
    duelsWon:6, dribblesCompleted:3, clearances:1 } }, attrs);
t('CareerHub (with last result)', () => renderToString(React.createElement(CareerHub, {
  career:c, attributes:attrs, onPlayMatch(){}, onSimMatch(){}, onSave(){}, onQuit(){}, lastResult:rec })));

// Force an end of season so transfers/history render
while (c.season === 1) {
  c.runTraining(c.trainingPlan, attrs);
  const sel = c.selectionDecision();
  c.recordMatch({ opponent:'X', home:true, score:[1,1], result:'D', played:sel.starting,
    started:sel.starting, minutes:sel.starting?90:0, motm:false, cleanSheet:false,
    playerStats: sel.starting ? { rating:7.4, goals:1, assists:0, passes:40, passesCompleted:34, shots:2,
      shotsOnTarget:1, tacklesWon:2, interceptions:1, keyPasses:1, saves:0, distance:10000,
      sprintDistance:800, duelsWon:4, dribblesCompleted:2, clearances:1 } : null }, attrs);
}
console.log('  (season rolled to ' + c.season + ', offers: ' + c.transferOffers.length + ')');
t('CareerHub (season 2, transfers)', () => renderToString(React.createElement(CareerHub, {
  career:c, attributes:attrs, onPlayMatch(){}, onSimMatch(){}, onSave(){}, onQuit(){}, lastResult:null })));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
