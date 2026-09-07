#!/usr/bin/env python3
"""Arch ISO stages. Destructive installation is explicit and never a Stow action."""

import argparse
from dataclasses import dataclass
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys

from restore_lib.common import atomic_write


@dataclass
class Installation:
    repo: Path
    disk: Path
    efi: Path
    swap: Path
    root: Path
    target: Path
    hostname: str = "Akira"
    username: str = "akira"
    apply: bool = False

    def run(self, *args):
        print("  " + shlex.join(map(str, args)), flush=True)
        if self.apply:
            subprocess.run(list(map(str, args)), check=True)

    def chroot(self, *args):
        self.run("arch-chroot", self.target, *args)

    def write(self, relative, content, mode=0o644):
        print(f"  写入 {self.target / relative}", flush=True)
        if self.apply:
            path = self.target / relative
            # Writing through a symlink could change the source checkout or host.
            for parent in (path, *path.parents):
                if parent == self.target:
                    break
                if parent.is_symlink():
                    raise ValueError(f"安装配置路径包含符号链接：{parent}")
            atomic_write(path, content, mode)


def read(*args):
    return subprocess.check_output(list(map(str, args)), text=True).strip()


def mounted(path):
    result = subprocess.run(["findmnt", "-rn", "--mountpoint", str(path), "-o", "SOURCE,FSTYPE,FSROOT"],
                            text=True, capture_output=True)
    return result.stdout.strip() if result.returncode == 0 else ""


def preflight(ctx, action):
    tools = {"lsblk", "findmnt", "blkid", "cryptsetup", "mount", "swapon"}
    if action == "arch-install":
        tools |= {"mkfs.fat", "mkfs.btrfs", "mkswap", "btrfs", "umount", "pacstrap", "genfstab", "arch-chroot"}
    if action == "arch-post-install":
        tools |= {"arch-chroot"}
    absent = sorted(name for name in tools if not shutil.which(name))
    if absent:
        raise ValueError("Arch ISO 缺少命令：" + " ".join(absent))
    if read("lsblk", "-dn", "-o", "TYPE", ctx.disk) != "disk":
        raise ValueError("--disk 必须是整块磁盘")
    parts = (ctx.efi, ctx.swap, ctx.root)
    if len(set(parts)) != 3:
        raise ValueError("EFI、swap、root 必须是三个不同分区")
    for part in parts:
        if not part.is_block_device() or read("lsblk", "-dn", "-o", "TYPE", part) != "part":
            raise ValueError(f"分区不存在：{part}；入口不修改分区表")
        if read("lsblk", "-dn", "-o", "PKNAME", part) != ctx.disk.name:
            raise ValueError(f"分区不属于所选磁盘：{part}")
        destinations = read("lsblk", "-nr", "-o", "MOUNTPOINTS", part).splitlines()
        for destination in filter(None, destinations):
            if destination == "[SWAP]" and part == ctx.swap and action != "arch-install":
                continue
            if action == "arch-install" or not Path(destination).is_relative_to(ctx.target):
                raise ValueError(f"所选分区正在使用：{part} → {destination}")
    if ctx.target == Path("/") or ctx.target == ctx.repo or ctx.repo.is_relative_to(ctx.target) \
            or ctx.target.is_relative_to(ctx.repo) or ctx.target == Path.home():
        raise ValueError("安装目标必须是独立的挂载目录，不能是当前系统/home/仓库")
    if ctx.target.is_symlink() or ctx.target.resolve() != ctx.target:
        raise ValueError("安装目标路径不能经过符号链接")
    if action == "arch-install":
        if ctx.target.exists() and (mounted(ctx.target) or any(ctx.target.iterdir())):
            raise ValueError("新安装目标必须未挂载且为空")
        for name in ("cryptroot", "cryptswap"):
            if Path("/dev/mapper", name).exists():
                raise ValueError(f"加密映射已存在：{name}；不会覆盖现有映射")
    else:
        for part in (ctx.root, ctx.swap):
            if read("blkid", "-s", "TYPE", "-o", "value", part) != "crypto_LUKS":
                raise ValueError(f"不是现有 LUKS 分区：{part}")
        if read("blkid", "-s", "TYPE", "-o", "value", ctx.efi) != "vfat":
            raise ValueError("EFI 分区必须是已有 FAT 文件系统")
    for name, part in (("cryptroot", ctx.root), ("cryptswap", ctx.swap)):
        mapping = Path("/dev/mapper", name)
        if mapping.exists():
            status = read("cryptsetup", "status", name)
            device = re.search(r"^\s*device:\s*(\S+)", status, re.M)
            if not device or Path(device[1]).resolve() != part:
                raise ValueError(f"已有 {name} 指向其他分区")
    if action == "arch-post-install":
        expected = ("/dev/mapper/cryptroot[/@] btrfs /@", str(ctx.efi) + " vfat /")
        if mounted(ctx.target) != expected[0] or mounted(ctx.target / "efi") != expected[1]:
            raise ValueError("post-install 要求所选 root 的 @ 子卷和 EFI 已分别挂载到目标目录及其 /efi")
        if not (ctx.target / "etc/arch-release").is_file():
            raise ValueError("目标不是已 pacstrap 的 Arch 系统")
    if ctx.apply:
        if os.geteuid() != 0:
            raise ValueError("应用安装阶段需在 Arch ISO 以 root 运行，或显式用 run0 调用")
        if action != "arch-mount" and not Path("/sys/firmware/efi").is_dir():
            raise ValueError("请以 UEFI 模式启动 Arch ISO")


