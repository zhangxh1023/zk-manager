# ZooKeeper Manager

跨平台的 ZooKeeper 图形化管理客户端，基于 Tauri + Vue 3 + TypeScript 构建。

[English](README.md) | 中文版

> ⚠️ **注意：** 本项目仍在积极开发中，部分功能可能不完整或不稳定。

## 功能

### 已完成

#### 连接管理
- [x] 创建、编辑、删除 ZooKeeper 连接
- [x] 用户名/密码认证
- [x] SSH 隧道支持（密码认证、密钥认证）
- [x] 连接元数据保存到本地 SQLite 数据库
- [x] ZooKeeper 和 SSH 密码保存到系统钥匙串
- [x] 一键连接/断开连接

#### 节点浏览
- [x] 树状列表导航（点击进入子节点）
- [x] Breadcrumb 路径导航
- [x] 快速跳转指定路径
- [x] 在当前路径下搜索节点
- [x] 刷新当前节点
- [x] 返回上级目录

#### 节点操作
- [x] 查看节点数据（支持 JSON、XML、Text、Hex、Binary 格式）
- [x] 查看节点详情（ACL、Stat 元数据）
- [x] 创建节点（持久节点）
- [x] 递归创建节点路径
- [x] 删除空节点
- [x] 递归删除节点及其子节点
- [x] 修改节点数据
- [x] 导出/导入节点数据

#### ACL 管理
- [x] 查看节点 ACL
- [x] 修改节点 ACL

#### 辅助功能
- [x] 操作日志记录
- [x] 浅色/深色/跟随系统主题选择
- [x] 界面缩放 (80% - 200%)
- [x] 中英文切换

#### 其他
- [x] 节点数据监控（Watcher）
- [x] 节点 Watch 时间线（临时记录监听期间的节点变化）
- [x] 导入/导出连接配置

### 未完成

#### 连接管理
- [ ] 连接池/会话复用优化
- [ ] 连接超时配置

#### 节点操作
- [ ] 节点数据比较

#### ACL 管理
- [ ] ACL 模板预设
- [ ] 批量修改 ACL

#### 其他
- [ ] 快捷键支持

## 项目结构

```
zk-manager/
├── src/                          # Vue 前端源码
│   ├── api/                     # Tauri API 调用封装
│   ├── components/              # Vue 组件
│   │   ├── appMenus/           # 顶部菜单栏
│   │   ├── blocks/             # 布局区块
│   │   ├── dataInspector/      # 数据查看器
│   │   │   ├── components/     # 数据查看器展示组件
│   │   │   ├── composables/    # 数据查看器业务逻辑
│   │   │   ├── types.ts        # 数据查看器局部类型
│   │   │   └── utils.ts        # 数据查看器纯工具函数
│   │   ├── zkTree/            # ZooKeeper 树导航
│   │   └── ui/                 # UI 基础组件
│   ├── composables/             # 前端共享组合式函数
│   ├── stores/                  # Pinia 状态管理
│   ├── types/                   # TypeScript 类型定义
│   ├── utils/                   # 工具函数
│   ├── lib/                     # 前端共享工具
│   └── i18n/                    # 国际化配置
├── src-tauri/                   # Tauri/Rust 后端源码
│   └── src/
│       ├── commands/            # Tauri 命令分组
│       │   ├── connection.rs    # ZooKeeper 连接和密钥命令
│       │   ├── node.rs          # 节点数据、ACL、创建删除命令
│       │   └── watch.rs         # 节点 Watch 命令
│       ├── lib.rs               # Tauri 启动、插件注册和命令注册
│       ├── error.rs             # 应用错误类型和错误转换
│       ├── models.rs            # 后端请求/响应和 ZooKeeper 类型
│       ├── state.rs             # ZooKeeper 客户端、隧道和 Watcher 状态
│       ├── database.rs          # SQLite 持久化
│       ├── secrets.rs           # 系统钥匙串集成
│       ├── ssh_tunnel.rs        # SSH 隧道实现
│       └── migrations.rs        # 数据库迁移
└── dist/                        # 构建输出
```

## 开发

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm dev

# 构建生产版本
pnpm build

# 运行测试
pnpm test
```

## 构建桌面应用

```bash
# 开发桌面应用
pnpm tauri dev

# 构建桌面应用安装包
pnpm tauri build
```
