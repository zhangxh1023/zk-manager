use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ZkStat {
  pub(crate) czxid: i64,
  pub(crate) mzxid: i64,
  pub(crate) pzxid: i64,
  pub(crate) ctime: i64,
  pub(crate) mtime: i64,
  pub(crate) version: i32,
  pub(crate) cversion: i32,
  pub(crate) aversion: i32,
  pub(crate) ephemeral_owner: i64,
  pub(crate) data_length: i32,
  pub(crate) num_children: i32,
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct ZkAclEntry {
  pub(crate) scheme: String,
  pub(crate) id: String,
  pub(crate) permission: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ZnodeDetails {
  pub(crate) data: Vec<u8>,
  pub(crate) stat: ZkStat,
  pub(crate) acl: Vec<ZkAclEntry>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ZnodeSearchResult {
  pub(crate) name: String,
  pub(crate) path: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WatchEvent {
  pub(crate) connection_uuid: String,
  pub(crate) path: String,
  pub(crate) event_type: String,
  pub(crate) data: Option<Vec<u8>>,
  pub(crate) stat: Option<ZkStat>,
  pub(crate) acl: Option<Vec<ZkAclEntry>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConnectZkRequest {
  pub(crate) connection_uuid: String,
  pub(crate) server: String,
  pub(crate) username: Option<String>,
  pub(crate) password: Option<String>,
  pub(crate) use_ssh: bool,
  pub(crate) ssh_host: Option<String>,
  pub(crate) ssh_port: Option<u16>,
  pub(crate) ssh_username: Option<String>,
  pub(crate) ssh_auth_method: Option<String>,
  pub(crate) ssh_password: Option<String>,
  pub(crate) ssh_key_path: Option<String>,
  #[serde(default)]
  pub(crate) trust_unknown_ssh_host_key: bool,
}

impl From<zookeeper_client::Stat> for ZkStat {
  fn from(stat: zookeeper_client::Stat) -> Self {
    ZkStat {
      czxid: stat.czxid,
      mzxid: stat.mzxid,
      pzxid: stat.pzxid,
      ctime: stat.ctime,
      mtime: stat.mtime,
      version: stat.version,
      cversion: stat.cversion,
      aversion: stat.aversion,
      ephemeral_owner: stat.ephemeral_owner,
      data_length: stat.data_length,
      num_children: stat.num_children,
    }
  }
}

impl From<zookeeper_client::Acl> for ZkAclEntry {
  fn from(acl: zookeeper_client::Acl) -> Self {
    ZkAclEntry {
      scheme: acl.auth_id().scheme().to_string(),
      id: acl.auth_id().id().to_string(),
      permission: acl.permission().to_string(),
    }
  }
}
