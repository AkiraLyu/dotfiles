return {
  {
    dir = "/home/akira/.local/share/nvim/nvim-plugins/fcitx-switch",
    name = "fcitx-switch",
    config = function()
      require("fcitx_switch").setup() -- 如果你有 setup
    end,
  },
}
