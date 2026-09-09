import { CLASSIC_RULES, awardPoint, initialScore, landingWinner } from './Scoring';
import type { Side, MatchRules } from './Scoring';
import type { ShuttlecockPhysics } from '../shuttle/ShuttlecockPhysics';
import { validServiceLanding } from './ServeSystem';
export class MatchManager {
  constructor(readonly rules: MatchRules = CLASSIC_RULES) {}
  score = initialScore(); hits = 0; rallyTime = 0; serveEven = true; rallyServer: Side = 0;
  start() { this.hits = 0; this.rallyTime = 0; this.serveEven = this.score.points[this.score.server] % 2 === 0; this.rallyServer = this.score.server; }
  land(shuttle: ShuttlecockPhysics, serviceRules = true): { winner: Side; reason: string } {
    let winner = landingWinner(shuttle.position.x, shuttle.position.z, shuttle.lastHit, shuttle.crossedNet);
    let reason = Math.abs(shuttle.position.x) > 2.61 || Math.abs(shuttle.position.z) > 6.72 ? 'Out' : !shuttle.crossedNet ? 'Fault' : 'In';
    if (serviceRules && this.hits === 1 && !validServiceLanding(shuttle.position.x, shuttle.position.z, this.rallyServer, this.serveEven)) { winner = (1 - this.rallyServer) as Side; reason = 'Service fault'; }
    return { winner, reason };
  }
  point(side: Side) { this.score = awardPoint(this.score, side, this.rules); }
}
