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
    Migration {
      version: 4,
      description: "add_ssh_tunnel_config",
      sql: include_str!("./migrations/v4.sql"),
      kind: MigrationKind::Up,
    },
    Migration {
      version: 5,
      description: "add_connection_sort_order",
      sql: include_str!("./migrations/v5.sql"),
      kind: MigrationKind::Up,
    },
  ]
}
