#define _GNU_SOURCE

#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <poll.h>
#include <pthread.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/syscall.h>
#include <sys/types.h>
#include <sys/un.h>
#include <unistd.h>

/*
 * Chromium statically links its Wayland client, while Electron exposes only an
 * Ozone AcceleratedWidget id. Neither gives application code the wl_surface
 * required by ext-background-effect-v1. This preload bridge therefore proxies
 * only Wayland Unix sockets. It observes public wire messages, identifies the
 * xdg_toplevel's wl_surface, and inserts the standard background-effect
 * requests immediately before a wl_surface.commit.
 *
 * Injected objects reuse IDs released by the compositor. Their delete_id and
 * protocol events are withheld from Chromium, which intentionally keeps those
 * IDs as client-side zombies and cannot collide with the bridge. The transport
 * and safe ID-recycling design is adapted from Open Orpheus' MIT-licensed
 * Wayland proxy (Copyright 2026 YUCLing).
 */

#define EXT_BACKGROUND_EFFECT_INTERFACE "ext_background_effect_manager_v1"
#define EXT_BACKGROUND_EFFECT_CAPABILITY_BLUR 1u
#define MAX_STOLEN_IDS 16u
#define MAX_WAYLAND_MESSAGE_SIZE (1u << 20)
#define MAX_PENDING_BYTES (4u << 20)

enum request_opcode {
    WL_DISPLAY_GET_REGISTRY = 1,
    WL_REGISTRY_BIND = 0,
    WL_COMPOSITOR_CREATE_SURFACE = 0,
    WL_COMPOSITOR_CREATE_REGION = 1,
    WL_SURFACE_DESTROY = 0,
    WL_SURFACE_COMMIT = 6,
    WL_REGION_DESTROY = 0,
    WL_REGION_ADD = 1,
    XDG_WM_BASE_DESTROY = 0,
    XDG_WM_BASE_GET_XDG_SURFACE = 2,
    XDG_SURFACE_DESTROY = 0,
    XDG_SURFACE_GET_TOPLEVEL = 1,
    XDG_TOPLEVEL_DESTROY = 0,
    EXT_MANAGER_GET_BACKGROUND_EFFECT = 1,
    EXT_SURFACE_DESTROY = 0,
    EXT_SURFACE_SET_BLUR_REGION = 1,
};

enum event_opcode {
    WL_DISPLAY_ERROR = 0,
    WL_DISPLAY_DELETE_ID = 1,
    WL_REGISTRY_GLOBAL = 0,
    WL_REGISTRY_GLOBAL_REMOVE = 1,
    EXT_MANAGER_CAPABILITIES = 0,
};

enum object_type {
    OBJECT_UNKNOWN,
    OBJECT_DISPLAY,
    OBJECT_REGISTRY,
    OBJECT_COMPOSITOR,
    OBJECT_SURFACE,
    OBJECT_XDG_WM_BASE,
    OBJECT_XDG_SURFACE,
    OBJECT_XDG_TOPLEVEL,
    OBJECT_EXT_MANAGER,
    OBJECT_EXT_SURFACE,
    OBJECT_REGION,
};

enum object_flags {
    OBJECT_FLAG_INJECTED = 1u << 0,
    OBJECT_FLAG_TOPLEVEL = 1u << 1,
};

struct byte_buffer {
    uint8_t *data;
    size_t length;
    size_t capacity;
};

struct fd_buffer {
    int *data;
    size_t length;
    size_t capacity;
};

struct pending_stream {
    struct byte_buffer bytes;
    struct fd_buffer fds;
};

struct object_entry {
    uint32_t id;
    enum object_type type;
    uint32_t flags;
    uint32_t related_id;
    uint32_t effect_id;
    struct object_entry *next;
};

struct wayland_connection {
    int application_fd;
    int proxy_fd;
    int compositor_fd;
    struct pending_stream outbound;
    struct pending_stream inbound;
    struct object_entry *objects;
    uint32_t registry_id;
    uint32_t compositor_id;
    uint32_t background_effect_global_name;
    uint32_t background_effect_global_version;
    uint32_t background_effect_manager_id;
    uint32_t background_effect_capabilities;
    uint32_t stolen_ids[MAX_STOLEN_IDS];
    size_t stolen_id_count;
};

static bool debug_enabled(void) {
    const char *value = getenv("SHIGUANG_WAYLAND_BLUR_DEBUG");
    return value && value[0] != '\0' && strcmp(value, "0") != 0;
}

#define DEBUG_LOG(...)                                                         \
    do {                                                                       \
        if (debug_enabled()) {                                                 \
            fputs("[shiguang-wayland-blur] ", stderr);                         \
            fprintf(stderr, __VA_ARGS__);                                      \
            fputc('\n', stderr);                                               \
        }                                                                      \
    } while (0)

