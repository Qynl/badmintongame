import { Match } from '../src/sim/match.js';
import { makeTeam } from '../src/sim/teamFactory.js';
import { makeRng } from '../src/sim/math.js';
import { CLUBS } from '../src/data/names.js';
import { PITCH, PHASE } from '../src/sim/constants.js';
import { resetPlayerIds } from '../src/sim/player.js';
import { attackDir } from '../src/sim/analysis.js';

function build(seed) {
  resetPlayerIds();
  const rng = makeRng(seed);
  return new Match({
    seed,
    homeTeam: makeTeam(CLUBS[0], 0, rng),
    awayTeam: makeTeam(CLUBS[1], 1, rng),
    humanPlayerId: -1,
  });
}

const N = Number(process.argv[2] ?? 5);
const agg = {
  goals: 0, shots: 0, sot: 0, fouls: 0, corners: 0, throwIns: 0, offsides: 0,
  yellow: 0, red: 0, passes: 0, passComp: 0, subs: 0, saves: 0, freeKicks: 0,
  goalKicks: 0, penalties: 0, matches: 0, tackles: 0,
};
const phaseTime = {};
const zoneTime = { ownThird: 0, mid: 0, finalThird: 0 };
let gkMax = 0;
let gkStuck = 0;

for (let s = 0; s < N; s++) {
  const m = build(1000 + s * 137);
  let goalKicks = 0; let pens = 0;
  m.events.on('goalKick', () => goalKicks++);
  m.events.on('substitution', () => agg.subs++);
  m.events.on('*', (d, t) => { if (t === 'foul' && d.card) {} });
  const origSetupPen = m.setPieces.setupPenalty.bind(m.setPieces);
  m.setPieces.setupPenalty = (t) => { pens++; return origSetupPen(t); };

  let guard = 0;
  let stuckTicks = 0;
  while (m.phase !== PHASE.FULL_TIME && guard < 400000) {
    if (m.phase === PHASE.HALF_TIME) m.startSecondHalf();
    m.step(1 / 60);
    guard++;
    if (guard % 20 === 0) {
      phaseTime[m.phase] = (phaseTime[m.phase] ?? 0) + 1;
      const bx = m.ball.x;
      if (Math.abs(bx) < 17.5) zoneTime.mid++;
      else zoneTime.finalThird++;
      for (const t of m.teams) {
        const gk = t.players.find(p => p.isGK);
        if (!gk) continue;
        const og = t.index === 0 ? -PITCH.halfLength : PITCH.halfLength;
        gkMax = Math.max(gkMax, Math.abs(gk.x - og));
        if (m.ball.owner === gk.id) stuckTicks++;
      }
    }
  }
  gkStuck += stuckTicks;
  agg.matches++;
  agg.goals += m.score[0] + m.score[1];
  agg.shots += m.stats.shots[0] + m.stats.shots[1] + m.allPlayers.reduce((a, p) => a + p.stats.shots, 0);
  agg.fouls += m.stats.fouls[0] + m.stats.fouls[1];
  agg.corners += m.stats.corners[0] + m.stats.corners[1];
  agg.throwIns += m.stats.throwIns[0] + m.stats.throwIns[1];
  agg.offsides += m.stats.offsides[0] + m.stats.offsides[1];
  agg.yellow += m.stats.yellow[0] + m.stats.yellow[1];
  agg.red += m.stats.red[0] + m.stats.red[1];
  agg.saves += m.stats.saves[0] + m.stats.saves[1];
  agg.tackles += m.stats.tackles[0] + m.stats.tackles[1];
  agg.freeKicks += m.stats.freeKicks[0] + m.stats.freeKicks[1];
  agg.goalKicks += goalKicks;
  agg.penalties += pens;
  const all = [...m.allPlayers, ...m.teams[0].bench, ...m.teams[1].bench];
  agg.passes += all.reduce((a, p) => a + p.stats.passes, 0);
  agg.passComp += all.reduce((a, p) => a + p.stats.passesCompleted, 0);
  console.log(`seed ${1000 + s * 137}: ${m.score[0]}-${m.score[1]} poss ${m.stats.possession.join('/')} shots ${m.stats.shots.join('/')} guard=${guard}`);
}

console.log('\n--- PER MATCH AVERAGES (target real-world in brackets) ---');
const per = (k) => (agg[k] / agg.matches).toFixed(1);
console.log(`goals        ${per('goals')}   (2.7)`);
console.log(`shots        ${per('shots')}   (24)`);
console.log(`passes       ${per('passes')}   (900)`);
console.log(`pass comp %  ${(agg.passComp / agg.passes * 100).toFixed(0)}%  (80%)`);
console.log(`fouls        ${per('fouls')}   (22)`);
console.log(`yellow       ${per('yellow')}   (3.5)`);
console.log(`red          ${per('red')}   (0.2)`);
console.log(`corners      ${per('corners')}   (10)`);
console.log(`throw-ins    ${per('throwIns')}   (40)`);
console.log(`goal kicks   ${per('goalKicks')}   (16)`);
console.log(`free kicks   ${per('freeKicks')}   (20)`);
console.log(`penalties    ${per('penalties')}   (0.25)`);
console.log(`offsides     ${per('offsides')}   (2.7)`);
console.log(`saves        ${per('saves')}   (6)`);
console.log(`tackles      ${per('tackles')}   (30)`);
console.log(`subs         ${per('subs')}   (8)`);
console.log('\nphase distribution:', Object.entries(phaseTime).map(([k, v]) => `${k}=${(v / Object.values(phaseTime).reduce((a, b) => a + b) * 100).toFixed(0)}%`).join(' '));
console.log('ball zone: mid', (zoneTime.mid / (zoneTime.mid + zoneTime.finalThird) * 100).toFixed(0) + '%');
console.log('max GK distance from own goal:', gkMax.toFixed(1), '| GK-holds-ball ticks:', gkStuck);
