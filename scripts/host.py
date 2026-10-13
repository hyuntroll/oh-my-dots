#!/usr/bin/env python3
"""Single-owner production hosting on Linux Docker Engine or macOS Docker Desktop."""
import argparse
import getpass
import ipaddress
import json
import os
import platform
import re
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / '.local/hosting'
PYTHON = ROOT / '.venv/bin/python'
SERVICES = ['postgres', 'computer', 'shell', 'gateway']


def run(args, **kwargs):
    return subprocess.run([str(a) for a in args], cwd=ROOT, check=True, **kwargs)


def output(args):
    return run(args, capture_output=True, text=True).stdout.strip()


def private_write(path, value, mode=0o600):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, mode)
    with os.fdopen(fd, 'w') as file:
        file.write(value)
    os.chmod(path, mode)


def validate_origin(value):
    parsed = urlsplit(value)
    if (parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password
            or parsed.path not in ('', '/') or parsed.query or parsed.fragment):
        raise ValueError('Origin must be a complete http(s) address without a path or credentials.')
    if parsed.scheme == 'http' and parsed.hostname not in ('localhost', '127.0.0.1'):
        raise ValueError('Remote access requires an HTTPS origin; keep the local gateway behind a TLS proxy.')
    host = parsed.hostname.encode('idna').decode().lower()
    host = '[' + host + ']' if ':' in host else host
    port = parsed.port
    suffix = f':{port}' if port and (parsed.scheme, port) not in (('https', 443), ('http', 80)) else ''
    return f'{parsed.scheme}://{host}{suffix}'


def free_port(exclude=()):
    while True:
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        if port not in exclude:
            return port


def settings():
    return json.loads((BASE / 'settings.json').read_text())


def network_subnets():
    ids = output(['docker', 'network', 'ls', '-q']).splitlines()
    rows = json.loads(output(['docker', 'network', 'inspect', *ids])) if ids else []
    used = [ipaddress.ip_network(item['Subnet']) for row in rows
            for item in row.get('IPAM', {}).get('Config') or [] if item.get('Subnet')]
    selected = []
    for pool in ('10.247.0.0/16', '10.248.0.0/16', '10.249.0.0/16'):
        for candidate in ipaddress.ip_network(pool).subnets(new_prefix=24):
            if not any(network.version == 4 and candidate.overlaps(network) for network in used):
                selected.append(str(candidate))
                if len(selected) == 5:
                    return dict(zip(('BACKEND', 'FRONTEND', 'DESKTOP', 'SHELL', 'EGRESS'), selected))
    raise ValueError('No free private Docker subnet found. Configure non-overlapping hosting networks manually.')


def compose(config):
    args = ['docker', 'compose', '--project-name', config['project'], '--env-file', '.env.local',
            '--env-file', str(BASE / 'hosting.env'), '-f', 'compose.yaml', '-f', 'compose.host.yaml']
    if platform.system() == 'Linux':
        args += ['-f', 'compose.host-linux.yaml']
    return args


def write_config(config):
    private_write(BASE / 'settings.json', json.dumps(config, indent=2) + '\n')
    values = {
        'DOT_DATABASE_PASSWORD': config['database_password'], 'DOT_PORT': config['port'],
        'DOT_API_PORT': config['api_port'], 'DOT_WEB_PORT': config['web_port'],
    }
    values.update({'DOT_' + key + '_SUBNET': value for key, value in config['subnets'].items()})
    private_write(BASE / 'hosting.env', '\n'.join(f'{key}={value}' for key, value in values.items()) + '\n')


def password(user, stdin=False):
    if not re.fullmatch(r'[A-Za-z0-9_.-]{1,32}', user):
        raise ValueError('Use 1–32 letters, digits, underscores, dots or hyphens for the login name.')
    value = sys.stdin.readline().rstrip('\n') if stdin else getpass.getpass('Hosting password (12+ characters): ')
    if len(value) < 12 or len(value.encode()) > 72 or '\n' in value or '\r' in value:
        raise ValueError('Password must contain at least 12 characters and at most 72 UTF-8 bytes on a single line.')
    if not stdin and value != getpass.getpass('Confirm password: '):
        raise ValueError('Passwords do not match.')
    hashed = run(['docker', 'run', '--rm', '-i', '--network', 'none', 'httpd:2.4-alpine',
                  'htpasswd', '-niB', '-C', '10', user], input=value + '\n', text=True, capture_output=True).stdout
    # Parent directory is private; nginx workers must be able to read this mounted hash file.
    private_write(BASE / 'htpasswd', hashed, mode=0o644)


def service_pid():
    try:
        pid = int((BASE / 'server.pid').read_text())
        identity = output(['ps', '-p', str(pid), '-o', 'uid=,command=']).split(maxsplit=1)
        if int(identity[0]) == os.getuid() and str(Path(__file__).resolve()) + ' serve' in identity[1]:
            return pid
    except (FileNotFoundError, ValueError, IndexError, subprocess.CalledProcessError):
        pass
    return None


