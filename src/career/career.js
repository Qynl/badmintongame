import { CLUBS, FIRST_NAMES, LAST_NAMES } from '../data/names.js';
import { makeRng, clamp, lerp } from '../sim/math.js';
import { POS } from '../sim/constants.js';
import { overall } from '../sim/attributes.js';

// ---------------------------------------------------------------------------
// CAREER MODE
//
// You are one footballer. Your attributes move because of what you actually do
// on the pitch -- not because a bar filled up. Each match produces a rating and
// a set of measured contributions (passes completed, duels won, distance
// covered, chances created), those feed development in the specific attributes
// they exercise, and your manager's opinion of you decides whether you start.
// ---------------------------------------------------------------------------

export const TRAINING_DRILLS = {
  finishing:   { label: 'Finishing',        attrs: { finishing: 1.0, composure: 0.4, shooting: 0.5 }, fatigue: 0.16 },
  passing:     { label: 'Passing Patterns', attrs: { passing: 1.0, vision: 0.6, technique: 0.3 }, fatigue: 0.12 },
  dribbling:   { label: 'Ball Mastery',     attrs: { dribbling: 1.0, agility: 0.5, technique: 0.5 }, fatigue: 0.14 },
  defending:   { label: 'Defensive Shape',  attrs: { tackling: 0.8, marking: 0.8, positioning: 0.6, interception: 0.6 }, fatigue: 0.13 },
  aerial:      { label: 'Aerial Work',      attrs: { heading: 1.0, strength: 0.5, reactions: 0.3 }, fatigue: 0.18 },
  fitness:     { label: 'Conditioning',     attrs: { stamina: 1.0, pace: 0.35, acceleration: 0.4, strength: 0.5 }, fatigue: 0.26 },
  tactical:    { label: 'Tactical Session', attrs: { decisions: 0.9, positioning: 0.8, teamwork: 0.7, vision: 0.4 }, fatigue: 0.07 },
  pressing:    { label: 'Pressing Drills',  attrs: { workrate: 0.9, aggression: 0.5, interception: 0.4, stamina: 0.5 }, fatigue: 0.22 },
  keeping:     { label: 'Goalkeeping',      attrs: { reflexes: 1.0, handling: 0.8, gkPositioning: 0.7 }, fatigue: 0.14 },
  recovery:    { label: 'Recovery',         attrs: {}, fatigue: -0.55 },
  rest:        { label: 'Rest Day',         attrs: {}, fatigue: -0.35 },
};

export const OBJECTIVE_TEMPLATES = [
  { id: 'rating',   label: 'Average a match rating of {t}',        stat: 'rating',   cmp: 'avg', targets: [6.4, 6.8, 7.2] },
  { id: 'goals',    label: 'Score {t} goals',                       stat: 'goals',    cmp: 'sum', targets: [3, 6, 10] },
  { id: 'assists',  label: 'Register {t} assists',                  stat: 'assists',  cmp: 'sum', targets: [2, 4, 7] },
  { id: 'passpct',  label: 'Complete {t}% of your passes',          stat: 'passPct',  cmp: 'avg', targets: [72, 80, 86] },
  { id: 'tackles',  label: 'Win {t} tackles',                       stat: 'tacklesWon', cmp: 'sum', targets: [8, 15, 24] },
  { id: 'starts',   label: 'Start {t} matches',                     stat: 'started',  cmp: 'sum', targets: [4, 8, 14] },
  { id: 'cleansheet', label: 'Keep {t} clean sheets',               stat: 'cleanSheet', cmp: 'sum', targets: [2, 4, 7] },
];

// Which attributes each on-pitch action actually trains.
const ACTION_TRAINING = {
  passesCompleted: { passing: 0.020, vision: 0.008, technique: 0.006 },
  keyPasses:       { vision: 0.10, passing: 0.05, decisions: 0.04 },
  goals:           { finishing: 0.30, composure: 0.18, shooting: 0.10 },
  shotsOnTarget:   { finishing: 0.055, shooting: 0.03 },
  assists:         { vision: 0.12, passing: 0.08, technique: 0.04 },
  tacklesWon:      { tackling: 0.075, marking: 0.03, aggression: 0.02 },
  interceptions:   { interception: 0.075, positioning: 0.04, decisions: 0.02 },
  clearances:      { heading: 0.03, positioning: 0.02 },
  duelsWon:        { strength: 0.035, aggression: 0.02, composure: 0.03 },
  dribblesCompleted: { dribbling: 0.075, agility: 0.04, technique: 0.03 },
  saves:           { reflexes: 0.09, handling: 0.06, gkPositioning: 0.03 },
  sprintDistance:  { stamina: 0.0009, pace: 0.00025 },
};

