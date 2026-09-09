import { PITCH } from './constants.js';
import { dist, clamp } from './math.js';
import { attackDir, goalX, threatValue } from './analysis.js';

// ---------------------------------------------------------------------------
// CONTEXTUAL COMMENTARY
//
// Not a random line generator: lines are selected from the actual match state
// (score, time, momentum, who is on the ball, how good the chance was).
// ---------------------------------------------------------------------------

const LINES = {
  kickoff: ['And we are underway here.', 'The referee blows his whistle, we\'re off.', 'Kick-off, and the crowd is up for this one.'],
  goal: [
    'GOAL! What a finish from {player}!',
    '{player} buries it! {home} {hs}-{as} {away}.',
    'It\'s in! {player} makes no mistake.',
    'Superb strike from {player} — the keeper had no chance!',
  ],
  goalLate: ['{player} has scored a huge goal here, and there\'s barely any time left!'],
  goalEqualiser: ['{player} equalises! Game on!'],
  goalLead: ['{player} puts them in front!'],
  ownGoal: ['Oh no — that\'s an own goal by {player}.'],
  save: ['Great save!', 'The keeper gets a strong hand to it.', 'Superb reflexes to keep that out.'],
  bigSave: ['WHAT A SAVE! Somehow he\'s kept that out.'],
  miss: ['Wide! He should have scored there.', 'Over the bar — a big chance goes begging.', 'That has to hit the target.'],
  post: ['Off the woodwork! Inches away.', 'The post saves them!'],
  corner: ['Corner kick.', 'It\'s gone behind for a corner.'],
  offside: ['The flag is up — {player} was offside.', 'Offside. The run was mistimed.'],
  yellowCard: ['{player} goes into the book.', 'Yellow card for {player}.'],
  redCard: ['{player} is off! That\'s a red card.', 'He\'s seen red — down to ten men.'],
  injury: ['{player} is down and needs treatment.', 'That looks like a problem for {player}.'],
  substitution: ['{on} replaces {off}.', 'A change: {off} makes way for {on}.'],
  penalty: ['PENALTY! The referee points to the spot!'],
  penaltyTaken: ['{player} steps up...'],
  advantage: ['The referee plays the advantage.'],
  freeKickShot: ['{player} will have a go from here...'],
  halfTime: ['That\'s the half-time whistle.', 'Half time. {home} {hs}-{as} {away}.'],
  fullTime: ['Full time! It finishes {home} {hs}-{as} {away}.'],
  chance: ['A big chance here!', 'This is a good opportunity...', 'They\'re in behind!'],
  buildUp: ['Patient build-up from {team}.', '{team} keeping the ball nicely.'],
  press: ['{team} are pressing high here.', 'Real intensity from {team} out of possession.'],
  counter: ['They break at pace!', 'This is a dangerous counter-attack!'],
  pressure: ['{team} are camped in the opposition half.'],
  keeperOut: ['The keeper comes racing out!'],
  tackle: ['Great challenge!', 'Superb defending.'],
  cross: ['The cross comes in...'],
  wide: ['They switch it to the other flank.'],
  momentum: ['{team} really are on top at the moment.'],
  timeRunningOut: ['Time is running out for {team}.'],
  playerRating: ['{player} has been excellent today.'],
};

export class Commentary {
  constructor(match) {
    this.m = match;
    this.queue = [];
    this.current = null;
    this.cooldown = 0;
    this.lastType = null;
    this.lastAmbient = 0;
    this.crowdIntensity = 0.3;
    this.history = [];
  }

  say(type, data = {}, priority = 1) {
    const m = this.m;
    let pool = LINES[type];
    // Contextual variants for goals.
    if (type === 'goal') {
      const t = data.team;
      const diff = m.score[t] - m.score[1 - t];
      const minute = m.matchMinute();
      if (data.ownGoal) pool = LINES.ownGoal;
      else if (minute > 82) pool = LINES.goalLate.concat(LINES.goal);
      else if (diff === 0) pool = LINES.goalEqualiser.concat(LINES.goal);
      else if (diff === 1) pool = LINES.goalLead.concat(LINES.goal);
    }
    if (!pool || !pool.length) return;
    const line = pool[Math.floor(m.rng() * pool.length)];
    const text = this.interpolate(line, data);
    this.queue.push({ text, type, priority, t: m.matchSeconds });
    if (this.queue.length > 4) this.queue.shift();
    // Crowd reaction.
    if (type === 'goal') this.crowdIntensity = 1;
    else if (type === 'save' || type === 'penalty' || type === 'redCard') this.crowdIntensity = Math.max(this.crowdIntensity, 0.85);
    else if (type === 'chance' || type === 'corner') this.crowdIntensity = Math.max(this.crowdIntensity, 0.62);
  }

  interpolate(line, data) {
    const m = this.m;
    return line
      .replace('{player}', data.player?.name ?? data.scorer?.name ?? 'the striker')
      .replace('{scorer}', data.scorer?.name ?? '')
      .replace('{on}', data.on?.name ?? '')
      .replace('{off}', data.off?.name ?? '')
      .replace('{team}', data.team !== undefined ? m.teams[data.team].name : (data.teamName ?? ''))
      .replace('{home}', m.teams[0].shortName)
      .replace('{away}', m.teams[1].shortName)
      .replace('{hs}', String(m.score[0]))
      .replace('{as}', String(m.score[1]));
  }

  update(dt) {
    const m = this.m;
    this.cooldown -= dt;
    // Crowd noise decays toward a baseline driven by where the ball is.
    const dangerHome = threatValue(m.ball.x, m.ball.z, 0);
    const dangerAway = threatValue(m.ball.x, m.ball.z, 1);
    const baseline = 0.25 + Math.max(dangerHome, dangerAway) * 0.5;
    this.crowdIntensity += (baseline - this.crowdIntensity) * dt * 0.7;
    this.crowdIntensity = clamp(this.crowdIntensity, 0.15, 1);

    if (this.queue.length && this.cooldown <= 0) {
      this.current = this.queue.shift();
      this.history.unshift(this.current);
      if (this.history.length > 30) this.history.pop();
      this.cooldown = 2.6;
      m.events.emit('commentary', this.current);
    }

    // Ambient contextual lines.
    this.lastAmbient -= dt;
    if (this.lastAmbient <= 0 && this.cooldown <= 0 && !this.queue.length) {
      this.lastAmbient = 9 + m.rng() * 12;
      this.ambient();
    }
  }

  ambient() {
    const m = this.m;
    const poss = m.possessionTeam;
    if (poss === -1) return;
    const tb = m.teams[poss].brain;
    const r = m.rng();
    if (Math.abs(m.momentum) > 0.4 && r < 0.3) {
      this.say('momentum', { team: m.momentum > 0 ? 0 : 1 });
    } else if (tb.phase === 'counter' && r < 0.5) {
      this.say('counter', { team: poss });
    } else if (tb.phase === 'press' && r < 0.4) {
      this.say('press', { team: poss });
    } else if (tb.phase === 'build' && r < 0.4) {
      this.say('buildUp', { team: poss });
    } else if (m.matchMinute() > 80 && r < 0.4) {
      const losing = m.score[0] < m.score[1] ? 0 : m.score[1] < m.score[0] ? 1 : -1;
      if (losing !== -1) this.say('timeRunningOut', { team: losing });
    }
  }
}
