import { describe, it, expect } from 'vitest';
import { isWithinRoots } from './fs';

describe('isWithinRoots', () => {
  it('aceita caminho dentro da raiz', () => {
    expect(isWithinRoots('/home/u/curso', ['/home/u'])).toBe(true);
    expect(isWithinRoots('/home/u', ['/home/u'])).toBe(true);
  });
  it('rejeita fora da raiz e traversal', () => {
    expect(isWithinRoots('/etc/passwd', ['/home/u'])).toBe(false);
    expect(isWithinRoots('/home/u/../../etc', ['/home/u'])).toBe(false);
  });
});
