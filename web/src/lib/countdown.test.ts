import { describe, it, expect, vi } from 'vitest';
import { createCountdown } from './countdown';

describe('createCountdown', () => {
  it('conta até 0 e dispara onElapsed uma única vez', () => {
    const cb = vi.fn();
    const c = createCountdown(3, cb);
    expect(c.secondsLeft).toBe(3);
    c.tick();
    expect(c.secondsLeft).toBe(2);
    c.tick();
    c.tick();
    expect(c.secondsLeft).toBe(0);
    expect(cb).toHaveBeenCalledTimes(1);
    c.tick();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('cancel impede o onElapsed', () => {
    const cb = vi.fn();
    const c = createCountdown(2, cb);
    c.tick();
    c.cancel();
    c.tick();
    expect(cb).not.toHaveBeenCalled();
  });
});
