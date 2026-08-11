export interface Countdown {
  readonly secondsLeft: number;
  tick(): void;
  cancel(): void;
}

export function createCountdown(seconds: number, onElapsed: () => void): Countdown {
  let left = seconds;
  let done = false;
  let cancelled = false;
  return {
    get secondsLeft() {
      return left;
    },
    tick() {
      if (done || cancelled) return;
      left = Math.max(0, left - 1);
      if (left === 0) {
        done = true;
        onElapsed();
      }
    },
    cancel() {
      cancelled = true;
    },
  };
}
