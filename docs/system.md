# 系统配置

[返回 README](../README.md)

[install.sh](../install.sh) 中的 `system_files` 是 `/etc` 文件的管理清单，部署、比较和导出共用它。新增系统配置时，同时添加仓库文件和清单条目。

## 部署方式

| `/etc` 下的相对路径 | 部署方式 | 用途 |
| --- | --- | --- |
| `environment` | 相对链接 | 登录环境变量 |
| `makepkg.conf.d/90-local.conf` | 相对链接 | 本机构建参数 |
| `pacman.conf` | 独立副本 | 软件源和包管理设置 |
| `opt/chrome/policies/managed/webrtc.json` | 独立副本 | Chrome WebRTC 策略 |
| `tlp.conf` | 独立副本 | 电源管理 |
| `security/limits.d/90-memlock.conf` | 独立副本 | PAM 内存锁定限制 |
| `modprobe.d/sound.conf` | 独立副本 | Intel 声卡和无线网卡参数 |
| `cmdline.d/root.conf` | 独立副本 | 根分区、休眠和显示参数 |
| `mkinitcpio.conf` | 独立副本 | initramfs 构建设置 |
| `mkinitcpio.d/linux.preset` | 独立副本 | 内核和 UKI 输出路径 |
| `initcpio/install/block` | 独立副本 | 定制的 mkinitcpio block hook |
| `udev/hwdb.d/90-swap-caps-esc.hwdb` | 独立副本 | 指定键盘的 Caps Lock 与 Esc 交换 |

链接文件随仓库内容变化；复制文件需要重新部署。引导、包管理、PAM 和早期 udev 配置使用独立副本，避免依赖用户目录。TLP 服务设置了 `ProtectHome=yes`，也使用独立副本。

Chrome 策略将 `WebRtcIPHandling` 设为 `disable_non_proxied_udp`，部署到 `/etc/opt/chrome/policies/managed/webrtc.json`。修改后可在 Chrome 的 `chrome://policy` 中重新加载并检查策略。

## 比较与同步

以下命令在仓库根目录执行。文件参数使用 `/etc` 下的相对路径，且必须已登记在 `system_files` 中；省略文件参数时处理整个清单。

```bash
./install.sh etc diff
./install.sh --check etc install pacman.conf
./install.sh etc install pacman.conf
./install.sh --check etc export pacman.conf
./install.sh etc export pacman.conf
```

| 操作 | 方向 | 行为 |
| --- | --- | --- |
| `diff` | 比较仓库与实机 | 显示内容及权限差异，不写入文件 |
| `install` | 仓库 → `/etc` | 链接或复制文件；复制时沿用仓库文件的权限 |
| `export` | `/etc` → 仓库 | 以实机内容和权限覆盖仓库文件 |

`install` 和 `export` 不自动备份，执行前先查看 `diff`。`export` 跳过已链接到同一仓库文件的项目；实机路径不存在时保留仓库版本。导出以当前用户执行，确保文件可读。

部署键位文件时，脚本会运行 `systemd-hwdb update`。登录环境和 PAM 限制在新会话中验证，键位、TLP 和硬件参数在相应设备或服务重新加载后验证；需要时重启系统。

## 机器配置

换机器或调整硬件时，先核对以下配置：

| 文件 | 核对项 |
| --- | --- |
| `pacman.conf` | 软件源、密钥环、镜像列表和 `IgnorePkg`，详见[安装指南](install.md#准备环境) |
| `makepkg.conf.d/90-local.conf` | `x86-64-v4` 支持、`MAKEFLAGS`、构建目录和打包者信息 |
| `cmdline.d/root.conf` | 根分区及休眠 UUID、Btrfs 子卷、EDID 固件路径和显示输出 |
| `mkinitcpio.d/linux.preset` | `/boot/vmlinuz-linux` 是否对应目标内核，`/efi` 是否为实际 EFI 挂载点 |
| `mkinitcpio.conf`、`initcpio/install/block` | 所需 hook、模块和设备支持 |
| `modprobe.d/sound.conf`、`tlp.conf` | 声卡、无线网卡和电源参数 |
| `udev/hwdb.d/90-swap-caps-esc.hwdb` | 笔记本型号和外接键盘标识 |
| `environment` | 已生成的区域设置、输入法和桌面环境 |

构建参数和 PAM 限制分别保存在配置片段中，其他默认值由软件包维护。仓库的 `linux.preset` 面向 `linux` 内核；包清单也包含 `linux-cachyos`，其预设应单独检查。

## AVS 固件

需要 Intel AVS 固件的机器，先将固件迁入仓库中的 `private/firmware/intel/avs/tgl/dsp_basefw.bin`，再执行：

```bash
./install.sh --check firmware
./install.sh firmware
```

脚本仅将该文件以 `0644` 权限复制到 `/usr/lib/firmware/intel/avs/tgl/dsp_basefw.bin`，不会下载固件或自动重建启动镜像。

## 启动镜像

仓库的 `mkinitcpio.conf` 使用 systemd 和 Plymouth hook，`linux.preset` 将统一内核镜像（UKI）写入 `/efi/EFI/Linux/arch-linux.efi`。修改引导配置、模块参数或固件后，确认 EFI 分区已挂载，再重建：

```bash
findmnt /efi
run0 mkinitcpio -P
```

`mkinitcpio -P` 处理系统中的全部预设，不只处理仓库提供的 `linux.preset`。

定制的 `initcpio/install/block` 基于 mkinitcpio 41.1，省略 `drivers/mfd` 模块目录，用于原配置机器的触控板问题。`/etc/initcpio/install/` 的 hook 优先于软件包提供的版本，具体搜索顺序见 [mkinitcpio 手册](https://man.archlinux.org/man/mkinitcpio.8.en)。

mkinitcpio 更新后，比较新旧 hook，合入适用的上游变化；保留这项硬件调整前确认目标机器仍需要它：

```bash
diff -u /usr/lib/initcpio/install/block etc/initcpio/install/block
```

维护副本位于仓库的 `etc/initcpio/install/block`，通过 `etc install` 部署后重建 UKI。`/usr/lib/initcpio/install/block` 由软件包维护。