// Age curves: young players improve fast, veterans decline physically first.
function ageFactor(age, attr) {
  const physical = ['pace', 'acceleration', 'agility', 'stamina', 'strength', 'reactions'];
  const mental = ['decisions', 'positioning', 'vision', 'composure', 'teamwork', 'workrate'];
  const isPhys = physical.includes(attr);
  const isMental = mental.includes(attr);
  if (age <= 21) return isPhys ? 1.45 : 1.30;
  if (age <= 24) return isPhys ? 1.15 : 1.20;
  if (age <= 27) return isPhys ? 0.75 : 1.05;
  if (age <= 30) return isPhys ? 0.28 : 0.85;
  if (age <= 33) return isPhys ? -0.35 : 0.55;
  return isPhys ? -0.85 : 0.20;
}

// Attributes a given position can meaningfully develop. Training does not turn
// a centre-back into a goalkeeper, and a midfielder's reflexes never move.
const GK_ATTRS = ['reflexes', 'handling', 'gkPositioning'];

export function buildCeilings(attrs, potential, position) {
  // Each attribute's ceiling is its current level plus the headroom implied by
  // the player's potential relative to where they are now -- weighted by how
  // central that attribute is to the position. This means a young playmaker's
  // passing can climb a long way while their heading barely moves.
  //
  // Headroom is measured against the *positional overall*, the same number the
  // scouting screen shows, so "potential 80" genuinely means "can become an
  // 80-rated player in this position".
  const relevant = ATTR_RELEVANCE[position] ?? ATTR_RELEVANCE.CM;
  const cur = overall(attrs, position);
  const room = Math.max(0, potential - cur);
  const out = {};
  for (const k of Object.keys(attrs)) {
    if (typeof attrs[k] !== 'number') continue;
    if (position !== 'GK' && GK_ATTRS.includes(k)) { out[k] = attrs[k]; continue; }
    const w = relevant[k] ?? 0.35;
    out[k] = clamp(attrs[k] + room * (0.5 + w * 1.5), 1, 99);
  }
  return out;
}

// How central each attribute is to each position (0..1).
const ATTR_RELEVANCE = {
  GK: { reflexes: 1, handling: 1, gkPositioning: 1, reactions: 0.8, composure: 0.6, decisions: 0.6, passing: 0.4, positioning: 0.4, agility: 0.5, strength: 0.3 },
  CB: { tackling: 1, marking: 1, heading: 0.9, strength: 0.9, positioning: 0.9, interception: 0.9, decisions: 0.7, composure: 0.6, passing: 0.5, pace: 0.5 },
  LB: { pace: 0.9, stamina: 1, tackling: 0.8, marking: 0.8, workrate: 0.9, passing: 0.7, technique: 0.6, positioning: 0.7, interception: 0.7, dribbling: 0.6 },
  RB: { pace: 0.9, stamina: 1, tackling: 0.8, marking: 0.8, workrate: 0.9, passing: 0.7, technique: 0.6, positioning: 0.7, interception: 0.7, dribbling: 0.6 },
  DM: { interception: 1, positioning: 1, tackling: 0.9, passing: 0.9, decisions: 0.9, teamwork: 0.9, stamina: 0.9, marking: 0.8, composure: 0.7, strength: 0.7 },
  CM: { passing: 1, vision: 1, stamina: 1, decisions: 0.9, technique: 0.9, teamwork: 0.9, workrate: 0.9, positioning: 0.7, dribbling: 0.6, composure: 0.7 },
  AM: { vision: 1, technique: 1, passing: 0.9, dribbling: 0.9, finishing: 0.8, composure: 0.8, agility: 0.8, decisions: 0.8, shooting: 0.7 },
  LW: { pace: 1, dribbling: 1, acceleration: 1, agility: 0.9, technique: 0.9, finishing: 0.8, shooting: 0.7, passing: 0.6, stamina: 0.7 },
  RW: { pace: 1, dribbling: 1, acceleration: 1, agility: 0.9, technique: 0.9, finishing: 0.8, shooting: 0.7, passing: 0.6, stamina: 0.7 },
  ST: { finishing: 1, shooting: 1, positioning: 1, composure: 0.9, pace: 0.8, strength: 0.8, heading: 0.8, reactions: 0.8, technique: 0.7 },
};

