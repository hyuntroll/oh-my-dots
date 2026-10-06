"""Provider-neutral, replayable progress; only user-facing message text is published."""
import time

from pydantic_core import from_json


class OutputStream:
    def __init__(self, store, run_id):
        self.store = store
        self.run_id = run_id
        self.buffers = {}
        self.sent = {}
        self.last_emit = 0.0

    def update(self, item_id, text, *, structured=True, replace=False, force=False):
        raw = text if replace else self.buffers.get(item_id, "") + text
        self.buffers[item_id] = raw
        visible = raw
        if structured or raw.lstrip().startswith("{"):
            try:
                value = from_json(raw, allow_partial="trailing-strings")
                visible = value.get("message", "") if isinstance(value, dict) else ""
            except ValueError:
                visible = ""
        if not isinstance(visible, str) or not visible or self.sent.get(item_id) == visible:
            return
        now = time.monotonic()
        if not force and now - self.last_emit < 0.1:
            return
        self.last_emit = now
        self.sent[item_id] = visible
        self.store.event("message.updated", "답변을 작성하고 있어요", self.run_id,
                         {"item_id": item_id, "text": visible})


def record_usage(store, run_id, provider, values, *, last=None, requests=None):
    def count(*keys):
        for key in keys:
            value = values.get(key)
            if isinstance(value, int) and not isinstance(value, bool) and value >= 0:
                return value
        return 0
    payload = {
        "provider": provider,
        "input_tokens": count("input_tokens", "inputTokens"),
        "output_tokens": count("output_tokens", "outputTokens"),
        "cached_input_tokens": count("cached_input_tokens", "cachedInputTokens"),
    }
    if isinstance(requests, int) and not isinstance(requests, bool) and requests > 0:
        payload["model_requests"] = requests
    if last:
        value = last.get("inputTokens", last.get("input_tokens"))
        if isinstance(value, int) and not isinstance(value, bool) and value >= 0:
            payload["last_input_tokens"] = value
    store.event("run.usage", "모델 사용량", run_id, payload)
