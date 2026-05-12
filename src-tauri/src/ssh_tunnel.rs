//! SSH Tunnel implementation using russh with native direct-tcpip forwarding
//!
//! This module provides SSH tunnel functionality for forwarding TCP connections
//! through an SSH server to a target ZooKeeper instance.
//!
//! Key design decisions:
//! - Uses russh's `channel_open_direct_tcpip` for native SSH port forwarding
//! - Each incoming local TCP connection gets its own SSH channel
//! - Fully async with tokio, no dependency on remote tools (nc/socat)
//! - Supports both password and key authentication

use async_trait::async_trait;
use russh::client;
use std::sync::Arc;
use tokio::io::AsyncWriteExt;
use tokio::net::TcpListener;

/// Represents an active SSH tunnel
pub struct SshTunnel {
  /// Local port where the tunnel listens
  pub local_port: u16,
  /// Handle to the background forwarding task
  _task_handle: tokio::task::JoinHandle<()>,
}

/// Configuration for creating an SSH tunnel
#[derive(Debug, Clone)]
pub struct TunnelConfig {
  pub ssh_host: String,
  pub ssh_port: u16,
  pub ssh_username: String,
  pub ssh_auth_method: TunnelAuthMethod,
  pub target_host: String,
  pub target_port: u16,
  pub trust_unknown_host_key: bool,
}

#[derive(Debug, Clone)]
pub enum TunnelAuthMethod {
  Password { password: String },
  Key { key_path: String },
}

/// SSH client handler for russh
#[derive(Clone)]
struct SshClientHandler {
  host: String,
  port: u16,
  trust_unknown_host_key: bool,
}

#[async_trait]
impl client::Handler for SshClientHandler {
  type Error = russh::Error;

  async fn check_server_key(
    &mut self,
    server_public_key: &ssh_key::PublicKey,
  ) -> Result<bool, Self::Error> {
    match russh::keys::known_hosts::check_known_hosts(&self.host, self.port, server_public_key) {
      Ok(true) => Ok(true),
      Ok(false) if self.trust_unknown_host_key => {
        russh::keys::known_hosts::learn_known_hosts(&self.host, self.port, server_public_key)
          .map_err(russh::Error::from)?;
        Ok(true)
      }
      Ok(false) => Err(russh::Error::UnknownKey),
      Err(russh::keys::Error::KeyChanged { line }) => Err(russh::Error::KeyChanged { line }),
      Err(error) => Err(error.into()),
    }
  }
}

/// Expand ~ to home directory in a path string
fn expand_tilde(path: &str) -> std::path::PathBuf {
  if let Some(stripped_path) = path.strip_prefix("~/") {
    if let Ok(home) = std::env::var("HOME") {
      return std::path::PathBuf::from(home).join(stripped_path);
    }
  }
  std::path::PathBuf::from(path)
}

fn ssh_connect_error(host: &str, port: u16, error: russh::Error) -> String {
  if matches!(error, russh::Error::UnknownKey) {
    return format!(
      "SSH host key is not trusted. Add {}:{} to your ~/.ssh/known_hosts file and try again.",
      host, port
    );
  }
  if matches!(error, russh::Error::KeyChanged { .. }) {
    return format!(
      "SSH host key changed for {}:{}. Check your ~/.ssh/known_hosts file before connecting.",
      host, port
    );
  }
  format!(
    "Failed to connect to SSH server {}:{}: {}",
    host, port, error
  )
}

/// Create an SSH tunnel (async)
pub async fn create_tunnel(config: &TunnelConfig) -> Result<SshTunnel, String> {
  println!(
    "Creating SSH tunnel: {}@{}:{}",
    config.ssh_username, config.ssh_host, config.ssh_port
  );
  println!("ssh_tunnel:connect:start");

  // Configure SSH client
  let ssh_config = Arc::new(client::Config::default());

  // Connect to SSH server
  let mut session = client::connect(
    ssh_config,
    (config.ssh_host.as_str(), config.ssh_port),
    SshClientHandler {
      host: config.ssh_host.clone(),
      port: config.ssh_port,
      trust_unknown_host_key: config.trust_unknown_host_key,
    },
  )
  .await
  .map_err(|error| ssh_connect_error(&config.ssh_host, config.ssh_port, error))?;

  println!("ssh_tunnel:authenticate:start");
  // Authenticate
  match &config.ssh_auth_method {
    TunnelAuthMethod::Password { password } => {
      let auth_result = session
        .authenticate_password(&config.ssh_username, password)
        .await
        .map_err(|e| format!("SSH password authentication failed: {}", e))?;
      if !auth_result {
        return Err("SSH password authentication rejected".to_string());
      }
    }
    TunnelAuthMethod::Key { key_path } => {
      let expanded_path = expand_tilde(key_path);

      let key_pair = russh::keys::load_secret_key(&expanded_path, None)
        .map_err(|e| format!("Failed to load SSH key from {:?}: {}", expanded_path, e))?;
      let key_with_hash = russh::keys::key::PrivateKeyWithHashAlg::new(
        Arc::new(key_pair),
        None, // Use default hash algorithm
      )
      .map_err(|e| format!("Failed to create key with hash alg: {}", e))?;
      let auth_result = session
        .authenticate_publickey(&config.ssh_username, key_with_hash)
        .await
        .map_err(|e| format!("SSH public key authentication failed: {}", e))?;
      if !auth_result {
        return Err("SSH public key authentication rejected".to_string());
      }
    }
  }

  println!("SSH authentication successful");

  // Create local TCP listener on a random available port
  let listener = TcpListener::bind("127.0.0.1:0")
    .await
    .map_err(|e| format!("Failed to create local listener: {}", e))?;
  let local_port = listener
    .local_addr()
    .map_err(|e| format!("Failed to get local address: {}", e))?
    .port();

  println!("Local tunnel port: {}", local_port);

  let target_host = config.target_host.clone();
  let target_port = config.target_port;

  // Wrap session handle in Arc for sharing across tasks
  let session = Arc::new(session);

  // Spawn background task to handle port forwarding
  let task_handle = tokio::spawn(async move {
    handle_tunnel_loop(listener, session, &target_host, target_port).await;
  });

  Ok(SshTunnel {
    local_port,
    _task_handle: task_handle,
  })
}

