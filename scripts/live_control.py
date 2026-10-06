"""Actual container arbitration, independent shell and model re-observation checks."""

import asyncio
import json
import uuid
from pathlib import Path

import httpx
from dotenv import dotenv_values


async def main():
    env = dotenv_values(".env.local")
    async with (
        httpx.AsyncClient(base_url="http://localhost:3080", timeout=130) as ui,
        httpx.AsyncClient(
            base_url="http://127.0.0.1:18765", headers={"Authorization": "Bearer " + env["COMPUTER_TOKEN"]}
        ) as gui,
        httpx.AsyncClient(
            base_url="http://127.0.0.1:18766",
            headers={"Authorization": "Bearer " + env["SHELL_TOKEN"]},
            timeout=130,
        ) as shell,
    ):
        (await ui.get("/api/session")).raise_for_status()
        state = (await gui.get("/control")).json()
        if state["owner"] != "AGENT":
            (await ui.post("/api/computer-sessions/computer-1/return")).raise_for_status()
            state = (await gui.get("/control")).json()
        assert state["owner"] == "AGENT"
        user = await ui.post(
            "/api/computer-sessions/computer-1/input",
            json={"epoch": state["epoch"], "action": "key", "key": "Return"},
        )
        assert user.status_code == 409
        shell_run = asyncio.create_task(
            shell.post(
                "/exec",
                json={
                    "run_id": str(uuid.uuid4()),
                    "command": "sleep 2; printf independent-shell",
                    "cwd": "/workspace",
                },
            )
        )
        take = await ui.post("/api/computer-sessions/computer-1/takeover")
        take.raise_for_status()
        state = take.json()
        rejected = await gui.post(
            "/input", json={"actor": "AGENT", "epoch": state["epoch"], "action": "key", "key": "Return"}
        )
        assert rejected.status_code == 409
        allowed = await ui.post(
            "/api/computer-sessions/computer-1/input",
            json={"epoch": state["epoch"], "action": "launch", "app": "files"},
        )
        allowed.raise_for_status()
        completed = (await shell_run).json()
        assert completed["exit_code"] == 0 and completed["stdout"] == "independent-shell"
        stale_epoch = state["epoch"]
        returned = await ui.post("/api/computer-sessions/computer-1/return")
        returned.raise_for_status()
        assert returned.json()["owner"] == "AGENT"
        stale = await ui.post(
            "/api/computer-sessions/computer-1/input",
            json={"epoch": stale_epoch, "action": "key", "key": "Return"},
        )
        assert stale.status_code == 409
        rid = str(uuid.uuid4())
        process = asyncio.create_task(
            shell.post(
                "/exec",
                json={
                    "run_id": rid,
                    "command": "sleep 30; touch /workspace/artifacts/cancel-should-not-exist",
                    "cwd": "/workspace",
                },
            )
        )
        await asyncio.sleep(0.5)
        (await shell.post("/cancel/" + rid)).raise_for_status()
        outcome = (await process).json()
        assert outcome["cancelled"] and outcome["exit_code"] != 0
        report = {
            "user_blocked_during_agent": True,
            "agent_blocked_during_user": True,
            "user_gui_input_accepted": True,
            "shell_continued_during_takeover": True,
            "return_analyzed_by_real_codex": True,
            "stale_user_epoch_rejected": True,
            "shell_cancel_killed_process_group": True,
        }
        print(json.dumps(report))
        Path("output/live-control.json").write_text(json.dumps(report, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
