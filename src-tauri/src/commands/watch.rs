use tauri::Emitter;
use zookeeper_client::EventType;

use crate::error::{internal_error, zk_error, AppResult};
use crate::models::WatchEvent;
use crate::state::{client_for, ZkClient};

#[tauri::command]
pub(crate) async fn watch_node(
  app: tauri::AppHandle,
  state: tauri::State<'_, ZkClient>,
  connection_uuid: String,
  path: String,
) -> AppResult<String> {
  let watch_key = format!("{}:{}", connection_uuid, path);

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

  let (data, stat, watcher) = client_arc
    .get_and_watch_data(&path)
    .await
    .map_err(|e| zk_error(e, "Failed to watch node"))?;

  let (acl, _) = client_arc
    .get_acl(&path)
    .await
    .map_err(|e| zk_error(e, "Failed to read ACL"))?;

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

    let key = format!("{}:{}", conn_uuid, node_path);
    if let Ok(mut watchers) = watchers_arc.lock() {
      watchers.remove(&key);
    }
  });

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
pub(crate) async fn unwatch_node(
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
