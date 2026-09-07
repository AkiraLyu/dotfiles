# 软件清单

`install.sh --export/--restore` 使用这些声明，执行顺序和限制见 [RESTORE.md](../RESTORE.md)。

- `rust.json`：具体工具链版本、默认选择、components、targets。
- `cargo.json`：来源、完整 Git commit 或 registry 版本、features、可执行文件及构建工具链。
- `npm.json`：家目录 prefix 和两个已确认包版本；现有包保留，只补装缺失项。export 不自动更新它。
- `flatpak/manifest.json`：应用 ref、安装范围、来源及用户 overrides；旁边保存来源签名公钥。
- pacman 的四类包清单、版本/仓库参考保存在手动迁移的 `backup/pacman/`。

软件更新后先验证，再运行对应 `--export`。敏感账户配置、Codex 快照及应用数据库保存在私有 backup 中。