static int raw_close(int fd) { return (int)syscall(SYS_close, fd); }

static int raw_connect(int fd, const struct sockaddr *address,
                       socklen_t address_length) {
    return (int)syscall(SYS_connect, fd, address, address_length);
}

static ssize_t raw_recvmsg(int fd, struct msghdr *message, int flags) {
    return (ssize_t)syscall(SYS_recvmsg, fd, message, flags);
}

static ssize_t raw_sendmsg(int fd, const struct msghdr *message, int flags) {
    return (ssize_t)syscall(SYS_sendmsg, fd, message, flags);
}

static bool byte_buffer_reserve(struct byte_buffer *buffer, size_t required) {
    if (required <= buffer->capacity) {
        return true;
    }
    size_t capacity = buffer->capacity ? buffer->capacity : 256;
    while (capacity < required) {
        if (capacity > SIZE_MAX / 2) {
            return false;
        }
        capacity *= 2;
    }
    void *resized = realloc(buffer->data, capacity);
    if (!resized) {
        return false;
    }
    buffer->data = resized;
    buffer->capacity = capacity;
    return true;
}

static bool byte_buffer_append(struct byte_buffer *buffer, const void *data,
                               size_t length) {
    if (length > SIZE_MAX - buffer->length ||
        !byte_buffer_reserve(buffer, buffer->length + length)) {
        return false;
    }
    memcpy(buffer->data + buffer->length, data, length);
    buffer->length += length;
    return true;
}

static bool byte_buffer_append_u32(struct byte_buffer *buffer, uint32_t value) {
    return byte_buffer_append(buffer, &value, sizeof(value));
}

static bool byte_buffer_append_i32(struct byte_buffer *buffer, int32_t value) {
    return byte_buffer_append(buffer, &value, sizeof(value));
}

static void byte_buffer_consume(struct byte_buffer *buffer, size_t length) {
    if (length >= buffer->length) {
        buffer->length = 0;
        return;
    }
    memmove(buffer->data, buffer->data + length, buffer->length - length);
    buffer->length -= length;
}

static bool fd_buffer_append(struct fd_buffer *buffer, int fd) {
    if (buffer->length == buffer->capacity) {
        size_t capacity = buffer->capacity ? buffer->capacity * 2 : 8;
        void *resized = realloc(buffer->data, capacity * sizeof(*buffer->data));
        if (!resized) {
            return false;
        }
        buffer->data = resized;
        buffer->capacity = capacity;
    }
    buffer->data[buffer->length++] = fd;
    return true;
}

static void fd_buffer_close_all(struct fd_buffer *buffer) {
    for (size_t i = 0; i < buffer->length; i++) {
        if (buffer->data[i] >= 0) {
            raw_close(buffer->data[i]);
        }
    }
    buffer->length = 0;
}

static void pending_stream_destroy(struct pending_stream *stream) {
    fd_buffer_close_all(&stream->fds);
    free(stream->fds.data);
    free(stream->bytes.data);
    memset(stream, 0, sizeof(*stream));
}

static bool read_u32(const uint8_t *message, size_t message_size, size_t offset,
                     uint32_t *value) {
    if (!value || offset > message_size ||
        message_size - offset < sizeof(*value)) {
        return false;
    }
    memcpy(value, message + offset, sizeof(*value));
    return true;
}

static bool parse_header(const uint8_t *message, size_t available,
                         uint32_t *object_id, uint16_t *opcode,
                         size_t *message_size) {
    uint32_t header = 0;
    if (!read_u32(message, available, 0, object_id) ||
        !read_u32(message, available, 4, &header)) {
        return false;
    }
    *opcode = (uint16_t)(header & 0xffffu);
    *message_size = header >> 16;
    return *message_size >= 8 && (*message_size % 4) == 0 &&
           *message_size <= MAX_WAYLAND_MESSAGE_SIZE;
}

static bool parse_string(const uint8_t *message, size_t message_size,
                         size_t offset, const char **value,
                         size_t *value_length, size_t *next_offset) {
    uint32_t raw_length = 0;
    if (!read_u32(message, message_size, offset, &raw_length)) {
        return false;
    }
    const size_t start = offset + 4;
    const size_t padded_length = ((size_t)raw_length + 3u) & ~(size_t)3u;
    if (start > message_size || padded_length > message_size - start) {
        return false;
    }
    size_t text_length = raw_length;
    if (text_length > 0 && message[start + text_length - 1] == '\0') {
        text_length--;
    }
    *value = (const char *)(message + start);
    *value_length = text_length;
    *next_offset = start + padded_length;
    return true;
}

