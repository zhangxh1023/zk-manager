use std::sync::{Arc, Mutex};
use zookeeper_client::{Client, Acl, Permission, AuthId, CreateMode, Acls};
use serde::{Deserialize, Serialize};
mod migrations;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ZkStat {
    czxid: i64,
    mzxid: i64,
    pzxid: i64,
    ctime: i64,
    mtime: i64,
    version: i32,
    cversion: i32,
    aversion: i32,
    ephemeralOwner: i64,
    dataLength: i32,
    numChildren: i32,
}

#[derive(Serialize, Deserialize)]
struct ZkAclEntry {
    scheme: String,
    id: String,
    permission: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ZnodeDetails {
    data: Vec<u8>,
    stat: ZkStat,
    acl: Vec<ZkAclEntry>,
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
            ephemeralOwner: stat.ephemeral_owner,
            dataLength: stat.data_length,
            numChildren: stat.num_children,
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

struct ZkClient {
  client: Mutex<Option<Arc<Client>>>,
}

#[tauri::command]
async fn connect_zk(state: tauri::State<'_, ZkClient>, server: String) -> Result<String, String> {
  println!("尝试连接 ZK: {}", server);
  let client = zookeeper_client::Client::connect(&server).await.unwrap();
  let mut client_lock = state.client.lock().unwrap();
  *client_lock = Some(Arc::new(client));
  println!("连接成功");
  Ok("SUCCESS".to_string())
}

#[tauri::command]
async fn list_children(
  state: tauri::State<'_, ZkClient>,
  path: String,
) -> Result<Vec<String>, String> {
  println!("获取 path: {}", path);
  // 1. 在最小作用域内获取 Arc<Client>
  let client_arc = {
    let guard = state.client.lock().map_err(|_| "Mutex poisoned")?;
    // 使用 .clone() 增加引用计数，这样即使锁释放了，Client 依然可用
    guard
      .as_ref()
      .cloned()
      .ok_or("Client not initialized! Please init first.")?
  };
  let (children, _) = client_arc.get_children(&path).await.unwrap();
  Ok(children)
}

#[tauri::command]
async fn get_data(state: tauri::State<'_, ZkClient>, path: String) -> Result<Vec<u8>, String> {
  println!("获取 path data: {}", path);
  // 1. 在最小作用域内获取 Arc<Client>
  let client_arc = {
    let guard = state.client.lock().map_err(|_| "Mutex poisoned")?;
    // 使用 .clone() 增加引用计数，这样即使锁释放了，Client 依然可用
    guard
      .as_ref()
      .cloned()
      .ok_or("Client not initialized! Please init first.")?
  };
  let (data, stat) = client_arc.get_data(&path).await.unwrap();
  println!("--- 节点元数据 ---");
  println!("创建时间 (czxid): {}", stat.czxid);
  println!("修改时间 (mzxid): {}", stat.mzxid);
  println!("数据版本 (version): {}", stat.version);
  println!("子节点版本 (cversion): {}", stat.cversion);
  println!("数据长度: {} bytes", stat.data_length);
  println!("子节点数量: {}", stat.num_children);
  Ok(data)
}

#[tauri::command]
async fn get_acl(state: tauri::State<'_, ZkClient>, path: String) -> Result<Vec<ZkAclEntry>, String> {
  println!("获取 path data: {}", path);
  // 1. 在最小作用域内获取 Arc<Client>
  let client_arc = {
    let guard = state.client.lock().map_err(|_| "Mutex poisoned")?;
    // 使用 .clone() 增加引用计数，这样即使锁释放了，Client 依然可用
    guard
      .as_ref()
      .cloned()
      .ok_or("Client not initialized! Please init first.")?
  };
  let (acl, stat) = client_arc.get_acl(&path).await.unwrap();
  println!("--- 节点元数据 ---");
  println!("创建时间 (czxid): {}", stat.czxid);
  println!("修改时间 (mzxid): {}", stat.mzxid);
  println!("数据版本 (version): {}", stat.version);
  println!("子节点版本 (cversion): {}", stat.cversion);
  println!("数据长度: {} bytes", stat.data_length);
  println!("子节点数量: {}", stat.num_children);

  let converted: Vec<ZkAclEntry> = acl.into_iter().map(|a| a.into()).collect();
  Ok(converted)
}

#[tauri::command]
async fn get_znode_details(state: tauri::State<'_, ZkClient>, path: String) -> Result<ZnodeDetails, String> {
  println!("获取 znode details: {}", path);
  let client_arc = {
    let guard = state.client.lock().map_err(|_| "Mutex poisoned")?;
    guard
      .as_ref()
      .cloned()
      .ok_or("Client not initialized! Please init first.")?
  };
  let (data, stat) = client_arc.get_data(&path).await.unwrap();
  let (acl, _) = client_arc.get_acl(&path).await.unwrap();

  let details = ZnodeDetails {
    data,
    stat: stat.into(),
    acl: acl.into_iter().map(|a| a.into()).collect(),
  };
  Ok(details)
}

#[tauri::command]
async fn set_data(state: tauri::State<'_, ZkClient>, path: String, data: Vec<u8>) -> Result<ZnodeDetails, String> {
  println!("设置节点数据: {}, 数据长度: {}", path, data.len());
  let client_arc = {
    let guard = state.client.lock().map_err(|_| "Mutex poisoned")?;
    guard
      .as_ref()
      .cloned()
      .ok_or("Client not initialized! Please init first.")?
  };
  // 使用版本 -1 忽略版本检查
  let stat = client_arc.set_data(&path, data.as_slice(), Some(-1)).await.unwrap();
  // 获取更新后的数据和 ACL
  let (new_data, _) = client_arc.get_data(&path).await.unwrap();
  let (acl, _) = client_arc.get_acl(&path).await.unwrap();

  let details = ZnodeDetails {
    data: new_data,
    stat: stat.into(),
    acl: acl.into_iter().map(|a| a.into()).collect(),
  };
  Ok(details)
}

#[tauri::command]
async fn delete_node(state: tauri::State<'_, ZkClient>, path: String) -> Result<String, String> {
  println!("删除节点: {}", path);
  let client_arc = {
    let guard = state.client.lock().map_err(|_| "Mutex poisoned")?;
    guard
      .as_ref()
      .cloned()
      .ok_or("Client not initialized! Please init first.")?
  };
  // 使用版本 -1 忽略版本检查
  client_arc.delete(&path, Some(-1)).await.unwrap();
  Ok("SUCCESS".to_string())
}

#[tauri::command]
async fn create_node(state: tauri::State<'_, ZkClient>, path: String, data: Vec<u8>) -> Result<String, String> {
  println!("创建节点: {}", path);
  let client_arc = {
    let guard = state.client.lock().map_err(|_| "Mutex poisoned")?;
    guard
      .as_ref()
      .cloned()
      .ok_or("Client not initialized! Please init first.")?
  };
  // 使用持久节点创建，开放所有权限
  let options = CreateMode::Persistent.with_acls(Acls::anyone_all());
  println!("调用 create: path={}, data_len={}", path, data.len());
  match client_arc.create(&path, data.as_slice(), &options).await {
    Ok(_) => {
      println!("节点创建成功: {}", path);
      Ok("SUCCESS".to_string())
    }
    Err(e) => {
      println!("创建节点失败: {:?}", e);
      Err(format!("创建节点失败: {:?}", e))
    }
  }
}

#[tauri::command]
async fn set_acl(state: tauri::State<'_, ZkClient>, path: String, acl_entries: Vec<ZkAclEntry>) -> Result<String, String> {
  println!("设置节点 ACL: {}", path);
  let client_arc = {
    let guard = state.client.lock().map_err(|_| "Mutex poisoned")?;
    guard
      .as_ref()
      .cloned()
      .ok_or("Client not initialized! Please init first.")?
  };
  // 转换 ZkAclEntry 到 Acl
  let acls: Result<Vec<Acl>, String> = acl_entries.into_iter().map(|entry| {
    let scheme = entry.scheme;
    let id = entry.id;
    let auth_id = AuthId::new(&scheme, &id);
    // 解析权限字符串，例如 "READ|WRITE|DELETE" 或 "ALL"
    let perm_str = entry.permission;
    let permission = parse_permissions(&perm_str)?;
    Ok(Acl::new(permission, auth_id))
  }).collect();
  let acls = acls?;
  // 使用版本 -1 忽略版本检查
  let _stat = client_arc.set_acl(&path, &acls, Some(-1)).await.unwrap();
  Ok("SUCCESS".to_string())
}

fn parse_permissions(perm_str: &str) -> Result<Permission, String> {
  if perm_str == "ALL" {
    return Ok(Permission::ALL);
  }
  let mut permission = Permission::READ;
  for part in perm_str.split('|') {
    match part.trim().to_uppercase().as_str() {
      "READ" => permission = permission | Permission::READ,
      "WRITE" => permission = permission | Permission::WRITE,
      "CREATE" => permission = permission | Permission::CREATE,
      "DELETE" => permission = permission | Permission::DELETE,
      "ADMIN" => permission = permission | Permission::ADMIN,
      "" => {},
      _ => return Err(format!("未知权限: {}", part)),
    }
  }
  Ok(permission)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .plugin(
      tauri_plugin_sql::Builder::default()
        .add_migrations("sqlite:zk-manager-dev.db", migrations::get_migrations())
        .build(),
    )
    .manage(ZkClient {
      client: Mutex::new(None),
    })
    .invoke_handler(tauri::generate_handler![
      connect_zk,
      list_children,
      get_data,
      get_acl,
      get_znode_details,
      set_data,
      delete_node,
      create_node,
      set_acl
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
