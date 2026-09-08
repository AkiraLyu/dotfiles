# 本地源码

`local` Stow 包将源码部署到 `~/.local/src/`。来源与导入时的 Git commit 见 [sources.json](sources.json)；源码后续修改由本仓库 Git 跟踪。该索引只保留来源信息，不参与构建校验。

| 目录 | 内容 | 安装入口 |
| --- | --- | --- |
| `appgrid/` | App Grid | `--restore kde-plugins` |
| `kate-translucent-bars/` | Kate 原生插件 | `--restore kde-plugins` |
| `wechat-glass-live/` | KWin 微信插件 | `--restore kde-plugins` |
| `diary/` | 拾光日记 Electron 应用 | `--restore diary` |
| `gamescope/` | 旧源码快照及依赖 checkout | 当前构建使用 `packages/pkgbuilds/gamescope-anime4k/` 的固定远端来源 |
| `wps/` | unlock-fps 补丁和工具 | 仅源码存档，不安装；WPS 本体由用户管理 |
| `zhihu/` | 知乎收藏导出工具 | 已完成：源码与 `local/.local/bin/zhihu-collection-export` 均保存，由 Stow 部署二进制 |

表中入口均通过根目录 `./install.sh` 调用。KDE 配置与包模板在 `qt-plasma/`。构建器为实际构建输入生成摘要和软件包归档，无需手工维护全目录哈希。

迁入前的 Git 历史保存为 `backup/git-history/*.bundle`，知乎导出数据在 `backup/zhihu-exports/`。拾光日记的 `Diary/`、个人 Markdown、node_modules 和构建输出不随源码部署；日记库与应用设置单独迁移。