export class Career {
  constructor(config = {}) {
    this.rng = makeRng(config.seed ?? (Date.now() & 0xffffffff));
    this.seed = config.seed ?? (Date.now() & 0xffffffff);
    this.season = 1;
    this.week = 1;
    this.matchIndex = 0;
    this.history = [];        // per-match records
    this.seasonHistory = [];  // per-season summaries
    this.transferOffers = [];
    this.news = [];
    this.trainingPlan = ['tactical', 'passing', 'fitness', 'recovery'];
    this.weeklyTrainingDone = false;

    // --- The player ---
    const pos = config.position ?? POS.CM;
    this.player = {
      firstName: config.firstName ?? this.rng.pick(FIRST_NAMES),
      lastName: config.lastName ?? this.rng.pick(LAST_NAMES),
      age: config.age ?? 19,
      position: pos,
      preferredPositions: [pos],
      shirt: config.shirt ?? 0,
      footedness: config.footedness ?? (this.rng.chance(0.22) ? 'L' : 'R'),
      attributes: config.attributes,
      // Potential is resolved against the player's real starting overall in
      // attachAttributes(); this is only the fallback for a bare Career().
      potential: config.potential ?? null,
      potentialSpread: config.potentialSpread ?? clamp(this.rng.gauss(14, 6), 2, 30),
      ceilings: null,   // per-attribute ceiling, built on first use
      form: 0,          // -1..1 rolling
      fatigue: 0,       // 0..1
      morale: 0.6,      // 0..1
      reputation: config.reputation ?? 35, // 0..100
      managerTrust: 0.45,
      injury: null,
      contractYears: 3,
      wage: 4,          // k/week
      seasonStats: emptySeasonStats(),
      careerStats: emptySeasonStats(),
    };

    // --- Club ---
    const clubName = config.clubName;
    const pool = CLUBS.filter(c => c.rating <= (config.startingLevel ?? 74));
    this.club = clubName ? CLUBS.find(c => c.name === clubName) : this.rng.pick(pool.length ? pool : CLUBS);
    this.league = this.buildLeague();
    this.fixtures = this.buildFixtures();
    this.objectives = this.rollObjectives();
    this.addNews(`You have signed for ${this.club.name}.`, 'transfer');
  }

  get fullName() { return `${this.player.firstName} ${this.player.lastName}`; }

  buildLeague() {
    // A 12-team league centred on the player's club level.
    const sorted = [...CLUBS].sort((a, b) => Math.abs(a.rating - this.club.rating) - Math.abs(b.rating - this.club.rating));
    const teams = sorted.slice(0, 12);
    if (!teams.includes(this.club)) { teams[11] = this.club; }
    return teams.map(c => ({
      club: c, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, pts: 0,
    }));
  }

  buildFixtures() {
    // Double round-robin among the league, in a rotating schedule.
    const teams = this.league.map(t => t.club);
    const n = teams.length;
    const rounds = [];
    const list = [...teams];
    for (let leg = 0; leg < 2; leg++) {
      const arr = [...list];
      for (let r = 0; r < n - 1; r++) {
        const pairs = [];
        for (let i = 0; i < n / 2; i++) {
          const a = arr[i];
          const b = arr[n - 1 - i];
          pairs.push(leg === 0 ? { home: a, away: b } : { home: b, away: a });
        }
        rounds.push(pairs);
        arr.splice(1, 0, arr.pop());
      }
    }
    return rounds;
  }

  currentFixture() {
    const round = this.fixtures[(this.week - 1) % this.fixtures.length];
    if (!round) return null;
    return round.find(f => f.home === this.club || f.away === this.club) ?? null;
  }

  rollObjectives() {
    const pos = this.player.position;
    const relevant = OBJECTIVE_TEMPLATES.filter(o => {
      if (o.id === 'goals') return [POS.ST, POS.LW, POS.RW, POS.AM].includes(pos);
      if (o.id === 'assists') return [POS.AM, POS.LW, POS.RW, POS.CM, POS.LB, POS.RB].includes(pos);
      if (o.id === 'tackles') return [POS.CB, POS.DM, POS.CM, POS.LB, POS.RB].includes(pos);
      if (o.id === 'cleansheet') return [POS.GK, POS.CB, POS.LB, POS.RB, POS.DM].includes(pos);
      return true;
    });
    const picked = [];
    const used = new Set();
    // Always: a rating objective + a starts objective + 1-2 position-specific.
    for (const id of ['rating', 'starts']) {
      const t = OBJECTIVE_TEMPLATES.find(o => o.id === id);
      picked.push(this.makeObjective(t));
      used.add(id);
    }
    let guard = 0;
    while (picked.length < 4 && guard++ < 30) {
      const t = this.rng.pick(relevant);
      if (used.has(t.id)) continue;
      used.add(t.id);
      picked.push(this.makeObjective(t));
    }
    return picked;
  }

