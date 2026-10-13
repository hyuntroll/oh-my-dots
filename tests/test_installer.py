import hashlib
import importlib.util
import io
import json
import os
import pty
import select
import shlex
import shutil
import socket
import subprocess
import sys
import tarfile
import time
from pathlib import Path
from unittest.mock import Mock

import pytest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('host', ROOT / 'scripts/host.py')
host = importlib.util.module_from_spec(spec)
spec.loader.exec_module(host)
sys.modules['host'] = host
spec = importlib.util.spec_from_file_location('hosting_cli', ROOT / 'scripts/cli.py')
cli = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cli)


@pytest.fixture
def install_home(tmp_path, monkeypatch):
    root = tmp_path / "install's folder"
    root.mkdir()
    base = root / '.local/hosting'
    base.mkdir(parents=True)
    (root / 'scripts').mkdir()
    (root / 'scripts/cli.py').write_text('import sys; print(sys.argv[1:])')
    monkeypatch.setattr(host, 'ROOT', root)
    monkeypatch.setattr(host, 'BASE', base)
    monkeypatch.setattr(host, 'PYTHON', Path(sys.executable))
    monkeypatch.setattr(Path, 'home', lambda: tmp_path)
    return root, base


def test_port_rejects_conflict_and_privileged_range():
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        with pytest.raises(ValueError, match='사용 중'):
            cli.port(str(listener.getsockname()[1]))
    for value in ('80', '65536', 'oops'):
        with pytest.raises(ValueError):
            cli.port(value)


def test_invalid_answer_reprompts(monkeypatch):
    values = iter(['invalid', 'n'])
    monkeypatch.setattr('builtins.input', lambda _: next(values))
    assert cli.yes('Start?') is False


def test_launcher_handles_spaces_quotes_and_preserves_arguments(install_home):
    launcher = cli.create_launcher()
    result = subprocess.run([launcher, 'configure', '--origin', 'https://dots.example.com'],
                            capture_output=True, text=True, check=True)
    assert "['configure', '--origin', 'https://dots.example.com']" in result.stdout
    assert launcher.stat().st_mode & 0o777 == 0o755
    assert cli.create_launcher() == launcher


def test_launcher_does_not_overwrite_another_program_or_install(install_home, monkeypatch, tmp_path):
    launcher = cli.create_launcher()
    original = launcher.read_text()
    monkeypatch.setattr(host, 'ROOT', tmp_path / 'another-install')
    with pytest.raises(ValueError, match='another installation'):
        cli.create_launcher()
    assert launcher.read_text() == original
    launcher.write_text('#!/bin/sh\necho unrelated\n')
    with pytest.raises(ValueError, match='not our launcher'):
        cli.create_launcher()
    launcher.unlink()
    launcher.symlink_to(tmp_path / 'missing-target')
    with pytest.raises(ValueError, match='not our launcher'):
        cli.create_launcher()


def test_build_failure_keeps_private_log_and_recovery_launcher(install_home, monkeypatch):
    _, base = install_home
    launcher = cli.create_launcher()
    monkeypatch.setattr(subprocess, 'run', Mock(return_value=subprocess.CompletedProcess([], 1)))
    with pytest.raises(ValueError, match='setup'):
        cli.build([])
    assert (base / 'install.log').stat().st_mode & 0o777 == 0o600
    assert launcher.exists()


def test_existing_setup_preserves_config_password(install_home, monkeypatch):
    _, base = install_home
    config = {'origin': 'http://localhost:3090', 'project': 'kept', 'database_password': 'retained-secret'}
    (base / 'settings.json').write_text(json.dumps(config))
    (base / 'htpasswd').write_text('owner:retained-hash')
    monkeypatch.setattr(cli, 'doctor', lambda: None)
    monkeypatch.setattr(host, 'service_pid', lambda: None)
    monkeypatch.setattr(host, 'run', Mock())
    monkeypatch.setattr(host, 'password', Mock(side_effect=AssertionError('Must retain password')))
    monkeypatch.setattr(cli, 'add_path', lambda _: None)
    answers = iter([True, False])
    monkeypatch.setattr(cli, 'yes', lambda _: next(answers))
    build = Mock()
    monkeypatch.setattr(cli, 'build', build)
    cli.setup()
    build.assert_called_once_with([])
    assert json.loads((base / 'settings.json').read_text()) == config
    assert (base / 'htpasswd').read_text() == 'owner:retained-hash'


