-- Autocmds are automatically loaded on the VeryLazy event
-- Default autocmds that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/autocmds.lua
--
-- Add any additional autocmds here
-- with `vim.api.nvim_create_autocmd`
--
-- Or remove existing autocmds by their group name (which is prefixed with `lazyvim_` for the defaults)
-- e.g. vim.api.nvim_del_augroup_by_name("lazyvim_wrap_spell")

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