  makeObjective(tpl) {
    // Difficulty scales with reputation.
    const tier = this.player.reputation > 65 ? 2 : this.player.reputation > 42 ? 1 : 0;
    const target = tpl.targets[tier];
    return {
      id: tpl.id, stat: tpl.stat, cmp: tpl.cmp, target,
      label: tpl.label.replace('{t}', target),
      progress: 0, complete: false, awarded: false, reward: 3 + tier * 4,
    };
  }

  addNews(text, kind = 'info') {
    this.news.unshift({ text, kind, week: this.week, season: this.season });
    if (this.news.length > 40) this.news.pop();
  }

  // -------------------------------------------------------------------------
  // Selection: does the manager pick you this week?
  // -------------------------------------------------------------------------
  selectionDecision() {
    const p = this.player;
    if (p.injury && p.injury.weeks > 0) {
      return { starting: false, benched: false, reason: `Injured (${p.injury.name})` };
    }

    // Probabilistic, not a hard threshold -- a manager who has doubts still
    // gives you the odd start, which is what stops a bad run from becoming a
    // permanent exile.
    let standing = p.managerTrust + p.form * 0.22 - Math.max(0, p.fatigue - 0.55) * 0.6;
    // How hard it is to break into THIS squad.
    standing -= clamp((this.club.rating - 68) / 55, 0, 0.45);
    // A rested, sharp player who has been training well pushes his claim.
    standing += (p.morale - 0.5) * 0.12;
    // Sharpness from recent training load: too little work is as bad as too much.
    standing += clamp(0.35 - Math.abs(p.fatigue - 0.35), -0.15, 0.12);

    const startChance = clamp((standing - 0.18) / 0.62, 0.04, 0.94);
    const roll = this.rng();
    if (roll < startChance) {
      return { starting: true, benched: false, reason: reasonFor(standing, 'start') };
    }
    // Bench chance sits above the remaining gap -- squads are 18, not 11.
    const benchChance = clamp(startChance + 0.42, 0, 0.97);
    if (roll < benchChance) {
      return { starting: false, benched: true, reason: reasonFor(standing, 'bench') };
    }
    return { starting: false, benched: false, reason: reasonFor(standing, 'out') };
  }

  // -------------------------------------------------------------------------
  // Training week
  // -------------------------------------------------------------------------
  // Bind the career to a concrete attribute set. Must be called once, when the
  // player's attributes are first created, so potential can be expressed
  // relative to their actual ability.
  attachAttributes(playerAttributes) {
    const p = this.player;
    const cur = overall(playerAttributes, p.position);
    p.startingOverall = cur;
    if (p.potential == null) {
      // Younger players have more room; the spread is fixed per career so it
      // does not drift between sessions.
      const youth = clamp((24 - p.age) / 8, 0, 1);
      p.potential = clamp(Math.round(cur + p.potentialSpread * (0.35 + youth * 0.9)), cur, 96);
    }
    p.ceilings = buildCeilings(playerAttributes, p.potential, p.position);
    return p.potential;
  }

  ceilingsFor(playerAttributes) {
    if (!this.player.ceilings) this.attachAttributes(playerAttributes);
    return this.player.ceilings;
  }

  // Per-attribute ceilings alone let the weighted positional overall drift past
  // `potential`, because gains land on attributes the overall barely weights.
  // This is the hard stop: once the overall reaches potential, further growth
  // is scaled to nothing.
  overallHeadroom(playerAttributes) {
    const p = this.player;
    const cur = overall(playerAttributes, p.position);
    if (p.potential == null) return 1;
    return clamp((p.potential - cur) / 6, 0, 1);
  }

