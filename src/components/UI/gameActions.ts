import { useGameStore } from '../../state/gameStore';
import type { Mode } from '../../state/gameStore';
import { audio } from '../../game/audio/AudioManager';
export function focusGame() {
  const canvas = document.querySelector('canvas');
  if (canvas?.requestPointerLock) {
    try { const result = canvas.requestPointerLock(); if (result) result.catch(() => { /* The focus overlay provides a user-gesture retry. */ }); } catch { /* Browsers may require another click. */ }
  }
  void audio.unlock().catch(() => {});
}
export function startGame(mode: Mode) { useGameStore.getState().start(mode); focusGame(); }
export function resumeGame() { useGameStore.getState().resume(); focusGame(); }
export function leaveGame() { useGameStore.getState().home(); if (document.pointerLockElement) document.exitPointerLock(); audio.suspend(); }
