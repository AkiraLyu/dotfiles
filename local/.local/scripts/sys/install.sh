#!/bin/bash
set -euo pipefail

DISK=/dev/nvme0n1
EFI_PART=${DISK}p1
SWAP_PART=${DISK}p2
ROOT_PART=${DISK}p3

echo "===> Formatting LUKS volumes"
cryptsetup luksFormat --batch-mode "$SWAP_PART"
cryptsetup luksFormat --batch-mode "$ROOT_PART"

cryptsetup open "$SWAP_PART" cryptswap
cryptsetup open "$ROOT_PART" cryptroot

echo "===> Filesystem creation"
mkfs.fat -F32 "$EFI_PART"
mkswap /dev/mapper/cryptswap
mkfs.btrfs /dev/mapper/cryptroot
swapon /dev/mapper/cryptswap

echo "===> Creating Btrfs subvolumes"
mount /dev/mapper/cryptroot /mnt
btrfs subvolume create /mnt/@
btrfs subvolume create /mnt/@home
btrfs subvolume create /mnt/@snapshots
umount /mnt

echo "===> Mounting subvolumes"
mount -o noatime,compress=zstd,subvol=@ /dev/mapper/cryptroot /mnt
mkdir -p /mnt/{efi,home,.snapshots,mnt/defvol}

mount "$EFI_PART" /mnt/efi
mount -o noatime,compress=zstd,subvol=@home /dev/mapper/cryptroot /mnt/home
mount -o noatime,compress=zstd,subvol=@snapshots /dev/mapper/cryptroot /mnt/.snapshots
mount -o noatime,compress=zstd,subvol=/ /dev/mapper/cryptroot /mnt/mnt/defvol

echo "===> Installing system"
pacstrap -K /mnt \
  base base-devel linux linux-firmware sof-firmware \
  networkmanager btrfs-progs vim tmux

genfstab -U /mnt >> /mnt/etc/fstab

cp ./post-install.sh /mnt/
arch-chroot /mnt bash /post-install.sh
