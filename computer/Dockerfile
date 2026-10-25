FROM python:3.13-slim@sha256:bb2988715db2cf7ace7b53f38f3cffbef7c7046a656bee66245eb0ed386e2e81
ENV DEBIAN_FRONTEND=noninteractive DISPLAY=:99 HOME=/home/dot PYTHONUNBUFFERED=1
RUN apt-get update && apt-get install -y --no-install-recommends xvfb openbox chromium xfce4-terminal thunar xdotool x11-xserver-utils dbus-x11 fonts-noto-cjk tini && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir fastapi==0.142.2 uvicorn==0.54.0 mss==10.2.0 pillow==12.3.0
RUN useradd -m -u 1000 dot && mkdir -p /workspace && chown dot:dot /workspace
COPY daemon.py /app/daemon.py
COPY entrypoint.sh start.html /app/
RUN chmod 755 /app/entrypoint.sh
USER dot
WORKDIR /workspace
EXPOSE 8765
ENTRYPOINT ["/usr/bin/tini", "--", "/app/entrypoint.sh"]
