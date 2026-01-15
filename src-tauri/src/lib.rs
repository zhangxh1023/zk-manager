use std::sync::{Arc, Mutex};
use zookeeper_client::Client;
mod migrations;

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
async fn get_data(state: tauri::State<'_, ZkClient>, path: String) -> Result<String, String> {
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
  let (data, _) = client_arc.get_data(&path).await.unwrap();
  let data_str =
    String::from_utf8(data).map_err(|e| format!("数据不是有效的 UTF-8 格式: {}", e))?;
  Ok(data_str)
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
      get_data
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
