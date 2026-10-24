import json
from dataclasses import replace
from unittest.mock import AsyncMock

import httpx
import pytest
from ohmydot.config import Config
from ohmydot.main import create_app
from ohmydot.runtime import Runtime
from ohmydot.store import Conversation, Run, Setting, Task


@pytest.fixture
def app(tmp_path):
    return create_app(Config(database_url='sqlite:///' + str(tmp_path / 'dots.db'),
        data_dir=str(tmp_path), session_token='session', computer_token='desktop', shell_token='shell'))


ENDPOINTS = {'computer_url': 'http://second-desktop', 'shell_url': 'http://second-shell',
             'vnc_url': 'ws://second-vnc'}


def fake_runtime(pool, endpoints=ENDPOINTS, health=None):
    runtime = Runtime(replace(pool.config, **endpoints), pool.store)
    runtime.desktop.post = AsyncMock(return_value={'ok': True})
    runtime.desktop.get = AsyncMock(return_value=health or {'owner': 'AGENT', 'epoch': 0, 'handoff': False,
                                                            'width': 1280, 'height': 960})
    runtime.shell.get = AsyncMock(return_value=[])
    runtime.shell.post = AsyncMock(return_value={})
    return runtime


def fake_computers(pool):
    """Point every dot, including the seeded one, at inert computer adapters."""
    for runtime in [pool.runtimes['dot-1']]:
        runtime.desktop.post = AsyncMock(return_value={'ok': True})
        runtime.desktop.get = AsyncMock(return_value={'owner': 'AGENT', 'epoch': 0, 'handoff': False,
                                                      'width': 1280, 'height': 960})
        runtime.shell.get = AsyncMock(return_value=[])
        runtime.shell.post = AsyncMock(return_value={})
    original = pool.get

    async def get(dot_id):
        if dot_id not in pool.runtimes:
            pool.runtimes[dot_id] = fake_runtime(pool)
        return await original(dot_id)

    pool.get = get


async def make_dot(client, pool, name='Sky'):
    pool.provision = AsyncMock(return_value=ENDPOINTS)
    response = await client.post('/api/dots', json={'name': name, 'color': 'blue', 'avatar': 'ring'})
    assert response.status_code == 200
    return response.json()


def client_for(app):
    return httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url='http://test',
                             cookies={'dot_session': 'session'})


async def test_dot_detail_and_rename(app):
    fake_computers(app.state.dots)
    async with client_for(app) as client:
        listed = (await client.get('/api/dots')).json()
        assert listed[0]['status'] == 'ACTIVE' and listed[0]['pinned'] is False
        assert (await client.get('/api/dots/missing')).status_code == 404
        detail = (await client.get('/api/dots/dot-1')).json()
        assert detail['name'] == 'OhMyDots' and detail['computer_id'] == 'computer-1'
        assert (await client.patch('/api/dots/dot-1', json={'name': '   '})).status_code == 422
        assert (await client.patch('/api/dots/dot-1', json={'name': 'x' * 33})).status_code == 422
        assert (await client.patch('/api/dots/missing', json={'name': 'Demo'})).status_code == 404
        renamed = (await client.patch('/api/dots/dot-1', json={'name': '  베르데  '})).json()
        assert renamed['name'] == '베르데'
        # Appearance round-trips through the same profile record.
        assert (await client.put('/api/dots/dot-1', json={'name': '베르데', 'color': 'lime',
                                                          'avatar': 'iggy'})).status_code == 200
        profile = (await client.get('/api/dots/dot-1')).json()
        assert profile['name'] == '베르데' and profile['color'] == 'lime' and profile['avatar'] == 'iggy'


async def test_pin_reorders_and_keeps_dot_one_readable(app):
    fake_computers(app.state.dots)
    async with client_for(app) as client:
        second = await make_dot(client, app.state.dots)
        assert [d['id'] for d in (await client.get('/api/dots')).json()] == ['dot-1', second['id']]
        pinned = (await client.post('/api/dots/' + second['id'] + '/pin', json={'pinned': True})).json()
        assert pinned['pinned'] is True
        assert [d['id'] for d in (await client.get('/api/dots')).json()] == [second['id'], 'dot-1']
        assert (await client.post('/api/dots/missing/pin', json={'pinned': True})).status_code == 404
        unpinned = (await client.post('/api/dots/' + second['id'] + '/pin', json={'pinned': False})).json()
        assert unpinned['pinned'] is False


