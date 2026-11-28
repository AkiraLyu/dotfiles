set -g fish_key_bindings fish_vi_key_bindings


# Added by Antigravity CLI installer
set -gx PATH "/home/akira/.local/bin" $PATH

# The next line updates PATH for the Google Cloud SDK.
if [ -f "$HOME/.local/bin/google-cloud-sdk/path.fish.inc" ]; . "$HOME/.local/bin/google-cloud-sdk/path.fish.inc"; end
