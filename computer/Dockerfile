FROM python:3.13-slim@sha256:bb2988715db2cf7ace7b53f38f3cffbef7c7046a656bee66245eb0ed386e2e81
ENV DEBIAN_FRONTEND=noninteractive DISPLAY=:99 HOME=/home/dot PYTHONUNBUFFERED=1
RUN apt-get update && apt-get install -y --no-install-recommends xvfb x11vnc websockify openbox picom chromium xfce4-terminal thunar xdotool wmctrl x11-xserver-utils dbus-x11 fonts-noto-cjk fonts-inter python3-gi gir1.2-gtk-3.0 librsvg2-common adwaita-icon-theme tini && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir fastapi==0.142.2 uvicorn==0.54.0 mss==10.2.0 pillow==12.3.0
RUN useradd -m -u 1000 dot && mkdir -p /workspace/artifacts /home/dot/.local/share/dot-desktop && chown -R dot:dot /workspace /home/dot
COPY computer/daemon.py computer/appearance.py /app/
COPY computer/entrypoint.sh /app/entrypoint.sh
COPY computer/desktop/ /opt/dot-desktop/
USER dot
WORKDIR /workspace
EXPOSE 8765 6080
ENTRYPOINT ["/usr/bin/tini", "--", "/app/entrypoint.sh"]
