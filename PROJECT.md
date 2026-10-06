# 项目档案：走马灯行情

## 项目事实

- 类型：面向个人用户的 Windows 桌面 A 股自选行情工具，Tauri 2 + Vite + TypeScript。
- 仓库：https://github.com/dingding-abc/zoumadeng
- 核心流程：启动 → 查看走马灯/列表 → 搜索添加自选 → 调整显示 → 本机保存。支持 JSON 配置备份与恢复。
- 数据边界：前端处理展示、行情适配和设置；Rust 提供窗口、托盘、快捷键及限定域名的股票搜索代理。无自建后端、账户系统或云同步。
- 平台：Windows 10/11 x64；Node.js 22.6+、npm、Rust stable MSVC、Visual Studio C++ Build Tools、WebView2。依赖版本由 `package-lock.json` 和 `src-tauri/Cargo.lock` 固定，Windows 与 WSL 不共用产物。

## 权威实现

| 范围 | 权威入口 |
| --- | --- |
| 设置类型、默认值、兼容策略 | `src/types.ts` |
| 行情与缺失状态 | `src/data/provider.ts`、`src/data/quoteState.ts` |
| 股票搜索 | `src/data/catalog.ts`、`src-tauri/src/lib.rs` |
| 跨窗口请求与并发保存 | `src/windowContract.ts`、`src/settingsSubmission.ts` |
| 配置备份与严格校验 | `src/settingsBackup.ts` |
| 窗口与原生权限 | `src-tauri/tauri.conf.json`、`src-tauri/capabilities/` |

## 关键约束

- 主窗口是本机设置的唯一写入方。添加窗与设置窗通过请求 ID 和定向 ACK 确认结果；重试去重，写入成功后才回复成功。设置保存与恢复保留窗口打开期间新增的自选。
- `open_settings` 和 `open_add_stock` 保持异步命令，避免同步 IPC 创建 WebView2 导致窗口无响应。修改 Rust 后须重启原生开发进程。
- 行情从腾讯公开接口读取，请求失败明确显示演示；部分缺失保留位置并显示 `--`。请求含响应体读取统一 10 秒超时、2 MiB 上限。
- 本机刷新时间与数据源时间区分，数据源日期仅接受有效 14 位时间并标注 `+08:00`。隐藏更新时间不隐藏异常状态。
- 设置位于 `localStorage`，主键 `zoumadeng.settings.v1`，内容版本以 `CURRENT_SETTINGS_VERSION` 为准。备份格式为 `zoumadeng.settings` version 1，最多 128 KiB、200 自选；导入先进入草稿，写入前保存 `.restore-previous` 恢复点。
- 旧 version 8 配置及备份缺少 `showUpdateTime` 时默认显示，无需提高内容版本。
- 浏览器预览使用降级界面，不代表原生窗口、托盘、多屏或文件操作已验收。

## 检查与交付

命令在项目根目录执行：

```powershell
npm ci
npm test
npm run build
cargo check --locked --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
npm run tauri:dev
npm run tauri:build
```

浏览器预览为 `npm run dev`，端口 1421；安装包目录为 `src-tauri/target/release/bundle/`。人工步骤见 `DESIGN_CHECKLIST.md`，旧版实现背景见 `docs/change-2026-09-27.md`。

2026-10-06 开源准备验证：Node.js 24.19.0 / npm 11.17.0 下 39 项测试、TypeScript/Vite 构建、`cargo check --locked` 和 Rust 格式检查通过。Rust 增量缓存硬链接不可用时退回文件复制，未影响检查完成。多 DPI、多屏与真实安装流程仍需人工验证。

## 公开资源

- 原创代码、文档和项目图标采用 MIT；所有者于 2026-10-06 确认图标由本项目 AI 辅助绘制。
- 微信收款图来自所有者提供的微信导出原图，2026-10-06 确认使用；原图与来源记录位于 `assets/donations/`。公开二维码前运行 `scripts/check_wechat.py --root . --require-enabled`，不把文件校验视为付款或平台在线核验。
- 第三方依赖和行情数据不随原创代码许可重新授权，范围见 `THIRD-PARTY-NOTICES.md`。
