# zoumadeng 项目约定

## 运行与检查

- 使用 Node.js 22.6+ 和 npm；前端命令在项目根目录执行。
- 项目档案入口为 `PROJECT.md`，开发和贡献入口为 `README.md`、`CONTRIBUTING.md`。
- `npm test` 运行行情、设置备份、自选与跨窗口契约测试；`npm run build` 做 TypeScript 检查和 Vite 生产构建。
- Tauri 命令需要 Windows Rust stable、WebView2 与 Visual Studio C++ Build Tools。

## 代码边界

- 行情接口与解析集中在 `src/data/provider.ts`，替换数据源时保持 `QuoteProvider` 契约。
- 窗口、托盘和快捷键只通过 `src-tauri/src/lib.rs` 的 Tauri 命令暴露，前端调用统一走 `safeInvoke`。
- 用户设置存储在本机 `localStorage`；行情失败必须标记为“演示数据”。
