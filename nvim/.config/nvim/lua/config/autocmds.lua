-- Autocmds are automatically loaded on the VeryLazy event
-- Default autocmds that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/autocmds.lua
--
-- Add any additional autocmds here
-- with `vim.api.nvim_create_autocmd`
--
-- Or remove existing autocmds by their group name (which is prefixed with `lazyvim_` for the defaults)
-- e.g. vim.api.nvim_del_augroup_by_name("lazyvim_wrap_spell")

-- 自动编译 LaTeX 文件
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
  -- pattern = { "c", "cpp", "shell", "fish", "sh" },
  pattern = { "shell", "fish", "sh" },
  callback = function()
    vim.b.autoformat = false
  end,
})

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

-- 禁用latex preview
vim.api.nvim_create_autocmd("FileType", {
  pattern = "tex",
  callback = function()
    vim.opt_local.conceallevel = 0
  end,
})

-- Detect large files
vim.api.nvim_create_autocmd("BufReadPre", {
  callback = function()
    local max_filesize = 1024 * 1024 * 20 -- 20MB
    local file = vim.api.nvim_buf_get_name(0)
    local ok, stats = pcall(vim.loop.fs_stat, file)
    if ok and stats and stats.size > max_filesize then
      vim.opt.laststatus = 0
      -- Disable heavy features
      vim.cmd([[
        syntax off
        filetype off
        setlocal buftype=nowrite
        setlocal noswapfile
        setlocal noundofile
        setlocal nobuflisted
        setlocal nospell
        setlocal nocursorline
        setlocal signcolumn=no
        setlocal foldmethod=manual
        setlocal eventignore=all
      ]])

      -- Close treesitter & lsp if running
      pcall(vim.cmd, "TSBufDisable highlight")
      pcall(vim.cmd, "TSBufDisable incremental_selection")
      pcall(vim.cmd, "TSBufDisable indent")
      pcall(vim.cmd, "LspStop")

      vim.bo.filetype = "text"
      print("⚠️ Large file detected — switched to plain text mode")
    end
  end,
})