  runTraining(plan = this.trainingPlan, playerAttributes) {
    const p = this.player;
    const ceilings = this.ceilingsFor(playerAttributes);
    const gains = {};
    let fatigueDelta = 0;
    for (const key of plan) {
      const drill = TRAINING_DRILLS[key];
      if (!drill) continue;
      fatigueDelta += drill.fatigue;
      for (const [attr, weight] of Object.entries(drill.attrs)) {
        if (playerAttributes[attr] == null) continue;
        // Skip goalkeeping work for outfielders and vice versa.
        if (p.position !== 'GK' && GK_ATTRS.includes(attr)) continue;
        const cur = playerAttributes[attr];
        // Diminishing returns as you approach your ceiling for that attribute.
        const ceiling = ceilings[attr] ?? cur;
        const headroom = clamp((ceiling - cur) / 14, -0.25, 1);
        const af = ageFactor(p.age, attr);
        // Tired players train badly.
        const fatiguePenalty = 1 - clamp(p.fatigue, 0, 1) * 0.65;
        const moraleBonus = 0.8 + p.morale * 0.4;
        const g = weight * 0.16 * headroom * af * fatiguePenalty * moraleBonus *
                  (0.7 + this.rng() * 0.6);
        gains[attr] = (gains[attr] ?? 0) + g;
      }
    }
    // Apply, throttled by how close the overall is to the potential ceiling.
    const scale = this.overallHeadroom(playerAttributes);
    for (const [attr, g] of Object.entries(gains)) {
      gains[attr] = g * scale;
      playerAttributes[attr] = clamp((playerAttributes[attr] ?? 50) + gains[attr], 1, 99);
    }
    p.fatigue = clamp(p.fatigue + fatigueDelta, 0, 1);
    this.weeklyTrainingDone = true;
    return gains;
  }

