# 第三方组件与资源

本项目根目录的 MIT 许可覆盖原创代码、文档和项目图标。依赖、行情内容及微信收款图遵循各自的使用范围。

| 组件或资源 | 用途 | 上游与许可 | 分发核对 |
| --- | --- | --- | --- |
| Tauri 2、`@tauri-apps/api`、Tauri CLI、全局快捷键插件 | Windows 桌面外壳及前端 API | [Tauri](https://github.com/tauri-apps/tauri)，Apache-2.0 OR MIT；版本以 `Cargo.lock` 与 `package-lock.json` 为准 | 安装包发布前核对最终依赖树并随包提供适用许可正文 |
| Vite 7 | 前端构建 | [Vite](https://github.com/vitejs/vite)，MIT；版本以 `package-lock.json` 为准 | 开发工具通常不直接随安装包分发 |
| TypeScript 5 | 类型检查 | [TypeScript](https://github.com/microsoft/TypeScript)，Apache-2.0；版本以 `package-lock.json` 为准 | 开发工具通常不直接随安装包分发 |
| 腾讯公开行情与股票建议 | 运行时数据请求 | `qt.gtimg.cn`、`smartbox.gtimg.cn`；数据使用和再分发许可待核实 | 不将数据纳入本项目 MIT 授权；发布或商业使用前核对服务条款 |
| `src-tauri/icons/` | 应用图标与安装包图标 | 所有者于 2026-10-06 确认为本项目 AI 辅助绘制的原创素材，按 MIT 提供 | 包含源图及各平台导出尺寸 |
| `assets/donations/wechat-receive.png` | README 自愿支持入口 | 所有者提供并确认的微信导出收款图；第三方标识归各自权利人 | 仅用于向本项目作者提供支持，不纳入 MIT 素材授权；来源和摘要见同目录 README |

Windows WebView2、系统字体和系统组件由用户环境提供。依赖的完整许可与版权声明应以最终锁文件对应的版本核对；此表不能替代安装包所需的第三方许可正文。发布附件中的依赖许可材料及其覆盖范围以该 Release 说明为准。
