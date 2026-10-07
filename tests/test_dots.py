from dataclasses import replace
from unittest.mock import AsyncMock

import httpx
import pytest
from ohmydot.config import Config
from ohmydot.main import create_app
from ohmydot.runtime import Runtime
from ohmydot.store import Run, Task


@pytest.fixture
def app(tmp_path):
    return create_app(Config(database_url='sqlite:///' + str(tmp_path / 'dots.db'),
        data_dir=str(tmp_path), session_token='session', computer_token='desktop', shell_token='shell'))

async def test_separate_dot_profiles_conversations_and_computer_routes(app):
    pool = app.state.dots
    endpoints = {'computer_url':'http://second-desktop', 'shell_url':'http://second-shell', 'vnc_url':'ws://second-vnc'}
    pool.provision = AsyncMock(return_value=endpoints)
    original_get = pool.get
    async def get(dot_id):
        if dot_id not in pool.runtimes:
            rt = Runtime(replace(pool.config, **endpoints), pool.store)
            rt.desktop.post = AsyncMock(return_value={'ok':True})
            rt.desktop.get = AsyncMock(return_value={'owner':'AGENT','epoch':0,'handoff':False})
            rt.shell.get = AsyncMock(return_value=[{'path':'second.txt','size':4}])
            pool.runtimes[dot_id] = rt
        return await original_get(dot_id)
    pool.get = get
    pool.runtimes['dot-1'].desktop.get = AsyncMock(return_value={'owner':'USER','epoch':7,'handoff':False})
    pool.runtimes['dot-1'].shell.get = AsyncMock(return_value=[{'path':'first.txt','size':5}])
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url='http://test', cookies={'dot_session':'session'}) as client:
        assert (await client.post('/api/dots',json={'name':'   '})).status_code == 422
        assert (await client.post('/api/dots',json={'name':'B','color':'invalid'})).status_code == 422
        second = (await client.post('/api/dots',json={'name':'Sky','color':'blue','avatar':'pet'})).json()
        assert second['computer_id'] != 'computer-1'
        one = (await client.post('/api/conversations')).json()
        two = (await client.post('/api/conversations',json={'dot_id':second['id']})).json()
        assert one['dot_id'] == 'dot-1' and two['dot_id'] == second['id']
        with pool.store.session() as db:
            task = Task(dot_id=second['id'], conversation_id=two['id'], prompt='recovery test')
            db.add(task)
            db.flush()
            run = Run(task_id=task.id, conversation_id=two['id'], idempotency_key='recovery', provider='codex', model='test-model')
            db.add(run)
            db.commit()
        first_runtime = pool.runtimes['dot-1']
        second_runtime = pool.runtimes[second['id']]
        assert await pool.for_run(run.id) is second_runtime
        first_runtime.start = AsyncMock()
        first_runtime.shell.post = AsyncMock()
        second_runtime.shell.post = AsyncMock()
        await pool.start()
        first_runtime.start.assert_awaited_once_with(recover=False)
        second_runtime.shell.post.assert_awaited_once_with('/cancel/' + run.id)
        first_runtime.shell.post.assert_not_awaited()
        assert [c['id'] for c in (await client.get('/api/conversations')).json()] == [one['id']]
        assert [c['id'] for c in (await client.get('/api/conversations',params={'dot_id':second['id']})).json()] == [two['id']]
        assert (await client.get('/api/computer-sessions/computer-1')).json()['epoch'] == 7
        assert (await client.get('/api/computer-sessions/' + second['computer_id'])).json()['epoch'] == 0
        assert (await client.get('/api/artifacts')).json()[0]['path'] == 'first.txt'
        assert (await client.get('/api/artifacts',params={'dot_id':second['id']})).json()[0]['path'] == 'second.txt'
        changed = await client.put('/api/dots/' + second['id'],json={'name':'Ocean','color':'pink','avatar':'ring'})
        assert changed.status_code == 200
        profiles = (await client.get('/api/dots')).json()
        assert next(d for d in profiles if d['id']=='dot-1')['color'] == 'silver'
        assert next(d for d in profiles if d['id']==second['id'])['color'] == 'pink'
        for character in ('iggy', 'felipe', 'todd', 'alfred', 'jojo'):
            saved = await client.put('/api/dots/' + second['id'], json={'name':'Ocean','color':'pink','avatar':character})
            assert saved.status_code == 200 and saved.json()['avatar'] == character
            assert next(d for d in (await client.get('/api/dots')).json() if d['id']==second['id'])['avatar'] == character
        assert (await client.put('/api/dots/' + second['id'], json={'name':'Ocean','avatar':'unknown'})).status_code == 422
        assert (await client.get('/api/computer-sessions/missing')).status_code == 404
        assert (await client.post('/api/runs/missing/cancel')).status_code == 404

async def test_provision_failure_does_not_register_a_fake_dot(app):
    app.state.dots.provision = AsyncMock(side_effect=ValueError('Docker unavailable'))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app),base_url='http://test',cookies={'dot_session':'session'}) as client:
        assert (await client.post('/api/dots',json={'name':'Failed','color':'blue'})).status_code == 503
        assert len((await client.get('/api/dots')).json()) == 1
        client.cookies.set('dot_session', 'wrong')
        assert (await client.get('/api/dots')).status_code == 401
