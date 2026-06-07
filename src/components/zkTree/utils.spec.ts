import { describe, expect, it } from 'vitest';
import { filterZkListNodes, normalizeCreateNodePath } from './utils';

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

describe('filterZkListNodes', () => {
  const nodes = [
    { name: 'Alpha', path: '/parent/Alpha', hasChildren: true },
    { name: 'beta', path: '/parent/beta', hasChildren: true },
    { name: '  TrimmedNode  ', path: '/parent/trimmed', hasChildren: true },
    { name: 'child', path: '/parent/path-only-match', hasChildren: true },
  ];

  it('returns every node for an empty query', () => {
    expect(filterZkListNodes(nodes, '')).toBe(nodes);
    expect(filterZkListNodes(nodes, '   ')).toBe(nodes);
  });

  it('matches node names case-insensitively', () => {
    expect(filterZkListNodes(nodes, 'ALP')).toEqual([nodes[0]]);
    expect(filterZkListNodes(nodes, 'TA')).toEqual([nodes[1]]);
  });

  it('trims node names before matching', () => {
    expect(filterZkListNodes(nodes, 'trimmednode')).toEqual([nodes[2]]);
  });

  it('does not match against the full path', () => {
    expect(filterZkListNodes(nodes, 'path-only-match')).toEqual([]);
  });
});
