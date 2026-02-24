#include <fcntl.h>
#include <libinput.h>
#include <libudev.h>
#include <math.h>
#include <poll.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <systemd/sd-bus.h>
#include <unistd.h>

#define SWIPE_THRESHOLD 30.0

int is_show_desktop_active(sd_bus *bus) {
    sd_bus_error error = SD_BUS_ERROR_NULL;
    int showing = 0;

    int r = sd_bus_get_property_trivial(bus,
                                        "org.kde.KWin",   // service
                                        "/KWin",          // path
                                        "org.kde.KWin",   // interface
                                        "showingDesktop", // property
                                        &error,
                                        'b', // boolean
                                        &showing);

    if (r < 0) {
        sd_bus_error_free(&error);
        return 0;
    }

    return showing;
}

int is_overview_active(sd_bus *bus) {
    sd_bus_error error = SD_BUS_ERROR_NULL;
    int active = 0;
    char **effects = NULL;

    int r = sd_bus_get_property_strv(bus, "org.kde.KWin", "/Effects",
                                     "org.kde.kwin.Effects", "activeEffects",
                                     &error, &effects);

    if (r < 0) {
        sd_bus_error_free(&error);
        return 0;
    }

    if (effects) {
        for (char **curr = effects; *curr; curr++) {
            if (strcmp(*curr, "overview") == 0)
                active = 1;
            free(*curr);
        }
        free(effects);
    }
    return active;
}

void trigger_shortcut(sd_bus *bus, const char *shortcut_name) {
    sd_bus_error error = SD_BUS_ERROR_NULL;
    sd_bus_message *m = NULL;

    int r =
        sd_bus_call_method(bus, "org.kde.kglobalaccel", "/component/kwin",
                           "org.kde.kglobalaccel.Component", "invokeShortcut",
                           &error, &m, "s", shortcut_name);

    if (r < 0)
        fprintf(stderr, "Failed: %s\n", error.message);

    sd_bus_error_free(&error);
    sd_bus_message_unref(m);
}

static int open_restricted(const char *path, int flags, void *user_data) {
    return open(path, flags);
}
static void close_restricted(int fd, void *user_data) { close(fd); }

const struct libinput_interface interface = {
    .open_restricted = open_restricted,
    .close_restricted = close_restricted,
};

int main(void) {

    sd_bus *bus = NULL;
    sd_bus_default_user(&bus);

    struct udev *udev = udev_new();
    struct libinput *li = libinput_udev_create_context(&interface, NULL, udev);
    libinput_udev_assign_seat(li, "seat0");

    struct pollfd fds;
    fds.fd = libinput_get_fd(li);
    fds.events = POLLIN;

    struct libinput_event *event;
    int fingers_active = 0;
    double total_dx = 0.0;
    double total_dy = 0.0;

    printf("Gesture daemon started\n");

    while (1) {
        poll(&fds, 1, -1);
        libinput_dispatch(li);

        while ((event = libinput_get_event(li)) != NULL) {

            enum libinput_event_type type = libinput_event_get_type(event);

            if (type == LIBINPUT_EVENT_GESTURE_SWIPE_BEGIN) {
                struct libinput_event_gesture *g =
                    libinput_event_get_gesture_event(event);

                if (libinput_event_gesture_get_finger_count(g) == 3) {
                    fingers_active = 3;
                    total_dx = 0;
                    total_dy = 0;
                }
                if (libinput_event_gesture_get_finger_count(g) == 4) {
                    fingers_active = 4;
                    total_dx = 0;
                    total_dy = 0;
                }
            }

            else if (type == LIBINPUT_EVENT_GESTURE_SWIPE_UPDATE &&
                     fingers_active == 3) {
                struct libinput_event_gesture *g =
                    libinput_event_get_gesture_event(event);

                total_dx += libinput_event_gesture_get_dx(g);
                total_dy += libinput_event_gesture_get_dy(g);
            }

            // else if (type == LIBINPUT_EVENT_GESTURE_SWIPE_UPDATE &&
            //          fingers_active == 4) {
            //   struct libinput_event_gesture *g =
            //       libinput_event_get_gesture_event(event);
            //
            //   total_dx += libinput_event_gesture_get_dx(g);
            //   total_dy += libinput_event_gesture_get_dy(g);
            // }
            //
            else if (type == LIBINPUT_EVENT_GESTURE_SWIPE_END &&
                     fingers_active == 3) {

                double abs_dx = fabs(total_dx);
                double abs_dy = fabs(total_dy);

                /* 判断主方向 */
                if (abs_dy > abs_dx) {

                    if (total_dy < -SWIPE_THRESHOLD) {
                        /* UP -> Windows Task View */
                        if (is_show_desktop_active(bus)) {
                            trigger_shortcut(bus, "Show Desktop");
                        } else
                            trigger_shortcut(bus, "Overview");
                    } else if (total_dy > SWIPE_THRESHOLD) {
                        /* DOWN -> Show Desktop */
                        if (is_overview_active(bus)) {
                            trigger_shortcut(bus, "Overview");
                        } else
                            trigger_shortcut(bus, "Show Desktop");
                    }
                }
                // else {
                //
                //   if (total_dx > SWIPE_THRESHOLD) {
                //     /* RIGHT -> Next Desktop */
                //     trigger_shortcut(bus, "Switch to Previous Desktop");
                //   } else if (total_dx < -SWIPE_THRESHOLD) {
                //     /* LEFT -> Previous Desktop */
                //     trigger_shortcut(bus, "Switch to Next Desktop");
                //   }
                // }

                fingers_active = 0;
            }
            // else if (type == LIBINPUT_EVENT_GESTURE_SWIPE_END &&
            //            fingers_active == 4) {
            //   double abs_dx = fabs(total_dx);
            //   double abs_dy = fabs(total_dy);
            // if (abs_dx > abs_dy) {
            //   if (total_dx > SWIPE_THRESHOLD) {
            //     trigger_shortcut(bus, "Window to Next Desktop");
            //   }
            //   if (total_dx < -SWIPE_THRESHOLD) {
            //     trigger_shortcut(bus, "Window to Previous Desktop");
            //   }
            // } else
            //   continue;
            //}

            libinput_event_destroy(event);
        }

        sd_bus_process(bus, NULL);
    }
}