@pytest.mark.parametrize('condition', ['dirty', 'other-origin', 'other-branch'])
def test_update_rejects_unsafe_checkout_before_stopping(install_home, monkeypatch, condition):
    monkeypatch.setattr(cli, 'doctor', lambda: None)
    def output(args):
        if 'get-url' in args:
            return 'https://example.com/other.git' if condition == 'other-origin' else cli.REPO
        if 'branch' in args:
            return 'work' if condition == 'other-branch' else 'main'
        return ' M custom.py' if condition == 'dirty' else ''
    monkeypatch.setattr(host, 'output', output)
    run = Mock()
    monkeypatch.setattr(host, 'run', run)
    with pytest.raises(ValueError):
        cli.update()
    run.assert_not_called()


def test_start_waits_for_api_web_and_auth_gateway(install_home, monkeypatch):
    monkeypatch.setattr(host, 'run', Mock())
    monkeypatch.setattr(host, 'settings', lambda: {'api_port': 4001, 'web_port': 4002, 'port': 4003,
                                                'origin': 'http://localhost:4003'})
    monkeypatch.setattr(host, 'bind_host', lambda: '127.0.0.1')
    monkeypatch.setattr(host, 'service_pid', lambda: 123)
    monkeypatch.setattr(time, 'sleep', lambda _: None)
    requests = []
    def open_url(url, timeout):
        requests.append(url)
        if url.endswith(':4003/'):
            raise cli.HTTPError(url, 401, 'Login required', {}, None)
        response = Mock(status=200)
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        return response
    monkeypatch.setattr(cli, 'build_opener', lambda _: Mock(open=open_url))
    cli.start()
    assert requests == ['http://127.0.0.1:4001/health', 'http://127.0.0.1:4002/', 'http://127.0.0.1:4003/']


def executable(path, value):
    path.write_text(value)
    path.chmod(0o755)