static bool string_equals(const char *value, size_t value_length,
                          const char *expected) {
    const size_t expected_length = strlen(expected);
    return value_length == expected_length &&
           memcmp(value, expected, expected_length) == 0;
}

static struct object_entry *find_object(struct wayland_connection *connection,
                                        uint32_t id) {
    for (struct object_entry *entry = connection->objects; entry;
         entry = entry->next) {
        if (entry->id == id) {
            return entry;
        }
    }
    return NULL;
}

static struct object_entry *set_object(struct wayland_connection *connection,
                                       uint32_t id, enum object_type type,
                                       uint32_t flags) {
    struct object_entry *entry = find_object(connection, id);
    if (!entry) {
        entry = calloc(1, sizeof(*entry));
        if (!entry) {
            return NULL;
        }
        entry->id = id;
        entry->next = connection->objects;
        connection->objects = entry;
    }
    entry->type = type;
    entry->flags = flags;
    entry->related_id = 0;
    entry->effect_id = 0;
    return entry;
}

static bool remove_object(struct wayland_connection *connection, uint32_t id,
                          bool *was_injected) {
    struct object_entry **link = &connection->objects;
    while (*link) {
        if ((*link)->id == id) {
            struct object_entry *removed = *link;
            *link = removed->next;
            if (was_injected) {
                *was_injected = (removed->flags & OBJECT_FLAG_INJECTED) != 0;
            }
            free(removed);
            return true;
        }
        link = &(*link)->next;
    }
    if (was_injected) {
        *was_injected = false;
    }
    return false;
}

static void push_stolen_id(struct wayland_connection *connection, uint32_t id) {
    if (id == 0 || id >= 0xff000000u ||
        connection->stolen_id_count >= MAX_STOLEN_IDS) {
        return;
    }
    for (size_t i = 0; i < connection->stolen_id_count; i++) {
        if (connection->stolen_ids[i] == id) {
            return;
        }
    }
    connection->stolen_ids[connection->stolen_id_count++] = id;
}

static uint32_t allocate_injected_id(struct wayland_connection *connection,
                                     enum object_type type) {
    if (connection->stolen_id_count == 0) {
        return 0;
    }
    const uint32_t id = connection->stolen_ids[--connection->stolen_id_count];
    if (!set_object(connection, id, type, OBJECT_FLAG_INJECTED)) {
        push_stolen_id(connection, id);
        return 0;
    }
    return id;
}

static void release_unsubmitted_id(struct wayland_connection *connection,
                                   uint32_t id) {
    if (!id) {
        return;
    }
    remove_object(connection, id, NULL);
    push_stolen_id(connection, id);
}

static bool append_message_header(struct byte_buffer *output, uint32_t sender,
                                  uint16_t opcode, uint16_t size) {
    const uint32_t header = (uint32_t)opcode | ((uint32_t)size << 16);
    return byte_buffer_append_u32(output, sender) &&
           byte_buffer_append_u32(output, header);
}

static bool append_registry_bind(struct byte_buffer *output,
                                 uint32_t registry_id, uint32_t global_name,
                                 uint32_t version, uint32_t new_id) {
    static const char interface_name[] = EXT_BACKGROUND_EFFECT_INTERFACE;
    const uint32_t string_length = (uint32_t)sizeof(interface_name);
    const uint32_t padded_length = (string_length + 3u) & ~3u;
    const uint16_t size = (uint16_t)(24u + padded_length);
    if (!byte_buffer_reserve(output, output->length + size) ||
        !append_message_header(output, registry_id, WL_REGISTRY_BIND, size) ||
        !byte_buffer_append_u32(output, global_name) ||
        !byte_buffer_append_u32(output, string_length) ||
        !byte_buffer_append(output, interface_name, string_length)) {
        return false;
    }
    static const uint8_t padding[3] = {0, 0, 0};
    if (padded_length > string_length &&
        !byte_buffer_append(output, padding, padded_length - string_length)) {
        return false;
    }
    return byte_buffer_append_u32(output, version) &&
           byte_buffer_append_u32(output, new_id);
}

static bool append_create_region(struct byte_buffer *output,
                                 uint32_t compositor_id, uint32_t region_id) {
    return append_message_header(output, compositor_id,
                                 WL_COMPOSITOR_CREATE_REGION, 12) &&
           byte_buffer_append_u32(output, region_id);
}

static bool append_region_add(struct byte_buffer *output, uint32_t region_id) {
    return append_message_header(output, region_id, WL_REGION_ADD, 24) &&
           byte_buffer_append_i32(output, 0) &&
           byte_buffer_append_i32(output, 0) &&
           byte_buffer_append_i32(output, INT_MAX) &&
           byte_buffer_append_i32(output, INT_MAX);
}

