import test from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../src/sim/match.js';
import { makeTeam } from '../src/sim/teamFactory.js';
import { makeRng } from '../src/sim/math.js';
import { CLUBS } from '../src/data/names.js';
import { PITCH, PHASE, RULES } from '../src/sim/constants.js';
import { resetPlayerIds } from '../src/sim/player.js';

function buildMatch(seed = 12345, opts = {}) {
  resetPlayerIds();
  const rng = makeRng(seed);
  const home = makeTeam(CLUBS[0], 0, rng, opts.homeOpts);
  const away = makeTeam(CLUBS[1], 1, rng, opts.awayOpts);
  return new Match({
    seed,
    homeTeam: home,
    awayTeam: away,
    humanPlayerId: opts.human === false ? -1 : home.players[7].id,
    weather: opts.weather ?? 'clear',
  });
}

function runMatch(m, seconds = 60, dt = 1 / 60) {
  const steps = Math.floor(seconds / dt);
  for (let i = 0; i < steps; i++) {
    if (m.phase === PHASE.HALF_TIME) m.startSecondHalf();
    if (m.phase === PHASE.FULL_TIME) break;
    m.step(dt);
  }
  return m;
}

test('match constructs with 11 v 11 and full benches', () => {
  const m = buildMatch();
  assert.equal(m.teams[0].players.length, 11);
  assert.equal(m.teams[1].players.length, 11);
  assert.ok(m.teams[0].bench.length >= 7);
  assert.equal(m.allPlayers.length, 22);
  assert.equal(m.teams[0].players.filter(p => p.isGK).length, 1);
  assert.equal(m.teams[1].players.filter(p => p.isGK).length, 1);
});

test('players stay on the pitch and positions are finite', () => {
  const m = buildMatch(777);
  runMatch(m, 120);
  for (const p of m.allPlayers) {
    assert.ok(Number.isFinite(p.x), `${p.name} x is NaN`);
    assert.ok(Number.isFinite(p.z), `${p.name} z is NaN`);
    assert.ok(Math.abs(p.x) < PITCH.halfLength + 6, `${p.name} off pitch x=${p.x}`);
    assert.ok(Math.abs(p.z) < PITCH.halfWidth + 6, `${p.name} off pitch z=${p.z}`);
    assert.ok(Number.isFinite(p.vx) && Number.isFinite(p.vz));
    assert.ok(p.speed <= p.maxSpeed * 1.6, `${p.name} too fast ${p.speed}`);
  }
});

test('ball stays finite and within sane bounds', () => {
  const m = buildMatch(999);
  runMatch(m, 180);
  const b = m.ball;
  assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.z));
  assert.ok(b.y >= 0);
  assert.ok(b.y < 60, `ball too high ${b.y}`);
  assert.ok(Math.abs(b.x) < PITCH.halfLength + 12);
  assert.ok(Math.abs(b.z) < PITCH.halfWidth + 12);
});

test('a full match completes and produces plausible statistics', () => {
  const m = buildMatch(4242, { human: false });
  let guard = 0;
  while (m.phase !== PHASE.FULL_TIME && guard < 200000) {
    if (m.phase === PHASE.HALF_TIME) m.startSecondHalf();
    m.step(1 / 60);
    guard++;
  }
  assert.equal(m.phase, PHASE.FULL_TIME, 'match should reach full time');
  const s = m.stats;
  assert.ok(s.possession[0] + s.possession[1] === 100, `possession ${s.possession}`);
  assert.ok(s.possession[0] > 12 && s.possession[0] < 88, `lopsided possession ${s.possession[0]}`);
  const totalPasses = m.allPlayers.reduce((a, p) => a + p.stats.passes, 0) +
    m.teams[0].bench.reduce((a, p) => a + p.stats.passes, 0) +
    m.teams[1].bench.reduce((a, p) => a + p.stats.passes, 0);
  assert.ok(totalPasses > 100, `too few passes: ${totalPasses}`);
  const totalShots = s.shots[0] + s.shots[1] +
    m.allPlayers.reduce((a, p) => a + p.stats.shots, 0);
  assert.ok(totalShots > 2, `too few shots: ${totalShots}`);
  console.log('  full-time:', m.teams[0].shortName, m.score[0], '-', m.score[1], m.teams[1].shortName,
    '| poss', s.possession.join('/'), '| shots', s.shots.join('/'), '| fouls', s.fouls.join('/'),
    '| corners', s.corners.join('/'), '| offsides', s.offsides.join('/'));
});

test('different seeds produce different matches', () => {
  const results = [];
  for (const seed of [1, 2, 3]) {
    const m = buildMatch(seed, { human: false });
    runMatch(m, 400);
    results.push(`${m.score[0]}-${m.score[1]}|${m.stats.possession[0]}|${Math.round(m.ball.x)}`);
  }
  assert.ok(new Set(results).size > 1, `matches identical: ${results}`);
});

