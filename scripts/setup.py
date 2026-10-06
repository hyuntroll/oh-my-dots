"""Create private local service tokens without displaying values."""

import os
import secrets
from pathlib import Path

path = Path(".env.local")
existing = path.read_text() if path.exists() else ""
lines = []
for key in ("DOT_SESSION_TOKEN", "COMPUTER_TOKEN", "SHELL_TOKEN"):
    if not any(line.startswith(key + "=") for line in existing.splitlines()):
        lines.append(key + "=" + secrets.token_urlsafe(32))
if lines:
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
    with os.fdopen(fd, "w") as file:
        if existing and not existing.endswith("\n"):
            file.write("\n")
        file.write("\n".join(lines) + "\n")
    os.chmod(path, 0o600)
print("Local service tokens initialized in .env.local; values hidden.")