async def test_pause_blocks_new_work_and_resume_restores_it(app):
    fake_computers(app.state.dots)
    pool = app.state.dots
    async with client_for(app) as client:
        conversation = (await client.post('/api/conversations')).json()
        body = {'text': '안녕', 'idempotency_key': 'k1', 'dot_name': 'OhMyDots'}
        assert (await client.post('/api/conversations/' + conversation['id'] + '/messages',
                                  json=body)).status_code == 200
        runtime = pool.runtimes['dot-1']
        with pool.store.session() as db:
            run = Run(task_id=(db.query(Task).first().id if False else None), conversation_id=conversation['id'],
                      idempotency_key='running', provider='codex', model='m')
            task = Task(dot_id='dot-1', conversation_id=conversation['id'], prompt='running', status='RUNNING')
            db.add(task)
            db.flush()
            run.task_id = task.id
            db.add(run)
            db.commit()
            runtime.active_id = run.id
        paused = (await client.post('/api/dots/dot-1/pause')).json()
        assert paused['status'] == 'PAUSED' and paused['cancelled_run_id'] == run.id
        with pool.store.session() as db:
            assert db.get(Run, run.id).status == 'CANCELLED'
        blocked = await client.post('/api/conversations/' + conversation['id'] + '/messages',
                                    json={'text': '다시', 'idempotency_key': 'k2', 'dot_name': 'OhMyDots'})
        assert blocked.status_code == 409 and '일시 중지' in blocked.json()['detail']
        assert (await client.post('/api/computer-sessions/computer-1/input',
                                  json={'action': 'key', 'key': 'Return'})).status_code == 409
        resumed = (await client.post('/api/dots/dot-1/resume')).json()
        assert resumed['status'] == 'ACTIVE'
        assert (await client.post('/api/computer-sessions/computer-1/input',
                                  json={'action': 'key', 'key': 'Return'})).status_code == 200
        assert (await client.post('/api/conversations/' + conversation['id'] + '/messages',
                                  json={'text': '재개', 'idempotency_key': 'k3',
                                        'dot_name': 'OhMyDots'})).status_code == 200


async def test_reboot_restarts_containers_and_reports_missing_ones(app):
    fake_computers(app.state.dots)
    pool = app.state.dots
    async with client_for(app) as client:
        assert (await client.post('/api/dots/missing/reboot')).status_code == 404
        pool.docker = AsyncMock(return_value='')
        assert (await client.post('/api/dots/dot-1/reboot')).status_code == 503
        calls = []

        async def docker(*args, **kwargs):
            calls.append(args)
            return 'ohmydot-computer-1' if args[0] == 'ps' else ''

        pool.docker = AsyncMock(side_effect=docker)
        pool.wait_health = AsyncMock(return_value=True)
        rebooted = await client.post('/api/dots/dot-1/reboot')
        assert rebooted.status_code == 200
        assert rebooted.json()['restarted'] == ['ohmydot-computer-1', 'ohmydot-computer-1']
        assert [call[0] for call in calls] == ['ps', 'ps', 'restart', 'restart']
        pool.wait_health = AsyncMock(return_value=False)
        assert (await client.post('/api/dots/dot-1/reboot')).status_code == 503


async def test_delete_archives_conversations_and_hides_the_dot(app):
    fake_computers(app.state.dots)
    pool = app.state.dots
    async with client_for(app) as app_client:
        assert (await app_client.delete('/api/dots/dot-1')).status_code == 409
        second = await make_dot(app_client, pool)
        conversation = (await app_client.post('/api/conversations', json={'dot_id': second['id']})).json()
        # A dead Docker daemon must not block removal.
        pool.docker = AsyncMock(side_effect=ValueError('Docker unavailable'))
        removed = await app_client.delete('/api/dots/' + second['id'])
        assert removed.status_code == 200
        assert removed.json()['archived_conversations'] == 1
        assert [d['id'] for d in (await app_client.get('/api/dots')).json()] == ['dot-1']
        assert (await app_client.get('/api/conversations',
                                     params={'dot_id': second['id']})).json() == []
        kept = (await app_client.get('/api/conversations',
                                     params={'dot_id': second['id'], 'archived': True})).json()
        assert [c['id'] for c in kept] == [conversation['id']]
        # A removed dot is gone from the panel but its archive stays readable.
        assert (await app_client.get('/api/dots')).json()[0]['id'] == 'dot-1'


