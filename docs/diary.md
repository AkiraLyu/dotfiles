# 拾光日记

[返回 README](../README.md)

拾光日记（Shiguang Diary）的应用源码与完整使用文档由独立仓库 [AkiraLyu/shiguang-diary](https://github.com/AkiraLyu/shiguang-diary) 维护，打包配方位于 [AkiraLyu/pkgbuilds/shiguang-diary](https://github.com/AkiraLyu/pkgbuilds/tree/main/shiguang-diary)。本页记录该应用在 Arch Linux 环境下的软件包安装、版本重编与日记库恢复方法。

## 安装与更新

`shiguang-diary` 已列入 `packages/foreign.txt`，完整执行 `./install.sh packages` 时会自动构建并安装该软件包。如需在已准备好基础工具和软件源的机器上单独安装，可在 dotfiles 仓库根目录下执行：

```bash
PARU_CONF="$PWD/user/paru/.config/paru/paru.conf" paru --sudo run0 -Sy --pkgbuilds
PARU_CONF="$PWD/user/paru/.config/paru/paru.conf" paru --sudo run0 -S --needed shiguang-diary
shiguang-diary
```

远端 PKGBUILD 配方固定了上游仓库的源码提交哈希，构建过程中会自动运行单元测试、校验桌面启动器并使用系统 Electron 打包应用代码、静态资源与 Wayland 背景模糊原生模块。当上游发布新版本并在 `pkgbuilds` 仓库中更新了源码提交与 `.SRCINFO` 后，先执行 `paru -Sy --pkgbuilds` 刷新配方再运行安装命令即可升级；若需要在当前固定版本下重新编译本地二进制包，可执行：

```bash
PARU_CONF="$PWD/user/paru/.config/paru/paru.conf" paru --sudo run0 --rebuild -S shiguang-diary
```

## 数据备份与恢复

日记正文、配图、地点坐标数据库（`.shiguang/`）以及回收站内容（`.Trash/`）全部保存在用户自行选择的日记库目录中，与软件包及 Electron 应用配置目录完全解耦，升级或重装软件包均不影响日记数据。首次在新设备上启动应用时，在欢迎界面选择打开已迁入的日记库目录即可恢复全部内容。

日常备份日记库时，先退出拾光日记应用，再完整备份整个日记库目录及其内部的 `.shiguang/` 与 `.Trash/` 隐藏目录。其中 `.shiguang/` 下的地点数据库记录了用户手动确认过的地理坐标，必须随 Markdown 正文一同保留，具体目录结构见上游的[存储约定](https://github.com/AkiraLyu/shiguang-diary/blob/main/docs/storage.md)。

## 上游文档

| 文档 | 内容 |
| --- | --- |
| [使用指南](https://github.com/AkiraLyu/shiguang-diary/blob/main/docs/usage.md) | 日记阅读、编辑、全文搜索、图库、日历、统计洞察与回收站操作 |
| [Markdown 扩展](https://github.com/AkiraLyu/shiguang-diary/blob/main/docs/markdown.md) | 公式、图片语法和导入 |
| [地点与地图](https://github.com/AkiraLyu/shiguang-diary/blob/main/docs/location.md) | 高德 Key、坐标和旧地点补全 |
| [外观与窗口](https://github.com/AkiraLyu/shiguang-diary/blob/main/docs/appearance.md) | 主题、透明度和背景模糊 |
| [开发与打包](https://github.com/AkiraLyu/shiguang-diary/blob/main/docs/development.md) | 源码调试、测试、Windows 打包和本地 Arch 构建 |
