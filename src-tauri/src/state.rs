use std::sync::{Arc, Mutex};
use zookeeper_client::Client;

use crate::error::{internal_error, AppError, AppResult};
use crate::ssh_tunnel;

pub(crate) struct ZkClient {
  pub(crate) clients: Mutex<std::collections::HashMap<String, Arc<Client>>>,
  pub(crate) ssh_tunnels: Mutex<std::collections::HashMap<String, ssh_tunnel::SshTunnel>>,
  pub(crate) watchers: Arc<Mutex<std::collections::HashMap<String, tokio::task::AbortHandle>>>,
}

impl ZkClient {
  pub(crate) fn new() -> Self {
    ZkClient {
      clients: Mutex::new(std::collections::HashMap::new()),
      ssh_tunnels: Mutex::new(std::collections::HashMap::new()),
      watchers: Arc::new(Mutex::new(std::collections::HashMap::new())),
    }
  }
}

pub(crate) fn client_for(
  state: &tauri::State<'_, ZkClient>,
  connection_uuid: &str,
) -> AppResult<Arc<Client>> {
  let guard = state
    .clients
    .lock()
    .map_err(|_| internal_error("Internal client registry lock failed"))?;
  guard
    .get(connection_uuid)
    .cloned()
    .ok_or_else(|| AppError::new("CLIENT_NOT_CONNECTED", "Client is not connected"))
}
