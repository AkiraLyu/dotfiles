import pyautogui
import time

time.sleep(5)

i = 0

try:
    while True:
        i = i + 1
        pyautogui.press("f5")
        print("F5 pressed,count:", i)
        time.sleep(10)
except KeyboardInterrupt:
    print("paused")
