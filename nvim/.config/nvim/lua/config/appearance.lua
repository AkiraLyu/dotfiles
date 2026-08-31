local M = {}

local function valid(mode)
  return mode == "light" or mode == "dark"
end

function M.mode()
  local state_home = os.getenv("XDG_STATE_HOME")
  if not state_home or state_home == "" then
    local home = os.getenv("HOME")
    state_home = home and (home .. "/.local/state") or nil
  end

  if state_home then
    local file = io.open(state_home .. "/theme/mode", "r")
    if file then
      local mode = file:read("*l")
      file:close()
      if valid(mode) then
        return mode
      end
    end
  end

  -- 兼容远程环境及首次执行 `theme apply` 之前的会话。
  local inherited = os.getenv("TERTHEME")
  if valid(inherited) then
    return inherited
  end

  return "light"
end

return M
