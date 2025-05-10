-- Keymaps are automatically loaded on the VeryLazy event
-- Default keymaps that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/keymaps.lua
-- Add any additional keymaps here
vim.keymap.set("n", "gl", vim.diagnostic.open_float, { desc = "Show diagnostics under cursor" })

vim.keymap.set("n", "gcA", function()
  local cs = vim.bo.commentstring
  local comment = cs:match("^(.*)%%s")
  if comment then
    vim.cmd("normal! A " .. comment)
  else
    vim.cmd("normal! A //")
  end
  vim.cmd("startinsert!")
end, { desc = "Add Comment at End of Line" })