  // -------------------------------------------------------------------------
  // Post-match: record, develop, update trust/form/reputation.
  // -------------------------------------------------------------------------
  recordMatch(matchResult, playerAttributes) {
    const p = this.player;
    const s = matchResult.playerStats;
    const rating = matchResult.played ? s.rating : null;

    const record = {
      season: this.season, week: this.week,
      opponent: matchResult.opponent,
      home: matchResult.home,
      score: matchResult.score,
      result: matchResult.result,      // 'W' | 'D' | 'L'
      played: matchResult.played,
      minutes: matchResult.minutes ?? 0,
      rating,
      stats: s ? { ...s } : null,
    };
    this.history.push(record);
    this.matchIndex++;

    if (matchResult.played && s) {
      const ss = p.seasonStats;
      const cs = p.careerStats;
      for (const acc of [ss, cs]) {
        acc.apps++;
        if (matchResult.started) acc.started++;
        acc.minutes += matchResult.minutes ?? 0;
        acc.goals += s.goals ?? 0;
        acc.assists += s.assists ?? 0;
        acc.passes += s.passes ?? 0;
        acc.passesCompleted += s.passesCompleted ?? 0;
        acc.shots += s.shots ?? 0;
        acc.tacklesWon += s.tacklesWon ?? 0;
        acc.interceptions += s.interceptions ?? 0;
        acc.keyPasses += s.keyPasses ?? 0;
        acc.saves += s.saves ?? 0;
        acc.distance += s.distance ?? 0;
        acc.ratingSum += rating ?? 0;
        acc.motm += matchResult.motm ? 1 : 0;
        if (matchResult.cleanSheet) acc.cleanSheet++;
      }

      // --- Development from what you actually did ---
      const minutesFactor = clamp((matchResult.minutes ?? 0) / 90, 0, 1.15);
      const ceilings = this.ceilingsFor(playerAttributes);
      const isGK = p.position === 'GK';
      const trainable = (attr) => typeof playerAttributes[attr] === 'number' &&
        (isGK || !GK_ATTRS.includes(attr));
      const gains = {};
      for (const [statKey, attrs] of Object.entries(ACTION_TRAINING)) {
        const v = s[statKey] ?? 0;
        if (!v) continue;
        for (const [attr, per] of Object.entries(attrs)) {
          if (!trainable(attr)) continue;
          const cur = playerAttributes[attr];
          const headroom = clamp(((ceilings[attr] ?? cur) - cur) / 14, -0.3, 1);
          const af = ageFactor(p.age, attr);
          gains[attr] = (gains[attr] ?? 0) + v * per * headroom * af * 0.55;
        }
      }
      // A strong performance lifts everything a touch; a poor one costs you.
      // Ageing decline is applied here too -- it is the only thing that can
      // push an attribute meaningfully backwards.
      const perfMod = clamp(((rating ?? 6) - 6.4) * 0.030, -0.09, 0.14) * minutesFactor;
      for (const attr of Object.keys(playerAttributes)) {
        if (!trainable(attr)) continue;
        const af = ageFactor(p.age, attr);
        const cur = playerAttributes[attr];
        const headroom = clamp(((ceilings[attr] ?? cur) - cur) / 14, -0.3, 1);
        // Decline only bites once the age factor turns negative.
        const drift = af >= 0 ? perfMod * Math.max(0, headroom) : af * 0.035;
        gains[attr] = (gains[attr] ?? 0) + drift;
      }
      const scale = this.overallHeadroom(playerAttributes);
      for (const [attr, g] of Object.entries(gains)) {
        if (!trainable(attr)) continue;
        // Decline (negative) is never throttled -- ageing happens regardless.
        const applied = clamp(g, -0.35, 1.0) * (g > 0 ? scale : 1);
        gains[attr] = applied;
        playerAttributes[attr] = clamp(playerAttributes[attr] + applied, 1, 99);
      }
      record.development = Object.fromEntries(
        Object.entries(gains).filter(([, g]) => Math.abs(g) > 0.04)
          .sort((a, b) => b[1] - a[1]).slice(0, 6)
      );

      // --- Form (rolling over the last 5 appearances) ---
      const recent = this.history.filter(h => h.played).slice(-5);
      const avg = recent.reduce((a, h) => a + (h.rating ?? 6), 0) / Math.max(1, recent.length);
      p.form = clamp((avg - 6.3) / 1.4, -1, 1);

      // --- Manager trust ---
      const trustDelta = clamp(((rating ?? 6) - 6.4) * 0.075, -0.14, 0.14) +
                         (matchResult.motm ? 0.05 : 0) +
                         (matchResult.result === 'W' ? 0.012 : matchResult.result === 'L' ? -0.008 : 0);
      p.managerTrust = clamp(p.managerTrust + trustDelta, 0.05, 0.98);

      // --- Reputation: goals, MOTM and consistency at a good club ---
      // --- Reputation ---
      // Reputation is not a score you accumulate; it is what the game thinks
      // you are worth right now. It chases a target set by how good you
      // actually are, at what level, with what output -- so a solid squad
      // player at a mid-table club plateaus in the 50s no matter how many
      // games he plays, and only genuine production at a genuine level moves
      // you into the 80s.
      const ovr = overall(playerAttributes, p.position);
      const level = clamp((this.club.rating - 58) / 32, 0, 1);
      const seasonApps = Math.max(1, p.seasonStats.apps);
      const per90 = ((p.seasonStats.goals + p.seasonStats.assists) / seasonApps);
      const avgRating = p.seasonStats.ratingSum / seasonApps;
      const repTarget = clamp(
        (ovr - 46) * 1.35                    // your actual ability is the floor
        + level * 14                          // playing at a big club is seen
        + clamp((avgRating - 6.5), -1, 1.6) * 12  // and performing there
        + clamp(per90 * 22, 0, 16)            // goal contributions get noticed
        + Math.min(8, p.careerStats.motm * 0.6),
        3, 97);
      // Reputation moves slowly, and falls faster than it climbs is false --
      // in football it is the opposite: it is sticky on the way down.
      const gap = repTarget - p.reputation;
      const rate = gap > 0 ? 0.035 : 0.018;
      p.reputation = clamp(p.reputation + gap * rate, 1, 99);

      // --- Morale ---
      p.morale = clamp(p.morale + ((rating ?? 6) - 6.3) * 0.05 +
        (matchResult.result === 'W' ? 0.06 : matchResult.result === 'L' ? -0.05 : 0), 0.05, 1);

      // --- Fatigue ---
      p.fatigue = clamp(p.fatigue + minutesFactor * 0.30 - 0.05, 0, 1);

      // --- Injury risk rises with fatigue ---
      if (this.rng() < 0.012 + p.fatigue * 0.045) {
        this.applyInjury();
      }
    } else {
      // Didn't play: you get sharp and rested, and a manager who has left you
      // out for weeks starts to feel he owes you a look. Trust decays toward a
      // floor set by your reputation rather than collapsing to zero.
      p.fatigue = clamp(p.fatigue - 0.25, 0, 1);
      const floor = clamp(0.18 + p.reputation / 320, 0.15, 0.5);
      const recent = this.history.slice(-6);
      const idleWeeks = recent.filter(h => !h.played).length;
      const pull = idleWeeks >= 3 ? 0.035 : -0.012;
      p.managerTrust = clamp(
        p.managerTrust + (p.managerTrust < floor ? Math.max(pull, 0.02) : pull),
        floor * 0.8, 0.98);
      p.morale = clamp(p.morale - 0.025 + (idleWeeks >= 4 ? 0.01 : 0), 0.05, 1);
    }

    this.updateObjectives();
    this.updateLeagueTable(matchResult);
    this.week++;
    this.weeklyTrainingDone = false;

    // Injury countdown
    if (p.injury) {
      p.injury.weeks--;
      if (p.injury.weeks <= 0) {
        this.addNews(`You are back in full training after your ${p.injury.name.toLowerCase()}.`, 'injury');
        p.injury = null;
      }
    }

    if (this.week > this.fixtures.length) this.endSeason();
    return record;
  }

