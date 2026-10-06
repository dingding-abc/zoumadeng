# 贡献指南

感谢你帮助改进走马灯行情。问题反馈、文档修正和代码贡献都欢迎。

## 提交问题

请先搜索 [现有 Issues](https://github.com/dingding-abc/zoumadeng/issues)。新问题尽量包含：应用版本、Windows 版本、复现步骤、预期和实际结果。窗口问题请补充屏幕数量与 DPI 缩放；行情问题请说明代码、发生时间和在线/演示状态。

## 本地开发

环境和启动命令见 [README](README.md#从源码运行)。使用 npm 与现有锁文件，原生构建使用 Windows MSVC 工具链。

修改时优先复用现有边界：行情适配集中在 `src/data/provider.ts`，跨窗口契约在 `src/windowContract.ts`，配置备份在 `src/settingsBackup.ts`，原生能力通过 Tauri 命令与前端 `safeInvoke` 访问。保持本机设置由主窗口统一写入。

提交 Pull Request 前执行相关检查：

```powershell
npm test
npm run build
cargo check --locked --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
```

涉及窗口、托盘、快捷键或文件操作时，按 [原生验收清单](DESIGN_CHECKLIST.md) 验证受影响流程。只执行了浏览器预览时，请明确说明原生行为未验证。

PR 描述应说明解决的问题、主要改动与实际验证结果。请保留现有版权声明，不提交依赖目录、构建产物、个人配置、凭据或私钥。新增资源请注明来源和许可；项目原创贡献沿用 [MIT 许可](LICENSE)。
