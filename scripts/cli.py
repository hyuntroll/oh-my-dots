#!/usr/bin/env python3
"""Interactive installer and personal-hosting launcher. No model credentials in shell arguments."""
import argparse
import os
import platform
import re
import shlex
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import ProxyHandler, build_opener

import host

REPO = 'https://github.com/hyuntroll/oh-my-dots.git'


def ask(label, default, validate=lambda value: value):
    while True:
        value = input(f'{label} [{default}]: ').strip() or str(default)
        try:
            return validate(value)
        except ValueError as exc:
            print(exc)


def yes(label, default=True):
    def validate(value):
        if value.lower() not in ('y', 'yes', 'n', 'no'):
            raise ValueError('y 또는 n을 입력하세요.')
        return value.lower() in ('y', 'yes')
    return ask(label, 'Y' if default else 'N', validate)


def port(value):
    number = int(value)
    if not 1024 <= number <= 65535:
        raise ValueError('1024–65535 사이의 포트를 입력하세요.')
    try:
        with socket.socket() as check:
            check.bind(('127.0.0.1', number))
    except OSError:
        raise ValueError(f'{number} 포트는 사용 중입니다. 다른 포트를 선택하세요.') from None
    return number


def doctor():
    if sys.version_info < (3, 11) or platform.system() not in ('Linux', 'Darwin'):
        raise ValueError('Use Linux/macOS with Python 3.11+. Run install.sh to prepare Python.')
    for name in ('git', 'node', 'npm', 'docker'):
        if not shutil.which(name):
            raise ValueError(f'Missing {name}. Run install.sh or see docs/SELF-HOSTING.md.')
    if int(host.output(['node', '--version']).lstrip('v').split('.')[0]) < 24:
        raise ValueError('Node.js 24+ is required. Run install.sh to prepare Node.')
    version = host.output(['docker', 'compose', 'version', '--short'])
    match = re.search(r'(\d+)\.(\d+)\.(\d+)', version)
    if not match or tuple(map(int, match.groups())) < (2, 24, 4):
        raise ValueError('Docker Compose 2.24.4+ is required.')
    host.run(['docker', 'info'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print('✓ Python · Node · Docker · Compose 준비됨', flush=True)


def create_launcher():
    directory = Path.home() / '.local/bin'
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / 'ohmydots'
    marker = '# OhMyDots managed launcher\n'
    if path.exists() or path.is_symlink():
        if path.is_symlink() or marker not in path.read_text():
            raise ValueError(f'{path} already exists and is not our launcher. Keep it or rename it first.')
        # Never silently redirect the command to another installation.
        if shlex.quote(str(host.ROOT / 'scripts/cli.py')) not in path.read_text():
            raise ValueError(f'{path} belongs to another installation. Use this checkout directly.')
    runtime = host.ROOT / '.local/runtime/bin'
    script = (f'#!/bin/sh\n{marker}export PATH={shlex.quote(str(runtime))}:"$PATH"\n'
              f'exec {shlex.quote(str(host.PYTHON))} {shlex.quote(str(host.ROOT / "scripts/cli.py"))} "$@"\n')
    host.private_write(path, script, mode=0o755)
    return path


def add_path(launcher):
    if str(launcher.parent) in os.environ.get('PATH', '').split(os.pathsep):
        return
    shell = Path(os.environ.get('SHELL', '/bin/bash')).name
    if shell not in ('bash', 'zsh'):
        print(f'명령어 위치: {launcher}. 이 폴더를 셸 PATH에 추가하세요.')
        return
    rc = Path.home() / ('.zshrc' if shell == 'zsh' else '.bashrc')
    line = 'export PATH="$HOME/.local/bin:$PATH"'
    if rc.exists() and line in rc.read_text():
        print(f'새 터미널에서 ohmydots 명령을 사용할 수 있습니다. 현재 창: {launcher}')
        return
    if yes(f'{rc.name}에 ohmydots 명령어 경로를 추가할까요?'):
        with rc.open('a') as file:
            file.write(f'\n# OhMyDots\n{line}\n')
        print(f'새 터미널에서 ohmydots 명령을 사용할 수 있습니다. 현재 창: {launcher}')


def build(arguments):
    log = host.BASE / 'install.log'
    print(f'운영용 웹과 Dot 컴퓨터를 준비합니다. 첫 설치는 몇 분 걸립니다.\n로그: {log}', flush=True)
    fd = os.open(log, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
    os.chmod(log, 0o600)
    with os.fdopen(fd, 'a') as stream:
        result = subprocess.run([sys.executable, str(host.ROOT / 'scripts/host.py'), 'install', *arguments],
                                cwd=host.ROOT, stdout=stream, stderr=subprocess.STDOUT)
    if result.returncode:
        raise ValueError(f'설치가 완료되지 않았습니다. 로그를 확인한 뒤 ohmydots setup으로 다시 시도하세요: {log}')


def start():
    host.run([host.PYTHON, host.ROOT / 'scripts/host.py', 'start', '--detach'])
    print('웹과 컴퓨터가 시작될 때까지 기다립니다…', flush=True)
    config = host.settings()
    address = host.bind_host()
    opener = build_opener(ProxyHandler({}))
    deadline = time.monotonic() + 180
    while time.monotonic() < deadline:
        if not host.service_pid():
            raise ValueError(f'서버가 종료되었습니다. {host.BASE / "server.log"}를 확인하세요.')
        try:
            with opener.open(f'http://{address}:{config["api_port"]}/health', timeout=2) as response:
                if response.status != 200:
                    continue
            with opener.open(f'http://{address}:{config["web_port"]}/', timeout=2) as response:
                if response.status != 200:
                    continue
            try:
                opener.open(f'http://127.0.0.1:{config["port"]}/', timeout=2).close()
                raise ValueError('게이트웨이 비밀번호 보호를 확인할 수 없습니다.')
            except HTTPError as exc:
                if exc.code != 401:
                    raise URLError('Gateway is not ready') from exc
            print(f'✓ 실행 중: {config["origin"]}/', flush=True)
            if config['origin'] != f'http://localhost:{config["port"]}':
                print(f'로컬 게이트웨이: http://127.0.0.1:{config["port"]}/ · 원격 접속은 HTTPS 프록시를 준비하세요.')
            return
        except (OSError, URLError):
            time.sleep(1)
    raise ValueError(f'시작 대기 시간이 지났습니다. ohmydots status와 {host.BASE / "server.log"}를 확인하세요.')


def setup():
    print('\n  OhMyDots 설정\n')
    doctor()
    if host.service_pid():
        raise ValueError('먼저 ohmydots stop으로 서버를 중지하세요. systemd 사용 시 해당 서비스를 중지하세요.')
    existing = (host.BASE / 'settings.json').exists()
    if existing:
        config = host.settings()
        print(f'기존 설치: {config["origin"]} · 프로젝트 {config["project"]}\n기존 설정·비밀번호·데이터를 유지합니다.')
        if not yes('현재 코드를 다시 설치할까요?'):
            return
        arguments = []
    else:
        default_port = 3080
        try:
            port(str(default_port))
        except ValueError:
            default_port = host.free_port()
        chosen_port = ask('웹 접속 포트', default_port, port)
        origin = ask('접속 주소 (원격 접속은 HTTPS 프록시 필요)', f'http://localhost:{chosen_port}', host.validate_origin)
        def project(value):
            if not re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,40}', value):
                raise ValueError('프로젝트 이름: 소문자·숫자·하이픈·밑줄, 최대 41자.')
            if host.output(['docker', 'ps', '-aq', '--filter', f'label=com.docker.compose.project={value}']):
                raise ValueError('이 설치 이름의 컨테이너가 이미 있습니다. 다른 이름을 선택하세요.')
            return value
        chosen_project = ask('설치 이름 (여러 인스턴스는 서로 다른 이름)', 'ohmydots', project)
        arguments = ['--port', str(chosen_port), '--origin', origin, '--project', chosen_project]
    host.BASE.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(host.BASE, 0o700)
    # The wrapper also allows recovery when a subsequent dependency build fails.
    if not host.PYTHON.exists():
        host.run([sys.executable, '-m', 'venv', host.ROOT / '.venv'])
    host.run([host.PYTHON, '-c', 'import sys; assert sys.version_info >= (3, 11), "Recreate .venv with Python 3.11+"'])
    launcher = create_launcher()
    if not (host.BASE / 'htpasswd').exists():
        def login(value):
            if not re.fullmatch(r'[A-Za-z0-9_.-]{1,32}', value):
                raise ValueError('로그인 이름: 영문·숫자·밑줄·점·하이픈, 최대 32자.')
            return value
        user = ask('브라우저 로그인 이름', 'owner', login)
        while True:
            try:
                host.password(user)
                break
            except ValueError as exc:
                print(exc)
    build(arguments)
    print('✓ 설치 완료', flush=True)
    add_path(launcher)
    if yes('지금 서버를 실행할까요?'):
        start()
    print(f'\n관리 명령: {launcher} start | stop | status | setup | update | doctor\n'
          'AI 연결: 웹 설정 → AI 연결 → Codex 로그인 또는 OpenAI API\n'
          '외부 접속·자동 시작·백업: docs/SELF-HOSTING.md')


def update():
    doctor()
    if host.output(['git', 'remote', 'get-url', 'origin']) != REPO:
        raise ValueError('This checkout has a different origin; update it manually.')
    if host.output(['git', 'branch', '--show-current']) != 'main':
        raise ValueError('Switch to main before updating.')
    if host.output(['git', 'status', '--porcelain', '--untracked-files=normal']):
        raise ValueError('Save your checkout changes before updating; no files were reset.')
    was_running = bool(host.service_pid())
    if was_running:
        host.run([host.PYTHON, host.ROOT / 'scripts/host.py', 'stop'])
    host.run(['git', 'pull', '--ff-only'], stdin=subprocess.DEVNULL)
    # Run the updated wizard in a fresh interpreter so it uses the updated implementation.
    host.run([host.PYTHON, host.ROOT / 'scripts/cli.py', 'setup'])


def main():
    parser = argparse.ArgumentParser(description='OhMyDots · 개인 AI 작업 공간 설치 및 관리')
    parser.add_argument('command', nargs='?', default='setup', choices=(
        'setup', 'start', 'stop', 'status', 'update', 'doctor', 'password', 'configure', 'systemd'))
    args, remaining = parser.parse_known_args()
    if args.command in ('setup', 'start', 'update', 'doctor') and remaining:
        parser.error('이 명령에는 추가 옵션이 없습니다.')
    os.chdir(host.ROOT)
    {'setup': setup, 'start': start, 'update': update, 'doctor': doctor}.get(
        args.command, lambda: host.run([host.PYTHON, host.ROOT / 'scripts/host.py', args.command, *remaining]))()


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('\n설정을 중단했습니다. 저장한 데이터는 유지합니다.', file=sys.stderr)
        sys.exit(130)
    except (ValueError, OSError, EOFError, subprocess.CalledProcessError) as exc:
        print(f'OhMyDots: {exc}', file=sys.stderr)
        sys.exit(1)