  applyInjury() {
    const injuries = [
      { name: 'Knock', weeks: 1 }, { name: 'Dead leg', weeks: 1 },
      { name: 'Hamstring strain', weeks: 3 }, { name: 'Ankle sprain', weeks: 4 },
      { name: 'Groin strain', weeks: 3 }, { name: 'Calf tear', weeks: 5 },
    ];
    const inj = this.rng.pick(injuries);
    this.player.injury = { ...inj };
    this.player.morale = clamp(this.player.morale - 0.15, 0.05, 1);
    this.addNews(`Injury: ${inj.name}. Out for around ${inj.weeks} week(s).`, 'injury');
  }

  updateObjectives() {
    const p = this.player;
    const ss = p.seasonStats;
    for (const o of this.objectives) {
      let value = 0;
      if (o.stat === 'rating') value = ss.apps ? ss.ratingSum / ss.apps : 0;
      else if (o.stat === 'passPct') value = ss.passes ? (ss.passesCompleted / ss.passes) * 100 : 0;
      else value = ss[o.stat] ?? 0;
      o.progress = value;
      o.complete = value >= o.target;
      // Reward once per season, the first time it is hit. Ratings and pass %
      // are averages that can dip back below target -- that must not re-arm
      // the reward.
      if (o.complete && !o.awarded) {
        o.awarded = true;
        p.managerTrust = clamp(p.managerTrust + 0.06, 0.05, 0.98);
        p.morale = clamp(p.morale + 0.08, 0.05, 1);
        this.addNews(`Objective complete: ${o.label}`, 'objective');
      }
    }
  }