static bool append_get_background_effect(struct byte_buffer *output,
                                         uint32_t manager_id,
                                         uint32_t effect_id,
                                         uint32_t surface_id) {
    return append_message_header(output, manager_id,
                                 EXT_MANAGER_GET_BACKGROUND_EFFECT, 16) &&
           byte_buffer_append_u32(output, effect_id) &&
           byte_buffer_append_u32(output, surface_id);
}

static bool append_set_blur_region(struct byte_buffer *output,
                                   uint32_t effect_id, uint32_t region_id) {
    return append_message_header(output, effect_id, EXT_SURFACE_SET_BLUR_REGION,
                                 12) &&
           byte_buffer_append_u32(output, region_id);
}

static bool append_destructor(struct byte_buffer *output, uint32_t object_id,
                              uint16_t opcode) {
    return append_message_header(output, object_id, opcode, 8);
}

static bool maybe_bind_background_effect(struct wayland_connection *connection,
                                         struct byte_buffer *output) {
    if (connection->background_effect_manager_id ||
        !connection->background_effect_global_name ||
        !connection->registry_id || connection->stolen_id_count == 0) {
        return true;
    }

    const uint32_t manager_id =
        allocate_injected_id(connection, OBJECT_EXT_MANAGER);
    if (!manager_id) {
        return true;
    }
    const uint32_t version = connection->background_effect_global_version > 1
                                 ? 1
                                 : connection->background_effect_global_version;
    if (!byte_buffer_reserve(output, output->length + 64) ||
        !append_registry_bind(output, connection->registry_id,
                              connection->background_effect_global_name,
                              version, manager_id)) {
        release_unsubmitted_id(connection, manager_id);
        return false;
    }
    connection->background_effect_manager_id = manager_id;
    DEBUG_LOG("bound %s version %u as object %u",
              EXT_BACKGROUND_EFFECT_INTERFACE, version, manager_id);
    return true;
}

static bool maybe_attach_blur(struct wayland_connection *connection,
                              struct object_entry *surface,
                              struct byte_buffer *output) {
    if (!surface || surface->type != OBJECT_SURFACE ||
        !(surface->flags & OBJECT_FLAG_TOPLEVEL) || surface->effect_id ||
        !connection->background_effect_manager_id ||
        !(connection->background_effect_capabilities &
          EXT_BACKGROUND_EFFECT_CAPABILITY_BLUR) ||
        !connection->compositor_id || connection->stolen_id_count < 2) {
        return true;
    }
    if (!byte_buffer_reserve(output, output->length + 84)) {
        return false;
    }

    const uint32_t effect_id =
        allocate_injected_id(connection, OBJECT_EXT_SURFACE);
    const uint32_t region_id = allocate_injected_id(connection, OBJECT_REGION);
    if (!effect_id || !region_id) {
        release_unsubmitted_id(connection, effect_id);
        release_unsubmitted_id(connection, region_id);
        return true;
    }

    const bool appended =
        append_create_region(output, connection->compositor_id, region_id) &&
        append_region_add(output, region_id) &&
        append_get_background_effect(output,
                                     connection->background_effect_manager_id,
                                     effect_id, surface->id) &&
        append_set_blur_region(output, effect_id, region_id) &&
        append_destructor(output, region_id, WL_REGION_DESTROY);
    if (!appended) {
        release_unsubmitted_id(connection, effect_id);
        release_unsubmitted_id(connection, region_id);
        return false;
    }

    surface->effect_id = effect_id;
    DEBUG_LOG("enabled ext-background-effect-v1 blur for wl_surface %u",
              surface->id);
    return true;
}

static bool append_effect_destroy(struct object_entry *surface,
                                  struct byte_buffer *output) {
    if (!surface || !surface->effect_id) {
        return true;
    }
    const uint32_t effect_id = surface->effect_id;
    surface->effect_id = 0;
    return append_destructor(output, effect_id, EXT_SURFACE_DESTROY);
}

static void handle_registry_bind(struct wayland_connection *connection,
                                 const uint8_t *message, size_t message_size) {
    const char *interface = NULL;
    size_t interface_length = 0;
    size_t next_offset = 0;
    uint32_t new_id = 0;
    if (!parse_string(message, message_size, 12, &interface, &interface_length,
                      &next_offset) ||
        !read_u32(message, message_size, next_offset + 4, &new_id)) {
        return;
    }

    enum object_type type = OBJECT_UNKNOWN;
    if (string_equals(interface, interface_length, "wl_compositor")) {
        type = OBJECT_COMPOSITOR;
        connection->compositor_id = new_id;
    } else if (string_equals(interface, interface_length, "xdg_wm_base")) {
        type = OBJECT_XDG_WM_BASE;
    }
    if (type != OBJECT_UNKNOWN) {
        set_object(connection, new_id, type, 0);
    }
}

