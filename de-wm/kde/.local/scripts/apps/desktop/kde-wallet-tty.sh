#!/bin/bash

if [ "$XDG_CURRENT_DESKTOP" = "KDE" ]; then
    killall kwalletd6 2>/dev/null
    kwalletd6 &
    /usr/lib/pam_kwallet_init &
fi

