import asyncio
import importlib

import pytest
from fastapi import HTTPException


@pytest.fixture
def desktop(monkeypatch):
    monkeypatch.setenv("COMPUTER_TOKEN", "test-computer")
    module = importlib.import_module("computer.daemon")
    monkeypatch.setattr(module, "capture", lambda: asyncio.sleep(0, result=b"png"))
    return module


async def test_takeover_drains_inflight_input_and_rejects_queued_coordinates(desktop, monkeypatch):
    entered, finish = asyncio.Event(), asyncio.Event()
    calls = []

    async def command(*args):
        calls.append(args)
        if args[1] == "mousemove":
            entered.set()
            await finish.wait()
        return ""

    monkeypatch.setattr(desktop, "command", command)
    gate = desktop.Gate()
    initial_epoch = gate.epoch
    first = asyncio.create_task(
        gate.apply(desktop.Input(actor="AGENT", epoch=initial_epoch, action="down", x=30, y=30))
    )
    await entered.wait()
    transfer = asyncio.create_task(gate.takeover())
    await asyncio.sleep(0)
    stale = asyncio.create_task(
        gate.apply(desktop.Input(actor="AGENT", epoch=initial_epoch, action="click", x=90, y=90))
    )
    finish.set()
    await first
    state = await transfer
    with pytest.raises(HTTPException) as error:
        await stale
    assert error.value.status_code == 409
    assert state["owner"] == "USER" and not gate.buttons
    assert ("xdotool", "mouseup", "1") in calls
    assert not any("90" in c for c in calls)


async def test_bidirectional_epoch_and_return_freeze(desktop, monkeypatch):
    calls = []

    async def command(*args):
        calls.append(args)
        return ""

    monkeypatch.setattr(desktop, "command", command)
    gate = desktop.Gate()
    initial_epoch = gate.epoch
    with pytest.raises(HTTPException):
        await gate.apply(desktop.Input(actor="USER", epoch=initial_epoch, action="key", key="Return"))
    await gate.takeover()
    old_epoch = gate.epoch
    await gate.apply(desktop.Input(actor="USER", epoch=old_epoch, action="keydown", key="Control_L"))
    state = await gate.prepare_return()
    assert state["image"] and state["handoff"] and gate.owner == "USER"
    for actor in ["USER", "AGENT"]:
        with pytest.raises(HTTPException):
            await gate.apply(desktop.Input(actor=actor, epoch=gate.epoch, action="key", key="Return"))
    await gate.finish_return(state["epoch"], True)
    with pytest.raises(HTTPException):
        await gate.apply(desktop.Input(actor="USER", epoch=old_epoch, action="key", key="Return"))
    await gate.apply(desktop.Input(actor="AGENT", epoch=gate.epoch, action="key", key="Return"))
    assert ("xdotool", "keyup", "Control_L") in calls


async def test_failed_analysis_keeps_user_control(desktop, monkeypatch):
    monkeypatch.setattr(desktop, "command", lambda *args: asyncio.sleep(0, result=""))
    gate = desktop.Gate()
    await gate.takeover()
    snapshot = await gate.prepare_return()
    await gate.finish_return(snapshot["epoch"], False)
    assert gate.owner == "USER" and not gate.handoff


async def test_service_launcher_uses_fixed_urls_and_respects_control(desktop, monkeypatch):
    calls = []

    async def spawn(*args, **kwargs):
        calls.append(args)

    monkeypatch.setattr(asyncio, 'create_subprocess_exec', spawn)
    monkeypatch.setattr(desktop, 'command', lambda *args: asyncio.sleep(0, result=''))
    gate = desktop.Gate()
    with pytest.raises(HTTPException):
        await gate.apply(desktop.Input(actor='USER', epoch=gate.epoch, action='launch',
                                       app='chromium', service='gmail'))
    assert not calls
    await gate.takeover()
    for service, url in [('gmail', 'https://mail.google.com/'),
                         ('calendar', 'https://calendar.google.com/'),
                         ('drive', 'https://drive.google.com/'),
                         ('slack', 'https://slack.com/signin')]:
        await gate.apply(desktop.Input(actor='USER', epoch=gate.epoch, action='launch',
                                       app='chromium', service=service))
        assert calls[-1] == ('dot-browser', url)
    with pytest.raises(HTTPException) as error:
        await gate.apply(desktop.Input(actor='USER', epoch=gate.epoch, action='launch',
                                       app='terminal', service='gmail'))
    assert error.value.status_code == 422 and len(calls) == 4


async def test_agent_action_is_discarded_after_return(monkeypatch):
    from types import SimpleNamespace

    from ohmydot.tools import Tools

    returned = asyncio.Event()
    posts = []

    class Desktop:
        async def get(self, path):
            return {"owner": "USER", "handoff": False, "epoch": 2}

        async def post(self, *args):
            posts.append(args)

        async def image(self):
            return "fresh screenshot"

    async def wait(run_id):
        await returned.wait()

    tools = Tools(SimpleNamespace(desktop=Desktop(), wait_control=wait), "run")
    pending = asyncio.create_task(tools._invoke("desktop_input", {"action": "click", "x": 120, "y": 40}))
    await asyncio.sleep(0)
    assert not pending.done()
    returned.set()
    result = await pending
    assert result["image_url"] == "fresh screenshot" and not posts


async def test_old_input_is_rejected_after_desktop_restart(desktop, monkeypatch):
    epochs = iter([23, 91])
    monkeypatch.setattr(desktop.secrets, "randbits", lambda bits: next(epochs))
    monkeypatch.setattr(desktop, "command", lambda *args: asyncio.sleep(0, result=""))
    before = desktop.Gate()
    old_input = desktop.Input(actor="AGENT", epoch=before.epoch, action="click", x=40, y=40)
    after = desktop.Gate()
    with pytest.raises(HTTPException) as error:
        await after.apply(old_input)
    assert error.value.status_code == 409