static bool process_outbound_message(struct wayland_connection *connection,
                                     const uint8_t *message,
                                     size_t message_size, uint32_t sender_id,
                                     uint16_t opcode,
                                     struct byte_buffer *output) {
    struct object_entry *sender = find_object(connection, sender_id);
    if (sender) {
        switch (sender->type) {
        case OBJECT_DISPLAY: {
            if (opcode == WL_DISPLAY_GET_REGISTRY) {
                uint32_t new_id = 0;
                if (read_u32(message, message_size, 8, &new_id)) {
                    set_object(connection, new_id, OBJECT_REGISTRY, 0);
                    if (!connection->registry_id) {
                        connection->registry_id = new_id;
                    }
                }
            }
            break;
        }
        case OBJECT_REGISTRY:
            if (opcode == WL_REGISTRY_BIND) {
                handle_registry_bind(connection, message, message_size);
            }
            break;
        case OBJECT_COMPOSITOR: {
            if (opcode == WL_COMPOSITOR_CREATE_SURFACE) {
                uint32_t new_id = 0;
                if (read_u32(message, message_size, 8, &new_id)) {
                    set_object(connection, new_id, OBJECT_SURFACE, 0);
                }
            }
            break;
        }
        case OBJECT_XDG_WM_BASE: {
            if (opcode == XDG_WM_BASE_GET_XDG_SURFACE) {
                uint32_t xdg_surface_id = 0;
                uint32_t surface_id = 0;
                if (read_u32(message, message_size, 8, &xdg_surface_id) &&
                    read_u32(message, message_size, 12, &surface_id)) {
                    struct object_entry *xdg_surface = set_object(
                        connection, xdg_surface_id, OBJECT_XDG_SURFACE, 0);
                    if (xdg_surface) {
                        xdg_surface->related_id = surface_id;
                    }
                }
            } else if (opcode == XDG_WM_BASE_DESTROY) {
                remove_object(connection, sender_id, NULL);
            }
            break;
        }
        case OBJECT_XDG_SURFACE: {
            if (opcode == XDG_SURFACE_GET_TOPLEVEL) {
                uint32_t toplevel_id = 0;
                if (read_u32(message, message_size, 8, &toplevel_id)) {
                    struct object_entry *toplevel = set_object(
                        connection, toplevel_id, OBJECT_XDG_TOPLEVEL, 0);
                    if (toplevel) {
                        toplevel->related_id = sender_id;
                    }
                    struct object_entry *surface =
                        find_object(connection, sender->related_id);
                    if (surface && surface->type == OBJECT_SURFACE) {
                        surface->flags |= OBJECT_FLAG_TOPLEVEL;
                        DEBUG_LOG("found xdg_toplevel for wl_surface %u",
                                  surface->id);
                    }
                }
            } else if (opcode == XDG_SURFACE_DESTROY) {
                remove_object(connection, sender_id, NULL);
            }
            break;
        }
        case OBJECT_XDG_TOPLEVEL:
            if (opcode == XDG_TOPLEVEL_DESTROY) {
                remove_object(connection, sender_id, NULL);
            }
            break;
        case OBJECT_SURFACE:
            if (opcode == WL_SURFACE_COMMIT &&
                !maybe_attach_blur(connection, sender, output)) {
                return false;
            }
            if (opcode == WL_SURFACE_DESTROY) {
                if (!append_effect_destroy(sender, output)) {
                    return false;
                }
                remove_object(connection, sender_id, NULL);
            }
            break;
        default:
            break;
        }
    }

    return byte_buffer_append(output, message, message_size);
}

static void handle_registry_global(struct wayland_connection *connection,
                                   const uint8_t *message,
                                   size_t message_size) {
    uint32_t global_name = 0;
    uint32_t version = 0;
    const char *interface = NULL;
    size_t interface_length = 0;
    size_t next_offset = 0;
    if (!read_u32(message, message_size, 8, &global_name) ||
        !parse_string(message, message_size, 12, &interface, &interface_length,
                      &next_offset) ||
        !read_u32(message, message_size, next_offset, &version)) {
        return;
    }
    if (string_equals(interface, interface_length,
                      EXT_BACKGROUND_EFFECT_INTERFACE)) {
        connection->background_effect_global_name = global_name;
        connection->background_effect_global_version = version;
        DEBUG_LOG("compositor advertises %s version %u",
                  EXT_BACKGROUND_EFFECT_INTERFACE, version);
    }
}

