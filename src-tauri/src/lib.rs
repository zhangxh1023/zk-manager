use std::sync::{Arc, Mutex};
use zookeeper_client::{Client, Acl, Permission, AuthId, CreateMode, Acls};
use serde::{Deserialize, Serialize};
mod migrations;
mod ssh_tunnel;

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
  ssh_tunnel: Mutex<Option<ssh_tunnel::SshTunnel>>,
}

#[tauri::command]
async fn connect_zk(
  state: tauri::State<'_, ZkClient>,
  server: String,
  username: Option<String>,
  password: Option<String>,
  use_ssh: bool,
  ssh_host: Option<String>,
  ssh_port: Option<u16>,
  ssh_username: Option<String>,
  ssh_auth_method: Option<String>,
  ssh_password: Option<String>,
  ssh_key_path: Option<String>,
) -> Result<String, String> {
  println!("尝试连接 ZK: {}", server);

  // 解析 ZooKeeper 服务器地址
  let (zk_server_host, zk_server_port) = parse_server(&server)?;

  // 如果使用 SSH 隧道，先创建隧道
  let actual_server = if use_ssh {
    let ssh_host = ssh_host.ok_or("SSH host is required when SSH tunnel is enabled")?;
    let ssh_port = ssh_port.unwrap_or(22);
    let ssh_username = ssh_username.ok_or("SSH username is required when SSH tunnel is enabled")?;

    let auth_method = if ssh_auth_method.as_deref() == Some("key") {
      ssh_tunnel::TunnelAuthMethod::Key {
        key_path: ssh_key_path.ok_or("SSH key path is required for key authentication")?,
      }
    } else {
      ssh_tunnel::TunnelAuthMethod::Password {
        password: ssh_password.ok_or("SSH password is required for password authentication")?,
      }
    };

    let tunnel_config = ssh_tunnel::TunnelConfig {
      ssh_host,
      ssh_port,
      ssh_username,
      ssh_auth_method: auth_method,
      target_host: zk_server_host,
      target_port: zk_server_port,
    };

    let tunnel = ssh_tunnel::create_tunnel(&tunnel_config).await?;

    println!("SSH 隧道已建立，本地端口: {}", tunnel.local_port);

    // 保存 SSH 隧道状态
    let mut ssh_tunnel_lock = state.ssh_tunnel.lock().unwrap();
    *ssh_tunnel_lock = Some(tunnel);

    format!("localhost:{}", ssh_tunnel_lock.as_ref().unwrap().local_port)
  } else {
    server.clone()
  };

  println!("正在连接到 ZooKeeper: {}", actual_server);
  let client = zookeeper_client::Client::connect(&actual_server).await.map_err(|e| {
    println!("连接失败: {:?}", e);
    // 打印更详细的错误信息
    format!("连接失败: {:?}", e)
  })?;
  println!("ZooKeeper 客户端已创建");

  // 如果提供了认证信息，进行认证
  if let (Some(u), Some(p)) = (username, password) {
    println!("进行认证: {}", u);
    let auth_data = format!("{}:{}", u, p);
    match client.auth("digest", auth_data.as_bytes()).await {
      Ok(_) => println!("认证成功"),
      Err(e) => println!("认证失败: {:?}", e),
    }
  } else {
    println!("未提供认证信息，使用匿名访问");
  }

  let mut client_lock = state.client.lock().unwrap();
  *client_lock = Some(Arc::new(client));

  println!("连接成功");
  Ok("SUCCESS".to_string())
}

fn parse_server(server: &str) -> Result<(String, u16), String> {
  let parts: Vec<&str> = server.split(':').collect();
  if parts.len() == 2 {
    let host = parts[0].to_string();
    let port: u16 = parts[1].parse().map_err(|_| "Invalid port number")?;
    Ok((host, port))
  } else {
    // 默认 ZooKeeper 端口
    Ok((server.to_string(), 2181))
  }
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
  let (children, _) = client_arc.get_children(&path).await.map_err(|e| e.to_string())?;
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
  let (data, stat) = client_arc.get_data(&path).await.map_err(|e| e.to_string())?;
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
  let (acl, stat) = client_arc.get_acl(&path).await.map_err(|e| e.to_string())?;
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
  let (data, stat) = client_arc.get_data(&path).await.map_err(|e| e.to_string())?;
  let (acl, _) = client_arc.get_acl(&path).await.map_err(|e| e.to_string())?;

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
  let stat = client_arc.set_data(&path, data.as_slice(), Some(-1)).await.map_err(|e| e.to_string())?;
  // 获取更新后的数据和 ACL
  let (new_data, _) = client_arc.get_data(&path).await.map_err(|e| e.to_string())?;
  let (acl, _) = client_arc.get_acl(&path).await.map_err(|e| e.to_string())?;

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
  match client_arc.delete(&path, Some(-1)).await {
    Ok(_) => Ok("SUCCESS".to_string()),
    Err(e) => {
      let err_str = format!("{:?}", e);
      if err_str.contains("NotEmpty") {
        Err("NOT_EMPTY: Cannot delete node with children. Please delete child nodes first.".to_string())
      } else {
        Err(format!("删除失败: {:?}", e))
      }
    }
  }
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
  // 使用持久节点创建，使用 world:anyone ACL
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
  let _stat = client_arc.set_acl(&path, &acls, Some(-1)).await.map_err(|e| e.to_string())?;
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
      ssh_tunnel: Mutex::new(None),
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
