from pathlib import Path

import pytest
from pydantic import ValidationError
from computer.appearance import Appearance, write_appearance


def test_accent_updates_window_theme_and_atomic_start_page_settings(tmp_path):
    theme = tmp_path / '.themes/MyDot/openbox-3/themerc'
    theme.parent.mkdir(parents=True)
    source = Path('computer/desktop/themes/MyDot/openbox-3/themerc').read_text()
    theme.write_text(source)
    write_appearance('#d875d7', tmp_path)
    result = theme.read_text()
    assert 'window.active.title.bg.color: #d875d7' in result
    assert 'window.inactive.title.bg.color: #d875d7' in result
    assert 'window.active.label.text.color: #202020' in result
    assert 'border.width: 1' in result
    assert '#d875d7' in (tmp_path / '.config/gtk-3.0/gtk.css').read_text()
    assert '#d875d7' in (tmp_path / '.local/share/dot-desktop/appearance.css').read_text()
    assert '#d875d7' in (tmp_path / '.local/share/dot-desktop/appearance.js').read_text()
    write_appearance('#19b6de', tmp_path)
    assert '#d875d7' not in theme.read_text()
    assert not list(tmp_path.rglob('*.tmp'))


@pytest.mark.parametrize('accent', ['red', '#abc', '#123456; touch /tmp/test', 'url(x)', '#1234567'])
def test_appearance_rejects_non_hex_values(accent):
    with pytest.raises(ValidationError):
        Appearance(accent=accent)