static bool process_inbound_message(struct wayland_connection *connection,
                                    const uint8_t *message, size_t message_size,
                                    uint32_t sender_id, uint16_t opcode,
                                    struct byte_buffer *output) {
    if (sender_id == 1 && opcode == WL_DISPLAY_DELETE_ID) {
        uint32_t deleted_id = 0;
        if (read_u32(message, message_size, 8, &deleted_id)) {
            bool was_injected = false;
            remove_object(connection, deleted_id, &was_injected);
            if (was_injected) {
                push_stolen_id(connection, deleted_id);
                return true;
            }
            if (connection->background_effect_global_name &&
                connection->stolen_id_count < MAX_STOLEN_IDS) {
                push_stolen_id(connection, deleted_id);
                return true;
            }
        }
    }

    struct object_entry *sender = find_object(connection, sender_id);
    if (sender && (sender->flags & OBJECT_FLAG_INJECTED)) {
        if (sender->type == OBJECT_EXT_MANAGER &&
            opcode == EXT_MANAGER_CAPABILITIES) {
            uint32_t capabilities = 0;
            if (read_u32(message, message_size, 8, &capabilities)) {
                connection->background_effect_capabilities = capabilities;
                DEBUG_LOG("compositor background-effect capabilities: 0x%x",
                          capabilities);
            }
        }
        return true;
    }

    if (sender && sender->type == OBJECT_REGISTRY) {
        if (opcode == WL_REGISTRY_GLOBAL) {
            handle_registry_global(connection, message, message_size);
        } else if (opcode == WL_REGISTRY_GLOBAL_REMOVE) {
            uint32_t removed_name = 0;
            if (read_u32(message, message_size, 8, &removed_name) &&
                removed_name == connection->background_effect_global_name) {
                connection->background_effect_capabilities = 0;
            }
        }
    } else if (sender_id == 1 && opcode == WL_DISPLAY_ERROR) {
        uint32_t failed_object = 0;
        if (read_u32(message, message_size, 8, &failed_object)) {
            struct object_entry *failed =
                find_object(connection, failed_object);
            if (failed && (failed->flags & OBJECT_FLAG_INJECTED)) {
                DEBUG_LOG("Wayland compositor reported an error for injected "
                          "object %u",
                          failed_object);
            }
        }
    }

    return byte_buffer_append(output, message, message_size);
}

static bool collect_received_fds(struct pending_stream *pending,
                                 const struct msghdr *message) {
    for (struct cmsghdr *control = CMSG_FIRSTHDR((struct msghdr *)message);
         control; control = CMSG_NXTHDR((struct msghdr *)message, control)) {
        if (control->cmsg_level != SOL_SOCKET ||
            control->cmsg_type != SCM_RIGHTS ||
            control->cmsg_len < CMSG_LEN(0)) {
            continue;
        }
        const size_t bytes = control->cmsg_len - CMSG_LEN(0);
        const size_t count = bytes / sizeof(int);
        const int *fds = (const int *)CMSG_DATA(control);
        for (size_t i = 0; i < count; i++) {
            if (!fd_buffer_append(&pending->fds, fds[i])) {
                for (size_t remaining = i; remaining < count; remaining++) {
                    raw_close(fds[remaining]);
                }
                return false;
            }
        }
    }
    return true;
}

static bool send_buffer(int destination, const struct byte_buffer *bytes,
                        struct fd_buffer *fds) {
    if (bytes->length == 0) {
        return true;
    }

    size_t sent_total = 0;
    bool controls_sent = false;
    while (sent_total < bytes->length) {
        struct iovec iovec = {
            .iov_base = bytes->data + sent_total,
            .iov_len = bytes->length - sent_total,
        };
        struct msghdr message = {
            .msg_iov = &iovec,
            .msg_iovlen = 1,
        };

        void *control_data = NULL;
        if (!controls_sent && fds->length > 0) {
            const size_t control_size = CMSG_SPACE(fds->length * sizeof(int));
            control_data = calloc(1, control_size);
            if (!control_data) {
                return false;
            }
            message.msg_control = control_data;
            message.msg_controllen = control_size;
            struct cmsghdr *control = CMSG_FIRSTHDR(&message);
            control->cmsg_level = SOL_SOCKET;
            control->cmsg_type = SCM_RIGHTS;
            control->cmsg_len = CMSG_LEN(fds->length * sizeof(int));
            memcpy(CMSG_DATA(control), fds->data, fds->length * sizeof(int));
            message.msg_controllen = control_size;
        }

        ssize_t sent;
        do {
            sent = raw_sendmsg(destination, &message, MSG_NOSIGNAL);
        } while (sent < 0 && errno == EINTR);
        free(control_data);
        if (sent <= 0) {
            return false;
        }
        sent_total += (size_t)sent;
        controls_sent = true;
    }

    fd_buffer_close_all(fds);
    return true;
}

