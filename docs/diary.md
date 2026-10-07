# 拾光日记

[返回 README](../README.md)

拾光日记的源码和应用文档由 [AkiraLyu/shiguang-diary](https://github.com/AkiraLyu/shiguang-diary) 独立维护。本仓库记录软件包安装和环境恢复方式，`user` 步骤不部署应用源码。

## 安装

按[安装指南](install.md#准备环境)准备基础工具和软件源后，从 dotfiles 仓库根目录执行：

```bash
PARU_CONF="$PWD/user/paru/.config/paru/paru.conf" paru --sudo run0 -Sy --pkgbuilds
PARU_CONF="$PWD/user/paru/.config/paru/paru.conf" paru --sudo run0 -S --needed shiguang-diary
shiguang-diary
```

包名已列入 `packages/foreign.txt`，完整恢复环境时也会由 `./install.sh packages` 安装。

[远端配方](https://github.com/AkiraLyu/pkgbuilds/tree/main/shiguang-diary)从固定的上游提交构建，运行现有测试并验证桌面入口。软件包使用系统 Electron，包含应用代码、静态资源、Wayland 背景模糊库、启动器和文档，不包含开发依赖或日记数据。

## 更新

配方更新后，重新执行安装命令前先刷新 `pkgbuilds`。需要重新构建已安装版本时，使用：

```bash
PARU_CONF="$PWD/user/paru/.config/paru/paru.conf" paru --sudo run0 --rebuild -S shiguang-diary
```

重新构建使用配方固定的源码提交，不会自动选择上游最新提交。发布新的包版本时，在 `pkgbuilds` 中更新源码提交及版本信息，并重新生成 `.SRCINFO`。

## 数据恢复

首次启动时，通过“选择或创建目录”打开已有日记库。日记正文、图片、地点数据库和回收内容均保存在用户选择的目录中，独立于软件包。

备份时退出应用并保留整个日记库，包括 `.shiguang/` 和 `.Trash/` 等隐藏目录。地点数据库保存用户确认的坐标，不能仅从 Markdown 正文重建；具体目录结构见[存储约定](https://github.com/AkiraLyu/shiguang-diary/blob/main/docs/storage.md)。

应用设置位于 Electron 的用户数据目录中，不由 dotfiles 自动恢复。卸载或升级软件包不清理用户的日记库。

## 项目文档

| 文档 | 内容 |
| --- | --- |
| [使用指南](https://github.com/AkiraLyu/shiguang-diary/blob/main/docs/usage.md) | 阅读、编辑、搜索、图库、日历、洞察和回收 |
| [Markdown 扩展](https://github.com/AkiraLyu/shiguang-diary/blob/main/docs/markdown.md) | 公式、图片语法和导入 |
| [地点与地图](https://github.com/AkiraLyu/shiguang-diary/blob/main/docs/location.md) | 高德 Key、坐标和旧地点补全 |
| [外观与窗口](https://github.com/AkiraLyu/shiguang-diary/blob/main/docs/appearance.md) | 主题、透明度和背景模糊 |
| [开发与打包](https://github.com/AkiraLyu/shiguang-diary/blob/main/docs/development.md) | 源码运行、测试、Windows 打包和本地 Arch 构建 |

开发时单独克隆上游仓库。上游的 `npm run build:arch` 使用当前工作区的 PKGBUILD 构建；Paru 安装使用远端配方固定的版本。
