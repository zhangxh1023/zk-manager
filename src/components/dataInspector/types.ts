import type { SerializationFormat } from '../../utils/serializer';
import type { ZkAclEntry, ZkStat } from '../../types/znodeDetails';

export interface FormatOption {
  value: SerializationFormat;
  label: string;
}

export type StatRow = [string, string];

export interface WatchEventPayload {
  connectionUuid: string;
  path: string;
  eventType: string;
  data: number[] | null;
  stat: ZkStat | null;
  acl: ZkAclEntry[] | null;
}

export type WatchTimelineEntryKind = 'initial' | 'changed' | 'deleted';

export interface WatchTimelineEntry {
  id: number;
  observedAt: number;
  kind: WatchTimelineEntryKind;
  eventType: string;
  path: string;
  dataLength: number | null;
  dataPreview: string;
  dataTruncated: boolean;
  stat: ZkStat | null;
  acl: ZkAclEntry[];
}