static bool process_pending_stream(struct wayland_connection *connection,
                                   struct pending_stream *pending,
                                   int destination, bool inbound) {
    struct byte_buffer output = {0};
    if (!inbound && !maybe_bind_background_effect(connection, &output)) {
        free(output.data);
        return false;
    }

    size_t offset = 0;
    while (pending->bytes.length - offset >= 8) {
        uint32_t sender_id = 0;
        uint16_t opcode = 0;
        size_t message_size = 0;
        if (!parse_header(pending->bytes.data + offset,
                          pending->bytes.length - offset, &sender_id, &opcode,
                          &message_size)) {
            DEBUG_LOG(
                "invalid Wayland message header; closing proxied connection");
            free(output.data);
            return false;
        }
        if (message_size > pending->bytes.length - offset) {
            break;
        }

        const uint8_t *message = pending->bytes.data + offset;
        const bool ok =
            inbound
                ? process_inbound_message(connection, message, message_size,
                                          sender_id, opcode, &output)
                : process_outbound_message(connection, message, message_size,
                                           sender_id, opcode, &output);
        if (!ok) {
            free(output.data);
            return false;
        }
        offset += message_size;
    }

    if (offset > 0) {
        byte_buffer_consume(&pending->bytes, offset);
    }
    if (pending->bytes.length > MAX_PENDING_BYTES) {
        DEBUG_LOG("Wayland reassembly buffer exceeded its safety limit");
        free(output.data);
        return false;
    }

    const bool sent = send_buffer(destination, &output, &pending->fds);
    free(output.data);
    return sent;
}

static bool forward_once(struct wayland_connection *connection, int source,
                         int destination, bool inbound) {
    uint8_t data[65536];
    uint8_t control[CMSG_SPACE(64 * sizeof(int))];
    struct iovec iovec = {
        .iov_base = data,
        .iov_len = sizeof(data),
    };
    struct msghdr message = {
        .msg_iov = &iovec,
        .msg_iovlen = 1,
        .msg_control = control,
        .msg_controllen = sizeof(control),
    };

    ssize_t received;
    do {
        received = raw_recvmsg(source, &message, MSG_CMSG_CLOEXEC);
    } while (received < 0 && errno == EINTR);
    if (received < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) {
        return true;
    }
    if (received <= 0) {
        return false;
    }
    if (message.msg_flags & MSG_CTRUNC) {
        DEBUG_LOG("Wayland ancillary data exceeded its safety limit");
        return false;
    }

    struct pending_stream *pending =
        inbound ? &connection->inbound : &connection->outbound;
    if (!byte_buffer_append(&pending->bytes, data, (size_t)received) ||
        !collect_received_fds(pending, &message)) {
        return false;
    }
    return process_pending_stream(connection, pending, destination, inbound);
}

static void destroy_connection(struct wayland_connection *connection) {
    if (!connection) {
        return;
    }
    raw_close(connection->proxy_fd);
    raw_close(connection->compositor_fd);
    pending_stream_destroy(&connection->outbound);
    pending_stream_destroy(&connection->inbound);
    while (connection->objects) {
        struct object_entry *removed = connection->objects;
        connection->objects = removed->next;
        free(removed);
    }
    free(connection);
}

static void *proxy_thread(void *data) {
    struct wayland_connection *connection = data;
    struct pollfd descriptors[2] = {
        {.fd = connection->proxy_fd, .events = POLLIN},
        {.fd = connection->compositor_fd, .events = POLLIN},
    };

    bool running = true;
    while (running) {
        int result;
        do {
            result = poll(descriptors, 2, -1);
        } while (result < 0 && errno == EINTR);
        if (result < 0) {
            break;
        }

        if (descriptors[0].revents & (POLLIN | POLLERR | POLLHUP)) {
            running = forward_once(connection, connection->proxy_fd,
                                   connection->compositor_fd, false);
        }
        if (running && descriptors[1].revents & (POLLIN | POLLERR | POLLHUP)) {
            running = forward_once(connection, connection->compositor_fd,
                                   connection->proxy_fd, true);
        }
    }

    DEBUG_LOG("closed Wayland proxy for application fd %d",
              connection->application_fd);
    destroy_connection(connection);
    return NULL;
}

