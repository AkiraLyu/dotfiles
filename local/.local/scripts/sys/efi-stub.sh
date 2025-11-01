#!/bin/bash

sudo efibootmgr --create --disk /dev/nvme0n1 --part 1 --label "Arch Linux" --loader "\EFI\Arch\vmlinuz-linux" --unicode 'root=UUID=ab402fd8-781e-4936-9f6e-f5ab7f91fd1e rw rootflags=subvol=_active/_root resume=UUID=6808e2bb-1eed-48d1-bec1-46fd0ddcbaea loglevel=3 quiet drm.edid_firmware=eDP-1:edid/e.bin,HDMI-A-1:edid/s.bin video=HDMI-A-1:1920x1080@120e initrd=\EFI\Arch\intel-ucode.img initrd=\EFI\Arch\initramfs-linux.img' --verbose