def ensure_mount(ctx, source, relative, fsroot=None):
    destination = ctx.target / relative
    current = mounted(destination)
    if current:
        expected_source = str(source) + (f"[{fsroot}]" if fsroot and fsroot != "/" else "")
        if current.split()[0] != expected_source or (fsroot and current.split()[-1] != fsroot):
            raise ValueError(f"挂载目标已被不同文件系统占用：{destination}")
        return
    ctx.run("mkdir", "-p", destination)
    args = ["mount"]
    if fsroot:
        args += ["-o", f"noatime,compress=zstd,subvol={fsroot}"]
    ctx.run(*args, source, destination)


def mount_system(ctx):
    # Validate existing mount destinations before creating any new mounts.
    entries = (("", "/@"), ("home", "/@home"), (".snapshots", "/@snapshots"), ("mnt/defvol", "/"))
    for relative, fsroot in entries:
        current = mounted(ctx.target / relative)
        expected = "/dev/mapper/cryptroot" + (f"[{fsroot}]" if fsroot != "/" else "")
        if current and (current.split()[0] != expected or current.split()[-1] != fsroot):
            raise ValueError(f"目标已有其他挂载：{ctx.target / relative}")
    if mounted(ctx.target / "efi") and mounted(ctx.target / "efi").split()[0] != str(ctx.efi):
        raise ValueError("目标 /efi 已被其他分区占用")
    for part, name in ((ctx.root, "cryptroot"), (ctx.swap, "cryptswap")):
        if not Path("/dev/mapper", name).exists():
            ctx.run("cryptsetup", "open", part, name)
    for relative, fsroot in entries:
        ensure_mount(ctx, "/dev/mapper/cryptroot", relative, fsroot)
    ensure_mount(ctx, ctx.efi, "efi")


