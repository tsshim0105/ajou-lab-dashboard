#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
: "${ZIG_BIN:?Set ZIG_BIN to the verified Zig 0.15.2 executable}"
mkdir -p release build
cd src
if [ -n "${RC_BIN:-}" ]; then "$RC_BIN" "$(dirname "$ZIG_BIN")/lib" /fo ../build/app.res app.rc; else "$ZIG_BIN" rc /fo ../build/app.res app.rc; fi
"$ZIG_BIN" cc -target x86_64-windows-gnu -Os -municode -Wl,--subsystem,windows main.c ../build/app.res -o ../release/NISML-Hub-0.1.1-x64.exe -lshell32 -luser32
