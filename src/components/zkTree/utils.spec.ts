import { describe, expect, it } from 'vitest';
import { normalizeCreateNodePath } from './utils';

describe('normalizeCreateNodePath', () => {
  it.each([
    ['foo/bar', '/foo/bar'],
    ['/foo/bar/', '/foo/bar'],
    ['//foo//bar', '/foo/bar'],
    ['  /foo/bar  ', '/foo/bar'],
    ['', ''],
    ['/', ''],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeCreateNodePath(input)).toBe(expected);
  });
});
