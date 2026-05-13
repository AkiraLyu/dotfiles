#!/bin/bash

if [[ $(pidof pot) = "" ]]; then
    pot &
fi

grim -g "$(slurp)" ~/.cache/com.pot-app.desktop/pot_screenshot_cut.png && curl "http://127.0.0.1:60828/ocr_translate?screenshot=false"

