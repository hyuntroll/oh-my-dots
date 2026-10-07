#!/bin/sh
set -eu
if [ "$#" -eq 0 ]; then set -- chrome://newtab/; fi
exec chromium --no-sandbox --disable-dev-shm-usage --no-first-run --test-type --load-extension="$HOME/.local/share/dot-desktop" "$@"
