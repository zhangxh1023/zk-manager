mod commands;
mod database;
mod error;
mod migrations;
mod models;
mod secrets;
mod ssh_tunnel;
mod state;

use commands::{
  connect_zk, create_node, create_node_recursive, delete_connection_secrets, delete_node,
  delete_node_recursive, disconnect_zk, get_acl, get_connection_secrets, get_data,
  get_znode_details, list_children, search_nodes, set_acl, set_connection_secrets, set_data,
  unwatch_node, watch_node,
};
use state::ZkClient;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(
      tauri_plugin_sql::Builder::default()
        .add_migrations("sqlite:zk-manager-dev.db", migrations::get_migrations())
        .build(),
    )
    .manage(ZkClient::new())
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
      database::reorder_connections,
      database::list_logs,
      database::add_log,
      database::clear_logs,
      database::load_settings,
      database::save_settings
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
