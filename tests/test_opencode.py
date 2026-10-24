import asyncio
import json
from pathlib import Path
from types import SimpleNamespace

import pytest
from ohmydot import opencode_provider as oc
from ohmydot.providers import TaskFailure
from ohmydot.tool_registry import TOOLS


def test_product_config_allows_only_bounded_tools():
    cfg = oc.product_config('instructions', {'type': 'local', 'command': ['bridge']})
    allowed = {row['action'] for row in cfg['permissions'] if row['effect'] == 'allow'}
    assert allowed == {'ohmydots_' + t['name'] for t in TOOLS}
    assert cfg['permissions'][0] == {'action': '*', 'resource': '*', 'effect': 'deny'}
    assert cfg['agents']['ohmydots']['permissions'] == cfg['permissions']
    assert {'action': 'integration.use', 'resource': '*', 'effect': 'deny'} in cfg['policies']
    assert cfg['mcp']['servers']['ohmydots']['command'] == ['bridge']
    observer = oc.product_config('observe')
    assert not any(p['effect'] == 'allow' for p in observer['permissions'])
    assert observer['share'] == 'disabled'


async def test_catalog_version_gate_and_missing_cli(monkeypatch):
    oc._catalog_cache.clear()
    monkeypatch.setattr(oc.shutil, 'which', lambda _: None)
    assert not (await oc.opencode_status())['installed']
    monkeypatch.setattr(oc.shutil, 'which', lambda _: '/test/opencode')
    calls = []
    async def old(binary, *args, **kwargs):
        calls.append(args)
        return '1.2.0'
    monkeypatch.setattr(oc, 'cli_output', old)
    assert not (await oc.opencode_status())['available']
    assert calls == [('--version',)]
    oc._catalog_cache.clear()
    async def current(binary, *args, **kwargs):
        return 'opencode v2.0.32' if args == ('--version',) else 'vendor/model\nvendor/model\nnot a model\n'
    monkeypatch.setattr(oc, 'cli_output', current)
    status = await oc.opencode_status()
    assert status['available']
    assert status['models'] == [{'id': 'vendor/model', 'name': 'vendor/model'}]
    oc._catalog_cache.clear()


def executable(tmp_path, body):
    import sys
    path = tmp_path / 'fake-opencode'
    path.write_text('#!' + sys.executable + '\n' + body)
    path.chmod(0o700)
    return str(path)


async def test_json_transport_and_error_redaction(tmp_path):
    binary = executable(tmp_path, '''import json, os, sys
assert '--standalone' in sys.argv
assert '--auto' not in sys.argv
assert os.environ['OPENCODE_CONFIG_DIR'] == os.getcwd()
assert 'OPENCODE_CONFIG_CONTENT' not in os.environ
assert sys.stdin.read() == 'hello'
print(json.dumps({'type':'text','sessionID':'session-1','part':{'id':'text-1','text':'answer'}}))
''')
    events = []
    answer, session = await oc.run_turn(binary, str(tmp_path), 'hello', 'vendor/model', on_event=events.append)
    assert (answer, session) == ('answer', 'session-1')
    assert len(events) == 1
    binary = executable(tmp_path, '''import json, sys
sys.stdin.read()
print(json.dumps({'type':'error','error':{'type':'provider.auth','message':'SECRET_DO_NOT_ECHO'}}))
sys.exit(1)
''')
    with pytest.raises(TaskFailure) as failure:
        await oc.run_turn(binary, str(tmp_path), 'hello')
    assert str(failure.value) == 'OPENCODE_AUTH_FAILED'
    assert 'SECRET' not in failure.value.message


async def test_cancellation_terminates_private_process(tmp_path):
    binary = executable(tmp_path, '''import pathlib, os, sys, time
sys.stdin.read()
pathlib.Path('started').write_text(str(os.getpid()))
time.sleep(60)
''')
    task = asyncio.create_task(oc.run_turn(binary, str(tmp_path), 'hello'))
    async with asyncio.timeout(5):
        while not (tmp_path / 'started').exists():
            await asyncio.sleep(.01)
    pid = int((tmp_path / 'started').read_text())
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    import os
    with pytest.raises(ProcessLookupError):
        os.kill(pid, 0)


async def test_goal_continuation_reuses_session_and_accumulates_usage(monkeypatch):
    events, calls = [], []
    runtime = SimpleNamespace(config=SimpleNamespace(opencode_bin='opencode', internal_url='http://127.0.0.1:1', max_tools=80),
                              tool_tokens={'run-1': 'private-token'},
                              store=SimpleNamespace(event=lambda *args: events.append(args)))
    run = SimpleNamespace(id='run-1', model='vendor/model', dot_name='Dot')
    async def available(_):
        return {'available': True}
    monkeypatch.setattr(oc, 'opencode_status', available)
    async def turn(binary, cwd, prompt, model, session, on_event):
        calls.append((prompt, model, session))
        cfg = json.loads((Path(cwd) / 'opencode.json').read_text())
        assert cfg['mcp']['servers']['ohmydots']['environment']['DOT_RUN_TOKEN'] == 'private-token'
        assert (Path(cwd) / 'opencode.json').stat().st_mode & 0o777 == 0o600
        n = len(calls)
        event = {'type':'step_finish','part':{'id':str(n),'tokens':{'input':10,'output':2,'cache':{'read':4,'write':1}}}}
        on_event(event)
        on_event(event)
        return json.dumps({'status':'in_progress' if n == 1 else 'completed','message':'done',
                           'checkpoint':'one','next_action':'continue'}), 'session-1'
    monkeypatch.setattr(oc, 'run_turn', turn)
    answer = await oc.run_opencode(runtime, run, [{'role':'user','content':'hello'}], SimpleNamespace())
    assert answer == 'done'
    assert calls[0][2] is None and calls[1][2] == 'session-1'
    usage = [e[-1] for e in events if e[0] == 'run.usage']
    assert usage[-1]['input_tokens'] == 30
    assert usage[-1]['output_tokens'] == 4
    assert usage[-1]['model_requests'] == 2
    assert all('private-token' not in str(e) for e in events)


def test_invalid_final_does_not_become_success():
    with pytest.raises(RuntimeError, match='OPENCODE_INVALID_OUTCOME'):
        oc.parse_outcome('Everything is done!')
    assert oc.parse_outcome('```json\n{"status":"completed","message":"ok"}\n```').message == 'ok'
