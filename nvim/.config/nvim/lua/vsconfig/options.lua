vim.o.hlsearch = true
vim.keymap.set("n", "<Esc>", function()
  vim.cmd("nohlsearch")
end, { noremap = true, silent = true })
