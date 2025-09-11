#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <libinput.h>
#include <libudev.h>
#include <fcntl.h>
#include <errno.h>
#include <string.h>
#include <poll.h>

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
    struct udev *udev = udev_new();
    if (!udev) {
        fprintf(stderr, "Failed to initialize udev\n");
        return 1;
    }

    struct libinput *li = libinput_udev_create_context(&interface, NULL, udev);
    if (!li) {
        fprintf(stderr, "Failed to initialize libinput\n");
        udev_unref(udev);
        return 1;
    }

    if (libinput_udev_assign_seat(li, "seat0") != 0) {
        fprintf(stderr, "Failed to assign seat\n");
        libinput_unref(li);
        udev_unref(udev);
        return 1;
    }

    struct libinput_event *event;
    double last_scale = 1.0;
    int fingers_active = 0;

    while (1) {
        libinput_dispatch(li);

        while ((event = libinput_get_event(li)) != NULL) {
            enum libinput_event_type type = libinput_event_get_type(event);

            if (type == LIBINPUT_EVENT_GESTURE_PINCH_BEGIN) {
                struct libinput_event_gesture *g =
                    libinput_event_get_gesture_event(event);
                int fingers = libinput_event_gesture_get_finger_count(g);

                if (fingers == 3) {
                    fingers_active = 3;
                    last_scale = 1.0;
                    printf("3-finger pinch BEGIN\n");
                }
            }
            else if (type == LIBINPUT_EVENT_GESTURE_PINCH_UPDATE && fingers_active == 3) {
                struct libinput_event_gesture *g =
                    libinput_event_get_gesture_event(event);
                last_scale = libinput_event_gesture_get_scale(g);
            }
            else if (type == LIBINPUT_EVENT_GESTURE_PINCH_END && fingers_active == 3) {
                if (last_scale < 1.0) {
                    printf("3-finger pinch END with shrink → open-overview\n");
                    fflush(stdout);
                    system("niri msg action open-overview &");
                } else if (last_scale > 1.0) {
                    printf("3-finger pinch END with zoom → close-overview\n");
                    fflush(stdout);
                    system("niri msg action close-overview &");
                }

                fingers_active = 0;
                last_scale = 1.0;
            }

            libinput_event_destroy(event);
        }

        struct pollfd fds;
        fds.fd = libinput_get_fd(li);
        fds.events = POLLIN;
        poll(&fds, 1, -1);
    }

    libinput_unref(li);
    udev_unref(udev);
    return 0;
}
