"""Restart only the local OhMyDot API created by scripts/dev.sh or this task."""

import asyncio
import json
import os
import signal
import subprocess
import sys
import uuid
from pathlib import Path

import httpx
from dotenv import dotenv_values


async def main():
    env = dotenv_values(".env.local")
    async with (
        httpx.AsyncClient(base_url="http://localhost:3080", timeout=130) as c,
        httpx.AsyncClient(
            base_url="http://127.0.0.1:18766",
            headers={"Authorization": "Bearer " + env["SHELL_TOKEN"]},
            timeout=130,
        ) as shell,
    ):
        (await c.get("/api/session")).raise_for_status()
        cid = (await c.post("/api/conversations")).json()["id"]
        run = (
            await c.post(
                "/api/conversations/" + cid + "/messages",
                json={
                    "text": "복구 검증용입니다. ask_user로 준비되었나요를 질문하고 답변을 기다리세요.",
                    "idempotency_key": str(uuid.uuid4()),
                },
            )
        ).json()
        rid = run["id"]
        async with asyncio.timeout(300):
            while True:
                row = (await c.get("/api/conversations/" + cid)).json()["runs"][0]
                if row["wait_reason"] == "ANSWER":
                    break
                if row["status"] == "FAILED":
                    raise RuntimeError(row["error"])
                await asyncio.sleep(1)
        proc = asyncio.create_task(
            shell.post(
                "/exec",
                json={
                    "run_id": rid,
                    "command": "sleep 15; touch /workspace/artifacts/restart-should-not-exist",
                    "cwd": "/workspace",
                },
            )
        )
        await asyncio.sleep(0.5)
        pids = (
            subprocess.check_output(["lsof", "-nP", "-iTCP:18000", "-sTCP:LISTEN", "-t"], text=True)
            .strip()
            .splitlines()
        )
        assert len(pids) == 1
        pid = int(pids[0])
        name = subprocess.check_output(["ps", "-p", str(pid), "-o", "command="], text=True)
        cwd = subprocess.check_output(["lsof", "-a", "-p", str(pid), "-d", "cwd", "-Fn"], text=True)
        assert "uvicorn ohmydot.main:create_app" in name and "n" + os.getcwd() in cwd
        os.kill(pid, signal.SIGKILL)
        process_env = {
            **os.environ,
            "DATABASE_URL": "postgresql+psycopg://dots:local-demo-only@127.0.0.1:15432/dots",
            "PYTHONPATH": "apps/api",
        }
        with open("/tmp/ohmydot-api.log", "w") as log:
            subprocess.Popen(
                [
                    sys.executable,
                    "-m",
                    "uvicorn",
                    "ohmydot.main:create_app",
                    "--factory",
                    "--host",
                    "127.0.0.1",
                    "--port",
                    "18000",
                    "--no-access-log",
                ],
                env=process_env,
                stdout=log,
                stderr=log,
                start_new_session=True,
            )
        async with asyncio.timeout(30):
            while True:
                try:
                    r = await c.get("/api/session")
                    if r.status_code == 200:
                        break
                except httpx.HTTPError:
                    pass
                await asyncio.sleep(0.5)
        row = (await c.get("/api/conversations/" + cid)).json()["runs"][0]
        assert row["status"] == "FAILED" and row["error"] == "SERVER_RESTARTED"
        result = (await proc).json()
        assert result["cancelled"] and result["exit_code"] != 0
        assert (await c.get("/api/artifacts/restart-should-not-exist")).status_code == 404
        before = row["started_at"]
        await asyncio.sleep(2)
        data = (await c.get("/api/conversations/" + cid)).json()
        assert len(data["runs"]) == 1 and data["runs"][0]["started_at"] == before
        report = {
            "run_id": rid,
            "conversation_id": cid,
            "hard_restart_marked_failed": True,
            "shell_process_group_cancelled_on_recovery": True,
            "artifact_not_created_after_failure": True,
            "run_not_reexecuted": True,
            "status": row["status"],
            "error": row["error"],
        }
        Path("output/live-restart.json").write_text(json.dumps(report, indent=2))
        print(json.dumps(report))


if __name__ == "__main__":
    asyncio.run(main())
