"""Provider-owned model catalogs; credentials never leave the server."""
import json
from pathlib import Path

import httpx


async def model_catalog(provider, current, key='', cache=None):
    models = []
    message = ''
    if provider == 'codex':
        models.append({'id': '', 'name': '계정 기본 모델'})
        try:
            data = json.loads((cache or Path.home() / '.codex/models_cache.json').read_text())
            models.extend({'id': m['slug'], 'name': m.get('display_name') or m['slug']}
                          for m in data.get('models', [])
                          if isinstance(m, dict) and m.get('visibility') == 'list'
                          and isinstance(m.get('slug'), str))
        except (OSError, ValueError, TypeError, KeyError, AttributeError):
            message = 'Codex 모델 목록은 로그인 후 CLI가 갱신합니다.'
    elif key:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                response = await client.get('https://api.openai.com/v1/models', headers={'Authorization': 'Bearer ' + key})
                response.raise_for_status()
                ids = sorted({m['id'] for m in response.json().get('data', [])
                              if isinstance(m, dict) and isinstance(m.get('id'), str) and text_model(m['id'])})
                models = [{'id': i, 'name': i} for i in ids]
        except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError):
            message = '모델 목록을 불러오지 못했습니다. API 키와 연결 상태를 확인해 주세요.'
    else:
        message = 'API 키를 저장하면 사용 가능한 모델 목록을 불러옵니다.'
    if current and not any(m['id'] == current for m in models):
        models.insert(0, {'id': current, 'name': current + ' · 현재 설정'})
    return {'models': models, 'message': message}


def text_model(name):
    return name.startswith(('gpt-', 'o1', 'o3', 'o4')) and not any(
        part in name for part in ('audio', 'realtime', 'image', 'transcribe', 'tts', 'search', 'moderation'))