def render_boot(ctx, root_uuid, swap_uuid):
    template = (ctx.repo / "etc/cmdline.d/root.conf").read_text()
    for name, uuid in (("cryptroot", root_uuid), ("cryptswap", swap_uuid)):
        if not re.fullmatch(r"[0-9a-fA-F-]{36}", uuid):
            raise ValueError("无法读取新分区的 LUKS UUID")
        template, count = re.subn(r"rd\.luks\.name=[^\s=]+=" + name, f"rd.luks.name={uuid}={name}", template)
        if count != 1:
            raise ValueError(f"root.conf 缺少唯一的 {name} 定义")
    ctx.write("etc/cmdline.d/root.conf", template)
    ctx.write("etc/modprobe.d/sound.conf", (ctx.repo / "etc/modprobe.d/sound.conf").read_bytes())
    ctx.write("etc/initcpio/install/block", (ctx.repo / "etc/initcpio/install/block").read_bytes(), 0o755)
    ctx.write("etc/crypttab", f"cryptroot UUID={root_uuid} /etc/luks.key luks\n"
              f"cryptswap UUID={swap_uuid} /etc/luks.key luks\n", 0o600)
    ctx.write("etc/mkinitcpio.conf.d/90-dotfiles.conf", "# Touchpad workaround: /etc/initcpio/install/block\n"
              "HOOKS=(base systemd autodetect microcode modconf kms keyboard keymap sd-vconsole block sd-encrypt filesystems fsck)\n"
              '[[ " ${FILES[*]} " == *" /etc/luks.key "* ]] || FILES+=(/etc/luks.key)\n')
    ctx.write("etc/mkinitcpio.d/linux.preset", "ALL_kver='/boot/vmlinuz-linux'\nPRESETS=('default')\n"
              "default_uki='/efi/EFI/Linux/arch-linux.efi'\n"
              'default_options="--cmdline /etc/cmdline.d --splash /usr/share/systemd/bootctl/splash-arch.bmp"\n')
    ctx.write("efi/loader/loader.conf", "timeout 3\nconsole-mode keep\neditor yes\ndefault @saved\n")