/// Handle incoming local connections and forward them through the SSH tunnel
async fn handle_tunnel_loop(
  listener: TcpListener,
  session: Arc<client::Handle<SshClientHandler>>,
  target_host: &str,
  target_port: u16,
) {
  println!(
    "SSH tunnel thread started, target: {}:{}",
    target_host, target_port
  );

  loop {
    match listener.accept().await {
      Ok((local_stream, addr)) => {
        println!("Accepted local connection from: {:?}", addr);

        let session = session.clone();
        let target_host = target_host.to_string();

        // Spawn a task for each connection
        tokio::spawn(async move {
          if let Err(e) = forward_connection(local_stream, session, &target_host, target_port).await
          {
            eprintln!("Forwarding error: {}", e);
          }
        });
      }
      Err(e) => {
        eprintln!("Failed to accept connection: {}", e);
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
      }
    }
  }
}

/// Forward a single TCP connection through the SSH tunnel
async fn forward_connection(
  mut local_stream: tokio::net::TcpStream,
  session: Arc<client::Handle<SshClientHandler>>,
  target_host: &str,
  target_port: u16,
) -> Result<(), String> {
  // Open a new direct-tcpip channel for this connection
  // This is the SSH protocol's native TCP forwarding mechanism
  let channel = session
    .channel_open_direct_tcpip(
      target_host,
      target_port as u32,
      "127.0.0.1",
      0, // originator port (informational only)
    )
    .await
    .map_err(|e| format!("Failed to open direct-tcpip channel: {}", e))?;

  println!(
    "Opened direct-tcpip channel to {}:{}",
    target_host, target_port
  );

  // Convert the SSH channel to a stream for bidirectional I/O
  let mut ssh_stream = channel.into_stream();

  // Bidirectionally copy data between local TCP stream and SSH channel
  match tokio::io::copy_bidirectional(&mut local_stream, &mut ssh_stream).await {
    Ok((client_to_server, server_to_client)) => {
      println!(
        "Forwarding completed: {} bytes sent, {} bytes received",
        client_to_server, server_to_client
      );
    }
    Err(e) => {
      // Connection closed is normal when ZK client disconnects
      if e.kind() != std::io::ErrorKind::BrokenPipe
        && e.kind() != std::io::ErrorKind::ConnectionReset
      {
        println!("Forwarding ended with error: {}", e);
      }
    }
  }

  // Clean up: try to shut down the SSH stream gracefully
  let _ = ssh_stream.shutdown().await;

  Ok(())
}

impl Drop for SshTunnel {
  fn drop(&mut self) {
    println!("Closing SSH tunnel on port {}", self.local_port);
    self._task_handle.abort();
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_tunnel_config_password() {
    let config = TunnelConfig {
      ssh_host: "localhost".to_string(),
      ssh_port: 22,
      ssh_username: "user".to_string(),
      ssh_auth_method: TunnelAuthMethod::Password {
        password: "pass".to_string(),
      },
      target_host: "localhost".to_string(),
      target_port: 2181,
      trust_unknown_host_key: false,
    };

    assert_eq!(config.ssh_host, "localhost");
    assert_eq!(config.ssh_port, 22);
    assert!(matches!(
      config.ssh_auth_method,
      TunnelAuthMethod::Password { .. }
    ));
  }

  #[test]
  fn test_tunnel_config_key() {
    let config = TunnelConfig {
      ssh_host: "localhost".to_string(),
      ssh_port: 22,
      ssh_username: "user".to_string(),
      ssh_auth_method: TunnelAuthMethod::Key {
        key_path: "/path/to/key".to_string(),
      },
      target_host: "localhost".to_string(),
      target_port: 2181,
      trust_unknown_host_key: false,
    };

    assert!(matches!(
      config.ssh_auth_method,
      TunnelAuthMethod::Key { .. }
    ));
  }

  #[test]
  fn test_expand_tilde() {
    let result = expand_tilde("/absolute/path");
    assert_eq!(result, std::path::PathBuf::from("/absolute/path"));

    // Test with ~ (depends on HOME env)
    if let Ok(home) = std::env::var("HOME") {
      let result = expand_tilde("~/.ssh/id_rsa");
      assert_eq!(result, std::path::PathBuf::from(home).join(".ssh/id_rsa"));
    }
  }

  #[test]
  fn test_parse_server_address() {
    let result = parse_server_with_default("localhost:2181");
    assert_eq!(result.unwrap(), ("localhost".to_string(), 2181));

    let result = parse_server_with_default("localhost");
    assert_eq!(result.unwrap(), ("localhost".to_string(), 2181));

    let result = parse_server_with_default("localhost:notaport");
    assert!(result.is_err());
  }

  fn parse_server_with_default(server: &str) -> Result<(String, u16), String> {
    let parts: Vec<&str> = server.split(':').collect();
    if parts.len() == 2 {
      let host = parts[0].to_string();
      let port: u16 = parts[1].parse().map_err(|_| "Invalid port number")?;
      Ok((host, port))
    } else {
      Ok((server.to_string(), 2181))
    }
  }
}
