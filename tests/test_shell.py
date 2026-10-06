import asyncio
import importlib
import uuid

import pytest
from fastapi import HTTPException


@pytest.fixture
def shell(tmp_path, monkeypatch):
    monkeypatch.setenv("SHELL_TOKEN", "test-shell")
    module = importlib.import_module("shell.daemon")
    monkeypatch.setattr(module, "ROOT", tmp_path)
    monkeypatch.setattr(module, "TOOLS", tmp_path / ".tools")
    (tmp_path / "artifacts").mkdir()
    return module


async def test_timeout_and_bounded_output(shell):
    timed = await shell.execute(
        shell.Exec(run_id=str(uuid.uuid4()), cwd=str(shell.ROOT), command="sleep 5", timeout=0.1)
    )
    assert timed["timed_out"] and timed["exit_code"] != 0
    output = await shell.execute(
        shell.Exec(
            run_id=str(uuid.uuid4()), cwd=str(shell.ROOT), command="/usr/bin/yes x | /usr/bin/head -c 100000"
        )
    )
    assert len(output["stdout"].encode()) == shell.LIMIT and output["stdout_truncated"]


async def test_cancel_prevents_future_spawn_and_kills_descendants(shell):
    rid = str(uuid.uuid4())
    task = asyncio.create_task(
        shell.execute(shell.Exec(run_id=rid, cwd=str(shell.ROOT), command="sleep 5; touch should-not-exist"))
    )
    async with asyncio.timeout(2):
        while rid not in shell.processes:
            await asyncio.sleep(0.01)
    await shell.cancel(rid)
    result = await task
    assert result["cancelled"] and result["exit_code"] != 0
    assert not (shell.ROOT / "should-not-exist").exists()
    with pytest.raises(HTTPException):
        await shell.execute(shell.Exec(run_id=rid, cwd=str(shell.ROOT), command="touch should-not-exist"))


async def test_command_environment_has_no_gui_or_credentials(shell, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-placeholder")
    monkeypatch.setenv("DISPLAY", ":99")
    result = await shell.execute(
        shell.Exec(run_id=str(uuid.uuid4()), cwd=str(shell.ROOT), command="/usr/bin/env")
    )
    assert (
        "OPENAI_API_KEY" not in result["stdout"]
        and "DISPLAY" not in result["stdout"]
        and "SHELL_TOKEN" not in result["stdout"]
    )
    with pytest.raises(HTTPException):
        await shell.execute(shell.Exec(run_id=str(uuid.uuid4()), cwd="/", command="pwd"))


async def test_user_install_paths_persist_between_commands(shell):
    first = await shell.execute(shell.Exec(run_id=str(uuid.uuid4()), cwd=str(shell.ROOT),
        command='printf ready > "$PYTHONUSERBASE/installed-marker"; printf "%s" "$NPM_CONFIG_PREFIX"'))
    assert first["exit_code"] == 0
    assert str(shell.TOOLS / 'node') in first["stdout"]
    second = await shell.execute(shell.Exec(run_id=str(uuid.uuid4()), cwd=str(shell.ROOT),
        command='cat "$PYTHONUSERBASE/installed-marker"'))
    assert second["stdout"].strip() == 'ready'
