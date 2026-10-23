/**
 * Non-reactive animation clock for 60 FPS R3F render loop.
 * Kept completely outside React state and Zustand store to eliminate 60 FPS React re-renders.
 */

export interface AnimClock {
  time: number;
  animating: boolean;
  visualFreq: number;
}

export const animClock: AnimClock = {
  time: 0,
  animating: true,
  visualFreq: 1.0,
};

// Listeners for throttled UI updates (e.g., at most 4 Hz if needed)
type ClockListener = (time: number) => void;
const listeners = new Set<ClockListener>();

export function subscribeAnimClock(listener: ClockListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let lastThrottledDispatch = 0;
export function notifyThrottledClock(now: number, time: number) {
  if (now - lastThrottledDispatch > 250) {
    lastThrottledDispatch = now;
    for (const fn of listeners) {
      fn(time);
    }
  }
}
