"""Cancel an actual Codex Run and its concurrent shell process via the public API."""

import asyncio
import json
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
                    "text": "취소 검증용입니다. ask_user로 준비되었나요를 질문하고 답변을 기다리세요.",
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
                    "command": "sleep 30; touch /workspace/artifacts/cancel-should-not-exist",
                    "cwd": "/workspace",
                },
            )
        )
        await asyncio.sleep(0.5)
        cancelled = await c.post("/api/runs/" + rid + "/cancel")
        cancelled.raise_for_status()
        outcome = (await proc).json()
        assert outcome["cancelled"] and outcome["exit_code"] != 0
        row = (await c.get("/api/conversations/" + cid)).json()["runs"][0]
        assert row["status"] == "CANCELLED"
        assert (await c.get("/api/artifacts/cancel-should-not-exist")).status_code == 404
        report = {
            "run_id": rid,
            "conversation_id": cid,
            "actual_codex_run_cancelled": True,
            "same_run_shell_group_terminated": True,
            "artifact_not_created": True,
            "status": row["status"],
        }
        Path("output/live-cancel.json").write_text(json.dumps(report, indent=2))
        print(json.dumps(report))


if __name__ == "__main__":
    asyncio.run(main())