def configure_system(ctx):
    root_uuid = read("blkid", "-s", "UUID", "-o", "value", ctx.root)
    swap_uuid = read("blkid", "-s", "UUID", "-o", "value", ctx.swap)
    if not ctx.apply:
        render_boot(ctx, root_uuid, swap_uuid)
        print("  保留/新建目标 LUKS key；必要时交互添加 keyslot，创建用户并设置密码")
    else:
        key = ctx.target / "etc/luks.key"
        if key.is_symlink():
            raise ValueError("目标 luks.key 不能是符号链接")
        if not key.exists():
            descriptor = os.open(key, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, "wb") as stream:
                stream.write(os.urandom(4096))
        key.chmod(0o600)
        for part in (ctx.root, ctx.swap):
            valid = subprocess.run(["cryptsetup", "open", "--test-passphrase", "--key-file", str(key), str(part)],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0
            if not valid:
                ctx.run("cryptsetup", "luksAddKey", part, key)
        render_boot(ctx, root_uuid, swap_uuid)
        locale = ctx.target / "etc/locale.gen"
        content = re.sub(r"^#\s*((?:en_US|zh_CN)\.UTF-8\s+UTF-8)\s*$", r"\1", locale.read_text(), flags=re.M)
        ctx.write("etc/locale.gen", content)
    ctx.chroot("ln", "-sf", "/usr/share/zoneinfo/Asia/Shanghai", "/etc/localtime")
    ctx.chroot("hwclock", "--systohc")
    ctx.chroot("locale-gen")
    ctx.write("etc/locale.conf", "LANG=en_US.UTF-8\n")
    ctx.write("etc/hostname", ctx.hostname + "\n")
    # All boot inputs, the workaround and keyslots exist BEFORE image generation.
    ctx.run("mkdir", "-p", ctx.target / "efi/EFI/Linux")
    ctx.chroot("mkinitcpio", "-P")
    if ctx.apply and not (ctx.target / "efi/EFI/Linux/arch-linux.efi").is_file():
        raise ValueError("mkinitcpio 未生成预期的 UKI；停止后续步骤")
    ctx.chroot("bootctl", "--esp-path=/efi", "install")
    if ctx.apply:
        exists = subprocess.run(["arch-chroot", str(ctx.target), "id", "-u", ctx.username],
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0
        if not exists:
            ctx.chroot("useradd", "-m", "-G", "wheel", "-s", "/bin/bash", ctx.username)
            ctx.chroot("passwd", ctx.username)
        ctx.chroot("passwd", "root")
    print("基础启动阶段完成。系统服务按用户要求另行处理；重启后以普通用户继续 --bootstrap / --restore。")


def install_system(ctx):
    for part in (ctx.swap, ctx.root):
        ctx.run("cryptsetup", "luksFormat", part)
    for part, name in ((ctx.root, "cryptroot"), (ctx.swap, "cryptswap")):
        ctx.run("cryptsetup", "open", part, name)
    ctx.run("mkfs.fat", "-F32", ctx.efi)
    ctx.run("mkswap", "/dev/mapper/cryptswap")
    ctx.run("mkfs.btrfs", "/dev/mapper/cryptroot")
    ctx.run("mkdir", "-p", ctx.target)
    ctx.run("mount", "/dev/mapper/cryptroot", ctx.target)
    for name in ("@", "@home", "@snapshots"):
        ctx.run("btrfs", "subvolume", "create", ctx.target / name)
    ctx.run("umount", ctx.target)
    mount_system(ctx)
    ctx.run("swapon", "/dev/mapper/cryptswap")
    ctx.run("pacstrap", "-K", ctx.target, "base", "base-devel", "linux", "linux-firmware", "sof-firmware",
            "networkmanager", "btrfs-progs", "cryptsetup", "dosfstools", "python", "git", "stow", "polkit", "vim", "tmux")
    if ctx.apply:
        ctx.write("etc/fstab", read("genfstab", "-U", ctx.target) + "\n")
        configure_system(ctx)
    else:
        print("  替换生成 fstab（不追加）；按新 LUKS UUID 写入配置，再生成 UKI 和引导器")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("arch-install", "arch-mount", "arch-post-install"))
    parser.add_argument("--disk", required=True, type=Path)
    parser.add_argument("--efi-part", type=Path)
    parser.add_argument("--swap-part", type=Path)
    parser.add_argument("--root-part", type=Path)
    parser.add_argument("--mount-root", type=Path, default=Path("/mnt"))
    parser.add_argument("--hostname", default="Akira")
    parser.add_argument("--user", default="akira")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true")
    mode.add_argument("--check", "--dry-run", action="store_true")
    parser.add_argument("--erase", action="store_true", help="明确允许格式化所选三个分区，仅限 arch-install")
    args = parser.parse_args()
    if args.action == "arch-install" and args.apply and not args.erase:
        parser.error("实际安装会清除所选三个分区；检查布局后须明确指定 --apply --erase")
    if args.erase and args.action != "arch-install":
        parser.error("挂载/后置配置阶段不接受 --erase")
    if not re.fullmatch(r"[a-z_][a-z0-9_-]*", args.user) or not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9.-]*", args.hostname):
        parser.error("用户名或主机名无效")
    disk = args.disk.resolve()
    prefix = str(disk) + ("p" if disk.name[-1:].isdigit() else "")
    ctx = Installation(Path(__file__).resolve().parents[1], disk,
                       (args.efi_part or Path(prefix + "1")).resolve(),
                       (args.swap_part or Path(prefix + "2")).resolve(),
                       (args.root_part or Path(prefix + "3")).resolve(),
                       args.mount_root.absolute(), args.hostname, args.user, args.apply)
    print(f"{args.action}: disk={ctx.disk}; EFI={ctx.efi} → /efi; swap={ctx.swap}; root={ctx.root}; target={ctx.target}")
    preflight(ctx, args.action)
    {"arch-install": install_system, "arch-mount": mount_system, "arch-post-install": configure_system}[args.action](ctx)
    if not ctx.apply:
        print("只读检查完成，未格式化、挂载或写入。")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f"错误：{error}\n安装步骤已停止；不自动回滚格式化或卸载已有挂载。", file=sys.stderr)
        sys.exit(1)
