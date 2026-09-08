#!/bin/sh

set -eu

source_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
output_dir=${1:-"$source_dir/build"}
protocol_xml="$source_dir/protocols/ext-background-effect-v1.xml"
protocol_header="$output_dir/ext-background-effect-v1-client-protocol.h"
output_library="$output_dir/libshiguang-wayland-blur.so"

mkdir -p "$output_dir"
wayland-scanner client-header "$protocol_xml" "$protocol_header"

${CC:-cc} \
  -std=c17 \
  -O2 \
  -fPIC \
  -fvisibility=hidden \
  -Wall \
  -Wextra \
  -Wformat=2 \
  "$source_dir/wayland-blur.c" \
  -shared \
  -Wl,-z,defs \
  -Wl,-z,relro \
  -Wl,-z,now \
  -o "$output_library" \
  -pthread
