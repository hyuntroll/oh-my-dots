"""Apply a validated dot accent without sending keyboard or pointer input."""
import json
from pathlib import Path

from pydantic import BaseModel, Field


class Appearance(BaseModel):
    accent: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")


def write_appearance(accent: str, home: Path):
    theme = home / '.themes/MyDot/openbox-3/themerc'
    lines = theme.read_text().splitlines()
    for index, line in enumerate(lines):
        key, _, value = line.partition(':')
        if key.endswith('.color'):
            lines[index] = f'{key}: ' + ('#202020' if 'text' in key or 'image' in key else accent)
    theme.write_text('\n'.join(lines) + '\n')
    gtk = home / '.config/gtk-3.0/gtk.css'
    gtk.parent.mkdir(parents=True, exist_ok=True)
    gtk.write_text(f'headerbar {{ background: {accent}; color: #202020; box-shadow: none; }}\nheaderbar:backdrop {{ background: {accent}; }}\n')
    desktop = home / '.local/share/dot-desktop'
    desktop.mkdir(parents=True, exist_ok=True)
    (desktop / 'appearance.css').write_text(f'#desktop-wallpaper {{ background: {accent}; }}\n')
    appearance = desktop / 'appearance.js'
    temporary = desktop / 'appearance.js.tmp'
    temporary.write_text('document.documentElement.style.setProperty("--dot-accent", ' + json.dumps(accent) + ');')
    temporary.replace(appearance)
