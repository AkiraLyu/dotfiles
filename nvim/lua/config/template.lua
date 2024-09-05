vim.api.nvim_create_autocmd("BufNewFile", {
  pattern = "*.tex",
  callback = function()
    vim.api.nvim_buf_set_lines(0, 0, -1, false, {
      "\\documentclass{article}",
      "\\begin{document}",
      "",
      "\\end{document}",
    })

    vim.api.nvim_win_set_cursor(0, { 3, 0 })

    vim.cmd("startinsert")
  end,
})

vim.api.nvim_create_autocmd("BufNewFile", {
  pattern = { "*.c" },
  callback = function()
    vim.api.nvim_buf_set_lines(0, 0, -1, false, {
      "/*",
      " * Filename: " .. vim.fn.expand("%:t"),
      " * Author: Akira",
      " * Description: ",
      " */",
      "",
      "#include <stdio.h>",
      "",
      "int main() {",
      "    ",
      "    return 0;",
      "}",
    })

    vim.api.nvim_win_set_cursor(0, { 10, vim.fn.col("$") })

    vim.cmd("startinsert")

    vim.api.nvim_win_set_cursor(0, { 10, vim.fn.col("$") + 1 })
  end,
})

vim.api.nvim_create_autocmd("BufNewFile", {
  pattern = { "*.cpp", "*.cc" },
  callback = function()
    vim.api.nvim_buf_set_lines(0, 0, -1, false, {
      "/*",
      " * Filename: " .. vim.fn.expand("%:t"),
      " * Author: Akira",
      " * Description: ",
      " */",
      "",
      "#include <iostream>",
      "",
      "int main() {",
      "    ",
      "    return 0;",
      "}",
    })

    vim.api.nvim_win_set_cursor(0, { 10, vim.fn.col("$") })

    vim.cmd("startinsert")

    vim.api.nvim_win_set_cursor(0, { 10, vim.fn.col("$") + 1 })
  end,
})

vim.api.nvim_create_autocmd("BufNewFile", {
  pattern = { "*.h", "*.hpp" },
  callback = function()
    local filename = vim.fn.expand("%:t"):gsub("%.", "_"):upper()
    vim.api.nvim_buf_set_lines(0, 0, -1, false, {
      "/*",
      " * Filename: " .. vim.fn.expand("%:t"),
      " * Author: Your Name",
      " * Description: ",
      " */",
      "",
      "#ifndef " .. filename,
      "#define " .. filename,
      "",
      "",
      "",
      "#endif /* " .. filename .. " */",
    })

    vim.api.nvim_win_set_cursor(0, { 10, vim.fn.col("$") })

    vim.cmd("startinsert")

    vim.api.nvim_win_set_cursor(0, { 10, vim.fn.col("$") + 1 })
  end,
})

vim.api.nvim_create_autocmd("BufNewFile", {
  pattern = { "*.md" },
  callback = function()
    local filename = vim.fn.expand("%:t"):gsub("%.md$", "")

    vim.api.nvim_buf_set_lines(0, 0, -1, false, {
      "# " .. filename,
      "",
    })

    vim.api.nvim_win_set_cursor(0, { 2, vim.fn.col("$") })

    vim.cmd("startinsert")
  end,
})
