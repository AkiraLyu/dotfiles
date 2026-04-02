#!/bin/bash
set -euo pipefail

### 变量
DISK=/dev/nvme0n1
EFI_DIR=/efi
ROOT_PART=${DISK}p3
SWAP_PART=${DISK}p2

ROOT_LUKS_UUID=$(blkid -s UUID -o value "${ROOT_PART}")
SWAP_LUKS_UUID=$(blkid -s UUID -o value "${SWAP_PART}")

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

echo "===> 生成 LUKS 密钥文件"
(umask 0077 && dd if=/dev/urandom of=/etc/luks.key bs=4096 count=1 iflag=fullblock status=none)

echo "===> 将密钥加入 LUKS keyslot（root，需要输入现有 LUKS 口令）"
cryptsetup luksAddKey "${ROOT_PART}" /etc/luks.key

echo "===> 将密钥加入 LUKS keyslot（swap，需要输入现有 LUKS 口令）"
cryptsetup luksAddKey "${SWAP_PART}" /etc/luks.key

echo "===> 配置 mkinitcpio（systemd 模式，用于 UKI）"
sed -i 's/^HOOKS=.*/HOOKS=(base systemd autodetect microcode modconf kms keyboard sd-vconsole block sd-encrypt filesystems fsck)/' \
    /etc/mkinitcpio.conf
sed -i 's|^FILES=()|FILES=(/etc/luks.key)|' /etc/mkinitcpio.conf

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
rd.luks.name=${ROOT_LUKS_UUID}=cryptroot
rd.luks.name=${SWAP_LUKS_UUID}=cryptswap
rd.luks.key=/etc/luks.key

root=/dev/mapper/cryptroot rw rootflags=subvol=@
resume=/dev/mapper/cryptswap

loglevel=3
# irqpoll

drm.edid_firmware=HDMI-A-1:edid/edid.bin \
video=HDMI-A-1:1920x1080@60e
EOF

echo "===> 配置 systemd-boot loader"
cat > ${EFI_DIR}/loader/loader.conf <<EOF
timeout 3
console-mode keep
editor yes
default @saved
EOF

# echo "===> 创建 UKI 引导入口"
# mkdir -p ${EFI_DIR}/loader/entries
# 
# cat > ${EFI_DIR}/loader/entries/arch.conf <<EOF
# title   Arch Linux (UKI)
# efi     /EFI/Linux/arch-linux.efi
# EOF

echo "===> 写入 crypttab"
cat > /etc/crypttab <<EOF
cryptroot  UUID=${ROOT_LUKS_UUID}  /etc/luks.key  luks
cryptswap  UUID=${SWAP_LUKS_UUID}  /etc/luks.key  luks,swap
EOF

echo "===> 设置 root 密码"
passwd

echo "===> 全部完成"
