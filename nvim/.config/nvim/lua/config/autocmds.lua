-- Autocmds are automatically loaded on the VeryLazy event
-- Default autocmds that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/autocmds.lua
--
-- Add any additional autocmds here
-- with `vim.api.nvim_create_autocmd`
--
-- Or remove existing autocmds by their group name (which is prefixed with `lazyvim_` for the defaults)
-- e.g. vim.api.nvim_del_augroup_by_name("lazyvim_wrap_spell")

vim.api.nvim_create_augroup("TexCompile", { clear = true })

vim.api.nvim_create_autocmd("BufWritePost", {
  group = "TexCompile",
  pattern = "*.tex",
  callback = function()
    vim.cmd("silent !xelatex " .. vim.fn.expand("%"))
  end,
})

-- 禁止自动格式化
vim.api.nvim_create_autocmd({ "FileType" }, {
  pattern = { "c", "cpp", "shell" },
  callback = function()
    vim.b.autoformat = false
  end,
})

-- 自动切换输入法
-- 切换到英文输入的函数
local function switch_to_english()
  os.execute("fcitx5-remote -c") -- 切换到默认（英文）输入法
end

-- 自动切换输入法的 autocmd
vim.api.nvim_create_autocmd("InsertLeave", {
  callback = switch_to_english, -- 在离开插入模式时调用
})

-- 映射一个快捷键手动触发
vim.api.nvim_set_keymap("n", "K", "<cmd>lua vim.lsp.buf.hover()<CR>", { noremap = true, silent = true })

-- 自动触发光标悬浮显示
-- vim.api.nvim_create_autocmd("CursorHold", {
--   pattern = "*",
--   callback = function()
--     vim.lsp.buf.hover()
--   end,
-- })
--
--
