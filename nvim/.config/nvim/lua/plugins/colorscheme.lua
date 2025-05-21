local theme = os.getenv("TERTHEME")

if theme == "dark" then
  return {
    {
      "LazyVim/LazyVim",
      opts = {
        colorscheme = "tokyonight",
      },
    },
    {
      "folke/tokyonight.nvim",
      lazy = false,
      priority = 1000,
      opts = { style = "moon" },
    },
  }
else -- 默认使用 light（vscode）
  return {
    {
      "Mofiqul/vscode.nvim",
      lazy = false,
      priority = 1000,
      config = function()
        local c = require("vscode.colors").get_colors()
        require("vscode").setup({
          transparent = true,
          italic_comments = true,
          underline_links = true,
          disable_nvimtree_bg = true,
          terminal_colors = true,
          color_overrides = {
            vscLineNumber = "#000000",
          },
          group_overrides = {
            Cursor = { fg = c.vscDarkBlue, bg = c.vscLightGreen, bold = true },
          },
        })
        vim.cmd("colorscheme vscode")
      end,
    },
  }
end
