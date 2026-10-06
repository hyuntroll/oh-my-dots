"""Apply a validated dot accent without sending keyboard or pointer input."""
import json
from pathlib import Path

from pydantic import BaseModel, Field


class Appearance(BaseModel):
    accent: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    name: str = Field(default="OhMyDots", min_length=1, max_length=32)


def write_appearance(accent: str, home: Path, name: str = "OhMyDots"):
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
    r, g, b = [int(accent[offset:offset + 2], 16) / 255 for offset in (1, 3, 5)]
    matrix = f"{r} 0 {1-r} 0 0 {g} 0 {1-g} 0 0 {b} 0 {1-b} 0 0 0 0 0 1 0"
    temporary.write_text('(()=>{const heading=document.querySelector("h1");if(heading)heading.textContent="Welcome back, "+' + json.dumps(name) + ';const tint=document.getElementById("pet-tint");if(tint)tint.setAttribute("values",' + json.dumps(matrix) + ');' + 'document.documentElement.style.setProperty("--dot-accent", ' + json.dumps(accent) + ');})();')
    temporary.replace(appearance)
