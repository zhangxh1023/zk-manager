use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use tauri::Emitter;
use zookeeper_client::{Acl, Acls, AuthId, Client, CreateMode, EventType, Permission};
mod database;
mod migrations;
mod secrets;
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
  ephemeral_owner: i64,
  data_length: i32,
  num_children: i32,
}

#[derive(Serialize, Deserialize, Clone)]
struct ZkAclEntry {
  scheme: String,
  id: String,
  permission: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppError {
  code: String,
  message: String,
  detail: Option<String>,
}

pub(crate) type AppResult<T> = Result<T, AppError>;

impl AppError {
  pub(crate) fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
    AppError {
      code: code.into(),
      message: message.into(),
      detail: None,
    }
  }

  pub(crate) fn with_detail(
    code: impl Into<String>,
    message: impl Into<String>,
    detail: impl Into<String>,
  ) -> Self {
    AppError {
      code: code.into(),
      message: message.into(),
      detail: Some(detail.into()),
    }
  }
}

pub(crate) fn internal_error(message: &str) -> AppError {
  AppError::new("INTERNAL", message)
}

fn zk_error(error: impl std::fmt::Debug, fallback_message: &str) -> AppError {
  let detail = format!("{:?}", error);
  let (code, message) = if detail.contains("NoNode") {
    ("NO_NODE", "Node does not exist")
  } else if detail.contains("NodeExists") {
    ("NODE_EXISTS", "Node already exists")
  } else if detail.contains("NotEmpty") {
    ("NOT_EMPTY", "Cannot delete node with children")
  } else if detail.contains("BadVersion") {
    (
      "VERSION_CONFLICT",
      "Node was changed by another operation. Refresh and try again.",
    )
  } else if detail.contains("NoAuth") || detail.contains("AuthFailed") {
    ("AUTH_FAILED", "Authentication failed or permission denied")
  } else if detail.contains("ConnectionLoss") || detail.contains("SessionExpired") {
    ("CONNECTION_LOST", "ZooKeeper connection is not available")
  } else {
    ("ZK_ERROR", fallback_message)
  };

  AppError::with_detail(code, message, detail)
}

fn keychain_error(error: impl ToString) -> AppError {
  AppError::with_detail(
    "KEYCHAIN_ERROR",
    "Failed to access system keychain",
    error.to_string(),
  )
}

fn ssh_tunnel_error(error: String) -> AppError {
  if error.starts_with("SSH host key is not trusted.") {
    AppError::with_detail(
      "SSH_HOST_KEY_UNTRUSTED",
      "SSH host key is not trusted",
      error,
    )
  } else if error.starts_with("SSH host key changed") {
    AppError::with_detail("SSH_HOST_KEY_CHANGED", "SSH host key changed", error)
  } else {
    AppError::with_detail("SSH_TUNNEL_ERROR", "SSH tunnel failed", error)
  }
}