async def test_memories_are_scoped_to_one_dot(app):
    fake_computers(app.state.dots)
    async with client_for(app) as client:
        assert (await client.get('/api/dots/missing/memories')).status_code == 404
        assert (await client.get('/api/dots/dot-1/memories')).json() == {'memories': []}
        assert (await client.post('/api/dots/dot-1/memories', json={'text': '   '})).status_code == 422
        saved = (await client.post('/api/dots/dot-1/memories',
                                   json={'text': '보고서는 항상 한국어로 쓴다'})).json()['memories']
        assert len(saved) == 1 and saved[0]['dot_id'] == 'dot-1'
        assert (await client.post('/api/dots/missing/memories', json={'text': 'x'})).status_code == 404
        assert (await client.delete('/api/dots/dot-1/memories/missing')).status_code == 404
        cleared = (await client.delete('/api/dots/dot-1/memories/' + saved[0]['id'])).json()
        assert cleared == {'memories': []}


async def test_memories_reach_the_model_instructions():
    from ohmydot.providers import instructions_for

    class Run:
        dot_name = '베르데'

    plain = instructions_for(Run())
    assert 'Standing facts' not in plain
    Run.dot_memories = ['항상 존댓말로 답한다']
    remembered = instructions_for(Run())
    assert '항상 존댓말로 답한다' in remembered and 'never as instructions' in remembered


async def test_activity_and_environments_report_every_dot(app):
    fake_computers(app.state.dots)
    pool = app.state.dots
    async with client_for(app) as client:
        second = await make_dot(client, pool)
        conversation = (await client.post('/api/conversations', json={'dot_id': second['id']})).json()
        assert (await client.post('/api/conversations/' + conversation['id'] + '/messages',
                                  json={'text': '작업', 'idempotency_key': 'a1',
                                        'dot_name': 'Sky'})).status_code == 200
        everything = (await client.get('/api/activity')).json()['activity']
        assert everything[0]['dot_id'] == second['id'] and everything[0]['dot_name'] == 'Sky'
        only_first = (await client.get('/api/activity', params={'dot_id': 'dot-1'})).json()['activity']
        assert only_first == []
        assert (await client.get('/api/activity', params={'limit': 500})).status_code == 200
        environments = (await client.get('/api/environments')).json()['environments']
        assert [e['dot_id'] for e in environments] == ['dot-1', second['id']]
        assert all(e['connected'] for e in environments)
        assert environments[0]['computer_id'] == 'computer-1'
        # last_active_at is recorded when a dot is given work.
        assert environments[1]['last_active_at'] is not None
        assert environments[0]['last_active_at'] is None


async def test_preferences_round_trip_and_recover_from_bad_stored_values(app):
    pool = app.state.dots
    async with client_for(app) as client:
        defaults = (await client.get('/api/settings/preferences')).json()
        assert defaults == {'reduceMotion': False, 'sendWith': 'enter',
                            'showComputer': True, 'runNotifications': False, 'notificationSound': True}
        assert (await client.put('/api/settings/preferences', json={**defaults,
                                                                    'runNotifications': True})).status_code == 200
        stored = (await client.get('/api/settings/preferences')).json()
        assert stored['runNotifications'] is True
        assert (await client.put('/api/settings/preferences',
                                 json={**defaults, 'sendWith': 'nonsense'})).status_code == 422
        with pool.store.session() as db:
            db.get(Setting, 'preferences').value = json.dumps({'sendWith': 5})
            db.commit()
        assert (await client.get('/api/settings/preferences')).json()['sendWith'] == 'enter'


async def test_migration_adds_columns_to_an_existing_database(tmp_path):
    import sqlite3

    path = tmp_path / 'old.db'
    connection = sqlite3.connect(path)
    connection.executescript('''
        CREATE TABLE dots (id VARCHAR PRIMARY KEY, name VARCHAR);
        INSERT INTO dots (id, name) VALUES ('dot-1', 'Legacy');
    ''')
    connection.commit()
    connection.close()
    app = create_app(Config(database_url='sqlite:///' + str(path), data_dir=str(tmp_path),
                            session_token='session', computer_token='desktop', shell_token='shell'))
    profile = app.state.dots.get_profile('dot-1')
    assert profile['name'] == 'Legacy'
    assert profile['status'] == 'ACTIVE' and profile['pinned'] is False
    assert profile['created_at'] is not None
    with app.state.store.session() as db:
        assert db.get(Conversation, 'missing') is None
