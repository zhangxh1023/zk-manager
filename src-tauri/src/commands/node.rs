use std::collections::VecDeque;

use zookeeper_client::{Acl, Acls, AuthId, CreateMode, Permission};

use crate::error::{zk_error, AppError, AppResult};
use crate::models::{ZkAclEntry, ZnodeDetails, ZnodeSearchResult};
use crate::state::{client_for, ZkClient};

#[tauri::command]
pub(crate) async fn list_children(
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
pub(crate) async fn search_nodes(
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

#[tauri::command]
pub(crate) async fn get_data(
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
pub(crate) async fn get_acl(
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
pub(crate) async fn get_znode_details(
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
pub(crate) async fn set_data(
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
pub(crate) async fn delete_node(
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
pub(crate) async fn delete_node_recursive(
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
pub(crate) async fn create_node(
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
pub(crate) async fn create_node_recursive(
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
pub(crate) async fn set_acl(
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
