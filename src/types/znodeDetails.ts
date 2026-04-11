export interface ZkStat {
  czxid: number;
  mzxid: number;
  pzxid: number;
  ctime: number;
  mtime: number;
  version: number;
  cversion: number;
  aversion: number;
  ephemeralOwner: number;
  dataLength: number;
  numChildren: number;
}

export interface ZkAclEntry {
  scheme: string;
  id: string;
  permission: string;
}

export interface ZnodeDetails {
  data: number[];
  stat: ZkStat;
  acl: ZkAclEntry[];
}