  updateLeagueTable(matchResult) {
    // Simulate the rest of the round so the table is alive.
    const round = this.fixtures[(this.week - 1) % this.fixtures.length] ?? [];
    for (const fx of round) {
      const isMine = fx.home === this.club || fx.away === this.club;
      let hg, ag;
      if (isMine) {
        [hg, ag] = matchResult.home ? matchResult.score : [matchResult.score[1], matchResult.score[0]];
      } else {
        const diff = (fx.home.rating + 3) - fx.away.rating;
        const lambdaH = clamp(1.35 + diff * 0.035, 0.35, 3.4);
        const lambdaA = clamp(1.15 - diff * 0.035, 0.30, 3.2);
        hg = poisson(lambdaH, this.rng);
        ag = poisson(lambdaA, this.rng);
      }
      const th = this.league.find(t => t.club === fx.home);
      const ta = this.league.find(t => t.club === fx.away);
      if (!th || !ta) continue;
      th.played++; ta.played++;
      th.gf += hg; th.ga += ag; ta.gf += ag; ta.ga += hg;
      if (hg > ag) { th.won++; th.pts += 3; ta.lost++; }
      else if (hg < ag) { ta.won++; ta.pts += 3; th.lost++; }
      else { th.drawn++; ta.drawn++; th.pts++; ta.pts++; }
    }
    this.league.sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf);
  }

  endSeason() {
    const p = this.player;
    const ss = p.seasonStats;
    const pos = this.league.findIndex(t => t.club === this.club) + 1;
    const summary = {
      season: this.season,
      club: this.club.name,
      leaguePosition: pos,
      ...ss,
      avgRating: ss.apps ? ss.ratingSum / ss.apps : 0,
      objectivesMet: this.objectives.filter(o => o.awarded).length,
      objectivesTotal: this.objectives.length,
    };
    this.seasonHistory.push(summary);
    this.addNews(`Season ${this.season} finished. ${this.club.name} placed ${pos}${ordinal(pos)}. ` +
      `You made ${ss.apps} appearances, ${ss.goals} goals, ${ss.assists} assists, ` +
      `average rating ${(summary.avgRating || 0).toFixed(2)}.`, 'season');

    // Transfer interest is driven by reputation vs your club's level.
    this.transferOffers = this.generateOffers();
    if (this.transferOffers.length) {
      this.addNews(`${this.transferOffers.length} club(s) have registered an interest in you.`, 'transfer');
    }

    p.age++;
    p.seasonStats = emptySeasonStats();
    p.contractYears = Math.max(0, p.contractYears - 1);
    p.fatigue = 0;
    this.season++;
    this.week = 1;
    this.objectives = this.rollObjectives();
    for (const t of this.league) { t.played = t.won = t.drawn = t.lost = t.gf = t.ga = t.pts = 0; }
    this.fixtures = this.buildFixtures();
  }

  generateOffers() {
    const p = this.player;
    const offers = [];
    for (const c of CLUBS) {
      if (c === this.club) continue;
      // A club will look at you if your reputation is near its level.
      const wants = p.reputation + this.rng.gauss(0, 7) > c.rating + 4;
      if (!wants) continue;
      const better = c.rating > this.club.rating;
      offers.push({
        club: c,
        wage: Math.round((c.rating - 55) * 1.7 + p.reputation * 0.35 + this.rng.range(-3, 5)),
        role: c.rating > p.reputation + 8 ? 'Squad rotation' :
              c.rating > p.reputation - 4 ? 'First team' : 'Star player',
        better,
      });
    }
    offers.sort((a, b) => b.club.rating - a.club.rating);
    return offers.slice(0, 4);
  }

  acceptOffer(offer) {
    this.club = offer.club;
    this.player.wage = offer.wage;
    this.player.contractYears = 3;
    this.player.managerTrust = offer.role === 'Star player' ? 0.65
      : offer.role === 'First team' ? 0.5 : 0.32;
    this.player.morale = 0.75;
    this.league = this.buildLeague();
    this.fixtures = this.buildFixtures();
    this.transferOffers = [];
    this.addNews(`You have joined ${offer.club.name} as a ${offer.role.toLowerCase()}.`, 'transfer');
  }

  toJSON() {
    return {
      version: 1,
      seed: this.seed, season: this.season, week: this.week,
      matchIndex: this.matchIndex,
      player: this.player,
      clubName: this.club.name,
      history: this.history.slice(-60),
      seasonHistory: this.seasonHistory,
      objectives: this.objectives,
      news: this.news.slice(0, 25),
      trainingPlan: this.trainingPlan,
      league: this.league.map(t => ({ name: t.club.name, played: t.played, won: t.won, drawn: t.drawn, lost: t.lost, gf: t.gf, ga: t.ga, pts: t.pts })),
    };
  }

  static fromJSON(data) {
    const c = new Career({ seed: data.seed, clubName: data.clubName });
    c.season = data.season; c.week = data.week; c.matchIndex = data.matchIndex;
    c.player = data.player;
    c.history = data.history ?? [];
    c.seasonHistory = data.seasonHistory ?? [];
    c.objectives = data.objectives ?? c.objectives;
    c.news = data.news ?? [];
    c.trainingPlan = data.trainingPlan ?? c.trainingPlan;
    if (data.league) {
      for (const row of data.league) {
        const t = c.league.find(x => x.club.name === row.name);
        if (t) Object.assign(t, row);
      }
      c.league.sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga));
    }
    return c;
  }
}

function reasonFor(standing, outcome) {
  if (outcome === 'start') {
    return standing > 0.72 ? 'Undroppable' : standing > 0.5 ? 'In the starting XI' : 'Handed a start';
  }
  if (outcome === 'bench') {
    return standing > 0.45 ? 'Rotated to the bench' : 'On the bench';
  }
  return standing < 0.2 ? 'Out of the picture' : 'Not in the squad';
}

function emptySeasonStats() {
  return {
    apps: 0, started: 0, minutes: 0, goals: 0, assists: 0,
    passes: 0, passesCompleted: 0, shots: 0, tacklesWon: 0,
    interceptions: 0, keyPasses: 0, saves: 0, distance: 0,
    ratingSum: 0, motm: 0, cleanSheet: 0,
  };
}

function poisson(lambda, rng) {
  const L = Math.exp(-lambda);
  let k = 0; let p = 1;
  do { k++; p *= rng(); } while (p > L && k < 12);
  return k - 1;
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
