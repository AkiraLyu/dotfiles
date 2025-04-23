#!/bin/fish

set base_url "https://www.bilibili.com/video/BV1gp421X78k?p="

set start 11
set end 24

for i in (seq $start $end)
    set url "$base_url$i"
    echo "Downloading from: $url"

    yt-dlp --cookies-from-browser firefox "$url"

    sleep 2
end
