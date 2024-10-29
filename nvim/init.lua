-- bootstrap lazy.nvim, LazyVim and your plugins
require("config.lazy")
require("config.template")
require("config.cmp")
require("plugins.logo")

vim.o.tabstop = 4
vim.bo.tabstop = 4
vim.o.softtabstop = 4
vim.o.shiftround = true
vim.o.shiftwidth = 4
vim.o.relativenumber = false
