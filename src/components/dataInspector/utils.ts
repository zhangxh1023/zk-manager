import { formatDateTime24 } from '../../lib/utils';
import { formatBytes, type SerializationFormat } from '../../utils/serializer';
import type { ZkStat } from '../../types/znodeDetails';
import type {
  FormatOption,
  StatRow,
  WatchTimelineEntry,
  WatchTimelineEntryKind,
} from './types';

export const FORMAT_OPTIONS: FormatOption[] = [
  { value: 'text', label: 'Text' },
  { value: 'json', label: 'JSON' },
  { value: 'xml', label: 'XML' },
  { value: 'hex', label: 'Hex' },
  { value: 'binary', label: 'Binary' },
];

export const MAX_TIMELINE_ENTRIES = 200;
export const MAX_TIMELINE_DATA_PREVIEW_CHARS = 4000;
export const MAX_TIMELINE_LIST_PREVIEW_CHARS = 90;

export const formatTimestamp = (value: number) => {
  if (!value) return '-';
  return formatDateTime24(value);
};

export const getStatRows = (stat: ZkStat | null): StatRow[] => {
  if (!stat) return [];
  return [
    ['czxid', String(stat.czxid)],
    ['mzxid', String(stat.mzxid)],
    ['pzxid', String(stat.pzxid)],
    ['ctime', formatTimestamp(stat.ctime)],
    ['mtime', formatTimestamp(stat.mtime)],
    ['version', String(stat.version)],
    ['cversion', String(stat.cversion)],
    ['aversion', String(stat.aversion)],
    ['ephemeralOwner', String(stat.ephemeralOwner)],
    ['dataLength', String(stat.dataLength)],
    ['numChildren', String(stat.numChildren)],
  ];
};

export const buildChildPath = (parentPath: string, childName: string) => {
  const relativePath = childName.trim().split('/').filter(Boolean).join('/');
  if (!relativePath) return '';
  return parentPath === '/' ? `/${relativePath}` : `${parentPath}/${relativePath}`;
};

export const getNodeName = (path: string) => {
  if (path === '/') return '/';
  const parts = path.split('/');
  return parts[parts.length - 1];
};

export const formatTimelineDataPreview = (
  data: number[] | null,
  noDataText: string,
  format: SerializationFormat = 'text',
) => {
  if (data === null) {
    return {
      text: noDataText,
      truncated: false,
    };
  }

  const result = formatBytes(data, format);
  const text = result.success && result.data !== undefined ? result.data : '';
  if (text.length > MAX_TIMELINE_DATA_PREVIEW_CHARS) {
    return {
      text: text.slice(0, MAX_TIMELINE_DATA_PREVIEW_CHARS),
      truncated: true,
    };
  }
  return {
    text,
    truncated: false,
  };
};

export const getTimelineListPreview = (
  entry: Pick<WatchTimelineEntry, 'dataPreview' | 'dataTruncated'>,
  emptyValueText: string,
) => {
  const fallbackText = entry.dataPreview || emptyValueText;
  const singleLineText = fallbackText.replace(/\s+/g, ' ').trim() || fallbackText;
  const shouldEllipsize = entry.dataTruncated
    || singleLineText.length > MAX_TIMELINE_LIST_PREVIEW_CHARS;

  if (!shouldEllipsize) {
    return singleLineText;
  }

  return `${singleLineText.slice(0, MAX_TIMELINE_LIST_PREVIEW_CHARS).trimEnd()}...`;
};

export const getTimelineKindClass = (kind: WatchTimelineEntryKind) => {
  if (kind === 'deleted') {
    return 'bg-destructive/10 text-destructive border-destructive/20';
  }
  if (kind === 'initial') {
    return 'bg-muted text-muted-foreground border-border';
  }
  return 'bg-green-500/10 text-green-600 border-green-500/20 dark:text-green-400';
};
