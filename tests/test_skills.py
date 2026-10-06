import hashlib

import pytest
from ohmydot import skills


def test_catalog_is_summary_only_and_returns_independent_objects():
    catalog = skills.list_skills()
    assert len(catalog) == 2
    assert all("content" not in item for item in catalog)
    catalog[0]["title"] = "changed"
    assert skills.list_skills()[0]["title"] != "changed"
    for entry in skills.list_skills():
        loaded = skills.read_skill(entry["id"])
        assert loaded["content"].startswith("# ")
        assert loaded["sha256"] == hashlib.sha256(loaded["content"].encode()).hexdigest()
        assert loaded["version"] == entry["version"]


@pytest.mark.parametrize("name", ["../providers", "/etc/passwd", "verified-artifact.md", "", "foreign-skill"])
def test_skill_ids_do_not_open_arbitrary_paths(name, monkeypatch):
    def forbidden(*_):
        pytest.fail("Unknown ids must be rejected before filesystem access")
    monkeypatch.setattr(skills.Path, "read_bytes", forbidden)
    with pytest.raises(ValueError, match="Unknown built-in skill"):
        skills.read_skill(name)


def test_skill_size_is_bounded(monkeypatch):
    monkeypatch.setattr(skills.Path, "read_bytes", lambda _: b"x" * 16385)
    with pytest.raises(ValueError, match="16 KiB"):
        skills.read_skill("verified-artifact")


@pytest.mark.asyncio
async def test_loaded_skill_records_identity_without_copying_body_to_events():
    from types import SimpleNamespace

    from ohmydot.tools import Tools
    from test_execution import Events

    store = Events()
    runtime = SimpleNamespace(store=store, config=SimpleNamespace(max_tools=10), check_run=lambda _: None)
    result = await Tools(runtime, 'run').invoke('skill_read', {'skill_id': 'verified-artifact'})
    assert result['content']
    completed = next(event for event in store.events if event['type'] == 'tool.completed')
    assert completed['payload']['skill_sha256'] == result['sha256']
    assert completed['payload']['skill_title'] == result['title']
    assert 'content' not in completed['payload']
    assert store.events[0]['payload']['skill_id'] == 'verified-artifact'


@pytest.mark.asyncio
async def test_skill_endpoints_require_session_and_return_same_catalog(tmp_path):
    import httpx
    from ohmydot.config import Config
    from ohmydot.main import create_app

    app = create_app(Config(database_url='sqlite:///' + str(tmp_path / 'db'), data_dir=str(tmp_path),
                            session_token='test-session', computer_token='computer', shell_token='shell'))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://testserver') as client:
        assert (await client.get('/api/skills')).status_code == 401
        assert (await client.get('/api/skills/verified-artifact')).status_code == 401
        client.cookies.set('dot_session', 'test-session')
        assert (await client.get('/api/skills')).json() == {'skills': skills.list_skills()}
        response = await client.get('/api/skills/verified-artifact')
        assert response.json() == skills.read_skill('verified-artifact')
        assert (await client.get('/api/skills/unknown')).status_code == 404
        assert (await client.get('/api/skills', headers={'origin': 'https://foreign.example'})).status_code == 401
