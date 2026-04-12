use tauri_plugin_sql::{Migration, MigrationKind};

pub fn get_migrations() -> Vec<Migration> {
  vec![
    Migration {
      version: 1,
      description: "create_initial_tables",
      sql: include_str!("./migrations/v1.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 2,
      description: "add_auth_and_settings_tables",
      sql: include_str!("./migrations/v2.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 3,
      description: "add_success_to_logs",
      sql: include_str!("./migrations/v3.sql"),
      kind: MigrationKind::Up,
    },
  ]
}