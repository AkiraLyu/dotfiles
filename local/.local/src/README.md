# 本地程序源码

本仓库管理的原生程序源码统一位于此目录，`local` Stow 包将其部署到 `~/.local/src/`。Qt/Plasma 配置、桌面组件和安装命令仍位于 `qt-plasma/`，安装器与 App Grid 的链接已经改用这里的源码。

| 目录 | 内容 / 原位置 |
| --- | --- |
| `appgrid/` | App Grid；原 `qt-plasma/.local/src/appgrid` 和 `~/Projects/appgrid` 的源码一致，合为一份 |
| `diary/` | 原有日记工具源码 |
| `gamescope/` | 原 `~/Projects/gamescope/src` 工作区，包含本地依赖 checkout 的完整文件快照 |
| `kate-translucent-bars/` | 原 `qt-plasma/.local/src/kate-translucent-bars` |
| `kde_gesture/` | 原有 kwin_gesture 源码 |
| `niri-first-window/` | 原有窗口工具源码 |
| `niri-scale/` | 原有缩放工具源码 |
| `wechat-glass-live/` | 原 `qt-plasma/.local/src/wechat-glass-live` |
| `wps/` | 原 `~/Projects/wps` 的 WPS 补丁和工具源码 |
| `zhihu/` | 原 `~/Projects/zhihu` 的知乎收藏导出工具源码 |

来源、Git revision、依赖 checkout revision 和文件快照摘要见 [sources.json](sources.json)。迁入时保留工作树内容和未提交修改；外部项目的 Git 元数据、构建目录、导出数据以及原工作区保存在 `backup/source-migration/20260906T052224Z/workspaces/`。gamescope 包含其依赖仓库自带的 SDK/示例文件；仅为依赖的 `.gitignore` 补充快照保存规则，避免主仓库忽略原仓库已经跟踪的源码。原始忽略文件仍在完整工作区归档中。

旧 Projects 路径和当前 `~/.local/src` 已指向这里。外部项目已有构建/数据目录通过本机兼容链接访问 backup 中的原内容；微信源码原有的构建目录保留原状。这些构建产物、数据和兼容链接均被 Git 和 Stow 忽略，不属于源码快照或新机器部署输入。

本次仅集中源码和修正关联路径，没有构建、制包、升级这些程序，也没有调整它们的二进制安装位置。FoxVault、nsmanager 等尚未定位到源码的独立程序仍保留原状。
