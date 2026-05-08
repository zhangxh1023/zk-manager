use std::sync::{Arc, Mutex};
use zookeeper_client::{Client, Acl, Permission, AuthId, CreateMode, Acls, EventType};
use serde::{Deserialize, Serialize};
use tauri::Emitter;
mod migrations;
mod ssh_tunnel;

#[derive(Serialize, Deserialize, Clone)]
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

#[derive(Serialize, Deserialize, Clone)]
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

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct WatchEvent {
    connection_uuid: String,
    path: String,
    event_type: String,
    data: Option<Vec<u8>>,
    stat: Option<ZkStat>,
    acl: Option<Vec<ZkAclEntry>>,
}

struct ZkClient {
  clients: Mutex<std::collections::HashMap<String, Arc<Client>>>,
  ssh_tunnels: Mutex<std::collections::HashMap<String, ssh_tunnel::SshTunnel>>,
  watchers: Arc<Mutex<std::collections::HashMap<String, tokio::task::AbortHandle>>>,
}

#[tauri::command]
async fn connect_zk(
  state: tauri::State<'_, ZkClient>,
  connection_uuid: String,
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
  println!("尝试连接 ZK: {} uuid: {}", server, connection_uuid);

  let (zk_server_host, zk_server_port) = parse_server(&server)?;

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

    let mut ssh_tunnels_lock = state.ssh_tunnels.lock().unwrap();
    let port = tunnel.local_port;
    ssh_tunnels_lock.insert(connection_uuid.clone(), tunnel);

    format!("localhost:{}", port)
  } else {
    server.clone()
  };

  println!("正在连接到 ZooKeeper: {}", actual_server);
  let client = zookeeper_client::Client::connect(&actual_server).await.map_err(|e| {
    println!("连接失败: {:?}", e);
    format!("连接失败: {:?}", e)
  })?;
  println!("ZooKeeper 客户端已创建");

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

  let mut clients_lock = state.clients.lock().unwrap();
  clients_lock.insert(connection_uuid, Arc::new(client));

  println!("连接成功");
  Ok("SUCCESS".to_string())
}

#[tauri::command]
async fn disconnect_zk(
  state: tauri::State<'_, ZkClient>,
  connection_uuid: String,
) -> Result<String, String> {
  println!("断开连接 ZK: {}", connection_uuid);

  // Abort all watchers for this connection
  {
    let mut watchers_lock = state.watchers.lock().map_err(|_| "Mutex poisoned")?;
    let prefix = format!("{}:", connection_uuid);
    let keys: Vec<String> = watchers_lock.keys().filter(|k| k.starts_with(&prefix)).cloned().collect();
    for key in keys {
      if let Some(handle) = watchers_lock.remove(&key) {
        handle.abort();
      }
    }
  }

  let mut clients_lock = state.clients.lock().map_err(|_| "Mutex poisoned")?;
  clients_lock.remove(&connection_uuid);

  let mut ssh_tunnels_lock = state.ssh_tunnels.lock().map_err(|_| "Mutex poisoned")?;
  ssh_tunnels_lock.remove(&connection_uuid);

  Ok("SUCCESS".to_string())
}

fn parse_server(server: &str) -> Result<(String, u16), String> {
  let parts: Vec<&str> = server.split(':').collect();
  if parts.len() == 2 {
    let host = parts[0].to_string();
    let port: u16 = parts[1].parse().map_err(|_| "Invalid port number")?;
    Ok((host, port))
  } else {
    Ok((server.to_string(), 2181))
  }
}

#[tauri::command]
async fn list_children(
  state: tauri::State<'_, ZkClient>,
  connection_uuid: String,
  path: String,
) -> Result<Vec<String>, String> {
  let client_arc = {
    let guard = state.clients.lock().map_err(|_| "Mutex poisoned")?;
    guard
      .get(&connection_uuid)
      .cloned()
      .ok_or("Client not initialized for this connection!")?
  };
  let (children, _) = client_arc.get_children(&path).await.map_err(|e| e.to_string())?;
  Ok(children)
}

#[tauri::command]
async fn get_data(
  state: tauri::State<'_, ZkClient>,
  connection_uuid: String,
  path: String
) -> Result<Vec<u8>, String> {
  let client_arc = {
    let guard = state.clients.lock().map_err(|_| "Mutex poisoned")?;
    guard
      .get(&connection_uuid)
      .cloned()
      .ok_or("Client not initialized for this connection!")?
  };
  let (data, _) = client_arc.get_data(&path).await.map_err(|e| e.to_string())?;
  Ok(data)
}