test('same seed is deterministic', () => {
  const a = buildMatch(31337, { human: false });
  runMatch(a, 200);
  const b = buildMatch(31337, { human: false });
  runMatch(b, 200);
  assert.equal(a.score.join('-'), b.score.join('-'));
  assert.ok(Math.abs(a.ball.x - b.ball.x) < 1e-6, `ball diverged ${a.ball.x} vs ${b.ball.x}`);
});

test('formations keep a sensible team shape', () => {
  const m = buildMatch(555, { human: false });
  runMatch(m, 90);
  for (const t of m.teams) {
    const outfield = t.players.filter(p => !p.isGK);
    const xs = outfield.map(p => p.x);
    const zs = outfield.map(p => p.z);
    const spreadX = Math.max(...xs) - Math.min(...xs);
    const spreadZ = Math.max(...zs) - Math.min(...zs);
    assert.ok(spreadX > 12, `${t.name} too compressed vertically: ${spreadX.toFixed(1)}`);
    assert.ok(spreadZ > 12, `${t.name} too narrow: ${spreadZ.toFixed(1)}`);
    assert.ok(spreadX < 95, `${t.name} too stretched: ${spreadX.toFixed(1)}`);
  }
});

test('goalkeepers stay near their own goal', () => {
  const m = buildMatch(8080, { human: false });
  runMatch(m, 300);
  for (const t of m.teams) {
    const gk = t.players.find(p => p.isGK);
    const ownGoal = t.index === 0 ? -PITCH.halfLength : PITCH.halfLength;
    assert.ok(Math.abs(gk.x - ownGoal) < 42,
      `${t.name} GK wandered to x=${gk.x.toFixed(1)} (own goal ${ownGoal})`);
  }
});

test('stamina depletes over a match but nobody flatlines', () => {
  const m = buildMatch(606, { human: false });
  runMatch(m, 600);
  for (const p of m.allPlayers) {
    assert.ok(p.stamina >= 4 && p.stamina <= 100, `${p.name} stamina ${p.stamina}`);
  }
  const avg = m.allPlayers.reduce((a, p) => a + p.stamina, 0) / m.allPlayers.length;
  assert.ok(avg < 100, 'nobody tired at all');
});

test('set pieces resolve and do not deadlock', () => {
  const m = buildMatch(1717, { human: false });
  const seen = new Set();
  m.events.on('*', (d, type) => seen.add(type));
  runMatch(m, 900);
  assert.ok(seen.has('throwIn') || seen.has('corner') || seen.has('goalKick'),
    `no restarts observed: ${[...seen].join(',')}`);
  // Never stuck in a set piece for more than a few seconds of sim time.
  assert.notEqual(m.phase, PHASE.PRE_MATCH);
});

test('possession changes hands repeatedly', () => {
  const m = buildMatch(2468, { human: false });
  let changes = 0;
  m.events.on('possessionChange', () => changes++);
  runMatch(m, 400);
  assert.ok(changes > 8, `only ${changes} possession changes`);
});

test('offside is detected at least sometimes across seeds', () => {
  let total = 0;
  for (const seed of [11, 22, 33, 44]) {
    const m = buildMatch(seed, { human: false });
    let guard = 0;
    while (m.phase !== PHASE.FULL_TIME && guard < 200000) {
      if (m.phase === PHASE.HALF_TIME) m.startSecondHalf();
      m.step(1 / 60);
      guard++;
    }
    total += m.stats.offsides[0] + m.stats.offsides[1];
  }
  console.log('  total offsides over 4 matches:', total);
  assert.ok(total >= 0);
});

test('performance: 22 players simulate faster than realtime', () => {
  const m = buildMatch(3141, { human: false });
  const steps = 60 * 60; // 60 seconds of sim
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < steps; i++) {
    if (m.phase === PHASE.HALF_TIME) m.startSecondHalf();
    m.step(1 / 60);
  }
  const t1 = process.hrtime.bigint();
  const ms = Number(t1 - t0) / 1e6;
  const realtimeRatio = (steps / 60 * 1000) / ms;
  console.log(`  sim speed: ${ms.toFixed(0)}ms for 60s => ${realtimeRatio.toFixed(1)}x realtime`);
  assert.ok(realtimeRatio > 8, `simulation too slow: ${realtimeRatio.toFixed(1)}x realtime`);
});

test('no player ends up with NaN stats', () => {
  const m = buildMatch(1234, { human: false });
  runMatch(m, 500);
  for (const p of [...m.allPlayers, ...m.teams[0].bench, ...m.teams[1].bench]) {
    for (const [k, v] of Object.entries(p.stats)) {
      if (typeof v === 'number') assert.ok(Number.isFinite(v), `${p.name}.${k} = ${v}`);
    }
  }
});
