#!/bin/bash

IMAGE="/home/akira/.config/wlogout/lock"

if [ -d "$IMAGE" ]; then
    cd "$IMAGE"
    rm -rf ./*
    grim "$IMAGE/lock.png"
else
    cd /home/akira/.config/wlogout
    mkdir lock
    cd lock
    grim "$IMAGE/lock.png"
fi

convert "$IMAGE/lock.png" -filter Gaussian -resize 50% -define filter:sigma=2.5 -resize 200% "$IMAGE/lock.png"

swaylock -u -e -f -i "$IMAGE/lock.png"
