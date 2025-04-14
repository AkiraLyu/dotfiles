local function switch_to_english()
  os.execute("fcitx5-remote -c") -- 切换到默认（英文）输入法
end

-- 自动切换输入法的 autocmd
vim.api.nvim_create_autocmd("InsertLeave", {
  callback = switch_to_english, -- 在离开插入模式时调用
})