fn client_for(state: &tauri::State<'_, ZkClient>, connection_uuid: &str) -> AppResult<Arc<Client>> {
  let guard = state
    .clients
    .lock()
    .map_err(|_| internal_error("Internal client registry lock failed"))?;
  guard
    .get(connection_uuid)
    .cloned()
    .ok_or_else(|| AppError::new("CLIENT_NOT_CONNECTED", "Client is not connected"))
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ZnodeDetails {
  data: Vec<u8>,
  stat: ZkStat,
  acl: Vec<ZkAclEntry>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ZnodeSearchResult {
  name: String,
  path: String,
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConnectZkRequest {
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
  #[serde(default)]
  trust_unknown_ssh_host_key: bool,
}

#[tauri::command]
async fn connect_zk(
  state: tauri::State<'_, ZkClient>,
  request: ConnectZkRequest,
) -> AppResult<String> {
  let ConnectZkRequest {
    connection_uuid,
    server,
    username,
    password,
    use_ssh,
    ssh_host,
    ssh_port,
    ssh_username,
    ssh_auth_method,
    ssh_password,
    ssh_key_path,
    trust_unknown_ssh_host_key,
  } = request;
  println!("尝试连接 ZK: {} uuid: {}", server, connection_uuid);

  let (zk_server_host, zk_server_port) = parse_server(&server)?;
  let mut pending_tunnel = None;

  let actual_server = if use_ssh {
    let ssh_host = ssh_host.ok_or_else(|| {
      AppError::new(
        "VALIDATION_ERROR",
        "SSH host is required when SSH tunnel is enabled",
      )
    })?;
    let ssh_port = ssh_port.unwrap_or(22);
    let ssh_username = ssh_username.ok_or_else(|| {
      AppError::new(
        "VALIDATION_ERROR",
        "SSH username is required when SSH tunnel is enabled",
      )
    })?;

    let auth_method = if ssh_auth_method.as_deref() == Some("key") {
      ssh_tunnel::TunnelAuthMethod::Key {
        key_path: ssh_key_path.ok_or_else(|| {
          AppError::new(
            "VALIDATION_ERROR",
            "SSH key path is required for key authentication",
          )
        })?,
      }
    } else {
      ssh_tunnel::TunnelAuthMethod::Password {
        password: ssh_password.ok_or_else(|| {
          AppError::new(
            "VALIDATION_ERROR",
            "SSH password is required for password authentication",
          )
        })?,
      }
    };

    let tunnel_config = ssh_tunnel::TunnelConfig {
      ssh_host,
      ssh_port,
      ssh_username,
      ssh_auth_method: auth_method,
      target_host: zk_server_host,
      target_port: zk_server_port,
      trust_unknown_host_key: trust_unknown_ssh_host_key,
    };

    let tunnel = ssh_tunnel::create_tunnel(&tunnel_config)
      .await
      .map_err(ssh_tunnel_error)?;

    println!("SSH 隧道已建立，本地端口: {}", tunnel.local_port);

    let port = tunnel.local_port;
    pending_tunnel = Some(tunnel);

    format!("localhost:{}", port)
  } else {
    server.clone()
  };

  println!("正在连接到 ZooKeeper: {}", actual_server);
  let client = zookeeper_client::Client::connect(&actual_server)
    .await
    .map_err(|e| {
      println!("连接失败: {:?}", e);
      zk_error(e, "ZooKeeper connection failed")
    })?;
  println!("ZooKeeper 客户端已创建");

  let username = username.filter(|value| !value.is_empty());
  let password = password.filter(|value| !value.is_empty());
  match (username, password) {
    (Some(u), Some(p)) => {
      println!("进行认证: {}", u);
      let auth_data = format!("{}:{}", u, p);
      client
        .auth("digest", auth_data.as_bytes())
        .await
        .map_err(|e| {
          println!("认证失败: {:?}", e);
          zk_error(e, "ZooKeeper authentication failed")
        })?;
      println!("认证成功");
    }
    (None, None) => {
      println!("未提供认证信息，使用匿名访问");
    }
    _ => {
      return Err(AppError::new(
        "VALIDATION_ERROR",
        "Username and password must be provided together for digest authentication",
      ));
    }
  }

  let mut clients_lock = state
    .clients
    .lock()
    .map_err(|_| internal_error("Internal client registry lock failed"))?;
  clients_lock.insert(connection_uuid.clone(), Arc::new(client));

  if let Some(tunnel) = pending_tunnel {
    let mut ssh_tunnels_lock = state
      .ssh_tunnels
      .lock()
      .map_err(|_| internal_error("Internal SSH tunnel registry lock failed"))?;
    ssh_tunnels_lock.insert(connection_uuid, tunnel);
  }

  println!("连接成功");
  Ok("SUCCESS".to_string())
}

#[tauri::command]
async fn set_connection_secrets(
  connection_uuid: String,
  secrets: secrets::ConnectionSecrets,
) -> AppResult<()> {
  tauri::async_runtime::spawn_blocking(move || {
    secrets::set_connection_secrets(&connection_uuid, secrets)
  })
  .await
  .map_err(keychain_error)?
  .map_err(keychain_error)
}

#[tauri::command]
async fn get_connection_secrets(connection_uuid: String) -> AppResult<secrets::ConnectionSecrets> {
  tauri::async_runtime::spawn_blocking(move || secrets::get_connection_secrets(&connection_uuid))
    .await
    .map_err(keychain_error)?
    .map_err(keychain_error)
}

#[tauri::command]
async fn delete_connection_secrets(connection_uuid: String) -> AppResult<()> {
  tauri::async_runtime::spawn_blocking(move || secrets::delete_connection_secrets(&connection_uuid))
    .await
    .map_err(keychain_error)?
    .map_err(keychain_error)
}

#[tauri::command]
async fn disconnect_zk(
  state: tauri::State<'_, ZkClient>,
  connection_uuid: String,
) -> AppResult<String> {
  println!("断开连接 ZK: {}", connection_uuid);

  // Abort all watchers for this connection
  {
    let mut watchers_lock = state
      .watchers
      .lock()
      .map_err(|_| internal_error("Internal watcher registry lock failed"))?;
    let prefix = format!("{}:", connection_uuid);
    let keys: Vec<String> = watchers_lock
      .keys()
      .filter(|k| k.starts_with(&prefix))
      .cloned()
      .collect();
    for key in keys {
      if let Some(handle) = watchers_lock.remove(&key) {
        handle.abort();
      }
    }
  }

  let mut clients_lock = state
    .clients
    .lock()
    .map_err(|_| internal_error("Internal client registry lock failed"))?;
  clients_lock.remove(&connection_uuid);

  let mut ssh_tunnels_lock = state
    .ssh_tunnels
    .lock()
    .map_err(|_| internal_error("Internal SSH tunnel registry lock failed"))?;
  ssh_tunnels_lock.remove(&connection_uuid);

  Ok("SUCCESS".to_string())
}

fn parse_server(server: &str) -> AppResult<(String, u16)> {
  let parts: Vec<&str> = server.split(':').collect();
  if parts.len() == 2 {
    let host = parts[0].to_string();
    let port: u16 = parts[1]
      .parse()
      .map_err(|_| AppError::new("VALIDATION_ERROR", "Invalid port number"))?;
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
) -> AppResult<Vec<String>> {
  let client_arc = client_for(&state, &connection_uuid)?;
  let (children, _) = client_arc
    .get_children(&path)
    .await
    .map_err(|e| zk_error(e, "Failed to list children"))?;
  Ok(children)
}

#[tauri::command]
async fn search_nodes(
  state: tauri::State<'_, ZkClient>,
  connection_uuid: String,
  root_path: String,
  query: String,
  max_results: Option<usize>,
) -> AppResult<Vec<ZnodeSearchResult>> {
  let query = query.trim().to_lowercase();
  if query.is_empty() {
    return Ok(Vec::new());
  }

  let max_results = max_results.unwrap_or(50).clamp(1, 500);
  let client_arc = client_for(&state, &connection_uuid)?;
  let root_path = normalize_zk_path(&root_path);
  let mut queue = VecDeque::from([root_path]);
  let mut results = Vec::new();

  while let Some(path) = queue.pop_front() {
    let (children, _) = client_arc
      .get_children(&path)
      .await
      .map_err(|e| zk_error(e, "Failed to search nodes"))?;

    for child in children {
      let child_path = child_path(&path, &child);
      if child.to_lowercase().contains(&query) {
        results.push(ZnodeSearchResult {
          name: child.clone(),
          path: child_path.clone(),
        });

        if results.len() >= max_results {
          return Ok(results);
        }
      }
      queue.push_back(child_path);
    }
  }

  Ok(results)
}

fn normalize_zk_path(path: &str) -> String {
  let trimmed = path.trim();
  if trimmed.is_empty() || trimmed == "/" {
    "/".to_string()
  } else {
    format!("/{}", trimmed.trim_matches('/'))
  }
}

fn child_path(parent: &str, child: &str) -> String {
  if parent == "/" {
    format!("/{}", child)
  } else {
    format!("{}/{}", parent, child)
  }
}

#[tauri::command]
async fn get_data(
  state: tauri::State<'_, ZkClient>,
  connection_uuid: String,
  path: String,
) -> AppResult<Vec<u8>> {
  let client_arc = client_for(&state, &connection_uuid)?;
  let (data, _) = client_arc
    .get_data(&path)
    .await
    .map_err(|e| zk_error(e, "Failed to read node data"))?;
  Ok(data)
}

#[tauri::command]
async fn get_acl(
  state: tauri::State<'_, ZkClient>,
  connection_uuid: String,
  path: String,
) -> AppResult<Vec<ZkAclEntry>> {
  let client_arc = client_for(&state, &connection_uuid)?;
  let (acl, _) = client_arc
    .get_acl(&path)
    .await
    .map_err(|e| zk_error(e, "Failed to read ACL"))?;

  let converted: Vec<ZkAclEntry> = acl.into_iter().map(|a| a.into()).collect();
  Ok(converted)
}

#[tauri::command]
async fn get_znode_details(
  state: tauri::State<'_, ZkClient>,
  connection_uuid: String,
  path: String,
) -> AppResult<ZnodeDetails> {
  let client_arc = client_for(&state, &connection_uuid)?;
  let (data, stat) = client_arc
    .get_data(&path)
    .await
    .map_err(|e| zk_error(e, "Failed to read node data"))?;
  let (acl, _) = client_arc
    .get_acl(&path)
    .await
    .map_err(|e| zk_error(e, "Failed to read ACL"))?;

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
  data: Vec<u8>,
  version: i32,
) -> AppResult<ZnodeDetails> {
  let client_arc = client_for(&state, &connection_uuid)?;
  let stat = client_arc
    .set_data(&path, data.as_slice(), Some(version))
    .await
    .map_err(|e| zk_error(e, "Failed to update node data"))?;
  let (new_data, _) = client_arc
    .get_data(&path)
    .await
    .map_err(|e| zk_error(e, "Failed to read updated node data"))?;
  let (acl, _) = client_arc
    .get_acl(&path)
    .await
    .map_err(|e| zk_error(e, "Failed to read ACL"))?;

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
  path: String,
) -> AppResult<String> {
  let client_arc = client_for(&state, &connection_uuid)?;
  client_arc
    .delete(&path, Some(-1))
    .await
    .map_err(|e| zk_error(e, "Failed to delete node"))?;
  Ok("SUCCESS".to_string())
}

#[tauri::command]
async fn delete_node_recursive(
  state: tauri::State<'_, ZkClient>,
  connection_uuid: String,
  path: String,
) -> AppResult<String> {
  if path == "/" {
    return Err(AppError::new(
      "VALIDATION_ERROR",
      "Root node cannot be deleted",
    ));
  }

  let client_arc = client_for(&state, &connection_uuid)?;
  let mut pending = vec![path.clone()];
  let mut paths = Vec::new();

  while let Some(current_path) = pending.pop() {
    let (children, _) = client_arc
      .get_children(&current_path)
      .await
      .map_err(|e| zk_error(e, "Failed to list children for recursive delete"))?;

    paths.push(current_path.clone());
    for child in children {
      let child_path = if current_path == "/" {
        format!("/{}", child)
      } else {
        format!("{}/{}", current_path, child)
      };
      pending.push(child_path);
    }
  }

  for current_path in paths.into_iter().rev() {
    client_arc
      .delete(&current_path, Some(-1))
      .await
      .map_err(|e| zk_error(e, "Failed to delete node recursively"))?;
  }

  Ok("SUCCESS".to_string())
}

#[tauri::command]
async fn create_node(
  state: tauri::State<'_, ZkClient>,
  connection_uuid: String,
  path: String,
  data: Vec<u8>,
) -> AppResult<String> {
  let client_arc = client_for(&state, &connection_uuid)?;
  let options = CreateMode::Persistent.with_acls(Acls::anyone_all());
  client_arc
    .create(&path, data.as_slice(), &options)
    .await
    .map_err(|e| zk_error(e, "Failed to create node"))?;
  Ok("SUCCESS".to_string())
}

#[tauri::command]
async fn create_node_recursive(
  state: tauri::State<'_, ZkClient>,
  connection_uuid: String,
  path: String,
  data: Vec<u8>,
) -> AppResult<String> {
  let path = normalize_zk_path(&path);
  if path == "/" {
    return Err(AppError::new(
      "VALIDATION_ERROR",
      "Root node cannot be created",
    ));
  }

  let client_arc = client_for(&state, &connection_uuid)?;
  let options = CreateMode::Persistent.with_acls(Acls::anyone_all());
  let parent_path = path
    .rsplit_once('/')
    .map(|(parent, _)| parent)
    .unwrap_or("/");
  let parent_path = if parent_path.is_empty() {
    "/"
  } else {
    parent_path
  };

  if parent_path != "/" {
    client_arc
      .mkdir(parent_path, &options)
      .await
      .map_err(|e| zk_error(e, "Failed to create parent nodes"))?;
  }

  client_arc
    .create(&path, data.as_slice(), &options)
    .await
    .map_err(|e| zk_error(e, "Failed to create node recursively"))?;
  Ok("SUCCESS".to_string())
}

#[tauri::command]
async fn set_acl(
  state: tauri::State<'_, ZkClient>,
  connection_uuid: String,
  path: String,
  acl_entries: Vec<ZkAclEntry>,
  version: i32,
) -> AppResult<String> {
  let client_arc = client_for(&state, &connection_uuid)?;
  let acls: AppResult<Vec<Acl>> = acl_entries
    .into_iter()
    .map(|entry| {
      let auth_id = AuthId::new(&entry.scheme, &entry.id);
      let permission = parse_permissions(&entry.permission)?;
      Ok(Acl::new(permission, auth_id))
    })
    .collect();
  let acls = acls?;
  client_arc
    .set_acl(&path, &acls, Some(version))
    .await
    .map_err(|e| zk_error(e, "Failed to update ACL"))?;
  Ok("SUCCESS".to_string())
}

#[tauri::command]
async fn watch_node(
  app: tauri::AppHandle,
  state: tauri::State<'_, ZkClient>,
  connection_uuid: String,
  path: String,
) -> AppResult<String> {
  let watch_key = format!("{}:{}", connection_uuid, path);

  // Check if already watching
  {
    let watchers_lock = state
      .watchers
      .lock()
      .map_err(|_| internal_error("Internal watcher registry lock failed"))?;
    if watchers_lock.contains_key(&watch_key) {
      return Ok("ALREADY_WATCHING".to_string());
    }
  }

  let client_arc = client_for(&state, &connection_uuid)?;

  // Initial fetch with watch
  let (data, stat, watcher) = client_arc
    .get_and_watch_data(&path)
    .await
    .map_err(|e| zk_error(e, "Failed to watch node"))?;

  // Fetch ACL for initial event
  let (acl, _) = client_arc
    .get_acl(&path)
    .await
    .map_err(|e| zk_error(e, "Failed to read ACL"))?;

  // Emit initial data for clients that want to refresh their current view.
  // The frontend records its own timeline snapshot when watch starts.
  let _ = app.emit(
    "zk:node-changed",
    WatchEvent {
      connection_uuid: connection_uuid.clone(),
      path: path.clone(),
      event_type: "InitialSnapshot".to_string(),
      data: Some(data),
      stat: Some(stat.into()),
      acl: Some(acl.into_iter().map(|a| a.into()).collect()),
    },
  );

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
        let _ = app_handle.emit(
          "zk:node-changed",
          WatchEvent {
            connection_uuid: conn_uuid.clone(),
            path: node_path.clone(),
            event_type: "NodeDeleted".to_string(),
            data: None,
            stat: None,
            acl: None,
          },
        );
        break;
      }

      // Re-register watcher and fetch fresh data
      match client_for_task.get_and_watch_data(&node_path).await {
        Ok((new_data, new_stat, new_watcher)) => {
          let new_acl = match client_for_task.get_acl(&node_path).await {
            Ok((acl, _)) => acl.into_iter().map(|a| a.into()).collect(),
            Err(_) => vec![],
          };

          let _ = app_handle.emit(
            "zk:node-changed",
            WatchEvent {
              connection_uuid: conn_uuid.clone(),
              path: node_path.clone(),
              event_type: event_type.to_string(),
              data: Some(new_data),
              stat: Some(new_stat.into()),
              acl: Some(new_acl),
            },
          );

          current_watcher = new_watcher;
        }
        Err(e) => {
          // Node may have been deleted or connection lost
          println!("Watch re-register failed for {}: {:?}", node_path, e);
          let _ = app_handle.emit(
            "zk:node-changed",
            WatchEvent {
              connection_uuid: conn_uuid.clone(),
              path: node_path.clone(),
              event_type: "NodeDeleted".to_string(),
              data: None,
              stat: None,
              acl: None,
            },
          );
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
    let mut watchers_lock = state
      .watchers
      .lock()
      .map_err(|_| internal_error("Internal watcher registry lock failed"))?;
    watchers_lock.insert(watch_key, handle.abort_handle());
  }

  Ok("SUCCESS".to_string())
}

#[tauri::command]
async fn unwatch_node(
  state: tauri::State<'_, ZkClient>,
  connection_uuid: String,
  path: String,
) -> AppResult<String> {
  let watch_key = format!("{}:{}", connection_uuid, path);
  let mut watchers_lock = state
    .watchers
    .lock()
    .map_err(|_| internal_error("Internal watcher registry lock failed"))?;
  if let Some(handle) = watchers_lock.remove(&watch_key) {
    handle.abort();
    Ok("SUCCESS".to_string())
  } else {
    Ok("NOT_WATCHING".to_string())
  }
}

fn parse_permissions(perm_str: &str) -> AppResult<Permission> {
  let perm_str = perm_str.trim();
  if perm_str.eq_ignore_ascii_case("ALL") {
    return Ok(Permission::ALL);
  }
  if perm_str.eq_ignore_ascii_case("NONE") {
    return Ok(Permission::NONE);
  }
  if perm_str.is_empty() {
    return Err(AppError::new(
      "VALIDATION_ERROR",
      "ACL permission cannot be empty",
    ));
  }

  let mut permission = Permission::NONE;
  for part in perm_str.split('|') {
    match part.trim().to_uppercase().as_str() {
      "READ" => permission = permission | Permission::READ,
      "WRITE" => permission = permission | Permission::WRITE,
      "CREATE" => permission = permission | Permission::CREATE,
      "DELETE" => permission = permission | Permission::DELETE,
      "ADMIN" => permission = permission | Permission::ADMIN,
      "" => {}
      _ => {
        return Err(AppError::new(
          "VALIDATION_ERROR",
          format!("Unknown ACL permission: {}", part),
        ));
      }
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
      search_nodes,
      get_data,
      get_acl,
      get_znode_details,
      set_data,
      delete_node,
      delete_node_recursive,
      create_node,
      create_node_recursive,
      set_acl,
      watch_node,
      unwatch_node,
      set_connection_secrets,
      get_connection_secrets,
      delete_connection_secrets,
      database::list_connections,
      database::get_connection_legacy_secrets,
      database::clear_legacy_connection_secret,
      database::insert_connection,
      database::update_connection,
      database::delete_connection,
      database::list_logs,
      database::add_log,
      database::clear_logs,
      database::load_settings,
      database::save_settings
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn parse_single_permission_without_implicit_read() {
    let permission = parse_permissions("WRITE").unwrap();

    assert_eq!(permission, Permission::WRITE);
    assert!(!permission.has(Permission::READ));
  }

  #[test]
  fn parse_combined_permissions() {
    let permission = parse_permissions("READ|WRITE|ADMIN").unwrap();

    assert!(permission.has(Permission::READ));
    assert!(permission.has(Permission::WRITE));
    assert!(permission.has(Permission::ADMIN));
    assert!(!permission.has(Permission::CREATE));
  }

  #[test]
  fn parse_all_permission() {
    assert_eq!(parse_permissions("ALL").unwrap(), Permission::ALL);
  }

  #[test]
  fn normalize_zk_paths() {
    assert_eq!(normalize_zk_path(""), "/");
    assert_eq!(normalize_zk_path("/"), "/");
    assert_eq!(normalize_zk_path("a/b/"), "/a/b");
    assert_eq!(normalize_zk_path("/a/b"), "/a/b");
  }

  #[test]
  fn builds_child_paths() {
    assert_eq!(child_path("/", "child"), "/child");
    assert_eq!(child_path("/parent", "child"), "/parent/child");
  }
}
