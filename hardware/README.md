# AVS 固件与启动输入

实际使用的 AVS Tiger Lake 固件保存于 `backup/firmware/intel/avs/tgl/dsp_basefw.bin`，大小 546,764 字节。`avs-firmware.json` 保存部署路径和 SHA256：`c9d5e942c13e826ce0effeeb1e3c97963113c3c4823a4e23462d52862841111f`。

这是从当前正常使用的机器捕获的原始文件，未确认最初下载的上游提交；没有将它标记为任何未核实的官方版本。文件随私有的 `backup/` 手动迁移，不进入 Git。它仍由专用恢复阶段管理，未伪装成现有 pacman 包。

- `--arch-install` / `--arch-post-install` 在写入磁盘前校验固件，先复制到目标系统、加入 mkinitcpio FILES，再生成 UKI。可通过 `--backup-dir` 指定备份根目录。
- 对已有系统使用 `./install.sh --restore firmware --check` 和 `./install.sh --restore firmware`。内容相同则跳过；不同文件或链接会停止。实际新增后通过 run0 写入并运行 `mkinitcpio -P`。
- 自定义 `block` 中的 MFD 过滤和 `sound.conf` 的 `dsp_driver=4` 保持原有语义。EDID 参数不改动，也不补充 EDID 固件。

`etc/initcpio/install/block` 安装到 `/etc/initcpio/install/block`，加载当前系统包的 hook，仅在该 hook 执行期间过滤 `add_checked_modules /drivers/mfd/`，随后恢复原函数。用户确认这项排除是触控板正常工作的必要条件，必须保留；上游若改变调用方式，需要重新核对过滤规则。它不冻结整份上游 hook，也不全局禁用 MFD 驱动。

`install.sh etc` 部署独立文件，避免 TLP 的 ProtectHome 隔离无法读取家目录链接。它先比较所有内容，只接管同源链接/相同文件，保留目标 root.conf 的 LUKS UUID，不覆盖不同的本机配置；新增 hwdb 后编译数据库。此操作不重建 UKI、不启停服务。修改启动参数后需另行重建镜像并验收。
