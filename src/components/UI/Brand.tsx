export function ShuttleIcon({ size = 30, className = '' }: { size?: number; className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 40 40" fill="none" className={className} aria-hidden="true"><path d="m9 7 17 7 7 17M9 7l11 21M9 7l21 11M17 5l13 13M5 17l15 13M20 28l10-10M14 31l9-9" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"/><path d="m14 28-4 4a5 5 0 0 0 7 7l4-4" fill="currentColor" transform="translate(0 -3)"/></svg>;
}
export function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? 'compact' : ''}`}><ShuttleIcon size={36}/><div className="brand-word">feather<span>BADMINTON, REIMAGINED.</span></div></div>;
}
