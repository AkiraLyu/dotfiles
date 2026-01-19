#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <libinput.h>
#include <libudev.h>
#include <fcntl.h>
#include <errno.h>
#include <string.h>
#include <poll.h>
#include <systemd/sd-bus.h> // 引入 systemd dbus 库

#define SWIPE_THRESHOLD 20.0

/* * 保持一个全局或传递的 bus 连接，避免重复连接
 */

// 使用 sd-bus 检查 Overview 是否激活
int is_overview_active(sd_bus *bus) {
    sd_bus_error error = SD_BUS_ERROR_NULL;
    int active = 0;
    char **effects = NULL; // 这是一个字符串数组

    // 获取 activeEffects 属性
    int r = sd_bus_get_property_strv(
        bus,
        "org.kde.KWin",             
        "/Effects",                 
        "org.kde.kwin.Effects",     
        "activeEffects",            
        &error,
        &effects
    );

    if (r < 0) {
        // 这里的错误并不总是严重，有时只是属性获取失败，不打印 log 以免刷屏
        // fprintf(stderr, "DBus get property failed: %s\n", error.message);
        sd_bus_error_free(&error);
        return 0;
    }

    // 遍历数组查找 "overview"
    if (effects) {
        for (char **curr = effects; *curr; curr++) {
            if (strcmp(*curr, "overview") == 0) {
                active = 1;
                // 找到后不要立即 break，因为还需要继续循环来释放内存，
                // 或者在这里 break 之前，必须有一个专门的清理逻辑。
                // 为了代码简单，我们先记录 active 状态，等循环结束后统一释放。
            }
        }

        // --- 修复部分开始：手动释放内存 ---
        // sd_bus_get_property_strv 返回的是 NULL 结尾的字符串数组
        // 我们需要先释放每一个字符串，最后释放数组指针本身
        for (char **curr = effects; *curr; curr++) {
            free(*curr);
        }
        free(effects);
        // --- 修复部分结束 ---
    }

    return active;
}

// 使用 sd-bus 触发快捷键
void trigger_shortcut(sd_bus *bus, const char *shortcut_name) {
    sd_bus_error error = SD_BUS_ERROR_NULL;
    sd_bus_message *m = NULL;

    // 构造方法调用
    int r = sd_bus_call_method(
        bus,
        "org.kde.kglobalaccel",                 // Service
        "/component/kwin",                      // Object
        "org.kde.kglobalaccel.Component",       // Interface
        "invokeShortcut",                       // Method
        &error,                                 // Error return
        &m,                                     // Reply message
        "s",                                    // Signature (string)
        shortcut_name                           // Argument
    );

    if (r < 0) {
        fprintf(stderr, "Failed to invoke shortcut %s: %s\n", shortcut_name, error.message);
        sd_bus_error_free(&error);
    }
    
    // 我们不需要回复内容，释放消息
    sd_bus_message_unref(m);
}

static int open_restricted(const char *path, int flags, void *user_data) {
    int fd = open(path, flags);
    if (fd < 0)
        fprintf(stderr, "Failed to open %s: %s\n", path, strerror(errno));
    return fd;
}

static void close_restricted(int fd, void *user_data) {
    close(fd);
}

const struct libinput_interface interface = {
    .open_restricted = open_restricted,
    .close_restricted = close_restricted,
};

int main(void) {
    // 1. 初始化 D-Bus 连接 (User Session)
    sd_bus *bus = NULL;
    int r = sd_bus_default_user(&bus);
    if (r < 0) {
        fprintf(stderr, "Failed to connect to user bus: %s\n", strerror(-r));
        return 1;
    }

    // 2. 初始化 libinput
    struct udev *udev = udev_new();
    if (!udev) {
        fprintf(stderr, "Failed to initialize udev\n");
        sd_bus_unref(bus);
        return 1;
    }

    struct libinput *li = libinput_udev_create_context(&interface, NULL, udev);
    if (!li) {
        fprintf(stderr, "Failed to initialize libinput\n");
        udev_unref(udev);
        sd_bus_unref(bus);
        return 1;
    }

    if (libinput_udev_assign_seat(li, "seat0") != 0) {
        fprintf(stderr, "Failed to assign seat\n");
        libinput_unref(li);
        udev_unref(udev);
        sd_bus_unref(bus);
        return 1;
    }

    struct libinput_event *event;
    int fingers_active = 0;
    double total_dx = 0.0;
    double total_dy = 0.0;

    // 3. 准备 poll (需要同时监听 libinput 和 dbus，但在本例中我们只主动调用 dbus，不需监听 dbus 信号，所以只 poll libinput)
    struct pollfd fds;
    fds.fd = libinput_get_fd(li);
    fds.events = POLLIN;

    printf("Gesture daemon started. Listening...\n");

    while (1) {
        // 等待事件
        if (poll(&fds, 1, -1) < 0) {
            if (errno == EINTR) continue;
            break;
        }

        libinput_dispatch(li);

        while ((event = libinput_get_event(li)) != NULL) {
            enum libinput_event_type type = libinput_event_get_type(event);

            // 处理手势
            if (type == LIBINPUT_EVENT_GESTURE_SWIPE_BEGIN) {
                struct libinput_event_gesture *g = libinput_event_get_gesture_event(event);
                if (libinput_event_gesture_get_finger_count(g) == 3) {
                    fingers_active = 3;
                    total_dx = 0.0;
                    total_dy = 0.0;
                    // printf("3-finger swipe BEGIN\n"); // 生产环境建议注释掉 log 以减少 I/O
                }
            }
            else if (type == LIBINPUT_EVENT_GESTURE_SWIPE_UPDATE && fingers_active == 3) {
                struct libinput_event_gesture *g = libinput_event_get_gesture_event(event);
                total_dx += libinput_event_gesture_get_dx(g);
                total_dy += libinput_event_gesture_get_dy(g);
            }
            else if (type == LIBINPUT_EVENT_GESTURE_SWIPE_END && fingers_active == 3) {
                // printf("3-finger swipe END: dy=%.2f\n", total_dy);

                if (total_dy < -SWIPE_THRESHOLD) {
                    // UP: Open Overview
                    trigger_shortcut(bus, "Overview");
                }
                else if (total_dy > SWIPE_THRESHOLD) {
                    // DOWN: Close Overview OR Minimize
                    if (is_overview_active(bus)) {
                        trigger_shortcut(bus, "Overview");
                    } else {
                        trigger_shortcut(bus, "Window Minimize");
                    }
                }
                fingers_active = 0;
            }
            // 忽略 Cancel 事件和其他手指数量
            else if (type == LIBINPUT_EVENT_GESTURE_SWIPE_END) {
                fingers_active = 0;
            }

            libinput_event_destroy(event);
        }
        
        // 处理 D-Bus 请求 (如果有入站流量，虽然我们主要只是发送)
        sd_bus_process(bus, NULL);
    }

    libinput_unref(li);
    udev_unref(udev);
    sd_bus_unref(bus);
    return 0;
}
