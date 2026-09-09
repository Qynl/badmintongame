import { useGameStore } from '../../state/gameStore';
const replies: Record<string, string> = { Block: 'Blocked. Move in for the next touch.', Lift: 'Lifted. A chance to attack again.', Smash: 'Attack incoming. Get your racket ready.', Drop: 'Short reply. Move forward.', Clear: 'Deep reply. Get behind it.' };
export function RallyRead() {
  const format = useGameStore(s => s.matchFormat), score = useGameStore(s => s.score), games = useGameStore(s => s.games);
  const pulse = useGameStore(s => s.replyPulse), shot = useGameStore(s => s.opponentShot), active = useGameStore(s => s.rallyActive);
  const guides = useGameStore(s => s.settings.guides), mode = useGameStore(s => s.mode);
  if (mode !== 'match') return null;
  const target = format === 'duel' ? 7 : 21, cap = format === 'duel' ? 11 : 30;
  const point = score.findIndex((p, i) => (p >= target - 1 && p >= score[1 - i] + 1) || p === cap - 1);
  const matchPoint = point >= 0 && (format === 'duel' || games[point] === 1);
  return <div className="rally-read">
    <span className={point >= 0 ? 'point-pressure' : ''}>{score[0] === cap - 1 && score[1] === cap - 1 ? 'DECIDING POINT · NEXT POINT WINS' : point >= 0 ? `${point === 0 ? 'YOUR' : 'OPPONENT’S'} ${matchPoint ? 'MATCH' : 'GAME'} POINT` : score[0] >= target - 1 && score[0] === score[1] ? 'DEUCE · WIN BY TWO' : format === 'duel' ? 'QUICK DUEL · FIRST TO 7' : 'CLUB MATCH · FIRST TO 21'}</span>
    {guides && active && pulse > 0 && <strong key={shot}>{replies[shot] || `${shot}. Read the space.`}</strong>}
  </div>;
}
