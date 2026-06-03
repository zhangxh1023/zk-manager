# ZooKeeper Manager

A cross-platform ZooKeeper GUI client built with Tauri + Vue 3 + TypeScript.

[中文版](README_zh.md) | English

> ⚠️ **Note:** This project is still under active development. Some features may be incomplete or unstable.

## Features

### Completed

#### Connection Management
- [x] Create, edit, delete ZooKeeper connections
- [x] Username/password authentication
- [x] SSH tunnel support (password auth, key auth)
- [x] Save connection metadata to local SQLite database
- [x] Store ZooKeeper and SSH passwords in the system keychain
- [x] One-click connect/disconnect

#### Node Browsing
- [x] Tree list navigation (click to enter child nodes)
- [x] Breadcrumb path navigation
- [x] Quick jump to specified path
- [x] Search nodes under the current path
- [x] Refresh current node
- [x] Navigate to parent directory

#### Node Operations
- [x] View node data (JSON, XML, Text, Hex, Binary formats)
- [x] View node details (ACL, Stat metadata)
- [x] Create node (persistent node)
- [x] Recursive node path creation
- [x] Delete node, including recursive delete for non-empty nodes
- [x] Modify node data
- [x] Export/import node data

#### ACL Management
- [x] View node ACL
- [x] Modify node ACL

#### Auxiliary Features
- [x] Operation log history
- [x] Light/dark/system theme selection
- [x] UI scaling (80% - 200%)
- [x] Chinese/English language toggle

#### Others
- [x] Node data monitoring (Watcher)
- [x] Node watch timeline (temporarily records node changes while watching)
- [x] Import/export connection configurations

### Incomplete

#### Connection Management
- [ ] Connection pool/session reuse optimization
- [ ] Connection timeout configuration

#### Node Operations
- [ ] Batch delete nodes
- [ ] Node data comparison

#### ACL Management
- [ ] ACL template presets
- [ ] Batch ACL modification

#### Others
- [ ] Keyboard shortcuts

## Project Structure

```
zk-manager/
├── src/                          # Vue frontend source
│   ├── api/                     # Tauri API wrappers
│   ├── components/              # Vue components
│   │   ├── appMenus/           # Top menu bar
│   │   ├── blocks/             # Layout blocks
│   │   ├── dataInspector/      # Data inspector
│   │   │   ├── components/     # Data inspector view components
│   │   │   ├── composables/    # Data inspector business logic
│   │   │   ├── types.ts        # Data inspector local types
│   │   │   └── utils.ts        # Data inspector pure utilities
│   │   ├── zkTree/            # ZooKeeper tree navigation
│   │   └── ui/                 # Base UI components
│   ├── composables/             # Shared frontend composables
│   ├── stores/                  # Pinia state management
│   ├── types/                   # TypeScript type definitions
│   ├── utils/                   # Utility functions
│   ├── lib/                     # Shared frontend helpers
│   └── i18n/                    # Internationalization config
├── src-tauri/                   # Tauri/Rust backend source
│   └── src/
│       ├── commands/            # Grouped Tauri commands
│       │   ├── connection.rs    # ZooKeeper connection and secrets commands
│       │   ├── node.rs          # Node data, ACL, create/delete commands
│       │   └── watch.rs         # Node watch commands
│       ├── lib.rs               # Tauri startup, plugins, and command registry
│       ├── error.rs             # App error type and error mapping
│       ├── models.rs            # Backend request/response and ZooKeeper types
│       ├── state.rs             # ZooKeeper client, tunnel, and watcher state
│       ├── database.rs          # SQLite persistence
│       ├── secrets.rs           # System keychain integration
│       ├── ssh_tunnel.rs        # SSH tunnel implementation
│       └── migrations.rs         # Database migrations
└── dist/                        # Build output
```

## Development

```bash
# Install dependencies
pnpm install

# Development mode
pnpm dev

# Build for production
pnpm build

# Run tests
pnpm test
```

## Build Desktop App

```bash
# Develop desktop app
pnpm tauri dev

# Build desktop app installer
pnpm tauri build
```
