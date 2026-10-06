<p align="center">
  <img src="src-tauri/icons/128x128.png" width="88" height="88" alt="走马灯行情图标" />
</p>

<h1 align="center">走马灯行情</h1>

<p align="center">把自选行情放在桌面一角。</p>
<p align="center">Windows 桌面 · A 股自选 · 透明悬浮 · MIT 开源</p>

<p align="center">
  <a href="https://github.com/dingding-abc/zoumadeng/releases">下载安装</a> ·
  <a href="#开始使用">使用说明</a> ·
  <a href="#从源码运行">源码开发</a> ·
  <a href="https://github.com/dingding-abc/zoumadeng/issues">反馈问题</a> ·
  <a href="#支持项目">支持项目</a>
</p>

走马灯行情是一款轻量的 Windows 桌面行情工具。把关心的股票和指数加入自选，用横向滚动或紧凑列表查看行情，并按桌面习惯调整颜色、透明度、字号和显示字段。

## 功能

| 功能 | 说明 |
| --- | --- |
| 两种视图 | 横向走马灯与紧凑列表，窗口宽度随显示字段调整 |
| 快速添加 | 按股票代码、中文名称或拼音首字母搜索，在独立窗口中添加 |
| 自选管理 | 删除、置顶、上移、下移、置底；列表表头可隐藏 |
| 自定义外观 | 背景与文字透明度、涨跌颜色、字号、滚动速度、程序框 |
| 按需显示 | 代码、名称、价格、涨幅、涨跌、换手、成交量、成交额，共八种字段 |
| 桌面常驻 | 托盘菜单与 `Alt+1` 快捷键，随时显示或隐藏主窗口 |
| 配置备份 | JSON 导入导出；导入先预览草稿，保存后生效，并保留导入前恢复点 |
| 明确的数据状态 | 显示刷新时间、缺失行情与网络异常；演示数据始终有标记 |

## 下载安装

前往 [GitHub Releases](https://github.com/dingding-abc/zoumadeng/releases) 下载 Windows x64 安装包，选择名称以 `-setup.exe` 结尾的文件。`Source code` 压缩包用于源码开发。

- 运行环境：Windows 10/11（64 位）、Microsoft WebView2 Runtime。
- 每个版本的安装包、构建说明和 SHA-256 校验值均以对应 Release 为准。
- 安装后从开始菜单启动「走马灯行情」。关闭主窗口会隐藏到托盘，完全退出请使用右键或托盘菜单的「退出应用」。

可在 PowerShell 中核对下载文件的摘要，与 Release 附带的 `SHA256SUMS.txt` 比较：

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath '.\zoumadeng_0.1.0_x64-setup.exe'
```

## 开始使用

首次启动默认显示上证指数、深圳成指、创业板指和科创综指，字段为代码与涨幅。程序框默认隐藏，**在行情上点击右键即可打开操作菜单**。

1. **添加自选**：右键选择「添加股票」，或在显示程序框时点击 `＋`。输入代码、名称或简称拼音首字母，选择结果即可添加。支持 `↑`、`↓`、`Enter` 和 `Esc`。
2. **切换视图**：通过右键菜单切换走马灯与列表。在列表中右键股票可调整顺序；两种视图均可删除股票。
3. **调整外观**：右键选择「打开设置」，调整显示字段、配色、透明度、字号和速度，点击「保存设置」生效。取消会撤销本次草稿。
4. **显示或隐藏**：`Alt+1` 切换主窗口，托盘菜单也可恢复窗口。右键可分别控制程序框和更新时间的显示。

更详细的备份、恢复与异常状态说明见 [使用指南](docs/usage.md)。

## 行情与本地数据

行情来自腾讯公开接口 `qt.gtimg.cn`，搜索建议来自 `smartbox.gtimg.cn`。桌面版通过限定域名的原生命令请求搜索建议。接口异常时，行情明确显示「演示数据」；仅部分股票缺失时，对应字段显示 `--`。离线搜索仅覆盖内置常用股票目录。

状态条显示的是本机刷新时间，悬停股票可查看数据源时间。隐藏更新时间后，缺失和演示状态仍会显示。数据可能延迟或不可用，请勿将其作为唯一交易依据。

自选和设置保存在本机 WebView 的 `localStorage`，没有云同步。清理应用数据或更换 Windows 用户可能导致配置丢失，建议通过设置窗口导出备份。配置文件含自选清单，分享前请自行检查。

## 从源码运行

技术栈为 **Tauri 2 + TypeScript + Vite**。请在 Windows 上准备：

- Node.js 22.6+ 和 npm；依赖版本以 `package-lock.json` 为准。
- Rust stable 的 MSVC 工具链；Rust 依赖以 `src-tauri/Cargo.lock` 为准。
- Visual Studio C++ Build Tools（C++ 桌面开发工作负载）和 WebView2 Runtime。

在 PowerShell 中执行：

```powershell
git clone https://github.com/dingding-abc/zoumadeng.git
cd zoumadeng
npm ci
npm run tauri:dev
```

`npm run dev` 可单独启动浏览器预览，默认地址为 `http://127.0.0.1:1421`。浏览器预览不包含原生窗口、托盘和全局快捷键；在线接口是否可用取决于跨域许可。请勿在 WSL 和 Windows 之间共用 `node_modules` 或 Rust `target`。

### 检查与打包

```powershell
npm test
npm run build
cargo check --locked --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
npm run tauri:build
```

安装包输出到 `src-tauri/target/release/bundle/`。`dist/` 是前端构建产物，不能单独作为桌面应用安装。

### 项目结构

| 路径 | 职责 |
| --- | --- |
| `src/main.ts` | 主窗口、添加窗口和设置窗口的交互 |
| `src/types.ts` | 设置类型、默认值与版本兼容 |
| `src/windowContract.ts` | 跨窗口消息校验、去重和并发保存规则 |
| `src/settingsBackup.ts` | 配置导入导出与输入校验 |
| `src/data/` | 股票目录、行情适配与自选管理 |
| `src-tauri/src/lib.rs` | 原生窗口、托盘、快捷键和受限搜索代理 |
| `tests/` | 行情、设置、自选与窗口消息行为测试 |

开发边界见 [项目档案](PROJECT.md)，人工回归步骤见 [界面与原生验收清单](DESIGN_CHECKLIST.md)。

## 反馈与贡献

欢迎在 [Issues](https://github.com/dingding-abc/zoumadeng/issues) 提交问题或建议。反馈时请附上应用版本、Windows 版本、复现步骤，以及必要的截图；多屏或窗口问题请同时注明缩放比例。

代码贡献请参考 [贡献指南](CONTRIBUTING.md)。Star、反馈和改进文档同样是对项目的支持。

## 支持项目

如果这个小工具对你有帮助，欢迎自愿请作者喝杯咖啡。捐赠不解锁功能，也不影响开源许可。

<details>
<summary>微信支持 dingding-abc（点击展开收款码）</summary>

<p align="center">
  <img src="assets/donations/wechat-receive.png" width="280" alt="微信收款码，请在微信确认页面核对收款方" />
</p>

请在微信确认页面核对收款方后，再决定是否支持。感谢你的使用与鼓励。

</details>

## 许可

原创代码、文档和项目图标采用 [MIT 许可](LICENSE)，版权所有者为 **dingding-abc**。第三方组件、行情数据与微信收款图遵循各自的使用范围，详见 [第三方声明](THIRD-PARTY-NOTICES.md)。
