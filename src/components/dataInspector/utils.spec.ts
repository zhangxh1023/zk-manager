import { describe, expect, it } from 'vitest';
import {
  buildChildPath,
  formatTimelineDataPreview,
  getNodeName,
  getTimelineListPreview,
  MAX_TIMELINE_DATA_PREVIEW_CHARS,
} from './utils';

describe('DataInspector utilities', () => {
  it('builds child paths from root and nested parents', () => {
    expect(buildChildPath('/', 'child')).toBe('/child');
    expect(buildChildPath('/parent', 'child')).toBe('/parent/child');
    expect(buildChildPath('/parent', '/child/grandchild/')).toBe('/parent/child/grandchild');
  });

  it('returns an empty path for blank child names', () => {
    expect(buildChildPath('/parent', '   ')).toBe('');
    expect(buildChildPath('/parent', '///')).toBe('');
  });

  it('extracts node names from paths', () => {
    expect(getNodeName('/')).toBe('/');
    expect(getNodeName('/parent/child')).toBe('child');
  });

  it('truncates long timeline data previews', () => {
    const text = 'a'.repeat(MAX_TIMELINE_DATA_PREVIEW_CHARS + 1);
    const bytes = Array.from(new TextEncoder().encode(text));

    const preview = formatTimelineDataPreview(bytes, 'No data');

    expect(preview.truncated).toBe(true);
    expect(preview.text).toHaveLength(MAX_TIMELINE_DATA_PREVIEW_CHARS);
  });

  it('formats timeline list previews as a single line', () => {
    const preview = getTimelineListPreview({
      dataPreview: 'hello\nzk',
      dataTruncated: false,
    }, 'Empty');

    expect(preview).toBe('hello zk');
  });
});
