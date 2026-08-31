local theme = vim.g.appearance_mode or require("config.appearance").mode()

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
      "LazyVim/LazyVim",
      opts = {
        -- LazyVim 默认会先加载深色 TokyoNight；在这里明确指定
        -- VSCode Light，避免插件加载顺序把 background 留在 dark。
        colorscheme = function()
          require("vscode").load("light")
        end,
      },
    },
    {
      "Mofiqul/vscode.nvim",
      lazy = false,
      priority = 1000,
      config = function()
        vim.o.background = "light"
        local c = require("vscode.colors").get_colors()
        require("vscode").setup({
          style = "light",
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
        require("vscode").load("light")
      end,
    },
  }
end
