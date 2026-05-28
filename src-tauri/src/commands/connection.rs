use std::sync::Arc;

use crate::error::{
  internal_error, keychain_error, ssh_tunnel_error, zk_error, AppError, AppResult,
};
use crate::models::ConnectZkRequest;
use crate::secrets;
use crate::ssh_tunnel;
use crate::state::ZkClient;

#[tauri::command]
pub(crate) async fn connect_zk(
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
pub(crate) async fn set_connection_secrets(
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
pub(crate) async fn get_connection_secrets(
  connection_uuid: String,
) -> AppResult<secrets::ConnectionSecrets> {
  tauri::async_runtime::spawn_blocking(move || secrets::get_connection_secrets(&connection_uuid))
    .await
    .map_err(keychain_error)?
    .map_err(keychain_error)
}

#[tauri::command]
pub(crate) async fn delete_connection_secrets(connection_uuid: String) -> AppResult<()> {
  tauri::async_runtime::spawn_blocking(move || secrets::delete_connection_secrets(&connection_uuid))
    .await
    .map_err(keychain_error)?
    .map_err(keychain_error)
}

#[tauri::command]
pub(crate) async fn disconnect_zk(
  state: tauri::State<'_, ZkClient>,
  connection_uuid: String,
) -> AppResult<String> {
  println!("断开连接 ZK: {}", connection_uuid);

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
