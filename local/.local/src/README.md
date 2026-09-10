# 本地源码

`local` Stow 包将源码部署到 `~/.local/src/`。来源与导入时的 Git commit 见 [sources.json](sources.json)；源码后续修改由本仓库 Git 跟踪。该索引只保留来源信息，不参与构建校验。

| 目录 | 内容 | 安装入口 |
| --- | --- | --- |
| `appgrid/` | App Grid | 待整理 |
| `kate-translucent-bars/` | Kate 原生插件 | `./install.sh kde-plugins` |
| `wechat-glass-live/` | KWin 微信插件 | `./install.sh kde-plugins` |
| `diary/` | 拾光日记 Electron 应用 | 待整理 |
| `gamescope/` | 旧源码快照及依赖 checkout | 待整理 |
| `wps/` | unlock-fps 补丁和工具 | 仅源码存档，不安装；WPS 本体由用户管理 |
| `zhihu/` | 知乎收藏导出工具 | 已完成：源码与 `local/.local/bin/zhihu-collection-export` 均保存，由 Stow 部署二进制 |

命令在仓库根目录执行。KDE 设置在 `kde/`，两个插件的配方是 `packages/local/dotfiles-kde-plugins/PKGBUILD`；直接从本目录构建，不生成源码归档和摘要清单。

迁入前的 Git 历史保存为 `backup/git-history/*.bundle`，知乎导出数据在 `backup/zhihu-exports/`。拾光日记的 `Diary/`、个人 Markdown、node_modules 和构建输出不随源码部署；日记库与应用设置单独迁移。
