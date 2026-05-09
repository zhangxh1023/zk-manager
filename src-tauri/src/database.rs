use crate::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{Row, SqlitePool};
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

const DB_NAME: &str = "zk-manager-dev.db";

#[derive(Serialize)]
pub(crate) struct DbConnectionRow {
  uuid: String,
  name: String,
  url: String,
  username: Option<String>,
  password: Option<String>,
  use_ssh: i64,
  ssh_host: Option<String>,
  ssh_port: Option<i64>,
  ssh_username: Option<String>,
  ssh_auth_method: Option<String>,
  ssh_password: Option<String>,
  ssh_key_path: Option<String>,
}

#[derive(Serialize)]
pub(crate) struct ConnectionLegacySecrets {
  password: Option<String>,
  ssh_password: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct DbConnectionInput {
  uuid: String,
  name: String,
  url: String,
  username: Option<String>,
  use_ssh: Option<bool>,
  ssh_host: Option<String>,
  ssh_port: Option<i64>,
  ssh_username: Option<String>,
  ssh_auth_method: Option<String>,
  ssh_key_path: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LogEntry {
  id: i64,
  timestamp: i64,
  connection_name: String,
  command: String,
  details: Option<String>,
  success: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LogsPage {
  logs: Vec<LogEntry>,
  total_count: i64,
}

#[derive(Serialize)]
pub(crate) struct SettingRow {
  key: String,
  value: String,
}

#[derive(Deserialize)]
pub(crate) struct AppSettingsInput {
  language: String,
  theme: String,
  scale: f64,
}

fn db_error(error: impl std::fmt::Display) -> AppError {
  AppError::with_detail("DB_ERROR", "Database operation failed", error.to_string())
}

async fn db_pool(app: &tauri::AppHandle) -> AppResult<SqlitePool> {
  let app_path = app.path().app_config_dir().map_err(|error| {
    AppError::with_detail(
      "DB_PATH_ERROR",
      "Failed to resolve database path",
      error.to_string(),
    )
  })?;
  fs::create_dir_all(&app_path).map_err(|error| {
    AppError::with_detail(
      "DB_PATH_ERROR",
      "Failed to create database directory",
      error.to_string(),
    )
  })?;
  let path = app_path.join(DB_NAME);
  let options = SqliteConnectOptions::new()
    .filename(path)
    .create_if_missing(true);

  SqlitePoolOptions::new()
    .max_connections(1)
    .connect_with(options)
    .await
    .map_err(db_error)
}

async fn list_connections_with_pool(pool: &SqlitePool) -> AppResult<Vec<DbConnectionRow>> {
  let rows = sqlx::query(
    r#"
    SELECT
      uuid, name, url, username, password, use_ssh, ssh_host, ssh_port,
      ssh_username, ssh_auth_method, ssh_password, ssh_key_path
    FROM connections
    ORDER BY id ASC
    "#,
  )
  .fetch_all(pool)
  .await
  .map_err(db_error)?;

  Ok(
    rows
      .into_iter()
      .map(|row| DbConnectionRow {
        uuid: row.get("uuid"),
        name: row.try_get("name").unwrap_or_default(),
        url: row.get("url"),
        username: row.get("username"),
        password: row.get("password"),
        use_ssh: row.try_get("use_ssh").unwrap_or(0),
        ssh_host: row.get("ssh_host"),
        ssh_port: row.get("ssh_port"),
        ssh_username: row.get("ssh_username"),
        ssh_auth_method: row.get("ssh_auth_method"),
        ssh_password: row.get("ssh_password"),
        ssh_key_path: row.get("ssh_key_path"),
      })
      .collect(),
  )
}

async fn get_connection_legacy_secrets_with_pool(
  pool: &SqlitePool,
  uuid: &str,
) -> AppResult<ConnectionLegacySecrets> {
  let row = sqlx::query("SELECT password, ssh_password FROM connections WHERE uuid = ?")
    .bind(uuid)
    .fetch_optional(pool)
    .await
    .map_err(db_error)?;

  Ok(ConnectionLegacySecrets {
    password: row.as_ref().and_then(|row| row.get("password")),
    ssh_password: row.as_ref().and_then(|row| row.get("ssh_password")),
  })
}

async fn clear_legacy_connection_secret_with_pool(
  pool: &SqlitePool,
  uuid: &str,
  secret_key: &str,
) -> AppResult<()> {
  let column = match secret_key {
    "password" => "password",
    "ssh_password" => "ssh_password",
    _ => return Err(AppError::new("VALIDATION_ERROR", "Unknown secret key")),
  };
  let sql = format!("UPDATE connections SET {column} = NULL WHERE uuid = ?");
  sqlx::query(&sql)
    .bind(uuid)
    .execute(pool)
    .await
    .map_err(db_error)?;
  Ok(())
}

async fn insert_connection_with_pool(
  pool: &SqlitePool,
  connection: DbConnectionInput,
) -> AppResult<()> {
  sqlx::query(
    r#"
    INSERT INTO connections (
      uuid, name, url, username, password, use_ssh, ssh_host, ssh_port,
      ssh_username, ssh_auth_method, ssh_password, ssh_key_path
    ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, NULL, ?)
    "#,
  )
  .bind(connection.uuid)
  .bind(connection.name)
  .bind(connection.url)
  .bind(connection.username)
  .bind(if connection.use_ssh.unwrap_or(false) {
    1
  } else {
    0
  })
  .bind(if connection.use_ssh.unwrap_or(false) {
    connection.ssh_host
  } else {
    None
  })
  .bind(if connection.use_ssh.unwrap_or(false) {
    connection.ssh_port
  } else {
    None
  })
  .bind(if connection.use_ssh.unwrap_or(false) {
    connection.ssh_username
  } else {
    None
  })
  .bind(if connection.use_ssh.unwrap_or(false) {
    connection.ssh_auth_method.clone()
  } else {
    None
  })
  .bind(
    if connection.use_ssh.unwrap_or(false) && connection.ssh_auth_method.as_deref() == Some("key") {
      connection.ssh_key_path
    } else {
      None
    },
  )
  .execute(pool)
  .await
  .map_err(db_error)?;
  Ok(())
}

async fn update_connection_with_pool(
  pool: &SqlitePool,
  connection: DbConnectionInput,
) -> AppResult<()> {
  sqlx::query(
    r#"
    UPDATE connections SET
      name = ?,
      url = ?,
      username = ?,
      password = NULL,
      use_ssh = ?,
      ssh_host = ?,
      ssh_port = ?,
      ssh_username = ?,
      ssh_auth_method = ?,
      ssh_password = NULL,
      ssh_key_path = ?
    WHERE uuid = ?
    "#,
  )
  .bind(connection.name)
  .bind(connection.url)
  .bind(connection.username)
  .bind(if connection.use_ssh.unwrap_or(false) {
    1
  } else {
    0
  })
  .bind(if connection.use_ssh.unwrap_or(false) {
    connection.ssh_host
  } else {
    None
  })
  .bind(if connection.use_ssh.unwrap_or(false) {
    connection.ssh_port
  } else {
    None
  })
  .bind(if connection.use_ssh.unwrap_or(false) {
    connection.ssh_username
  } else {
    None
  })
  .bind(if connection.use_ssh.unwrap_or(false) {
    connection.ssh_auth_method.clone()
  } else {
    None
  })
  .bind(
    if connection.use_ssh.unwrap_or(false) && connection.ssh_auth_method.as_deref() == Some("key") {
      connection.ssh_key_path
    } else {
      None
    },
  )
  .bind(connection.uuid)
  .execute(pool)
  .await
  .map_err(db_error)?;
  Ok(())
}

async fn delete_connection_with_pool(pool: &SqlitePool, uuid: &str) -> AppResult<()> {
  sqlx::query("DELETE FROM connections WHERE uuid = ?")
    .bind(uuid)
    .execute(pool)
    .await
    .map_err(db_error)?;
  Ok(())
}

async fn list_logs_with_pool(pool: &SqlitePool, page: i64, page_size: i64) -> AppResult<LogsPage> {
  let page = page.max(1);
  let page_size = page_size.clamp(1, 200);
  let offset = (page - 1) * page_size;
  let total_count = sqlx::query("SELECT COUNT(*) AS cnt FROM logs")
    .fetch_one(pool)
    .await
    .map_err(db_error)?
    .get("cnt");
  let rows = sqlx::query(
    r#"
    SELECT id, timestamp, connectionName, command, details, success
    FROM logs
    ORDER BY timestamp DESC
    LIMIT ? OFFSET ?
    "#,
  )
  .bind(page_size)
  .bind(offset)
  .fetch_all(pool)
  .await
  .map_err(db_error)?;

  Ok(LogsPage {
    total_count,
    logs: rows
      .into_iter()
      .map(|row| LogEntry {
        id: row.get("id"),
        timestamp: row.get("timestamp"),
        connection_name: row.get("connectionName"),
        command: row.get("command"),
        details: row.get("details"),
        success: row.get::<i64, _>("success") != 0,
      })
      .collect(),
  })
}

async fn add_log_with_pool(
  pool: &SqlitePool,
  connection_name: String,
  command: String,
  details: String,
  success: bool,
  timestamp: i64,
) -> AppResult<()> {
  sqlx::query(
    "INSERT INTO logs (timestamp, connectionName, command, details, success) VALUES (?, ?, ?, ?, ?)",
  )
  .bind(timestamp)
  .bind(connection_name)
  .bind(command)
  .bind(details)
  .bind(if success { 1 } else { 0 })
  .execute(pool)
  .await
  .map_err(db_error)?;
  Ok(())
}

async fn clear_logs_with_pool(pool: &SqlitePool) -> AppResult<()> {
  sqlx::query("DELETE FROM logs")
    .execute(pool)
    .await
    .map_err(db_error)?;
  Ok(())
}

async fn load_settings_with_pool(pool: &SqlitePool) -> AppResult<Vec<SettingRow>> {
  let rows = sqlx::query("SELECT key, value FROM settings")
    .fetch_all(pool)
    .await
    .map_err(db_error)?;
  Ok(
    rows
      .into_iter()
      .map(|row| SettingRow {
        key: row.get("key"),
        value: row.get("value"),
      })
      .collect(),
  )
}

async fn save_settings_with_pool(pool: &SqlitePool, settings: AppSettingsInput) -> AppResult<()> {
  for (key, value) in [
    ("language", settings.language),
    ("theme", settings.theme),
    ("scale", settings.scale.to_string()),
  ] {
    sqlx::query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
      .bind(key)
      .bind(value)
      .execute(pool)
      .await
      .map_err(db_error)?;
  }
  Ok(())
}

#[tauri::command]
pub(crate) async fn list_connections(app: tauri::AppHandle) -> AppResult<Vec<DbConnectionRow>> {
  let pool = db_pool(&app).await?;
  list_connections_with_pool(&pool).await
}

#[tauri::command]
pub(crate) async fn get_connection_legacy_secrets(
  app: tauri::AppHandle,
  uuid: String,
) -> AppResult<ConnectionLegacySecrets> {
  let pool = db_pool(&app).await?;
  get_connection_legacy_secrets_with_pool(&pool, &uuid).await
}

#[tauri::command]
pub(crate) async fn clear_legacy_connection_secret(
  app: tauri::AppHandle,
  uuid: String,
  secret_key: String,
) -> AppResult<()> {
  let pool = db_pool(&app).await?;
  clear_legacy_connection_secret_with_pool(&pool, &uuid, &secret_key).await
}

#[tauri::command]
pub(crate) async fn insert_connection(
  app: tauri::AppHandle,
  connection: DbConnectionInput,
) -> AppResult<()> {
  let pool = db_pool(&app).await?;
  insert_connection_with_pool(&pool, connection).await
}

#[tauri::command]
pub(crate) async fn update_connection(
  app: tauri::AppHandle,
  connection: DbConnectionInput,
) -> AppResult<()> {
  let pool = db_pool(&app).await?;
  update_connection_with_pool(&pool, connection).await
}

#[tauri::command]
pub(crate) async fn delete_connection(app: tauri::AppHandle, uuid: String) -> AppResult<()> {
  let pool = db_pool(&app).await?;
  delete_connection_with_pool(&pool, &uuid).await
}

#[tauri::command]
pub(crate) async fn list_logs(
  app: tauri::AppHandle,
  page: i64,
  page_size: i64,
) -> AppResult<LogsPage> {
  let pool = db_pool(&app).await?;
  list_logs_with_pool(&pool, page, page_size).await
}

#[tauri::command]
pub(crate) async fn add_log(
  app: tauri::AppHandle,
  connection_name: String,
  command: String,
  details: String,
  success: bool,
) -> AppResult<()> {
  let timestamp = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map_err(|error| {
      AppError::with_detail(
        "TIME_ERROR",
        "Failed to read system time",
        error.to_string(),
      )
    })?
    .as_millis() as i64;
  let pool = db_pool(&app).await?;
  add_log_with_pool(&pool, connection_name, command, details, success, timestamp).await
}

#[tauri::command]
pub(crate) async fn clear_logs(app: tauri::AppHandle) -> AppResult<()> {
  let pool = db_pool(&app).await?;
  clear_logs_with_pool(&pool).await
}

#[tauri::command]
pub(crate) async fn load_settings(app: tauri::AppHandle) -> AppResult<Vec<SettingRow>> {
  let pool = db_pool(&app).await?;
  load_settings_with_pool(&pool).await
}

#[tauri::command]
pub(crate) async fn save_settings(
  app: tauri::AppHandle,
  settings: AppSettingsInput,
) -> AppResult<()> {
  let pool = db_pool(&app).await?;
  save_settings_with_pool(&pool, settings).await
}

#[cfg(test)]
mod tests {
  use super::*;

  async fn test_pool() -> SqlitePool {
    let pool = SqlitePoolOptions::new()
      .max_connections(1)
      .connect("sqlite::memory:")
      .await
      .unwrap();

    sqlx::query(
      r#"
      CREATE TABLE connections (
        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        uuid TEXT NOT NULL,
        url TEXT NOT NULL,
        name TEXT,
        username TEXT,
        password TEXT,
        use_ssh INTEGER DEFAULT 0,
        ssh_host TEXT,
        ssh_port INTEGER DEFAULT 22,
        ssh_username TEXT,
        ssh_auth_method TEXT DEFAULT 'password',
        ssh_password TEXT,
        ssh_key_path TEXT
      );
      "#,
    )
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query(
      r#"
      CREATE TABLE settings (
        key TEXT NOT NULL PRIMARY KEY,
        value TEXT NOT NULL
      );
      "#,
    )
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query(
      r#"
      CREATE TABLE logs (
        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        connectionName TEXT NOT NULL,
        command TEXT NOT NULL,
        details TEXT,
        success INTEGER DEFAULT 1
      );
      "#,
    )
    .execute(&pool)
    .await
    .unwrap();

    pool
  }

  fn connection_input(uuid: &str, use_ssh: bool) -> DbConnectionInput {
    DbConnectionInput {
      uuid: uuid.to_string(),
      name: "Local".to_string(),
      url: "localhost:2181".to_string(),
      username: Some("zk-user".to_string()),
      use_ssh: Some(use_ssh),
      ssh_host: Some("ssh.example.com".to_string()),
      ssh_port: Some(22),
      ssh_username: Some("deploy".to_string()),
      ssh_auth_method: Some("key".to_string()),
      ssh_key_path: Some("~/.ssh/id_ed25519".to_string()),
    }
  }

  #[tokio::test]
  async fn connection_crud_preserves_ssh_fields_and_clears_secrets() {
    let pool = test_pool().await;

    insert_connection_with_pool(&pool, connection_input("conn-1", true))
      .await
      .unwrap();

    sqlx::query("UPDATE connections SET password = ?, ssh_password = ? WHERE uuid = ?")
      .bind("legacy-zk")
      .bind("legacy-ssh")
      .bind("conn-1")
      .execute(&pool)
      .await
      .unwrap();

    let connections = list_connections_with_pool(&pool).await.unwrap();
    assert_eq!(connections.len(), 1);
    assert_eq!(connections[0].uuid, "conn-1");
    assert_eq!(connections[0].use_ssh, 1);
    assert_eq!(
      connections[0].ssh_key_path.as_deref(),
      Some("~/.ssh/id_ed25519")
    );

    let secrets = get_connection_legacy_secrets_with_pool(&pool, "conn-1")
      .await
      .unwrap();
    assert_eq!(secrets.password.as_deref(), Some("legacy-zk"));
    assert_eq!(secrets.ssh_password.as_deref(), Some("legacy-ssh"));

    clear_legacy_connection_secret_with_pool(&pool, "conn-1", "password")
      .await
      .unwrap();
    let secrets = get_connection_legacy_secrets_with_pool(&pool, "conn-1")
      .await
      .unwrap();
    assert_eq!(secrets.password, None);
    assert_eq!(secrets.ssh_password.as_deref(), Some("legacy-ssh"));

    let mut updated = connection_input("conn-1", false);
    updated.name = "No SSH".to_string();
    updated.username = None;
    update_connection_with_pool(&pool, updated).await.unwrap();

    let connections = list_connections_with_pool(&pool).await.unwrap();
    assert_eq!(connections[0].name, "No SSH");
    assert_eq!(connections[0].username, None);
    assert_eq!(connections[0].use_ssh, 0);
    assert_eq!(connections[0].ssh_host, None);
    assert_eq!(connections[0].ssh_key_path, None);

    delete_connection_with_pool(&pool, "conn-1").await.unwrap();
    assert!(list_connections_with_pool(&pool).await.unwrap().is_empty());
  }

  #[tokio::test]
  async fn clear_legacy_secret_rejects_unknown_keys() {
    let pool = test_pool().await;
    let error = clear_legacy_connection_secret_with_pool(&pool, "conn-1", "token")
      .await
      .unwrap_err();

    assert_eq!(error.code, "VALIDATION_ERROR");
  }

  #[tokio::test]
  async fn logs_are_paginated_and_clearable() {
    let pool = test_pool().await;

    add_log_with_pool(
      &pool,
      "conn".to_string(),
      "CONNECT".to_string(),
      "first".to_string(),
      true,
      100,
    )
    .await
    .unwrap();
    add_log_with_pool(
      &pool,
      "conn".to_string(),
      "DELETE".to_string(),
      "second".to_string(),
      false,
      200,
    )
    .await
    .unwrap();

    let first_page = list_logs_with_pool(&pool, 1, 1).await.unwrap();
    assert_eq!(first_page.total_count, 2);
    assert_eq!(first_page.logs.len(), 1);
    assert_eq!(first_page.logs[0].details.as_deref(), Some("second"));
    assert!(!first_page.logs[0].success);

    let second_page = list_logs_with_pool(&pool, 2, 1).await.unwrap();
    assert_eq!(second_page.logs[0].details.as_deref(), Some("first"));
    assert!(second_page.logs[0].success);

    clear_logs_with_pool(&pool).await.unwrap();
    let empty = list_logs_with_pool(&pool, 1, 20).await.unwrap();
    assert_eq!(empty.total_count, 0);
    assert!(empty.logs.is_empty());
  }

  #[tokio::test]
  async fn settings_are_saved_and_overwritten() {
    let pool = test_pool().await;

    save_settings_with_pool(
      &pool,
      AppSettingsInput {
        language: "zh".to_string(),
        theme: "dark".to_string(),
        scale: 1.25,
      },
    )
    .await
    .unwrap();
    save_settings_with_pool(
      &pool,
      AppSettingsInput {
        language: "en".to_string(),
        theme: "system".to_string(),
        scale: 1.0,
      },
    )
    .await
    .unwrap();

    let mut settings = load_settings_with_pool(&pool).await.unwrap();
    settings.sort_by(|left, right| left.key.cmp(&right.key));

    assert_eq!(settings.len(), 3);
    assert_eq!(settings[0].key, "language");
    assert_eq!(settings[0].value, "en");
    assert_eq!(settings[1].key, "scale");
    assert_eq!(settings[1].value, "1");
    assert_eq!(settings[2].key, "theme");
    assert_eq!(settings[2].value, "system");
  }
}
