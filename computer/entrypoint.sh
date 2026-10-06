#!/bin/sh
set -eu
mkdir -p "$HOME/.config" "$HOME/.cache" "$HOME/.local/share/dot-desktop" /workspace/artifacts
mkdir -p "$HOME/.config/openbox" "$HOME/.themes" "$HOME/.config/xfce4/terminal"
mkdir -p "$HOME/.config/chromium/Default" "$HOME/.config/gtk-3.0"
cat > "$HOME/.config/chromium/Default/Preferences" <<'EOF'
{"translate":{"enabled":false},"intl":{"accept_languages":"ko-KR,ko,en-US,en"},"browser":{"check_default_browser":false,"custom_chrome_frame":false},"extensions":{"theme":{"system_theme":1}}}
EOF
cat > "$HOME/.config/gtk-3.0/gtk.css" <<'EOF'
headerbar { background: #f39a80; color: #443933; box-shadow: none; }
headerbar:backdrop { background: #e8baa9; }
EOF
cp /opt/dot-desktop/start.html /opt/dot-desktop/start.js /opt/dot-desktop/background.js /opt/dot-desktop/manifest.json "$HOME/.local/share/dot-desktop/"
cp -R /opt/dot-desktop/assets "$HOME/.local/share/dot-desktop/"
cp -R /opt/dot-desktop/themes/MyDot "$HOME/.themes/"
PYTHONPATH=/app python -c 'from appearance import write_appearance; from pathlib import Path; write_appearance("#bdc1d2", Path.home())'
sed 's/<name>Clearlooks<\/name>/<name>MyDot<\/name>/' /etc/xdg/openbox/rc.xml > "$HOME/.config/openbox/rc.xml"
cat > "$HOME/.config/xfce4/terminal/terminalrc" <<'EOF'
[Configuration]
FontName=Monospace 11
ColorBackground=#1b1c20
ColorForeground=#e9e3db
MiscDefaultGeometry=84x24
MiscMenubarDefault=FALSE
EOF
Xvfb :99 -screen 0 1280x960x24 -nolisten tcp -ac &
until xdpyinfo -display :99 >/dev/null 2>&1; do sleep 0.1; done
dbus-launch openbox --sm-disable &
sleep 0.5
xsetroot -solid '#bdc1d2'
picom --backend xrender --config /dev/null &
sleep 0.3
cp /opt/dot-desktop/dock.css "$HOME/.local/share/dot-desktop/dock.css"
/usr/bin/python3 /opt/dot-desktop/dot_dock.py &
dot-browser --window-size=1120,825 --window-position=0,0 >/dev/null 2>&1 &
# The VNC server itself rejects all input; authenticated API owns input arbitration.
x11vnc -display :99 -rfbport 5900 -listen 127.0.0.1 -nopw -forever -shared -viewonly -noxdamage -quiet &
websockify 6080 localhost:5900 &
exec uvicorn daemon:app --app-dir /app --host 0.0.0.0 --port 8765 --no-access-log