def install_api_dependencies():
    probe = [PYTHON, '-m', 'pip', '--version']
    quiet = {'stdout': subprocess.DEVNULL, 'stderr': subprocess.DEVNULL}
    if subprocess.run(probe, **quiet).returncode:
        print('Preparing pip in the existing virtual environment…', flush=True)
        subprocess.run([PYTHON, '-m', 'ensurepip', '--upgrade'], **quiet)
        if subprocess.run(probe, **quiet).returncode:
            uv = ROOT / '.local/runtime/uv/uv'
            if uv.is_file():
                # Managed Python distributions can omit pip/ensurepip; uv does not need them.
                run([uv, 'pip', 'install', '--python', PYTHON, '-r', 'requirements.txt'])
                return
            raise ValueError('This Python environment has neither pip nor ensurepip. '
                             'Install your Python distribution\'s venv/pip support and retry setup; '
                             'existing settings and data are retained.')
    run([PYTHON, '-m', 'pip', 'install', '-r', 'requirements.txt'])


def install(args):
    if service_pid():
        raise ValueError('Stop the hosting service before installing an update.')
    if platform.system() not in ('Linux', 'Darwin'):
        raise ValueError('Use Linux Docker Engine or macOS Docker Desktop. Native Windows is not supported yet.')
    if int(output(['node', '--version']).lstrip('v').split('.')[0]) < 24:
        raise ValueError('Node.js 24 or newer is required.')
    output(['docker', 'compose', 'version'])
    BASE.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(BASE, 0o700)
    api_port = free_port((args.port,))
    config = settings() if (BASE / 'settings.json').exists() else {
        'project': args.project, 'port': args.port, 'origin': f'http://localhost:{args.port}',
        'api_port': api_port, 'web_port': free_port((args.port, api_port)), 'database_password': secrets.token_urlsafe(32),
    }
    if not re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,40}', config['project']):
        raise ValueError('Invalid Compose project name.')
    if args.origin:
        config['origin'] = validate_origin(args.origin)
    if 'subnets' not in config:
        config['subnets'] = network_subnets()
    write_config(config)
    run([sys.executable, 'scripts/setup.py'])
    if not (BASE / 'htpasswd').exists():
        password(args.user, args.password_stdin)
    if not PYTHON.exists():
        run([sys.executable, '-m', 'venv', ROOT / '.venv'])
    print('Installing API and Codex dependencies…', flush=True)
    install_api_dependencies()
    run(['npm', 'install', '--prefix', BASE / 'codex', '@openai/codex@0.160.0'])
    web = BASE / 'web'
    if web.exists():
        shutil.rmtree(web)
    shutil.copytree(ROOT / 'apps/web', web, ignore=shutil.ignore_patterns('node_modules', '.next', '.env*', '*.tsbuildinfo'))
    print('Building the production web application…', flush=True)
    run(['npm', 'ci', '--prefix', web])
    run(['npm', 'run', 'build', '--prefix', web], env={**os.environ, 'NEXT_TELEMETRY_DISABLED': '1'})
    run(compose(config) + ['build', 'computer', 'shell'])
    print('Installed. Start with: python3 scripts/host.py start --detach')


def published(config, service, port):
    address = output(compose(config) + ['port', service, str(port)]).splitlines()[0]
    if not address.startswith('127.0.0.1:'):
        raise ValueError('Private service port must be published on loopback.')
    return address


def bind_host():
    if platform.system() == 'Darwin':
        return '127.0.0.1'
    # Listen only on Docker's host-side bridge, not the server's public interface.
    bridge = json.loads(output(['docker', 'network', 'inspect', 'bridge']))[0]
    return bridge['IPAM']['Config'][0]['Gateway']


def environment(config):
    db = published(config, 'postgres', 5432)
    computer = published(config, 'computer', 8765)
    shell = published(config, 'shell', 8766)
    vnc = published(config, 'computer', 6080)
    host = bind_host()
    return {**os.environ, 'DATABASE_URL': f"postgresql+psycopg://dots:{config['database_password']}@{db}/dots",
            'COMPUTER_URL': 'http://' + computer, 'SHELL_URL': 'http://' + shell, 'VNC_URL': 'ws://' + vnc,
            'DOT_DATA_DIR': str(BASE / 'data'), 'CODEX_HOME': str(BASE / 'data/codex'),
            'CODEX_BIN': str(BASE / 'codex/node_modules/.bin/codex'), 'DOT_ORIGIN': config['origin'],
            'DOT_COMPOSE_PROJECT': config['project'], 'DOT_MANAGED_COMPUTERS': '1',
            'INTERNAL_API_URL': f"http://{host}:{config['api_port']}", 'PYTHONPATH': str(ROOT / 'apps/api'),
            'HOSTNAME': host, 'PORT': str(config['web_port']), 'NODE_ENV': 'production'}


