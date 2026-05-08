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
- [x] 连接配置保存到本地 SQLite 数据库
- [x] 一键连接/断开连接

#### 节点浏览
- [x] 树状列表导航（点击进入子节点）
- [x] Breadcrumb 路径导航
- [x] 快速跳转指定路径
- [x] 刷新当前节点
- [x] 返回上级目录

#### 节点操作
- [x] 查看节点数据（支持 JSON、XML、Text、Hex、Binary 格式）
- [x] 查看节点详情（ACL、Stat 元数据）
- [x] 创建节点（持久节点）
- [x] 删除节点
- [x] 修改节点数据

#### ACL 管理
- [x] 查看节点 ACL
- [x] 修改节点 ACL

#### 辅助功能
- [x] 操作日志记录
- [x] 深色/浅色主题切换
- [x] 界面缩放 (80% - 200%)
- [x] 中英文切换

#### 其他
- [x] 节点数据监控（Watcher）

### 未完成

#### 连接管理
- [ ] 连接池/会话复用优化
- [ ] 连接超时配置

#### 节点操作
- [ ] 批量删除节点
- [ ] 递归创建节点路径
- [ ] 导出/导入节点数据
- [ ] 节点数据比较

#### ACL 管理
- [ ] ACL 模板预设
- [ ] 批量修改 ACL

#### 其他
- [ ] 节点历史版本查看
- [ ] 搜索功能
- [ ] 快捷键支持
- [ ] 导入/导出连接配置

## 项目结构

```
zk-manager/
├── src/                          # Vue 前端源码
│   ├── api/                     # Tauri API 调用封装
│   ├── components/              # Vue 组件
│   │   ├── appMenus/           # 顶部菜单栏
│   │   ├── blocks/             # 布局区块
│   │   ├── dataInspector/      # 数据查看器
│   │   ├── zkTree/            # ZooKeeper 树导航
│   │   └── ui/                 # UI 基础组件
│   ├── stores/                  # Pinia 状态管理
│   ├── types/                   # TypeScript 类型定义
│   ├── utils/                   # 工具函数
│   ├── i18n/                   # 国际化配置
│   └── db/                      # 数据库操作
├── src-tauri/                   # Tauri/Rust 后端源码
│   └── src/
│       ├── lib.rs               # 主库文件和 Tauri 命令
│       ├── ssh_tunnel.rs       # SSH 隧道实现
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
