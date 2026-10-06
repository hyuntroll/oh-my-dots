#!/bin/sh
set -eu
exec chromium --no-sandbox --disable-dev-shm-usage --no-first-run --test-type --load-extension="$HOME/.local/share/dot-desktop" "$@" chrome://newtab/