def serve():
    if service_pid():
        raise ValueError('Hosting service is already running.')
    config = settings()
    if 'subnets' not in config:
        config['subnets'] = network_subnets()
        write_config(config)
    children = []
    stopping = False

    def stop(*_):
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    private_write(BASE / 'server.pid', str(os.getpid()))
    try:
        command = compose(config) + ['up', '-d', '--no-build', '--wait', '--wait-timeout', '120', *SERVICES]
        startup = subprocess.Popen(command, cwd=ROOT)
        children.append(startup)
        while not stopping and startup.poll() is None:
            time.sleep(0.2)
        if stopping:
            return
        if startup.returncode:
            raise subprocess.CalledProcessError(startup.returncode, command)
        children.clear()
        names = output(['docker', 'ps', '-a', '--filter', 'label=ohmydots.project=' + config['project'], '--format', '{{.Names}}']).splitlines()
        if names:
            run(['docker', 'start', *names])
        env = environment(config)
        for port in (config['api_port'], config['web_port']):
            with socket.socket() as sock:
                sock.bind((env['HOSTNAME'], port))
        api = [str(PYTHON), '-m', 'uvicorn', 'ohmydot.main:create_app', '--factory', '--host', env['HOSTNAME'],
               '--port', str(config['api_port']), '--no-access-log', '--timeout-graceful-shutdown', '10']
        web = ['node', str(BASE / 'web/scripts/start.mjs')]
        for command in (api, web):
            children.append(subprocess.Popen(command, cwd=ROOT, env=env))
        print('OhMyDots: ' + config['origin'], flush=True)
        while not stopping and all(child.poll() is None for child in children):
            time.sleep(0.5)
        if not stopping:
            raise ValueError('A hosting process stopped. Check .local/hosting/server.log.')
    finally:
        for child in children:
            if child.poll() is None:
                child.terminate()
        for child in children:
            try:
                child.wait(timeout=15)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()
        if (BASE / 'server.pid').read_text() == str(os.getpid()):
            (BASE / 'server.pid').unlink()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    setup = commands.add_parser('install')
    setup.add_argument('--port', type=int, default=3080, choices=range(1024, 65536), metavar='PORT')
    setup.add_argument('--origin')
    setup.add_argument('--project', default='ohmydots')
    setup.add_argument('--user', default='owner')
    setup.add_argument('--password-stdin', action='store_true', help='Read initial password from stdin (automation only)')
    commands.add_parser('serve', help=argparse.SUPPRESS)
    start = commands.add_parser('start')
    start.add_argument('--detach', action='store_true')
    commands.add_parser('stop')
    commands.add_parser('status')
    configure = commands.add_parser('configure')
    configure.add_argument('--origin', required=True)
    change = commands.add_parser('password')
    change.add_argument('--user', default='owner')
    commands.add_parser('systemd')
    args = parser.parse_args()
    os.chdir(ROOT)
    if args.command == 'install':
        install(args)
    elif args.command == 'serve':
        serve()
    elif args.command == 'start':
        if not args.detach:
            serve()
        else:
            if service_pid():
                raise ValueError('Hosting service is already running.')
            fd = os.open(BASE / 'server.log', os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
            with os.fdopen(fd, 'a') as log:
                child = subprocess.Popen([str(PYTHON), str(Path(__file__).resolve()), 'serve'], cwd=ROOT,
                                         stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True)
            time.sleep(1)
            if child.poll() is not None:
                raise ValueError('Could not start. Check .local/hosting/server.log.')
            print('Starting. Check: python3 scripts/host.py status')
    elif args.command == 'stop':
        pid = service_pid()
        if pid:
            os.kill(pid, signal.SIGTERM)
            for _ in range(40):
                if not service_pid():
                    break
                time.sleep(0.5)
            else:
                raise ValueError('The service is still stopping; check the log before retrying.')
        print('Hosting processes stopped. Docker computers and saved data are retained.')
    elif args.command == 'status':
        print('Running' if service_pid() else 'Stopped')
    elif args.command == 'configure':
        if service_pid():
            raise ValueError('Stop hosting before changing its public origin.')
        config = settings()
        config['origin'] = validate_origin(args.origin)
        write_config(config)
        print('Origin saved. Start hosting again to apply it.')
    elif args.command == 'password':
        password(args.user)
        print('Hosting login password updated.')
    elif args.command == 'systemd':
        unit = ('[Unit]\nDescription=OhMyDots personal hosting\nAfter=network-online.target\n\n[Service]\n'
                f'WorkingDirectory="{ROOT}"\nExecStart="{PYTHON}" "{Path(__file__).resolve()}" serve\n'
                'Restart=on-failure\nRestartSec=5\nTimeoutStopSec=45\n\n[Install]\nWantedBy=default.target\n')
        private_write(BASE / 'ohmydots.service', unit)
        print('Unit written to .local/hosting/ohmydots.service; see docs/SELF-HOSTING.md to enable it.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, FileNotFoundError, subprocess.CalledProcessError) as exc:
        print('Hosting setup failed: ' + str(exc), file=sys.stderr)
        sys.exit(1)
