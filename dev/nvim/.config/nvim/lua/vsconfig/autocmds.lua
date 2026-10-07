-- 映射一个快捷键手动触发
vim.api.nvim_set_keymap("n", "K", "<cmd>lua vim.lsp.buf.hover()<CR>", { noremap = true, silent = true })

-- 保存当前输入法状态的变量
local input_status = 0

-- 检查是否是 Linux 且有 fcitx5-remote 命令
local function has_fcitx5()
  return vim.fn.executable("fcitx5-remote") == 1
end

-- 获取当前输入法状态
local function get_input_status()
  return tonumber(vim.fn.system("fcitx5-remote")) or 0
end

-- 切换到英文输入法
local function switch_to_english()
  if has_fcitx5() then
    input_status = get_input_status()
    if input_status ~= 0 then
      vim.fn.system("fcitx5-remote -c")
    end
  end
end

-- 恢复原来的输入法状态
local function restore_input_method()
  if has_fcitx5() and input_status == 2 then
    vim.fn.system("fcitx5-remote -o")
  end
end

-- 设置自动命令
vim.api.nvim_create_autocmd("InsertLeave", {
  pattern = "*",
  callback = switch_to_english,
})

vim.api.nvim_create_autocmd("InsertEnter", {
  pattern = "*",
  callback = restore_input_method,
})