static bool is_wayland_address(const struct sockaddr *address,
                               socklen_t address_length) {
    if (!address || address_length < sizeof(sa_family_t) ||
        address->sa_family != AF_UNIX) {
        return false;
    }

    const struct sockaddr_un *unix_address =
        (const struct sockaddr_un *)address;
    const size_t path_offset = offsetof(struct sockaddr_un, sun_path);
    if ((size_t)address_length <= path_offset) {
        return false;
    }
    size_t path_length = (size_t)address_length - path_offset;
    if (path_length > sizeof(unix_address->sun_path)) {
        path_length = sizeof(unix_address->sun_path);
    }

    const uint8_t *raw_path = (const uint8_t *)unix_address->sun_path;
    const uint8_t *candidate = raw_path;
    size_t candidate_length = path_length;
    if (raw_path[0] == '\0') {
        candidate++;
        candidate_length--;
    } else {
        const void *terminator = memchr(raw_path, '\0', path_length);
        if (terminator) {
            candidate_length = (const uint8_t *)terminator - raw_path;
        }
    }
    if (candidate_length == 0) {
        return false;
    }

    const char *display = getenv("WAYLAND_DISPLAY");
    if (display && display[0] != '\0') {
        const size_t display_length = strlen(display);
        if (display[0] == '/') {
            return candidate_length == display_length &&
                   memcmp(candidate, display, display_length) == 0;
        }
        return candidate_length >= display_length &&
               (candidate_length == display_length ||
                candidate[candidate_length - display_length - 1] == '/') &&
               memcmp(candidate + candidate_length - display_length, display,
                      display_length) == 0;
    }

    size_t filename_offset = 0;
    for (size_t i = 0; i < candidate_length; i++) {
        if (candidate[i] == '/') {
            filename_offset = i + 1;
        }
    }
    static const uint8_t prefix[] = "wayland-";
    const size_t filename_length = candidate_length - filename_offset;
    if (filename_length <= sizeof(prefix) - 1 ||
        memcmp(candidate + filename_offset, prefix, sizeof(prefix) - 1) != 0) {
        return false;
    }
    for (size_t i = filename_offset + sizeof(prefix) - 1; i < candidate_length;
         i++) {
        if (candidate[i] < '0' || candidate[i] > '9') {
            return false;
        }
    }
    return true;
}

__attribute__((visibility("default"))) int
connect(int socket_fd, const struct sockaddr *address,
        socklen_t address_length) {
    if (!is_wayland_address(address, address_length)) {
        return raw_connect(socket_fd, address, address_length);
    }

    int socket_type = SOCK_STREAM;
    socklen_t socket_type_size = sizeof(socket_type);
    if (getsockopt(socket_fd, SOL_SOCKET, SO_TYPE, &socket_type,
                   &socket_type_size) != 0) {
        socket_type = SOCK_STREAM;
    }
    const int compositor_fd = socket(AF_UNIX, socket_type | SOCK_CLOEXEC, 0);
    if (compositor_fd < 0) {
        return -1;
    }
    if (raw_connect(compositor_fd, address, address_length) < 0) {
        const int saved_errno = errno;
        raw_close(compositor_fd);
        errno = saved_errno;
        return -1;
    }

    int pair[2] = {-1, -1};
    if (socketpair(AF_UNIX, SOCK_STREAM | SOCK_CLOEXEC, 0, pair) != 0) {
        const int saved_errno = errno;
        raw_close(compositor_fd);
        errno = saved_errno;
        return -1;
    }

    const int descriptor_flags = fcntl(socket_fd, F_GETFD, 0);
    const int status_flags = fcntl(socket_fd, F_GETFL, 0);
    if (dup2(pair[0], socket_fd) < 0) {
        const int saved_errno = errno;
        raw_close(pair[0]);
        raw_close(pair[1]);
        raw_close(compositor_fd);
        errno = saved_errno;
        return -1;
    }
    raw_close(pair[0]);
    if (descriptor_flags >= 0) {
        fcntl(socket_fd, F_SETFD, descriptor_flags);
    }
    if (status_flags >= 0) {
        fcntl(socket_fd, F_SETFL, status_flags);
    }

    struct wayland_connection *connection = calloc(1, sizeof(*connection));
    if (!connection) {
        raw_close(pair[1]);
        raw_close(compositor_fd);
        errno = ENOMEM;
        return -1;
    }
    connection->application_fd = socket_fd;
    connection->proxy_fd = pair[1];
    connection->compositor_fd = compositor_fd;
    if (!set_object(connection, 1, OBJECT_DISPLAY, 0)) {
        destroy_connection(connection);
        errno = ENOMEM;
        return -1;
    }

    pthread_t thread;
    const int thread_error =
        pthread_create(&thread, NULL, proxy_thread, connection);
    if (thread_error != 0) {
        destroy_connection(connection);
        errno = thread_error;
        return -1;
    }
    pthread_detach(thread);
    DEBUG_LOG("proxied Wayland connection on application fd %d", socket_fd);
    return 0;
}
