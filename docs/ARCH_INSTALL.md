# 从 Arch ISO 接入复现流程

`install.sh` 现在包含基础系统安装、已有系统挂载、后置启动配置三个阶段。三者默认只读，只有 `--apply` 才会执行；新安装还必须带 `--erase`。日常 Stow、`--all` 和 `--restore all` 不会触发磁盘操作。

## 目标布局

必须显式指定 `--disk`。默认使用这块磁盘的前三个已有分区；也可显式提供 `--efi-part`、`--swap-part`、`--root-part`。自动适配 `/dev/sda1`、`/dev/nvme0n1p1`、`/dev/mmcblk0p1` 的命名，不创建或改写分区表，其余分区不参与格式化。

| 分区 | 用途 | 安装后路径 |
| --- | --- | --- |
| p1 / 第 1 分区 | FAT32 EFI 系统分区 | `/efi` |
| p2 / 第 2 分区 | LUKS → cryptswap → swap | 交换分区，`resume=/dev/mapper/cryptswap` |
| p3 / 第 3 分区 | LUKS → cryptroot → Btrfs | `@` → `/`，`@home` → `/home`，`@snapshots` → `/.snapshots`，顶层 → `/mnt/defvol` |

当前设备就是这个布局：`nvme0n1p1` 挂载 `/efi`，p2/p3 为上述两个 LUKS 容器。入口拒绝格式化已挂载/启用交换的所选分区、覆盖已有 cryptroot/cryptswap 映射、使用其他磁盘的分区或把当前系统作为安装目标。

## 新安装

在 UEFI 模式的 Arch ISO 中准备 Python、arch-install-scripts、cryptsetup、btrfs-progs、dosfstools 和网络。下面的磁盘名必须替换为实际准备重装的目标。先检查：

```bash
./install.sh --arch-install --disk /dev/nvme0n1 --check
```

实际执行会格式化选中的 EFI、swap 和 root 三个分区，必须确认它们已经完成需要的备份：

```bash
./install.sh --arch-install --disk /dev/nvme0n1 --apply --erase
```

在 Arch ISO 的 root 终端直接运行；从普通用户发起时用 `run0`。支持 `--mount-root /mnt`、`--hostname Akira`、`--user akira`，以上为默认值。

执行顺序为：LUKS 与文件系统 → 创建子卷并挂载 → pacstrap → 替换生成 fstab → 配置密钥与启动输入 → 生成 UKI → 安装 systemd-boot → 创建普通用户/交互设置密码。fstab 不再追加重复条目；中途失败会停止，不尝试回滚已格式化的分区或自动卸载现场。

引导器安装使用 `bootctl --esp-path=/efi install`。普通用户加入 wheel，基础系统包含 Python、Git、Stow 和 polkit。系统 systemd 服务按用户要求不在本阶段启用，包括原脚本中自动启用 NetworkManager 的动作。首次启动后的联网由用户安排。

将仓库和手动迁移的 backup 放入新用户目录后，按照 [RESTORE.md](../RESTORE.md) 继续 `--bootstrap`、软件恢复、配置和用户 target 阶段。

## 已有系统挂载与后置配置

挂载阶段不格式化，也不自动 swapon。它检查 LUKS/FAT 类型、已有映射对应的实际分区和目标挂载；已经正确挂载的路径会跳过：

```bash
./install.sh --arch-mount --disk /dev/nvme0n1 --check
./install.sh --arch-mount --disk /dev/nvme0n1 --apply
./install.sh --arch-post-install --disk /dev/nvme0n1 --check
./install.sh --arch-post-install --disk /dev/nvme0n1 --apply
```

后置配置从 ISO 对已挂载的目标运行，不是在当前已登录系统中直接重写 `/etc`。目标必须是选中 root 的 `@` 子卷、其 `/efi` 必须是选中 EFI 分区，并且已经 pacstrap。它读取实际 LUKS UUID，替换模板中的 root/swap 标识，保留已有 luks.key；只有密钥尚未加入时才交互调用 luksAddKey。

先写 root.conf、crypttab、mkinitcpio 配置/preset、声卡配置和 block 修复，再运行 mkinitcpio。preset 显式指定 `/etc/cmdline.d`，避免回退到 ISO 的 `/proc/cmdline`。生成预期 UKI 后才安装引导器。crypttab 不使用每次启动重新 mkswap 的 `swap` 选项，保留交换分区内容以配合休眠恢复。

旧的 install.sh、mount-target.sh、post-install.sh 路径保留为主入口包装器，避免维护两套分区/UUID/EFI 逻辑。

## 触控板所需的 block 修复

用户确认：mkinitcpio 的 block hook 收集 `drivers/mfd` 会导致此设备触控板不可用，必须保留排除行为。

仓库的 `etc/initcpio/install/block` 安装到 `/etc/initcpio/install/block`，它加载当前 `/usr/lib/initcpio/install/block`，仅在执行该 hook 时跳过 `add_checked_modules /drivers/mfd/`，其他调用和全局状态继续由当前包版本处理，执行后恢复原函数。它不对运行中的系统全局 blacklist MFD 驱动，也不冻结整份上游 hook。[mkinitcpio 支持的自定义 hook 位置](https://man.archlinux.org/man/mkinitcpio.8)

当前机器已部署这个覆盖 hook；原 `/usr/lib` 中的单行改动保留原状，下次包更新后由覆盖 hook 继续提供修复。本轮没有重新生成当前 UKI 或重启。上游若改变了收集 MFD 的调用方式，应重跑对应测试并检查过滤条件。

仓库 root.conf 与当前实际文件一致（实际路径原本就是仓库链接），sound.conf 已同步为 `dsp_driver=4`。新系统使用安装时读取的 UUID；不要用旧仓库 UUID 强行覆盖新生成文件。EDID、Niri 配置与系统服务清单按用户要求不作进一步处理。

## 用户 target

```bash
./install.sh --user-targets --check
./install.sh --user-targets
```

这个入口先校验全部 unit 和路径，再建立相对链接；只有指向同一仓库文件的既有链接会被规范化，独立文件或其他来源会阻止部署。最后仅执行 `systemctl --user daemon-reload`，不启停应用或修改系统服务。也支持 `--target DIR` 进行其他 home 的恢复；这种情况下不重载当前用户。

现有四个个人 target 的依赖定义校验通过，因此保留其分组与启动语义。本轮修复七个手工绝对链接；当前 `install.sh --check systemd` 已通过，后续仍可使用 Stow 管理。
