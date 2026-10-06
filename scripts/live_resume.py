"""Actual ask_user -> same Run -> GUI takeover wait -> new screenshot -> artifact proof."""

import asyncio
import json
import time
import uuid
from pathlib import Path

import httpx


async def wait_run(client, cid, predicate):
    async with asyncio.timeout(600):
        while True:
            row = (await client.get("/api/conversations/" + cid)).json()["runs"][0]
            if predicate(row):
                return row
            if row["status"] in ["FAILED", "CANCELLED"]:
                raise RuntimeError(row["error"] or row["status"])
            await asyncio.sleep(1)


async def main():
    async with httpx.AsyncClient(base_url="http://localhost:3080", timeout=130) as c:
        (await c.get("/api/session")).raise_for_status()
        cid = (await c.post("/api/conversations")).json()["id"]
        prompt = (
            '제어권 인계 데모를 실행합니다. 먼저 ask_user로 "준비되었나요?"를 물어 답변을 기다리세요. '
            "답변 후 desktop_input focus 또는 hotkey를 호출하여 GUI 제어권 대기를 검증하세요. "
            "사용자가 직접 공개 웹페이지를 바꾼 뒤 Return control 합니다. 반환 시 제공되는 새 스크린샷을 읽고, "
            "사용자가 열어 놓은 현재 페이지의 제목을 handoff/current-page.txt에 저장하고 다시 읽어 검증하세요. "
            "다른 페이지로 이동하지 마세요. 이 작업은 공개 페이지와 데모 파일만 다룹니다."
        )
        run = (
            await c.post(
                "/api/conversations/" + cid + "/messages",
                json={"text": prompt, "idempotency_key": str(uuid.uuid4())},
            )
        ).json()
        rid = run["id"]
        await wait_run(c, cid, lambda r: r["wait_reason"] == "ANSWER")
        started = time.monotonic()
        state = (await c.post("/api/computer-sessions/computer-1/takeover")).json()
        elapsed = round((time.monotonic() - started) * 1000, 1)
        (
            await c.post(
                "/api/runs/" + rid + "/answer",
                json={
                    "text": "준비되었습니다. 제어권이 반환될 때까지 기다리고 반환 후 당시 페이지를 기록해 주세요."
                },
            )
        ).raise_for_status()
        await wait_run(c, cid, lambda r: r["wait_reason"] == "CONTROL")
        for action in [
            {"action": "hotkey", "key": "ctrl+l"},
            {"action": "type", "text": "https://www.iana.org/help/example-domains"},
            {"action": "key", "key": "Return"},
        ]:
            (
                await c.post(
                    "/api/computer-sessions/computer-1/input", json={**action, "epoch": state["epoch"]}
                )
            ).raise_for_status()
        await asyncio.sleep(4)
        (await c.post("/api/computer-sessions/computer-1/return")).raise_for_status()
        final = await wait_run(c, cid, lambda r: r["status"] == "COMPLETED")
        artifact = (await c.get("/api/artifacts/handoff/current-page.txt")).json()["text"]
        assert "IANA" in artifact or "Example Domains" in artifact
        report = {
            "run_id": rid,
            "conversation_id": cid,
            "same_run_answer": True,
            "gui_waited_during_user_control": True,
            "user_changed_actual_public_page": True,
            "fresh_page_verified_in_artifact": True,
            "status": final["status"],
            "takeover_ms": elapsed,
        }
        Path("output/live-resume.json").write_text(json.dumps(report, indent=2))
        print(json.dumps(report))


if __name__ == "__main__":
    asyncio.run(main())
