# 从 Arch ISO 安装

`install.sh` 提供基础安装、挂载、后置启动配置三个磁盘阶段。三者默认只读；执行须加 `--apply`，新安装还须加 `--erase`。`--all` 和 `--restore all` 不包含磁盘操作。

## 磁盘布局

必须指定 `--disk`，默认选择磁盘前三个已有分区，也可通过 `--efi-part`、`--swap-part`、`--root-part` 指定。脚本不创建或改写分区表。

| 分区 | 文件系统 | 挂载 |
| --- | --- | --- |
| 第 1 分区 | FAT32 EFI | `/efi` |
| 第 2 分区 | LUKS → cryptswap → swap | 交换分区与休眠恢复 |
| 第 3 分区 | LUKS → cryptroot → Btrfs | `@` → `/`，`@home` → `/home`，`@snapshots` → `/.snapshots`，顶层 → `/mnt/defvol` |

当前机器使用 nvme0n1 的这个布局。入口拒绝格式化正在使用的分区、覆盖已有加密映射、混用其他磁盘或将当前系统作为目标。

## 新安装

以 UEFI 模式启动 Arch ISO，准备网络、Python、arch-install-scripts、cryptsetup、btrfs-progs、dosfstools，以及仓库和完整 backup。先配置 CachyOS 源与 keyring 并刷新数据库；脚本在写盘前检查基础包是否可用，同时校验 AVS 固件，缺失则停止。

```bash
./install.sh --arch-install --disk /dev/nvme0n1 --check
# 确认目标磁盘和备份后；实际格式化选中的三个分区：
./install.sh --arch-install --disk /dev/nvme0n1 --apply --erase
```

在 ISO 的 root 终端运行；普通用户用 `run0`。支持 `--mount-root /mnt`、`--hostname Akira`、`--user akira`、`--backup-dir DIR`。默认参数按当前机器保存：Asia/Tokyo、zh_CN.UTF-8、Fish、新用户 UID 1000，附加组为 libvirt/video/render/kvm/input/audio/wheel；已有用户保留 UID 并补齐组和 shell。

基础包同时安装 linux、linux-cachyos 和 plymouth。Btrfs 使用 noatime、zstd:3，EFI 使用 fmask/dmask=0022；systemd-boot 保留上次启动项，等待 5 秒。后置阶段写入 `etc/` 中的 hosts、pacman 源、镜像、makepkg 和 memlock 设置；CachyOS v4 与 x86-64-v4 编译参数面向当前 CPU，换机器时需调整。

顺序为：格式化 → 子卷与挂载 → pacstrap → 生成 fstab → 密钥和启动配置 → AVS 固件 → UKI → systemd-boot → 普通用户与交互设置密码。失败即停止，已格式化分区不能自动回滚。系统服务不自动启用，首次启动的联网由用户安排。

## 挂载已有系统与修复启动输入

```bash
./install.sh --arch-mount --disk /dev/nvme0n1 --check
./install.sh --arch-mount --disk /dev/nvme0n1 --apply
./install.sh --arch-post-install --disk /dev/nvme0n1 --check
./install.sh --arch-post-install --disk /dev/nvme0n1 --apply
```

挂载阶段不格式化、不自动 swapon；已正确挂载的路径跳过。后置阶段从 ISO 对已挂载且已 pacstrap 的目标运行，要求 root 的 `@` 子卷和所选 EFI 分别挂载到目标及其 `/efi`。

后置阶段要求目标已安装两个内核，并补齐 plymouth。它读取目标 LUKS UUID，保留已有 luks.key，必要时交互执行 luksAddKey。先写 root.conf、crypttab、mkinitcpio 配置/preset、声卡配置、block 修复和 AVS 固件，再生成 `arch-linux.efi` 与 `arch-linux-cachyos.efi`。crypttab 保留 swap 内容用于休眠。两个镜像都生成成功后才运行 `bootctl --esp-path=/efi install`。

`etc/mkinitcpio.conf` 和 `etc/mkinitcpio.d/*.preset` 保存当前配置，安装时直接复制。命令行由 mkinitcpio 默认读取 `/etc/cmdline.d`；`quiet splash` 与 `plymouth` hook 启用默认 bgrt 主题，preset 不再向 UKI 添加 `--splash` 位图。`90-dotfiles.conf` 只补充 AVS 固件，不覆盖主配置的 hooks。

触控板所需的 MFD 排除、AVS 和独立系统配置见 [hardware/README.md](../hardware/README.md)。EDID 参数保留，但 EDID 文件不自动保存或恢复。

系统可启动后，按 [RESTORE.md](../RESTORE.md) 继续软件、配置和用户 target 恢复。`--user-targets` 先校验全部 unit，再建立相对链接并执行用户 daemon-reload；支持 `--check` 与 `--target DIR`，不启停应用或修改系统服务。
