import json

import httpx
from ohmydot.model_catalog import model_catalog


async def test_codex_catalog_excludes_hidden_models_and_keeps_current(tmp_path):
    cache = tmp_path / 'models.json'
    cache.write_text(json.dumps({'models': [
        {'slug': 'visible-model', 'display_name': 'Visible', 'visibility': 'list'},
        {'slug': 'hidden-model', 'visibility': 'hide'}, None,
    ]}))
    result = await model_catalog('codex', 'older-model', cache=cache)
    assert [m['id'] for m in result['models']] == ['older-model', '', 'visible-model']
    assert result['models'][2]['name'] == 'Visible'
    cache.write_text('[]')
    result = await model_catalog('codex', '', cache=cache)
    assert result['models'] == [{'id': '', 'name': '계정 기본 모델'}]
    assert result['message']


async def test_openai_catalog_uses_server_key_and_filters_other_modalities(monkeypatch):
    requests = []

    def respond(request):
        requests.append(request)
        return httpx.Response(200, json={'data': [
            {'id': 'gpt-test'}, {'id': 'gpt-test'}, {'id': 'o3-test'},
            {'id': 'gpt-test-audio'}, {'id': 'text-embedding-test'}, None,
        ]})

    real_client = httpx.AsyncClient
    monkeypatch.setattr(httpx, 'AsyncClient', lambda **kwargs: real_client(
        transport=httpx.MockTransport(respond), **kwargs))
    result = await model_catalog('openai', '', 'test-placeholder')
    assert [m['id'] for m in result['models']] == ['gpt-test', 'o3-test']
    assert requests[0].headers['authorization'] == 'Bearer test-placeholder'
    assert 'test-placeholder' not in json.dumps(result)


async def test_missing_key_does_not_request_catalog_and_reports_next_step():
    result = await model_catalog('openai', 'current-model')
    assert [m['id'] for m in result['models']] == ['current-model']
    assert result['message']