#[tauri::command]
async fn get_acl(
  state: tauri::State<'_, ZkClient>,
  connection_uuid: String,
  path: String
) -> Result<Vec<ZkAclEntry>, String> {
  let client_arc = {
    let guard = state.clients.lock().map_err(|_| "Mutex poisoned")?;
    guard
      .get(&connection_uuid)
      .cloned()
      .ok_or("Client not initialized for this connection!")?
  };
  let (acl, _) = client_arc.get_acl(&path).await.map_err(|e| e.to_string())?;

  let converted: Vec<ZkAclEntry> = acl.into_iter().map(|a| a.into()).collect();
  Ok(converted)
}

#[tauri::command]
async fn get_znode_details(
  state: tauri::State<'_, ZkClient>,
  connection_uuid: String,
  path: String
) -> Result<ZnodeDetails, String> {
  let client_arc = {
    let guard = state.clients.lock().map_err(|_| "Mutex poisoned")?;
    guard
      .get(&connection_uuid)
      .cloned()
      .ok_or("Client not initialized for this connection!")?
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
async fn set_data(
  state: tauri::State<'_, ZkClient>,
  connection_uuid: String,
  path: String,
  data: Vec<u8>
) -> Result<ZnodeDetails, String> {
  let client_arc = {
    let guard = state.clients.lock().map_err(|_| "Mutex poisoned")?;
    guard
      .get(&connection_uuid)
      .cloned()
      .ok_or("Client not initialized for this connection!")?
  };
  let stat = client_arc.set_data(&path, data.as_slice(), Some(-1)).await.map_err(|e| e.to_string())?;
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
async fn delete_node(
  state: tauri::State<'_, ZkClient>,
  connection_uuid: String,
  path: String
) -> Result<String, String> {
  let client_arc = {
    let guard = state.clients.lock().map_err(|_| "Mutex poisoned")?;
    guard
      .get(&connection_uuid)
      .cloned()
      .ok_or("Client not initialized for this connection!")?
  };
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
async fn create_node(
  state: tauri::State<'_, ZkClient>,
  connection_uuid: String,
  path: String,
  data: Vec<u8>
) -> Result<String, String> {
  let client_arc = {
    let guard = state.clients.lock().map_err(|_| "Mutex poisoned")?;
    guard
      .get(&connection_uuid)
      .cloned()
      .ok_or("Client not initialized for this connection!")?
  };
  let options = CreateMode::Persistent.with_acls(Acls::anyone_all());
  match client_arc.create(&path, data.as_slice(), &options).await {
    Ok(_) => Ok("SUCCESS".to_string()),
    Err(e) => {
      Err(format!("创建节点失败: {:?}", e))
    }
  }
}

#[tauri::command]
async fn set_acl(
  state: tauri::State<'_, ZkClient>,
  connection_uuid: String,
  path: String,
  acl_entries: Vec<ZkAclEntry>
) -> Result<String, String> {
  let client_arc = {
    let guard = state.clients.lock().map_err(|_| "Mutex poisoned")?;
    guard
      .get(&connection_uuid)
      .cloned()
      .ok_or("Client not initialized for this connection!")?
  };
  let acls: Result<Vec<Acl>, String> = acl_entries.into_iter().map(|entry| {
    let auth_id = AuthId::new(&entry.scheme, &entry.id);
    let permission = parse_permissions(&entry.permission)?;
    Ok(Acl::new(permission, auth_id))
  }).collect();
  let acls = acls?;
  client_arc.set_acl(&path, &acls, Some(-1)).await.map_err(|e| e.to_string())?;
  Ok("SUCCESS".to_string())
}

#[tauri::command]
async fn watch_node(
  app: tauri::AppHandle,
  state: tauri::State<'_, ZkClient>,
  connection_uuid: String,
  path: String,
) -> Result<String, String> {
  let watch_key = format!("{}:{}", connection_uuid, path);

  // Check if already watching
  {
    let watchers_lock = state.watchers.lock().map_err(|_| "Mutex poisoned")?;
    if watchers_lock.contains_key(&watch_key) {
      return Ok("ALREADY_WATCHING".to_string());
    }
  }

  let client_arc = {
    let guard = state.clients.lock().map_err(|_| "Mutex poisoned")?;
    guard
      .get(&connection_uuid)
      .cloned()
      .ok_or("Client not initialized for this connection!")?
  };

  // Initial fetch with watch
  let (data, stat, watcher) = client_arc.get_and_watch_data(&path).await.map_err(|e| e.to_string())?;

  // Fetch ACL for initial event
  let (acl, _) = client_arc.get_acl(&path).await.map_err(|e| e.to_string())?;

  // Emit initial data
  let _ = app.emit("zk:node-changed", WatchEvent {
    connection_uuid: connection_uuid.clone(),
    path: path.clone(),
    event_type: "NodeDataChanged".to_string(),
    data: Some(data),
    stat: Some(stat.into()),
    acl: Some(acl.into_iter().map(|a| a.into()).collect()),
  });

  // Spawn background watcher task
  let app_handle = app.clone();
  let conn_uuid = connection_uuid.clone();
  let node_path = path.clone();
  let client_for_task = client_arc.clone();
  let watchers_arc = state.watchers.clone();

  let handle = tokio::spawn(async move {
    let mut current_watcher = watcher;
    loop {
      let event = current_watcher.changed().await;

      let event_type = match event.event_type {
        EventType::NodeCreated => "NodeCreated",
        EventType::NodeDeleted => "NodeDeleted",
        EventType::NodeDataChanged => "NodeDataChanged",
        EventType::NodeChildrenChanged => "NodeChildrenChanged",
        EventType::Session => "Session",
      };

      if event.event_type == EventType::NodeDeleted {
        let _ = app_handle.emit("zk:node-changed", WatchEvent {
          connection_uuid: conn_uuid.clone(),
          path: node_path.clone(),
          event_type: "NodeDeleted".to_string(),
          data: None,
          stat: None,
          acl: None,
        });
        break;
      }

      // Re-register watcher and fetch fresh data
      match client_for_task.get_and_watch_data(&node_path).await {
        Ok((new_data, new_stat, new_watcher)) => {
          let new_acl = match client_for_task.get_acl(&node_path).await {
            Ok((acl, _)) => acl.into_iter().map(|a| a.into()).collect(),
            Err(_) => vec![],
          };

          let _ = app_handle.emit("zk:node-changed", WatchEvent {
            connection_uuid: conn_uuid.clone(),
            path: node_path.clone(),
            event_type: event_type.to_string(),
            data: Some(new_data),
            stat: Some(new_stat.into()),
            acl: Some(new_acl),
          });

          current_watcher = new_watcher;
        }
        Err(e) => {
          // Node may have been deleted or connection lost
          println!("Watch re-register failed for {}: {:?}", node_path, e);
          let _ = app_handle.emit("zk:node-changed", WatchEvent {
            connection_uuid: conn_uuid.clone(),
            path: node_path.clone(),
            event_type: "NodeDeleted".to_string(),
            data: None,
            stat: None,
            acl: None,
          });
          break;
        }
      }
    }

    // Clean up from watchers map when task ends
    let key = format!("{}:{}", conn_uuid, node_path);
    if let Ok(mut watchers) = watchers_arc.lock() {
      watchers.remove(&key);
    }
  });

  // Store the abort handle
  {
    let mut watchers_lock = state.watchers.lock().map_err(|_| "Mutex poisoned")?;
    watchers_lock.insert(watch_key, handle.abort_handle());
  }

  Ok("SUCCESS".to_string())
}

#[tauri::command]
async fn unwatch_node(
  state: tauri::State<'_, ZkClient>,
  connection_uuid: String,
  path: String,
) -> Result<String, String> {
  let watch_key = format!("{}:{}", connection_uuid, path);
  let mut watchers_lock = state.watchers.lock().map_err(|_| "Mutex poisoned")?;
  if let Some(handle) = watchers_lock.remove(&watch_key) {
    handle.abort();
    Ok("SUCCESS".to_string())
  } else {
    Ok("NOT_WATCHING".to_string())
  }
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
      clients: Mutex::new(std::collections::HashMap::new()),
      ssh_tunnels: Mutex::new(std::collections::HashMap::new()),
      watchers: Arc::new(Mutex::new(std::collections::HashMap::new())),
    })
    .invoke_handler(tauri::generate_handler![
      connect_zk,
      disconnect_zk,
      list_children,
      get_data,
      get_acl,
      get_znode_details,
      set_data,
      delete_node,
      create_node,
      set_acl,
      watch_node,
      unwatch_node
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

