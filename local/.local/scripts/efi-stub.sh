#!/bin/bash

sudo efibootmgr --create --disk /dev/nvme0n1 --part 1 --label "Arch Linux" --loader "\EFI\Arch\vmlinuz-linux" --unicode 'root=UUID=e4322485-5bd9-4934-9fc4-954b4fdf30be rw rootflags=subvol=_active/_root resume=UUID=377311f9-231f-49b8-97f2-44638cb71c70 loglevel=3 quiet initrd=\EFI\Arch\intel-ucode.img initrd=\EFI\Arch\initramfs-linux.img' --verbose

