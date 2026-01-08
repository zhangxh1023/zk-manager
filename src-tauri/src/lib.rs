use tauri::State;
use tokio::sync::Mutex;
use zookeeper::{WatchedEvent, ZooKeeper};
use std::time::Duration;
use std::sync::Arc;

struct ZkState {
    client: Mutex<Option<Arc<ZooKeeper>>>,
}

#[tauri::command]
async fn connect_zk(state: State<'_, ZkState>, server: String) -> Result<String, String> {
    println!("尝试连接 ZK: {}", server);

    // 使用 spawn_blocking 在后台线程连接，避免阻塞 Tauri 的异步运行时
    // zookeeper crate 是同步的，所以需要 spawn_blocking
    let client_result = tokio::task::spawn_blocking(move || {
        ZooKeeper::connect(&server, Duration::from_secs(5), |e: WatchedEvent| {
            println!("ZK Event: {:?}", e);
        })
    })
    .await
    .map_err(|e| e.to_string())?;

    match client_result {
        Ok(client) => {
            let mut client_lock = state.client.lock().await;
            *client_lock = Some(Arc::new(client));
            Ok("连接成功".into())
        }
        Err(e) => {
            println!("ZK 连接失败: {:?}", e);
            Err(format!("Zookeeper 连接失败: {}", e))
        }
    }
}

#[tauri::command]
async fn list_children(state: State<'_, ZkState>, path: String) -> Result<Vec<String>, String> {
    let client = state.client.lock().await.as_ref().cloned();
    if let Some(client) = client {
        let children = tokio::task::spawn_blocking(move || client.get_children(&path, false))
            .await
            .map_err(|e| e.to_string())? // 处理 JoinError
            .map_err(|e| e.to_string())?; // 处理 Zookeeper Error

        Ok(children)
    } else {
        Err("Not connected".into())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(ZkState {
            client: Mutex::new(None), // 使用具名初始化
        })
        .invoke_handler(tauri::generate_handler![connect_zk, list_children])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
