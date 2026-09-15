return {
  {
    "https://github.com/AkiraLyu/nvim-plugins",
    name = "nvim-plugins",
    lazy = false,
    config = function(plugin)
      vim.opt.rtp:append(plugin.dir .. "/fcitx-switch")
      vim.opt.rtp:append(plugin.dir .. "/nvimtex")

      require("fcitx_switch").setup()
      require("nvimtex").setup()
    end,
  },
}
