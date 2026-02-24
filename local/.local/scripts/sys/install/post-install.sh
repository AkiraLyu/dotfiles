#!/bin/bash
set -euo pipefail

### 变量
DISK=/dev/nvme0n1
EFI_DIR=/efi

ROOT=$(blkid -s UUID -o value ${DISK}p3)
SWAP=$(blkid -s UUID -o value ${DISK}p2)
SWAP_UUID=$(blkid -s UUID -o value /dev/mapper/cryptswap)
ROOT_UUID=$(blkid -s UUID -o value /dev/mapper/cryptroot)

echo "===> 设置时区"
ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime
hwclock --systohc

echo "===> 配置本地化"
sed -i 's/#en_US.UTF-8/en_US.UTF-8/' /etc/locale.gen
sed -i 's/#zh_CN.UTF-8/zh_CN.UTF-8/' /etc/locale.gen
locale-gen
echo "LANG=en_US.UTF-8" > /etc/locale.conf

echo "===> 设置主机名"
echo "Akira" > /etc/hostname

echo "===> 启用 NetworkManager"
systemctl enable NetworkManager

echo "===> 配置 mkinitcpio（systemd 模式，用于 UKI）"
sed -i 's/^HOOKS=.*/HOOKS=(base systemd autodetect microcode modconf kms keyboard sd-vconsole block sd-encrypt filesystems fsck)/' \
    /etc/mkinitcpio.conf

# 生成用于 UKI 的 preset
echo "===> 生成 UKI preset"
cat > /etc/mkinitcpio.d/linux.preset <<EOF
ALL_kver='/boot/vmlinuz-linux'

PRESETS=('default')
default_uki="/efi/EFI/Linux/arch-linux.efi"
default_options="--splash /usr/share/systemd/bootctl/splash-arch.bmp"
EOF

echo "===> 生成 UKI"
mkinitcpio -P

echo "===> 安装 systemd-boot"
bootctl install

echo "===> 配置 kernel cmdline（/etc/cmdline.d/root.conf）"
mkdir -p /etc/cmdline.d

cat > /etc/cmdline.d/root.conf << EOF
rd.luks.name=${ROOT}=cryptroot \
rd.luks.name=${SWAP}=cryptswap \
root=/dev/mapper/cryptroot rw rootflags=subvol=@ \
resume=/dev/mapper/cryptswap \
loglevel=3 \
irqpoll \
drm.edid_firmware=HDMI-A-1:edid/s.bin \
video=HDMI-A-1:1920x1080@60e \
EOF

echo "===> 配置 systemd-boot loader"
cat > ${EFI_DIR}/loader/loader.conf <<EOF
timeout 3
console-mode keep
editor yes
EOF

echo "===> 创建 UKI 引导入口"
mkdir -p ${EFI_DIR}/loader/entries

cat > ${EFI_DIR}/loader/entries/arch.conf <<EOF
title   Arch Linux (UKI)
efi     /EFI/Linux/arch-linux.efi
EOF

echo "===> 写入 crypttab"
cat > /etc/crypttab <<EOF
cryptroot  UUID=${ROOT_UUID}  none  luks
cryptswap  UUID=${SWAP_UUID}  none  luks,swap
EOF

echo "===> 设置 root 密码"
passwd

echo "===> 全部完成"

