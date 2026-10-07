return {
  {
    "jamessan/vim-gnupg",
    lazy = false, -- 必须 eager 加载才能工作
    init = function()
      -- 自动使用你的 GPG 密钥进行加密
      vim.g.GPGPreferSign = 0
      vim.g.GPGUseAgent = 1
      vim.g.GPGDefaultRecipients = { "akira.uestc@gmail.com" }
      vim.g.GPGEncryptToSelf = 1
      vim.g.GPGPreferArmor = 1
      vim.g.GPGKeepTempFiles = 0
      vim.g.GPGExecutable = "gpg" -- 也可以改为 gpg2，看你系统上哪个可用
    end,
  },
}
