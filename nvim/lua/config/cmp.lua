local has_words_before = function()
  unpack = unpack or table.unpack
  local line, col = unpack(vim.api.nvim_win_get_cursor(0))
  return col ~= 0 and vim.api.nvim_buf_get_lines(0, line - 1, line, true)[1]:sub(col, col):match("%s") == nil
end

local luasnip = require("luasnip")
local cmp = require("cmp")

cmp.setup({
  snippet = {
    -- REQUIRED - you must specify a snippet engine
    expand = function(args)
      require("luasnip").lsp_expand(args.body) -- For `luasnip` users.
    end,
  },

  window = {
    completion = {
      border = "rounded", -- Use 'rounded' for rounded corners, you can also use 'single', 'double', 'solid', etc.
      winhighlight = "Normal:Normal,FloatBorder:FloatBorder,CursorLine:Visual,Search:None", -- Highlighting for window elements
    },
    documentation = {
      border = "rounded", -- Same for documentation window
      winhighlight = "Normal:Normal,FloatBorder:FloatBorder,CursorLine:Visual,Search:None", -- Highlighting for window elements
    },
  },

  mapping = cmp.mapping.preset.insert({
    -- Use <C-b/f> to scroll the docs
    ["<C-b>"] = cmp.mapping.scroll_docs(-4),
    ["<C-f>"] = cmp.mapping.scroll_docs(4),
    -- Use <C-k/j> to switch in items
    ["<C-k>"] = cmp.mapping.select_prev_item(),
    ["<C-j>"] = cmp.mapping.select_next_item(),
    -- Use <CR>(Enter) to confirm selection
    -- Accept currently selected item. Set `select` to `false` to only confirm explicitly selected items.
    ["<CR>"] = cmp.mapping.confirm({ select = false }),

    -- A super tab
    -- sourc: https://github.com/hrsh7th/nvim-cmp/wiki/Example-mappings#luasnip
    ["<C-Tab>"] = cmp.mapping(function(fallback)
      -- Hint: if the completion menu is visible select next one
      if cmp.visible() then
        cmp.select_next_item()
      elseif has_words_before() then
        cmp.complete()
      else
        fallback()
      end
    end, { "i", "s" }), -- i - insert mode; s - select mode
    ["<Tab>"] = cmp.mapping(function(fallback)
      -- if cmp.visible() then
      -- cmp.select_prev_item()
      if luasnip.jumpable(1) then
        luasnip.jump(1)
      else
        fallback()
      end
    end, { "i", "s" }),
  }),

  formatting = {
    format = function(entry, item)
      local icons = LazyVim.config.icons.kinds
      if icons[item.kind] then
        item.kind = icons[item.kind] .. item.kind
      end

      local widths = {
        abbr = vim.g.cmp_widths and vim.g.cmp_widths.abbr or 40,
        menu = vim.g.cmp_widths and vim.g.cmp_widths.menu or 30,
      }

      for key, width in pairs(widths) do
        if item[key] and vim.fn.strdisplaywidth(item[key]) > width then
          item[key] = vim.fn.strcharpart(item[key], 0, width - 1) .. "…"
        end
      end

      return item
    end,
  },

  -- Set source precedence
  sources = cmp.config.sources({
    { name = "luasnip" }, -- For luasnip user
    { name = "nvim_lsp" }, -- For nvim-lsp
    { name = "buffer" }, -- For buffer word completion
    { name = "path" }, -- For path completion
    { name = "latex_title" },
  }),
})

-- 自定义标题补全源
local title_source = {
  name = "latex_title",
  complete = function(_, _, callback)
    callback({
      { label = "Frc", insertText = "\\frac{$1}{$2}", insertTextFormat = 2 },
      { label = "td", insertText = "^{$1}", insertTextFormat = 2 },
      { label = "mmb", insertText = "$$1$", insertTextFormat = 2 },
    })
  end,
}

vim.api.nvim_create_autocmd({ "FileType" }, {
  pattern = "tex",
  callback = function()
    cmp.register_source("latex_title", title_source)
  end,
})
