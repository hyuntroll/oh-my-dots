#!/bin/sh
set -eu
mkdir -p "$HOME/.config/openbox" "$HOME/.cache"
# A stopped container retains X's lock/socket even when no X process survives.
python - <<'PY'
import os
for path in ('/tmp/.X99-lock', '/tmp/.X11-unix/X99'):
    try:
        os.unlink(path)
    except FileNotFoundError:
        pass
PY
Xvfb :99 -screen 0 1280x960x24 -nolisten tcp -ac &
display_pid=$!
attempt=0
until xdpyinfo -display :99 >/dev/null 2>&1; do
    kill -0 "$display_pid" 2>/dev/null || exit 1
    attempt=$((attempt + 1))
    [ "$attempt" -lt 100 ] || exit 1
    sleep 0.1
done
dbus-launch openbox --sm-disable &
xsetroot -solid '#e3e6e3'
chromium --no-sandbox --no-first-run --disable-dev-shm-usage --disable-gpu --window-size=1080,800 --window-position=100,80 file:///app/start.html >/tmp/browser.log 2>&1 &
exec uvicorn daemon:app --app-dir /app --host 0.0.0.0 --port 8765 --no-access-log