@pytest.mark.parametrize('managed', ['node', 'python', 'bad-checksum'])
def test_curl_pipe_uses_tty_and_prepares_missing_runtime(tmp_path, managed):
    """Actual bash pipe + controlling PTY; isolated tools, no Docker changes or downloads."""
    home = tmp_path / 'home'
    home.mkdir()
    bin_dir = tmp_path / 'bin'
    bin_dir.mkdir()
    for name in ('bash', 'sh', 'uname', 'mkdir', 'chmod', 'mktemp', 'rm', 'tar', 'awk', 'ln'):
        (bin_dir / name).symlink_to(shutil.which(name))
    executable(bin_dir / 'id', '#!/bin/sh\necho 1000\n')
    if managed == 'python':
        executable(bin_dir / 'python3', '#!/bin/sh\nexit 1\n')
        for name in ('node', 'npm'):
            executable(bin_dir / name, '#!/bin/sh\nexit 0\n')
    else:
        (bin_dir / 'python3.12').symlink_to(sys.executable)
    executable(bin_dir / 'docker', '#!/bin/sh\nexit 0\n')
    executable(bin_dir / 'git', '''#!/bin/sh
if [ "$1" = clone ]; then
  for dest; do :; done
  mkdir -p "$dest/scripts"
  printf '%s\n' 'import sys' 'print("WIZARD_READY", flush=True)' 'assert input("Port: ") == "3099"' 'print("PIPE_SETUP_OK", flush=True)' > "$dest/scripts/cli.py"
else
  exit 1
fi
''')
    system = 'darwin' if sys.platform == 'darwin' else 'linux'
    arch = 'arm64' if os.uname().machine in ('arm64', 'aarch64') else 'x64'
    folder = f'node-v24.19.0-{system}-{arch}'
    archive = tmp_path / (folder + '.tar.gz')
    with tarfile.open(archive, 'w:gz') as tar:
        for name in ('node', 'npm', 'npx'):
            content = b'#!/bin/sh\nexit 0\n'
            info = tarfile.TarInfo(f'{folder}/bin/{name}')
            info.mode = 0o755
            info.size = len(content)
            tar.addfile(info, io.BytesIO(content))
    checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
    if managed == 'bad-checksum':
        checksum = '0' * 64
    checksums = tmp_path / 'SHASUMS256.txt'
    checksums.write_text(f'{checksum}  {archive.name}\n')
    uv = tmp_path / 'uv-stub'
    executable(uv, f'#!/bin/sh\nif [ "$2" = find ]; then printf "%s\\n" {shlex.quote(sys.executable)}; fi\n')
    uv_install = tmp_path / 'uv-install.sh'
    uv_install.write_text(f'#!/bin/sh\nmkdir -p "$UV_INSTALL_DIR"\n'
                          f'{shlex.quote(shutil.which("cp"))} {shlex.quote(str(uv))} "$UV_INSTALL_DIR/uv"\n')
    executable(bin_dir / 'curl', f'''#!/bin/sh
for arg; do
  case "$arg" in
    *SHASUMS256.txt) src={shlex.quote(str(checksums))} ;;
    *.tar.gz) src={shlex.quote(str(archive))} ;;
    */uv/install.sh) src={shlex.quote(str(uv_install))} ;;
  esac
done
while [ "$#" -gt 0 ]; do
  if [ "$1" = -o ]; then {shlex.quote(shutil.which('cp'))} "$src" "$2"; exit; fi
  shift
done
exit 1
''')
    result = subprocess.run([sys.executable, '-c',
        'import runpy,sys; from pathlib import Path; '
        'runpy.run_path(sys.argv[1])["pipe_session"](Path(sys.argv[2]), Path(sys.argv[3]), sys.argv[4])',
        str(Path(__file__)), str(bin_dir), str(home), managed], capture_output=True, text=True, timeout=25)
    assert result.returncode == 0, result.stdout + result.stderr
    if managed == 'node':
        assert (home / f'.ohmydots/.local/runtime/{folder}/bin/node').exists()
    elif managed == 'python':
        assert (home / '.ohmydots/.local/runtime/bin/python3').exists()
    else:
        assert not (home / f'.ohmydots/.local/runtime/{folder}/bin/node').exists()


def pipe_session(bin_dir, home, managed):
    pid, terminal = pty.fork()
    if pid == 0:
        env = {**os.environ, 'HOME': str(home), 'PATH': str(bin_dir)}
        os.execve(str(bin_dir / 'bash'), ['bash', '-c', f'/bin/cat {shlex.quote(str(ROOT / "install.sh"))} | bash'], env)
    transcript = b''
    sent_folder = sent_port = False
    try:
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            if select.select([terminal], [], [], 0.2)[0]:
                try:
                    data = os.read(terminal, 65536)
                except OSError:
                    break
                if not data:
                    break
                transcript += data
                if '설치 폴더'.encode() in transcript and not sent_folder:
                    os.write(terminal, b'\n')
                    sent_folder = True
                if b'Port:' in transcript and not sent_port:
                    os.write(terminal, b'3099\n')
                    sent_port = True
        else:
            os.kill(pid, 9)
            raise AssertionError('Piped installer hung: ' + transcript.decode(errors='replace'))
        _, status = os.waitpid(pid, 0)
        if managed == 'bad-checksum':
            assert os.waitstatus_to_exitcode(status) != 0
            assert b'Node checksum mismatch' in transcript and b'PIPE_SETUP_OK' not in transcript
            return
        assert os.waitstatus_to_exitcode(status) == 0, transcript.decode(errors='replace')
        assert b'PIPE_SETUP_OK' in transcript
    finally:
        os.close(terminal)
