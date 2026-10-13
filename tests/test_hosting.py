import importlib.util
import json
import os
from pathlib import Path
from unittest.mock import AsyncMock, Mock

import httpx
import pytest
from ohmydot.config import Config
from ohmydot.main import create_app
from ohmydot.store import ComputerSession, Dot, Setting

spec = importlib.util.spec_from_file_location('host', Path(__file__).resolve().parents[1] / 'scripts/host.py')
host = importlib.util.module_from_spec(spec)
spec.loader.exec_module(host)


@pytest.mark.parametrize('repaired', [True, False])
def test_missing_pip_recovers_without_recreating_environment(tmp_path, monkeypatch, repaired):
    monkeypatch.setattr(host, 'ROOT', tmp_path)
    uv = tmp_path / '.local/runtime/uv/uv'
    uv.parent.mkdir(parents=True)
    uv.touch()
    results = iter([1, 0 if repaired else 1, 0 if repaired else 1])
    monkeypatch.setattr(host.subprocess, 'run', lambda *args, **kwargs: Mock(returncode=next(results)))
    run = Mock()
    monkeypatch.setattr(host, 'run', run)
    host.install_api_dependencies()
    expected = [host.PYTHON, '-m', 'pip', 'install', '-r', 'requirements.txt'] if repaired else [
        uv, 'pip', 'install', '--python', host.PYTHON, '-r', 'requirements.txt']
    run.assert_called_once_with(expected)


def test_missing_pip_without_uv_has_actionable_error(tmp_path, monkeypatch):
    monkeypatch.setattr(host, 'ROOT', tmp_path)
    monkeypatch.setattr(host.subprocess, 'run', lambda *args, **kwargs: Mock(returncode=1))
    with pytest.raises(ValueError, match='settings and data are retained'):
        host.install_api_dependencies()


@pytest.mark.parametrize('value', ['https://dots.example.com', 'http://localhost:3090', 'http://127.0.0.1:3090'])
def test_hosting_origin(value):
    assert host.validate_origin(value + '/') == value


def test_hosting_origin_matches_browser_normalization():
    assert host.validate_origin('HTTPS://DOTS.Example.COM:443/') == 'https://dots.example.com'
    assert host.validate_origin('https://닷츠.example/') == 'https://xn--mk1b282c.example'


@pytest.mark.parametrize('value', ['http://public.example.com', 'https://owner:secret@example.com',
                                  'https://example.com/path', 'https://example.com?key=secret', 'javascript:alert(1)'])
def test_hosting_rejects_unsafe_or_noncanonical_origins(value):
    with pytest.raises(ValueError):
        host.validate_origin(value)


def test_stop_never_targets_a_stale_or_foreign_pid(tmp_path, monkeypatch):
    monkeypatch.setattr(host, 'BASE', tmp_path)
    (tmp_path / 'server.pid').write_text('123')
    monkeypatch.setattr(host, 'output', lambda _: f'{os.getuid()} unrelated-process')
    assert host.service_pid() is None
    monkeypatch.setattr(host, 'output', lambda _: f'{os.getuid() + 1} {Path(host.__file__).resolve()} serve')
    assert host.service_pid() is None
    monkeypatch.setattr(host, 'output', lambda _: f'{os.getuid()} python {Path(host.__file__).resolve()} serve')
    assert host.service_pid() == 123


def test_host_networks_avoid_existing_subnets_without_pruning(monkeypatch):
    calls = []
    def output(args):
        calls.append(args)
        if args[2] == 'ls':
            return 'one\ntwo'
        return json.dumps([{'IPAM': {'Config': [{'Subnet': '10.247.0.0/23'}]}},
                           {'IPAM': {'Config': [{'Subnet': 'fd00::/64'}]}}])
    monkeypatch.setattr(host, 'output', output)
    result = host.network_subnets()
    assert len(set(result.values())) == 5
    assert not {'10.247.0.0/24', '10.247.1.0/24'} & set(result.values())
    assert all('prune' not in args for args in calls)


async def test_remote_session_requires_gateway_secret_and_matching_origin(tmp_path):
    app = create_app(Config(database_url='sqlite:///' + str(tmp_path / 'db'), data_dir=str(tmp_path),
                            session_token='secret', computer_token='computer', shell_token='shell',
                            origin='https://dots.example.com'))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url='https://dots.example.com') as client:
        assert (await client.get('/api/session')).status_code == 403
        headers = {'X-Dot-Bootstrap': 'secret', 'Origin': 'https://dots.example.com'}
        response = await client.get('/api/session', headers=headers)
        assert response.status_code == 200
        cookie = response.headers['set-cookie'].lower()
        assert 'secure' in cookie and 'httponly' in cookie and 'samesite=strict' in cookie
        assert (await client.get('/api/dots')).status_code == 200
        headers['Origin'] = 'https://attacker.example.com'
        assert (await client.get('/api/session', headers=headers)).status_code == 403
        assert (await client.get('/api/session', headers={'X-Dot-Bootstrap': 'secret', 'Host': 'attacker.example.com'})).status_code == 403


async def test_managed_dot_refreshes_published_ports_after_restart(tmp_path):
    app = create_app(Config(database_url='sqlite:///' + str(tmp_path / 'db'), data_dir=str(tmp_path),
                            session_token='session', computer_token='computer', shell_token='shell',
                            compose_project='personal-dots', managed_computers=True))
    pool = app.state.dots
    with pool.store.session() as db:
        db.add(Dot(id='dot-demo', name='Demo'))
        db.add(ComputerSession(id='computer-dot-demo', dot_id='dot-demo'))
        db.add(Setting(key='dot-computer:dot-demo', value=json.dumps({'computer_url': 'http://stale:1'})))
        db.commit()
    def inspect(*args):
        assert args[0] == 'inspect' and args[1].startswith('personal-dots-dot-demo-')
        return json.dumps([{'Config': {'Labels': {'ohmydots.project': 'personal-dots', 'ohmydots.dot': 'dot-demo'}},
                            'NetworkSettings': {'Ports': {'8765/tcp': [{'HostPort': '51001'}],
                                                         '6080/tcp': [{'HostPort': '51002'}],
                                                         '8766/tcp': [{'HostPort': '51003'}]}}}])
    pool.docker = AsyncMock(side_effect=inspect)
    monkey_runtime = AsyncMock()
    from unittest.mock import patch
    with patch('ohmydot.dots.Runtime', return_value=monkey_runtime):
        monkey_runtime.desktop.post = AsyncMock(return_value={})
        await pool.get('dot-demo')
    saved = json.loads(pool.store.get_setting('dot-computer:dot-demo', '{}'))
    assert saved == {'computer_url': 'http://127.0.0.1:51001', 'vnc_url': 'ws://127.0.0.1:51002',
                     'shell_url': 'http://127.0.0.1:51003'}
    pool.docker = AsyncMock(return_value=json.dumps([{'Config': {'Labels': {}}, 'NetworkSettings': {}}]))
    with pytest.raises(ValueError, match='identity mismatch'):
        await pool.container_endpoints('dot-demo')
