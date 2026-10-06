import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(".env.local")


@dataclass
class Config:
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///.local/dots.db")
    computer_url: str = os.getenv("COMPUTER_URL", "http://127.0.0.1:18765")
    shell_url: str = os.getenv("SHELL_URL", "http://127.0.0.1:18766")
    computer_token: str = os.getenv("COMPUTER_TOKEN", "")
    shell_token: str = os.getenv("SHELL_TOKEN", "")
    session_token: str = os.getenv("DOT_SESSION_TOKEN", "")
    origin: str = os.getenv("DOT_ORIGIN", "http://localhost:3080")
    vnc_url: str = os.getenv("VNC_URL", "ws://127.0.0.1:16080")
    internal_url: str = os.getenv("INTERNAL_API_URL", "http://127.0.0.1:18000")
    provider: str = os.getenv("DOT_PROVIDER", "codex")
    model: str = os.getenv("OPENAI_MODEL", "gpt-5.4")
    codex_bin: str = os.getenv("CODEX_BIN", "codex")
    data_dir: str = os.getenv("DOT_DATA_DIR", ".local")
    run_seconds: int = 600
    max_tools: int = 80

    def __post_init__(self):
        Path(self.data_dir).mkdir(parents=True, exist_ok=True)
        if not self.session_token or not self.computer_token or not self.shell_token:
            raise RuntimeError("Run scripts/setup.py to initialize private tokens")
