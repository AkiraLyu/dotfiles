#!/bin/bash

sudo efibootmgr --create --disk /dev/nvme0n1 --part 1 --label "Arch Linux" --loader /vmlinuz-linux --unicode 'root=UUID=e4322485-5bd9-4934-9fc4-954b4fdf30be rw rootflags=subvol=_active/_root resume=UUID=3b0fdd11-9ff7-40ef-b5d0-08e62775295d loglevel=3 quiet initrd=\intel-ucode.img initrd=\initramfs-linux.img' --verbose

